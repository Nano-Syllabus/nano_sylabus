import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createSupabaseServerClient: vi.fn(),
  createSupabaseAdminClient: vi.fn(),
  listStudentCourseSubjects: vi.fn(),
  listCreatorPrivateSubjectAccess: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: mocks.createSupabaseServerClient,
}));
vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: mocks.createSupabaseAdminClient,
}));
vi.mock("@/lib/student-courses", () => ({
  listStudentCourseSubjects: mocks.listStudentCourseSubjects,
  listCreatorPrivateSubjectAccess: mocks.listCreatorPrivateSubjectAccess,
}));

import { GET } from "@/app/api/student/practice/attempts/route";

function attemptsQuery(rows: Array<Record<string, unknown>>) {
  const result = { data: rows, error: null };
  const query: Record<string, any> = {
    select: vi.fn(() => query),
    eq: vi.fn(() => query),
    order: vi.fn(() => query),
    limit: vi.fn(async () => result),
  };
  return query;
}

describe("GET /api/student/practice/attempts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createSupabaseServerClient.mockResolvedValue({
      auth: { getUser: vi.fn(async () => ({ data: { user: { id: "student-1" } } })) },
    });
    mocks.listStudentCourseSubjects.mockResolvedValue([
      { courseId: "course-1", subjectSlug: "physics" },
    ]);
    mocks.listCreatorPrivateSubjectAccess.mockResolvedValue([
      { courseId: "private:subject-1", subjectSlug: "private-math" },
    ]);
  });

  it("does not expose inaccessible legacy or other-course results", async () => {
    const base = {
      source: "practice",
      total_score: 1,
      total_marks: 2,
      evaluation: null,
      created_at: "2026-08-25T00:00:00.000Z",
    };
    mocks.createSupabaseAdminClient.mockReturnValue({
      from: vi.fn(() => attemptsQuery([
        { ...base, id: "owned", course_id: "course-1", subject_slug: "physics", subject_name: "Physics" },
        { ...base, id: "other", course_id: "course-2", subject_slug: "chemistry", subject_name: "Chemistry" },
        { ...base, id: "private", course_id: null, subject_slug: "private-math", subject_name: "Private Math" },
        { ...base, id: "orphan", course_id: null, subject_slug: "control-system", subject_name: "Control System" },
      ])),
    });

    const response = await GET();
    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.attempts.map((attempt: { id: string }) => attempt.id)).toEqual([
      "owned",
      "private",
    ]);
  });
});
