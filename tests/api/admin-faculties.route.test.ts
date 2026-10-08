import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  access: vi.fn(),
  create: vi.fn(),
  list: vi.fn(),
  get: vi.fn(),
  update: vi.fn(),
  addSubject: vi.fn(),
  updateSubject: vi.fn(),
  scope: vi.fn(),
}));
vi.mock("@/lib/admin-access", () => ({ assertAdminRequest: mocks.access }));
// The scope lookup reads Supabase; tests hand it a scope directly.
vi.mock("@/lib/admin-scope", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/admin-scope")>();
  return {
    ...actual,
    assertScopedAdmin: async () => {
      const access = await mocks.access();
      return "error" in access ? access : { ...access, scope: mocks.scope() };
    },
  };
});
vi.mock("@/lib/data/faculty-activity", () => ({ recordFacultyActivity: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => {
  const chain: Record<string, unknown> = {};
  for (const key of ["from", "update", "eq", "gte"]) chain[key] = () => chain;
  chain.then = (resolve: (value: { error: null }) => unknown) => resolve({ error: null });
  return { createSupabaseAdminClient: () => chain };
});
vi.mock("@/lib/data/communities", () => ({
  createCommunity: mocks.create,
  CommunityError: class extends Error {},
}));
vi.mock("@/lib/data/admin-faculties", () => ({
  listAdminFaculties: mocks.list,
  getAdminFaculty: mocks.get,
  updateAdminFaculty: mocks.update,
  addAdminFacultySubject: mocks.addSubject,
  updateAdminFacultySubject: mocks.updateSubject,
}));
import { GET, POST } from "@/app/api/admin/faculties/route";
import { PATCH } from "@/app/api/admin/faculties/[slug]/route";
import { POST as addSubject } from "@/app/api/admin/faculties/[slug]/subjects/route";
import { PATCH as updateSubject } from "@/app/api/admin/faculties/[slug]/subjects/[subjectId]/route";
const faculty = {
  name: "BCT License",
  university: "Nepal Engineering Council",
  faculty: "BCT",
  level: "License",
  totalYears: 1,
  totalSemesters: 1,
  visibility: "public",
  challengeQuestionFormat: "mcq",
  description: "",
};
const context = { params: Promise.resolve({ slug: "bct-license" }) };
const termId = "11111111-1111-4111-8111-111111111111";
const subjectContext = { params: Promise.resolve({ slug: "bct-license", subjectId: termId }) };
function req(body: unknown, method = "POST", origin = "http://localhost") {
  return new Request("http://localhost/api/admin/faculties", {
    method,
    headers: { "Content-Type": "application/json", origin },
    body: JSON.stringify(body),
  });
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.access.mockResolvedValue({ userId: "verified-admin", role: "admin" });
  mocks.scope.mockReturnValue({
    all: false,
    userId: "verified-admin",
    role: "admin",
    site: { slug: "license", name: "License" },
    faculties: [{ id: "f1", slug: "bct-license", name: "BCT License" }],
  });
  mocks.create.mockResolvedValue({ slug: "bct-license" });
  mocks.update.mockResolvedValue({ slug: "bct-license" });
  mocks.addSubject.mockResolvedValue({ slug: "bct-license" });
  mocks.updateSubject.mockResolvedValue({ slug: "bct-license" });
});
describe("admin faculty permissions", () => {
  it.each([401, 403])("denies all reads and writes for status %s", async (status) => {
    mocks.access.mockResolvedValue({ error: "Denied", status });
    expect((await GET()).status).toBe(status);
    expect((await POST(req(faculty))).status).toBe(status);
    expect((await PATCH(req(faculty, "PATCH"), context)).status).toBe(status);
    expect((await addSubject(req({ termId, name: "Physics" }), context)).status).toBe(status);
    expect((await updateSubject(req({ action: "publish" }, "PATCH"), subjectContext)).status).toBe(
      status,
    );
    for (const write of [
      mocks.create,
      mocks.update,
      mocks.addSubject,
      mocks.updateSubject,
      mocks.list,
    ])
      expect(write).not.toHaveBeenCalled();
  });
  it("takes the creator from the verified admin session", async () => {
    expect((await POST(req({ ...faculty, creatorId: "forged", userId: "forged" }))).status).toBe(
      201,
    );
    expect(mocks.create).toHaveBeenCalledExactlyOnceWith("verified-admin", faculty);
  });
  it("rejects cross-origin writes", async () => {
    expect((await POST(req(faculty, "POST", "https://evil.example"))).status).toBe(403);
    expect((await PATCH(req(faculty, "PATCH", "https://evil.example"), context)).status).toBe(403);
    expect(
      (await addSubject(req({ termId, name: "Physics" }, "POST", "https://evil.example"), context))
        .status,
    ).toBe(403);
    expect(
      (
        await updateSubject(
          req({ action: "publish" }, "PATCH", "https://evil.example"),
          subjectContext,
        )
      ).status,
    ).toBe(403);
    expect(mocks.create).not.toHaveBeenCalled();
  });
  it("cannot change a creator or stable faculty URL through metadata", async () => {
    expect(
      (
        await PATCH(
          req({ ...faculty, status: "active", slug: "changed", creator_id: "forged" }, "PATCH"),
          context,
        )
      ).status,
    ).toBe(200);
    const input = mocks.update.mock.calls[0][1];
    expect(input).not.toHaveProperty("creator_id");
    expect(input).not.toHaveProperty("slug");
    expect(input).not.toHaveProperty("totalYears");
  });
  it("rejects malformed subject creation without running provisioning", async () => {
    expect((await addSubject(req({ termId: "bad", name: "Physics" }), context)).status).toBe(400);
    expect((await addSubject(req({ termId, name: "../secret" }), context)).status).toBe(400);
    expect(mocks.addSubject).not.toHaveBeenCalled();
  });
  it("refuses a faculty outside the admin's subdomain", async () => {
    mocks.scope.mockReturnValue({
      all: false,
      userId: "verified-admin",
      role: "admin",
      site: { slug: "ioe", name: "IOE" },
      faculties: [{ id: "f2", slug: "bei", name: "BEI" }],
    });
    const response = await PATCH(req(faculty, "PATCH"), context);
    expect(response.status).toBe(403);
    expect(mocks.update).not.toHaveBeenCalled();
  });
});
