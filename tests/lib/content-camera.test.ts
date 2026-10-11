import { randomUUID } from "node:crypto";
import sharp from "sharp";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { photoPagesToPdf } from "@/lib/browser-photo-pdf";
import { GET, POST, DELETE } from "@/app/api/content-camera/[id]/[token]/route";

const mock = vi.hoisted(() => ({
  objects: new Map<string, Blob>(),
  removed: [] as string[],
  beforePdfRead: undefined as (() => Promise<void>) | undefined,
}));
vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: () => {
    throw new Error("Camera handoffs must never access Supabase.");
  },
}));
vi.mock("@/lib/vps-storage", () => ({
  createVpsStorageClient: () => ({
    from: (bucket: string) => {
      expect(bucket).toBe("content-camera");
      return {
        upload: async (path: string, data: string) => {
          if (mock.objects.has(path)) return { error: { statusCode: "409" } };
          mock.objects.set(path, new Blob([data], { type: "application/json" }));
          return { error: null };
        },
        download: async (path: string) => {
          if (path.endsWith(".pdf")) await mock.beforePdfRead?.();
          const data = mock.objects.get(path);
          return data ? { data, error: null } : { data: null, error: { statusCode: "404" } };
        },
        info: async (path: string) => {
          const data = mock.objects.get(path);
          return data
            ? { data: { size: data.size, mimetype: data.type }, error: null }
            : { data: null, error: { statusCode: "404" } };
        },
        createSignedUploadUrl: async (path: string, seconds: number) => ({
          data: {
            signedUrl: `/vps-storage/signed-upload/content-camera/${path}?seconds=${seconds}`,
          },
        }),
        remove: async (paths: string[]) => {
          paths.forEach((path) => {
            mock.objects.delete(path);
            mock.removed.push(path);
          });
          return { error: null };
        },
        list: async (prefix: string, after = "") => {
          const names = new Map<string, boolean>();
          for (const path of mock.objects.keys()) {
            if (!path.startsWith(prefix + "/")) continue;
            const tail = path.slice(prefix.length + 1),
              name = tail.split("/")[0];
            if (name > after) names.set(name, tail.includes("/"));
          }
          return {
            data: [...names]
              .sort(([a], [b]) => a.localeCompare(b))
              .slice(0, 1000)
              .map(([name, isDirectory]) => ({ name, isDirectory })),
            error: null,
          };
        },
      };
    },
  }),
}));
import {
  cleanupContentCameras,
  closeContentCamera,
  completeContentPdf,
  contentCameraPdf,
  contentCameraState,
  createContentCamera,
  getContentCamera,
  prepareContentPdf,
} from "@/lib/data/content-camera";

beforeEach(() => {
  mock.objects.clear();
  mock.removed.length = 0;
  mock.beforePdfRead = undefined;
});
const root = (id: string) => `handoffs/${id}`;
async function prepared(pageCount = 2) {
  const opened = await createContentCamera(randomUUID(), "Physics/Notes");
  const jpeg = new Blob(
    [
      new Uint8Array(
        await sharp({ create: { width: 20, height: 30, channels: 3, background: "white" } })
          .jpeg()
          .toBuffer(),
      ),
    ],
    { type: "image/jpeg" },
  );
  const pdf = photoPagesToPdf(
    Array.from({ length: pageCount }, () => ({ blob: jpeg, width: 20, height: 30 })),
  );
  const reservation = await prepareContentPdf(opened.session.id, opened.token, {
    name: "My notes",
    size: pdf.size,
    pageCount,
  });
  const path = `${root(opened.session.id)}/${reservation.pdfId}.pdf`;
  return { ...opened, reservation, pdf, path };
}
describe("private VPS PDF handoffs", () => {
  it("creates a hashed, expiring QR session without Supabase or image objects", async () => {
    const { session, token } = await createContentCamera(randomUUID(), "Syllabus");
    expect(token).toMatch(/^[a-f0-9]{64}$/);
    expect(session.token_hash).not.toBe(token);
    expect(Date.parse(session.expires_at) - Date.now()).toBeGreaterThan(119 * 60_000);
    expect(await getContentCamera(session.id, token)).toEqual(session);
    expect(await contentCameraState(session)).toEqual({
      id: session.id,
      title: "Syllabus",
      expiresAt: session.expires_at,
      maxPages: 50,
      pdf: null,
    });
    expect([...mock.objects.keys()]).toEqual([`${root(session.id)}/session.json`]);
    expect(await mock.objects.values().next().value!.text()).not.toContain(token);
    await expect(getContentCamera(session.id, "0".repeat(64))).rejects.toMatchObject({
      status: 404,
    });
    await expect(getContentCamera("../escape", token)).rejects.toMatchObject({ status: 404 });
  });
  it("accepts one finished phone PDF, verifies its page count, and delivers the same bytes", async () => {
    const fixture = await prepared();
    const { session, token, reservation, pdf, path } = fixture;
    expect(reservation.uploadUrl).toContain(`${reservation.pdfId}.pdf`);
    expect(reservation.uploadUrl).toContain("seconds=300");
    await expect(completeContentPdf(session.id, token, reservation.pdfId)).rejects.toMatchObject({
      status: 409,
    });
    mock.objects.set(path, pdf);
    await completeContentPdf(session.id, token, reservation.pdfId);
    const state = await contentCameraState(session);
    expect(state.pdf).toMatchObject({
      id: reservation.pdfId,
      name: "My notes.pdf",
      size: pdf.size,
      pageCount: 2,
    });
    expect(state).not.toHaveProperty("teacher_id");
    expect(state.pdf).not.toHaveProperty("digest");
    expect(Buffer.from(await pdf.arrayBuffer())).toEqual(
      await contentCameraPdf(session, reservation.pdfId),
    );
    await expect(completeContentPdf(session.id, token, reservation.pdfId)).resolves.toEqual(
      session,
    );
    await expect(
      prepareContentPdf(session.id, token, { name: "Second.pdf", size: 100, pageCount: 1 }),
    ).rejects.toMatchObject({ status: 409 });
    expect([...mock.objects.keys()].every((path) => /\.(json|pdf)$/.test(path))).toBe(true);
  });
  it("blocks incorrect size, mime type, corrupt PDFs, and page-count mismatches", async () => {
    const { session, token, reservation, pdf, path } = await prepared();
    for (const wrong of [
      new Blob(["not a PDF"], { type: "application/pdf" }),
      new Blob([await pdf.arrayBuffer()], { type: "image/jpeg" }),
      new Blob([" ".repeat(pdf.size)], { type: "application/pdf" }),
    ]) {
      mock.objects.set(path, wrong);
      await expect(completeContentPdf(session.id, token, reservation.pdfId)).rejects.toThrow();
    }
    mock.objects.set(path, pdf);
    const manifest = `${root(session.id)}/${reservation.pdfId}.json`;
    const values = JSON.parse(await mock.objects.get(manifest)!.text());
    mock.objects.set(manifest, new Blob([JSON.stringify({ ...values, pageCount: 3 })]));
    await expect(completeContentPdf(session.id, token, reservation.pdfId)).rejects.toThrow(
      "verified",
    );
  });
  it("detects a signed-upload overwrite after the PDF has been completed", async () => {
    const { session, token, reservation, pdf, path } = await prepared();
    mock.objects.set(path, pdf);
    await completeContentPdf(session.id, token, reservation.pdfId);
    const bytes = new Uint8Array(await pdf.arrayBuffer());
    bytes[200] ^= 1;
    mock.objects.set(path, new Blob([bytes], { type: "application/pdf" }));
    await expect(contentCameraPdf(session, reservation.pdfId)).rejects.toMatchObject({
      status: 409,
    });
  });
  it("does not allow a late completion to reopen a closed link; closing is idempotent", async () => {
    const { session, token, reservation, pdf, path } = await prepared();
    mock.objects.set(path, pdf);
    mock.beforePdfRead = () => closeContentCamera(session.id, token);
    await expect(completeContentPdf(session.id, token, reservation.pdfId)).rejects.toMatchObject({
      status: 410,
    });
    await expect(closeContentCamera(session.id, token)).resolves.toBeUndefined();
    await expect(getContentCamera(session.id, token)).rejects.toMatchObject({ status: 410 });
    expect(mock.objects.has(`${root(session.id)}/ready.json`)).toBe(false);
  });
  it("revokes the QR and removes the delivered PDF on close, keeping a tombstone", async () => {
    const { session, token, reservation, pdf, path } = await prepared();
    mock.objects.set(path, pdf);
    await completeContentPdf(session.id, token, reservation.pdfId);
    await Promise.all([
      closeContentCamera(session.id, token),
      closeContentCamera(session.id, token),
    ]);
    expect(mock.objects.has(path)).toBe(false);
    expect(mock.objects.has(`${root(session.id)}/closed.json`)).toBe(true);
    await expect(contentCameraPdf(session, reservation.pdfId)).rejects.toMatchObject({
      status: 410,
    });
  });
  it("expires QR links and sweeps all abandoned uploads only after signed PUTs expire", async () => {
    const { session, token, pdf, path } = await prepared();
    mock.objects.set(path, pdf);
    const expired = { ...session, expires_at: new Date(Date.now() - 1000).toISOString() };
    mock.objects.set(`${root(session.id)}/session.json`, new Blob([JSON.stringify(expired)]));
    await expect(getContentCamera(session.id, token)).rejects.toMatchObject({ status: 410 });
    await cleanupContentCameras();
    expect(mock.objects.has(path)).toBe(true);
    expired.expires_at = new Date(Date.now() - 6 * 60_000).toISOString();
    mock.objects.set(`${root(session.id)}/session.json`, new Blob([JSON.stringify(expired)]));
    await cleanupContentCameras();
    expect(mock.objects.size).toBe(0);
  });
  it.each([
    { size: 51 * 1024 * 1024, pageCount: 1 },
    { size: 100, pageCount: 0 },
    { size: 100, pageCount: 51 },
  ])("rejects invalid PDF limits: %j", async (input) => {
    const { session, token } = await createContentCamera(randomUUID(), "Notes");
    await expect(
      prepareContentPdf(session.id, token, { name: "notes", ...input }),
    ).rejects.toThrow();
  });
});

describe("phone handoff API", () => {
  it("accepts PDF actions only and rejects the old individual-photo upload actions", async () => {
    const { session, token } = await createContentCamera(randomUUID(), "Notes");
    const context = { params: Promise.resolve({ id: session.id, token }) };
    for (const action of ["prepare", "complete", "reorder", "remove"]) {
      const response = await POST(
        new Request("http://localhost/api/content-camera", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action, name: "photo.jpg", size: 100, source: "phone" }),
        }),
        context,
      );
      expect(response.status).toBe(400);
    }
    const response = await POST(
      new Request("http://localhost/api/content-camera", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "prepare-pdf", name: "Notes.pdf", size: 100, pageCount: 2 }),
      }),
      context,
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toHaveProperty("pdfId");
    expect(response.headers.get("Cache-Control")).toContain("no-store");
  });
  it("serves the verified PDF privately and denies both incorrect and revoked QR tokens", async () => {
    const { session, token, reservation, pdf, path } = await prepared();
    mock.objects.set(path, pdf);
    await completeContentPdf(session.id, token, reservation.pdfId);
    const context = { params: Promise.resolve({ id: session.id, token }) };
    const response = await GET(
      new Request(`http://localhost/api/content-camera?pdf=${reservation.pdfId}`),
      context,
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("application/pdf");
    expect(response.headers.get("Referrer-Policy")).toBe("no-referrer");
    expect(Buffer.from(await response.arrayBuffer())).toEqual(Buffer.from(await pdf.arrayBuffer()));
    const denied = await GET(new Request("http://localhost/api/content-camera"), {
      params: Promise.resolve({ id: session.id, token: "f".repeat(64) }),
    });
    expect(denied.status).toBe(404);
    expect((await DELETE(new Request("http://localhost/api/content-camera"), context)).status).toBe(
      200,
    );
    expect((await GET(new Request("http://localhost/api/content-camera"), context)).status).toBe(
      410,
    );
  });
});
