import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  isAdmin: vi.fn(),
  enrollmentRow: vi.fn(),
  deleted: vi.fn(),
}));

vi.mock("@/lib/data/platform-admin", () => ({ isPlatformAdmin: mocks.isAdmin }));
vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: () => ({
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: mocks.enrollmentRow(), error: null }) }) }),
      delete: () => ({ eq: async (column: string, value: string) => (mocks.deleted(column, value), { error: null }) }),
    }),
  }),
}));

import { getFacultyLock, releaseAdminFacultyLock } from "@/lib/data/faculty-lock";

const row = {
  exam_slug: "ioe",
  community_id: "f1",
  selected_at: "2026-10-01",
  communities: { slug: "bct-license", name: "BCT" },
  landing_sites: { name: "IOE" },
};

describe("faculty lock", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.enrollmentRow.mockReturnValue(row);
  });

  it("pins an enrolled student", async () => {
    mocks.isAdmin.mockResolvedValue(false);
    expect((await getFacultyLock("student-1"))?.facultySlug).toBe("bct-license");
  });

  it("never pins a platform admin", async () => {
    mocks.isAdmin.mockResolvedValue(true);
    expect(await getFacultyLock("admin-1")).toBeNull();
  });

  it("releases only an admin's own enrollment", async () => {
    mocks.isAdmin.mockResolvedValue(false);
    expect(await releaseAdminFacultyLock("student-2")).toBe(false);
    expect(mocks.deleted).not.toHaveBeenCalled();

    mocks.isAdmin.mockResolvedValue(true);
    expect(await releaseAdminFacultyLock("admin-2")).toBe(true);
    expect(mocks.deleted).toHaveBeenCalledWith("user_id", "admin-2");
  });
});
