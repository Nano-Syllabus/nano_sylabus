import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getTeacherProfile: vi.fn(),
  getTeacherSubjects: vi.fn(),
  createSupabaseAdminClient: vi.fn(),
}));

vi.mock("@/app/teachers/actions", () => ({ getTeacherProfile: mocks.getTeacherProfile }));
vi.mock("@/lib/teacher-app/client", () => ({ getTeacherSubjects: mocks.getTeacherSubjects }));
vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: mocks.createSupabaseAdminClient,
}));

import { DELETE } from "@/app/api/teacher/courses/[courseId]/route";

const context = (courseId = "course-1") => ({ params: Promise.resolve({ courseId }) });

function deleteQuery(data: { id: string } | null = { id: "course-1" }) {
  const query = {
    delete: vi.fn(),
    eq: vi.fn(),
    is: vi.fn(),
    select: vi.fn(),
    maybeSingle: vi.fn(async () => ({ data, error: null })),
  };
  query.delete.mockReturnValue(query);
  query.eq.mockReturnValue(query);
  query.is.mockReturnValue(query);
  query.select.mockReturnValue(query);
  return query;
}

describe("DELETE /api/teacher/courses/[courseId]", () => {
  beforeEach(() => {
    mocks.getTeacherProfile.mockResolvedValue({ id: "teacher-1" });
    const query = deleteQuery();
    mocks.createSupabaseAdminClient.mockReturnValue({ from: vi.fn(() => query) });
  });

  it("permanently deletes a course owned by the authenticated teacher", async () => {
    const response = await DELETE(
      new Request("http://localhost/api/teacher/courses/course-1", { method: "DELETE" }),
      context(),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ deleted: true });
    const admin = mocks.createSupabaseAdminClient.mock.results[0].value;
    expect(admin.from).toHaveBeenCalledWith("teacher_courses");
    const query = admin.from.mock.results[0].value;
    expect(query.delete).toHaveBeenCalledOnce();
    expect(query.eq).toHaveBeenCalledWith("id", "course-1");
    expect(query.eq).toHaveBeenCalledWith("teacher_id", "teacher-1");
  });

  it("does not allow course deletion without an authenticated teacher", async () => {
    mocks.getTeacherProfile.mockResolvedValueOnce(null);

    const response = await DELETE(
      new Request("http://localhost/api/teacher/courses/course-1", { method: "DELETE" }),
      context(),
    );

    expect(response.status).toBe(401);
    expect(mocks.createSupabaseAdminClient).not.toHaveBeenCalled();
  });

  it("returns not found when the course is not owned by the teacher", async () => {
    const query = deleteQuery(null);
    mocks.createSupabaseAdminClient.mockReturnValueOnce({ from: vi.fn(() => query) });

    const response = await DELETE(
      new Request("http://localhost/api/teacher/courses/other", { method: "DELETE" }),
      context("other"),
    );

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ error: "Course not found." });
  });
});
