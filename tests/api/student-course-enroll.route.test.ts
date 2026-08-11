import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createSupabaseServerClient: vi.fn(),
  enrollStudentInCourse: vi.fn(),
  leaveStudentCourse: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: mocks.createSupabaseServerClient,
}));
vi.mock("@/lib/student-courses", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/student-courses")>();
  return {
    ...actual,
    enrollStudentInCourse: mocks.enrollStudentInCourse,
    leaveStudentCourse: mocks.leaveStudentCourse,
  };
});

import { DELETE, POST } from "@/app/api/student/courses/[slug]/enroll/route";
import { StudentCourseError } from "@/lib/student-courses";

describe("POST /api/student/courses/[slug]/enroll", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createSupabaseServerClient.mockResolvedValue({
      auth: { getUser: vi.fn(async () => ({ data: { user: { id: "student-1" } } })) },
    });
    mocks.enrollStudentInCourse.mockResolvedValue({
      id: "course-1",
      slug: "ioe-entrance",
      name: "IOE Entrance",
    });
    mocks.leaveStudentCourse.mockResolvedValue({
      id: "course-1",
      slug: "ioe-entrance",
      name: "IOE Entrance",
    });
  });

  it("enrolls the authenticated student in the requested course", async () => {
    const response = await POST(new Request("http://localhost", { method: "POST" }), {
      params: Promise.resolve({ slug: "ioe-entrance" }),
    });

    expect(response.status).toBe(200);
    expect(mocks.enrollStudentInCourse).toHaveBeenCalledWith("student-1", "ioe-entrance");
    await expect(response.json()).resolves.toMatchObject({
      course: { id: "course-1", slug: "ioe-entrance" },
    });
  });

  it("does not allow enrollment without a signed-in student", async () => {
    mocks.createSupabaseServerClient.mockResolvedValueOnce({
      auth: { getUser: vi.fn(async () => ({ data: { user: null } })) },
    });

    const response = await POST(new Request("http://localhost", { method: "POST" }), {
      params: Promise.resolve({ slug: "ioe-entrance" }),
    });

    expect(response.status).toBe(401);
    expect(mocks.enrollStudentInCourse).not.toHaveBeenCalled();
  });

  it("preserves course enrollment errors such as unavailable checkout", async () => {
    mocks.enrollStudentInCourse.mockRejectedValueOnce(
      new StudentCourseError("Paid enrollment is not available yet.", 409),
    );

    const response = await POST(new Request("http://localhost", { method: "POST" }), {
      params: Promise.resolve({ slug: "paid-course" }),
    });

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      error: "Paid enrollment is not available yet.",
    });
  });

  it("lets the authenticated student leave an enrolled course", async () => {
    const response = await DELETE(new Request("http://localhost", { method: "DELETE" }), {
      params: Promise.resolve({ slug: "ioe-entrance" }),
    });

    expect(response.status).toBe(200);
    expect(mocks.leaveStudentCourse).toHaveBeenCalledWith("student-1", "ioe-entrance");
    await expect(response.json()).resolves.toMatchObject({
      course: { id: "course-1", slug: "ioe-entrance" },
    });
  });

  it("does not allow leaving without a signed-in student", async () => {
    mocks.createSupabaseServerClient.mockResolvedValueOnce({
      auth: { getUser: vi.fn(async () => ({ data: { user: null } })) },
    });

    const response = await DELETE(new Request("http://localhost", { method: "DELETE" }), {
      params: Promise.resolve({ slug: "ioe-entrance" }),
    });

    expect(response.status).toBe(401);
    expect(mocks.leaveStudentCourse).not.toHaveBeenCalled();
  });

  it("preserves leave-course errors", async () => {
    mocks.leaveStudentCourse.mockRejectedValueOnce(
      new StudentCourseError("You are not enrolled in this course.", 404),
    );

    const response = await DELETE(new Request("http://localhost", { method: "DELETE" }), {
      params: Promise.resolve({ slug: "ioe-entrance" }),
    });

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({
      error: "You are not enrolled in this course.",
    });
  });
});
