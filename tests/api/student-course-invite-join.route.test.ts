import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createSupabaseServerClient: vi.fn(),
  enrollStudentInCourseByInviteCode: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: mocks.createSupabaseServerClient,
}));
vi.mock("@/lib/student-courses", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/student-courses")>();
  return {
    ...actual,
    enrollStudentInCourseByInviteCode: mocks.enrollStudentInCourseByInviteCode,
  };
});

import { POST } from "@/app/api/student/course-invites/[code]/join/route";
import { StudentCourseError } from "@/lib/student-courses";

describe("POST /api/student/course-invites/[code]/join", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createSupabaseServerClient.mockResolvedValue({
      auth: { getUser: vi.fn(async () => ({ data: { user: { id: "student-1" } } })) },
    });
    mocks.enrollStudentInCourseByInviteCode.mockResolvedValue({
      id: "course-1",
      slug: "private-programming",
      name: "Private Programming",
    });
  });

  it("turns a valid invite into a regular course enrollment", async () => {
    const response = await POST(new Request("http://localhost", { method: "POST" }), {
      params: Promise.resolve({ code: "ABCDEF0123456789ABCDEF0123456789" }),
    });

    expect(response.status).toBe(200);
    expect(mocks.enrollStudentInCourseByInviteCode).toHaveBeenCalledWith(
      "student-1",
      "ABCDEF0123456789ABCDEF0123456789",
    );
    await expect(response.json()).resolves.toMatchObject({
      course: { id: "course-1", slug: "private-programming" },
    });
  });

  it("requires authentication before joining", async () => {
    mocks.createSupabaseServerClient.mockResolvedValueOnce({
      auth: { getUser: vi.fn(async () => ({ data: { user: null } })) },
    });

    const response = await POST(new Request("http://localhost", { method: "POST" }), {
      params: Promise.resolve({ code: "ABCDEF0123456789ABCDEF0123456789" }),
    });

    expect(response.status).toBe(401);
    expect(mocks.enrollStudentInCourseByInviteCode).not.toHaveBeenCalled();
  });

  it("preserves revoked-link and creator enrollment errors", async () => {
    mocks.enrollStudentInCourseByInviteCode.mockRejectedValueOnce(
      new StudentCourseError("This course invite is invalid or no longer active.", 404),
    );

    const response = await POST(new Request("http://localhost", { method: "POST" }), {
      params: Promise.resolve({ code: "REVOKED0123456789" }),
    });

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({
      error: "This course invite is invalid or no longer active.",
    });
  });
});
