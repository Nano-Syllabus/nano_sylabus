import { beforeEach, describe, expect, it, vi } from "vitest";
import { createLandingTemplate } from "@/lib/landing-templates";

type Row = {
  slug: string;
  name: string;
  status: string;
  draft: unknown;
  content: unknown;
  published_at: string | null;
  updated_at: string;
};
const db = vi.hoisted(() => ({ rows: new Map<string, Row>(), inserts: 0, superAdmin: true }));
vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
  unstable_cache: (fn: unknown) => fn,
}));
vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: () => ({
    from: () => {
      let slug = "";
      let patch: Record<string, unknown> | null = null;
      const read = async () => {
        const existing = db.rows.get(slug);
        if (existing && patch) db.rows.set(slug, { ...existing, ...patch } as Row);
        return { data: db.rows.get(slug) ?? null, error: null };
      };
      const query = {
        select: () => query,
        eq: (_column: string, value: string) => {
          slug = value;
          return query;
        },
        maybeSingle: read,
        single: read,
      };
      return {
        select: () => query,
        upsert: async () => ({ error: null }),
        insert: (row: Record<string, unknown>) => {
          db.inserts++;
          slug = String(row.slug);
          db.rows.set(slug, {
            ...row,
            published_at: null,
            updated_at: new Date().toISOString(),
          } as Row);
          return query;
        },
        update: (value: Record<string, unknown>) => {
          patch = value;
          return query;
        },
      };
    },
  }),
}));
vi.mock("@/lib/admin-scope", () => ({
  assertScopedAdmin: async () => ({
    userId: "admin-1",
    role: db.superAdmin ? "super_admin" : "admin",
    scope: { all: db.superAdmin },
  }),
  superAdminOnly: () => new Response(JSON.stringify({ error: "Forbidden" }), { status: 403 }),
}));
vi.mock("@/lib/data/faculty-activity", () => ({ recordFacultyActivity: vi.fn() }));

import {
  createLandingSite,
  getLandingSite,
  getPublishedLandingSite,
  publishLandingSite,
  updateLandingSite,
} from "@/lib/data/landing-sites";
import { POST } from "@/app/api/admin/sites/route";

describe("sample selection, drafts and publishing", () => {
  beforeEach(() => {
    db.rows.clear();
    db.inserts = 0;
    db.superAdmin = true;
  });

  it("creates a hidden sample and retains its layout and customisations across saving and publishing", async () => {
    const site = await createLandingSite({
      slug: "my-exam",
      name: "My exam",
      templateId: "academy",
      userId: "admin-1",
    });
    expect(site.status).toBe("hidden");
    expect(site.draft).toEqual(createLandingTemplate("academy"));
    expect(await getPublishedLandingSite(site.slug)).toBeNull();
    const draft = { ...site.draft, hero: { ...site.draft.hero, titleLead: "Custom exam" } };
    await updateLandingSite(site.slug, { draft }, "admin-1");
    expect((await getLandingSite(site.slug))?.draft.hero.titleLead).toBe("Custom exam");
    expect((await getLandingSite(site.slug))?.content.hero.titleLead).toBe(
      site.content.hero.titleLead,
    );
    await publishLandingSite(site.slug, "admin-1");
    await updateLandingSite(site.slug, { status: "live" }, "admin-1");
    const published = await getPublishedLandingSite(site.slug);
    expect(published?.content.design.template).toBe("academy");
    expect(published?.content.hero.titleLead).toBe("Custom exam");
    expect((await getLandingSite(site.slug))?.hasUnpublishedChanges).toBe(false);
  });

  it("copies the published layout and content of an existing site", async () => {
    const original = await createLandingSite({
      slug: "original-exam",
      name: "Original exam",
      templateId: "studio",
      userId: "admin-1",
    });
    await updateLandingSite(
      original.slug,
      {
        draft: { ...original.draft, hero: { ...original.draft.hero, titleLead: "Not published" } },
      },
      "admin-1",
    );
    const copy = await createLandingSite({
      slug: "copied-exam",
      name: "Copied exam",
      copyFrom: original.slug,
      userId: "admin-1",
    });
    expect(copy.draft).toEqual(original.content);
    expect(copy.draft.design.template).toBe("studio");
  });

  it("accepts a sample through the create API and rejects invalid or conflicting choices without writes", async () => {
    const request = (body: object) =>
      new Request("http://localhost/api/admin/sites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
    const response = await POST(
      request({ slug: "new-course", name: "New course", templateId: "community" }),
    );
    expect(response.status).toBe(201);
    expect((await response.json()).site.draft.design.template).toBe("community");
    const inserts = db.inserts;
    expect((await POST(request({ slug: "bad", name: "Bad", templateId: "unknown" }))).status).toBe(
      400,
    );
    expect(
      (await POST(request({ slug: "both", name: "Both", templateId: "studio", copyFrom: "main" })))
        .status,
    ).toBe(400);
    db.superAdmin = false;
    expect(
      (await POST(request({ slug: "forbidden", name: "Forbidden", templateId: "academy" }))).status,
    ).toBe(403);
    expect(db.inserts).toBe(inserts);
  });
});
