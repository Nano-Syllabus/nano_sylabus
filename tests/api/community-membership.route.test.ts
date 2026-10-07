import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  enrollment: vi.fn(),
  isAdmin: vi.fn(),
  release: vi.fn(),
  createSupabaseServerClient: vi.fn(),
  joinCommunity: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: mocks.createSupabaseServerClient,
}));
vi.mock("@/lib/data/communities", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/data/communities")>();
  return { ...actual, joinCommunity: mocks.joinCommunity };
});

// The lock's contract (lib/data/faculty-lock.ts, tested there): a super admin
// is never refused, and releasing is a no-op for anyone else.
vi.mock("@/lib/data/faculty-lock", () => ({
  facultyChangeRefusal: async (id: string, target: { slug: string }) =>
    !(await mocks.isAdmin(id)) && (await mocks.enrollment(id))?.facultySlug !== undefined &&
    (await mocks.enrollment(id)).facultySlug !== target.slug
      ? "Your faculty is locked. Contact an admin to change it."
      : null,
  releaseFacultyLockFor: mocks.release,
}));

import { POST } from "@/app/api/communities/[slug]/join/route";

describe("POST /api/communities/[slug]/join", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.enrollment.mockResolvedValue(null);
    mocks.isAdmin.mockResolvedValue(false);
    mocks.release.mockImplementation(async (id: string) => mocks.isAdmin(id));
    mocks.createSupabaseServerClient.mockResolvedValue({
      auth: { getUser: vi.fn(async () => ({ data: { user: { id: "aarav" } } })) },
    });
    mocks.joinCommunity.mockResolvedValue({
      id: "community-1",
      slug: "sec-bei",
      membership: { status: "active" },
    });
  });

  it("joins the signed-in student", async () => {
    const response = await POST(new Request("http://localhost", { method: "POST" }), {
      params: Promise.resolve({ slug: "sec-bei" }),
    });
    expect(response.status).toBe(200);
    expect(mocks.joinCommunity).toHaveBeenCalledWith("aarav", "sec-bei");
  });

  it("cannot join a different faculty after the exam choice is locked", async () => {
    mocks.enrollment.mockResolvedValue({ facultySlug: "bct-license" });
    const response = await POST(new Request("http://localhost", { method: "POST" }), {
      params: Promise.resolve({ slug: "sec-bei" }),
    });
    expect(response.status).toBe(409);
    expect(mocks.joinCommunity).not.toHaveBeenCalled();
    expect(mocks.release).not.toHaveBeenCalled();
  });

  it("lets a super admin change faculty, releasing their own lock first", async () => {
    mocks.enrollment.mockResolvedValue({ facultySlug: "bct-license" });
    mocks.isAdmin.mockResolvedValue(true);
    const response = await POST(new Request("http://localhost", { method: "POST" }), {
      params: Promise.resolve({ slug: "sec-bei" }),
    });
    expect(response.status).toBe(200);
    expect(mocks.release).toHaveBeenCalledWith("aarav", { slug: "sec-bei" });
    expect(mocks.release.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.joinCommunity.mock.invocationCallOrder[0],
    );
  });

  it("does not call the join service without authentication", async () => {
    mocks.createSupabaseServerClient.mockResolvedValueOnce({
      auth: { getUser: vi.fn(async () => ({ data: { user: null } })) },
    });
    const response = await POST(new Request("http://localhost", { method: "POST" }), {
      params: Promise.resolve({ slug: "sec-bei" }),
    });
    expect(response.status).toBe(401);
    expect(mocks.joinCommunity).not.toHaveBeenCalled();
  });
});
