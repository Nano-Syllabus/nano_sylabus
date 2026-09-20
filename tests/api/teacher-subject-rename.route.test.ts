import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getTeacherProfile: vi.fn(),
  createSupabaseAdminClient: vi.fn(),
}));

vi.mock("@/app/teachers/actions", () => ({ getTeacherProfile: mocks.getTeacherProfile }));
vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: mocks.createSupabaseAdminClient,
}));
vi.mock("@/lib/data/study-trail-cleanup", () => ({
  clearTeacherSubjectTrails: vi.fn(),
}));
vi.mock("@/lib/teacher-course-links", () => ({
  detachTeacherSubjectFromCourses: vi.fn(),
}));
vi.mock("@/lib/teacher-app/client", () => ({
  getTeacherSubjects: vi.fn(),
  deleteTeacherSubject: vi.fn(),
  TeacherApiError: class MockTeacherApiError extends Error {
    constructor(message: string, readonly status: number) {
      super(message);
    }
  },
}));

import { PATCH } from "@/app/api/teacher/subjects/[slug]/route";

const context = (slug = "physics") => ({ params: Promise.resolve({ slug }) });

function createQuery<T>(data: T | null = null) {
  const query = {
    select: vi.fn(),
    update: vi.fn(),
    eq: vi.fn(),
    maybeSingle: vi.fn(async () => ({ data, error: null })),
    error: null,
  };
  query.select.mockReturnValue(query);
  query.update.mockReturnValue(query);
  query.eq.mockReturnValue(query);
  return query;
}

describe("PATCH /api/teacher/subjects/[slug]", () => {
  beforeEach(() => {
    mocks.getTeacherProfile.mockResolvedValue({ id: "teacher-1" });
    const queries = {
      teacher_subject_profiles: createQuery({ subject_name: "Physics", folder_path: "Physics" }),
      community_subjects: createQuery(),
      teacher_course_subjects: createQuery(),
      teacher_classrooms: createQuery(),
      teacher_exam_papers: createQuery(),
    };
    mocks.createSupabaseAdminClient.mockReturnValue({
      from: vi.fn((table: keyof typeof queries) => queries[table]),
    });
  });

  it("renames the display label without changing its slug or folder", async () => {
    const response = await PATCH(
      new Request("http://localhost/api/teacher/subjects/physics", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: " Applied  Mechanics " }),
      }),
      context(),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      subject: { slug: "physics", name: "Applied Mechanics", folder_path: "Physics" },
      name: "Applied Mechanics",
      renamed: true,
    });
    const admin = mocks.createSupabaseAdminClient.mock.results[0].value;
    expect(admin.from("teacher_subject_profiles").update).toHaveBeenCalledWith(
      expect.objectContaining({ subject_name: "Applied Mechanics" }),
    );
    expect(admin.from("community_subjects").update).toHaveBeenCalledWith(
      expect.objectContaining({ name: "Applied Mechanics" }),
    );
  });

  it("rejects an invalid name before touching the database", async () => {
    const response = await PATCH(
      new Request("http://localhost/api/teacher/subjects/physics", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Physics/Notes" }),
      }),
      context(),
    );

    expect(response.status).toBe(400);
    expect(mocks.createSupabaseAdminClient).not.toHaveBeenCalled();
  });

  it("does not rename a subject outside the teacher workspace", async () => {
    const profileQuery = createQuery(null);
    mocks.createSupabaseAdminClient.mockReturnValueOnce({
      from: vi.fn(() => profileQuery),
    });

    const response = await PATCH(
      new Request("http://localhost/api/teacher/subjects/missing", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "New name" }),
      }),
      context("missing"),
    );

    expect(response.status).toBe(404);
  });
});
