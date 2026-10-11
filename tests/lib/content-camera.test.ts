import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import sharp from "sharp";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const mock = vi.hoisted(() => ({
  query: vi.fn(),
  objects: new Map<string, Uint8Array>(),
  remove: vi.fn(),
}));

// Execute the production manifest operations against real Postgres semantics,
// including concurrent revision comparisons, instead of emulating row state.
vi.mock("@/lib/supabase/admin", () => {
  class Query {
    op = "select";
    values: Record<string, unknown> = {};
    conditions: string[] = [];
    params: unknown[] = [];
    head = false;
    singleRow = false;
    ordering = "";
    take = "";
    select(_columns = "*", options?: { head?: boolean }) {
      this.head = Boolean(options?.head);
      return this;
    }
    insert(values: Record<string, unknown>) {
      this.op = "insert";
      this.values = values;
      return this;
    }
    update(values: Record<string, unknown>) {
      this.op = "update";
      this.values = values;
      return this;
    }
    delete() {
      this.op = "delete";
      return this;
    }
    where(key: string, op: string, value: unknown) {
      this.params.push(value);
      this.conditions.push(`${key} ${op} $${this.params.length}`);
      return this;
    }
    eq(key: string, value: unknown) {
      return this.where(key, "=", value);
    }
    gt(key: string, value: unknown) {
      return this.where(key, ">", value);
    }
    lt(key: string, value: unknown) {
      return this.where(key, "<", value);
    }
    order(key: string) {
      this.ordering = ` order by ${key}`;
      return this;
    }
    limit(value: number) {
      this.take = ` limit ${value}`;
      return this;
    }
    single() {
      this.singleRow = true;
      return this;
    }
    maybeSingle() {
      this.singleRow = true;
      return this;
    }
    async execute() {
      const values = Object.entries(this.values);
      const placeholders = values.map(([, value], index) => {
        this.params.push(typeof value === "object" ? JSON.stringify(value) : value);
        return `$${this.params.length}${values[index][0] === "pages" ? "::jsonb" : ""}`;
      });
      const where = this.conditions.length ? ` where ${this.conditions.join(" and ")}` : "";
      const sql =
        this.op === "insert"
          ? `insert into content_camera_sessions (${values.map(([key]) => key)}) values (${placeholders}) returning *`
          : this.op === "update"
            ? `update content_camera_sessions set ${values.map(([key], index) => `${key}=${placeholders[index]}`)}${where} returning *`
            : this.op === "delete"
              ? `delete from content_camera_sessions${where} returning *`
              : `select * from content_camera_sessions${where}${this.ordering}${this.take}`;
      try {
        const result = await mock.query(sql, this.params);
        return {
          data: this.head ? null : this.singleRow ? (result.rows[0] ?? null) : result.rows,
          count: result.rows.length,
          error: null,
        };
      } catch (error) {
        return { data: null, error };
      }
    }
    then(resolve: (value: unknown) => unknown, reject: (error: unknown) => unknown) {
      return this.execute().then(resolve, reject);
    }
  }
  return {
    createSupabaseAdminClient: () => ({
      from: () => new Query(),
      get storage() {
        throw new Error("Camera images must never use Supabase Storage");
      },
    }),
  };
});
vi.mock("@/lib/vps-storage", () => ({
  createVpsStorageClient: () => ({
    from: (bucket: string) => {
      expect(bucket).toBe("content-camera");
      return {
        createSignedUploadUrl: async (path: string) => ({
          data: { signedUrl: `/vps-storage/signed-upload/content-camera/${path}` },
        }),
        createSignedUrls: async (paths: string[]) => ({
          data: paths.map((path) => ({ signedUrl: `/vps-storage/signed/content-camera/${path}` })),
        }),
        info: async (path: string) => ({
          data: { size: mock.objects.get(path)?.length ?? 0, mimetype: "image/jpeg" },
        }),
        download: async (path: string) => ({
          data: new Blob([new Uint8Array(mock.objects.get(path) ?? [])]),
          error: null,
        }),
        remove: mock.remove,
      };
    },
  }),
}));

import {
  cleanupContentCameras,
  closeContentCamera,
  completeContentPhoto,
  contentCameraPdf,
  contentCameraState,
  createContentCamera,
  getContentCamera,
  prepareContentPhoto,
  removeContentPhoto,
  reorderContentPhotos,
} from "@/lib/data/content-camera";

let db: PGlite;
let image: Buffer;
const teacher = "00000000-0000-0000-0000-000000000001";
beforeAll(async () => {
  db = new PGlite();
  await db.exec(`create role anon; create role authenticated; create role service_role;
    create table teachers(id uuid primary key); insert into teachers values ('${teacher}');`);
  await db.exec(
    readFileSync("supabase/migrations/20261011053848_content_camera_sessions.sql", "utf8"),
  );
  mock.query.mockImplementation((sql, values) => db.query(sql, values));
  image = await sharp({ create: { width: 600, height: 800, channels: 3, background: "white" } })
    .jpeg()
    .toBuffer();
}, 15000);
beforeEach(async () => {
  await db.exec("delete from content_camera_sessions");
  mock.objects.clear();
  mock.remove.mockImplementation(async (paths: string[]) => {
    paths.forEach((path) => mock.objects.delete(path));
    return { error: null };
  });
});
afterAll(() => db?.close());

async function add(id: string, token: string) {
  const prepared = await prepareContentPhoto(id, token, {
    name: "photo.jpg",
    size: image.length,
    source: "phone",
  });
  mock.objects.set(`${id}/${prepared.pageId}.jpg`, image);
  await completeContentPhoto(id, token, prepared.pageId);
  return prepared.pageId;
}
describe("content capture using private VPS files and metadata only", () => {
  it("stores a hash, rejects forged/expired links, and refuses direct browser access to session rows", async () => {
    const { session, token } = await createContentCamera(teacher, "Physics/Notes");
    expect(session.token_hash).not.toBe(token);
    await expect(getContentCamera(session.id, "a".repeat(64))).rejects.toMatchObject({
      status: 404,
    });
    for (const role of ["anon", "authenticated"]) {
      await db.exec(`set role ${role}`);
      await expect(db.query("select * from content_camera_sessions")).rejects.toThrow(
        "permission denied",
      );
      await db.exec("reset role");
    }
    await db.query(
      "update content_camera_sessions set expires_at=now()-interval '1 minute' where id=$1",
      [session.id],
    );
    await expect(getContentCamera(session.id, token)).rejects.toMatchObject({ status: 410 });
  });
  it("keeps concurrent additions, appends arrivals absent from a desktop snapshot, and builds the PDF in that order", async () => {
    const { session, token } = await createContentCamera(teacher, "Physics/Notes");
    const ids = await Promise.all([add(session.id, token), add(session.id, token)]);
    const arrival = await add(session.id, token);
    const reordered = await reorderContentPhotos(session.id, token, [...ids].reverse());
    const state = await contentCameraState(reordered);
    expect(state.pages.map((page) => page.id)).toEqual([...ids].reverse().concat(arrival));
    expect(state.pages.every((page) => page.previewUrl?.startsWith("/vps-storage/"))).toBe(true);
    expect((await contentCameraPdf(reordered, reordered.revision)).toString("latin1")).toContain(
      "/Count 3",
    );
    await expect(contentCameraPdf(reordered, reordered.revision - 1)).rejects.toMatchObject({
      status: 409,
    });
  });
  it("holds PDF generation until pending photos finish, rejects invalid bytes and oversized uploads, and releases removed pages", async () => {
    const { session, token } = await createContentCamera(teacher, "Physics/Syllabus");
    await expect(
      prepareContentPhoto(session.id, token, {
        name: "large.jpg",
        size: 3 * 1024 * 1024,
        source: "phone",
      }),
    ).rejects.toThrow("under 2 MB");
    const prepared = await prepareContentPhoto(session.id, token, {
      name: "bad.jpg",
      size: 6,
      source: "phone",
    });
    mock.objects.set(`${session.id}/${prepared.pageId}.jpg`, new TextEncoder().encode("notjpg"));
    const pending = await getContentCamera(session.id, token);
    await expect(contentCameraPdf(pending, pending.revision)).rejects.toMatchObject({
      status: 409,
    });
    await expect(completeContentPhoto(session.id, token, prepared.pageId)).rejects.toThrow(
      "could not be opened",
    );
    await removeContentPhoto(session.id, token, prepared.pageId);
    const pageId = await add(session.id, token);
    const state = await contentCameraState(await getContentCamera(session.id, token));
    expect(state.pendingCount).toBe(0);
    expect(state.pages.map((page) => page.id)).toEqual([pageId]);
  });
  it("revokes a closed QR and removes temporary files, including late uploads during expiry cleanup", async () => {
    const { session, token } = await createContentCamera(teacher, "Physics/Notes");
    const pageId = await add(session.id, token);
    await closeContentCamera(session.id, token);
    expect(mock.objects.size).toBe(0);
    await expect(getContentCamera(session.id, token)).rejects.toMatchObject({ status: 410 });
    mock.objects.set(`${session.id}/${pageId}.jpg`, image);
    await db.query(
      "update content_camera_sessions set expires_at=now()-interval '6 minutes' where id=$1",
      [session.id],
    );
    await cleanupContentCameras();
    expect(mock.objects.size).toBe(0);
    expect((await db.query("select * from content_camera_sessions")).rows).toHaveLength(0);
  });
});
