import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  role: vi.fn(),
  grants: vi.fn(),
  enrollmentRow: vi.fn(),
  deleted: vi.fn(),
}));

// One fake table per name; each chain ends the way faculty-lock.ts reads it.
vi.mock("next/headers", () => ({ headers: async () => new Headers({ host: "localhost:3000" }) }));
vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: () => ({
    from: (table: string) => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({
            data: table === "student_profiles" ? { role: mocks.role() } : mocks.enrollmentRow(),
            error: null,
          }),
          // student_exam_enrollments: every site the student joined, newest first.
          order: async () => ({
            data: mocks.enrollmentRow() ? [mocks.enrollmentRow()] : [],
            error: null,
          }),
        }),
        // landing_site_admins: the asking admin runs the "ioe" site when it has faculties.
        // landing_exam_faculties: that site's faculties.
        in: (_column: string, ids: string[]) => {
          const result =
            table === "landing_site_admins"
              ? {
                  data: mocks.grants().length
                    ? [{ user_id: ids[0], site_slug: "ioe", landing_sites: { name: "IOE" } }]
                    : [],
                  error: null,
                }
              : {
                  data: mocks.grants().map((row: object) => ({ ...row, exam_slug: "ioe" })),
                  error: null,
                };
          return Object.assign(Promise.resolve(result), {
            eq: () => ({ order: async () => result }),
          });
        },
      }),
      delete: () => ({
        eq: async (column: string, value: string) => (mocks.deleted(column, value), { error: null }),
      }),
    }),
  }),
}));

import { facultyChangeRefusal, releaseFacultyLockFor } from "@/lib/data/faculty-lock";

const enrollment = {
  exam_slug: "ioe",
  community_id: "f1",
  selected_at: "2026-10-01",
  communities: { slug: "bei", name: "BEI" },
  landing_sites: { name: "IOE" },
};
const grant = (id: string, slug: string, name: string) => ({
  communities: { id, slug, name, status: "active" },
});

// `cache` is per-request in React; a fresh user id per test keeps them apart.
let n = 0;
const user = () => `user-${++n}`;

describe("faculty lock", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.enrollmentRow.mockReturnValue(enrollment);
    mocks.grants.mockReturnValue([]);
  });

  it("pins an enrolled student to their faculty", async () => {
    mocks.role.mockReturnValue("student");
    expect(await facultyChangeRefusal(user(), { slug: "csit" })).toMatch(/locked/);
    expect(await facultyChangeRefusal(user(), { slug: "bei" })).toBeNull();
  });

  it("lets a super admin go anywhere", async () => {
    mocks.role.mockReturnValue("super_admin");
    expect(await facultyChangeRefusal(user(), { slug: "csit" })).toBeNull();
  });

  it("pins an admin with no subdomain like a student", async () => {
    mocks.role.mockReturnValue("admin");
    expect(await facultyChangeRefusal(user(), { slug: "csit" })).toMatch(/locked/);
  });

  it("lets an admin switch only between their subdomain's faculties", async () => {
    mocks.role.mockReturnValue("admin");
    mocks.grants.mockReturnValue([grant("f2", "csit", "Bsc CSIT"), grant("f3", "bct", "BCT")]);
    expect(await facultyChangeRefusal(user(), { slug: "csit" })).toBeNull();
    expect(await facultyChangeRefusal(user(), { id: "f3" })).toBeNull();
    expect(await facultyChangeRefusal(user(), { slug: "bel" })).toBe(
      "You can switch only between your faculties: Bsc CSIT, BCT.",
    );
  });

  it("releases the enrollment only for a permitted move", async () => {
    mocks.role.mockReturnValue("student");
    expect(await releaseFacultyLockFor(user(), { slug: "csit" })).toBe(false);

    mocks.role.mockReturnValue("admin");
    mocks.grants.mockReturnValue([grant("f2", "csit", "Bsc CSIT")]);
    expect(await releaseFacultyLockFor(user(), { slug: "bel" })).toBe(false);
    expect(mocks.deleted).not.toHaveBeenCalled();

    const admin = user();
    expect(await releaseFacultyLockFor(admin, { slug: "csit" })).toBe(true);
    expect(mocks.deleted).toHaveBeenCalledWith("user_id", admin);
  });

  it("releases nothing when moving to the enrolled faculty itself", async () => {
    mocks.role.mockReturnValue("super_admin");
    expect(await releaseFacultyLockFor(user(), { slug: "bei" })).toBe(false);
    expect(mocks.deleted).not.toHaveBeenCalled();
  });
});
