import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getTeacherProfile: vi.fn(),
  createSupabaseAdminClient: vi.fn(),
  clearStudentStudyTrails: vi.fn(),
  findAssignedCourseSubjects: vi.fn(),
  listTeacherCourses: vi.fn(),
}));

vi.mock("@/app/teachers/actions", () => ({ getTeacherProfile: mocks.getTeacherProfile }));
vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: mocks.createSupabaseAdminClient,
}));
vi.mock("@/lib/data/study-trail-cleanup", () => ({
  clearStudentStudyTrails: mocks.clearStudentStudyTrails,
  clearTeacherCourseTrails: vi.fn(),
}));
vi.mock("@/lib/teacher-course-store", () => ({
  courseStorageError: (error: unknown) => error instanceof Error ? error.message : "Course error",
  findAssignedCourseSubjects: mocks.findAssignedCourseSubjects,
  isCourseSubjectOwnershipConflict: () => false,
  listTeacherCourses: mocks.listTeacherCourses,
}));

import { PATCH } from "@/app/api/teacher/courses/[courseId]/route";

function query(data: unknown = null) {
  const result = { data, error: null };
  const chain: Record<string, any> = {
    select: vi.fn(() => chain),
    update: vi.fn(() => chain),
    upsert: vi.fn(() => chain),
    delete: vi.fn(() => chain),
    eq: vi.fn(() => chain),
    in: vi.fn(() => chain),
    is: vi.fn(() => chain),
    maybeSingle: vi.fn(async () => result),
    then: (resolve: (value: typeof result) => unknown) => Promise.resolve(result).then(resolve),
  };
  return chain;
}

const payload = {
  name: "Engineering Foundations",
  shortName: "Foundations",
  category: "Bachelor",
  authority: "University",
  tagline: "A focused engineering preparation course.",
  description: "A complete preparation course built from indexed engineering subject material.",
  durationWeeks: 12,
  level: "Intermediate",
  languageModes: ["English"],
  accessModel: "free",
  priceNpr: 0,
  visibility: "public",
  diagnosticQuestionCount: 10,
  dailyMinutes: 20,
  passPercentage: 40,
  negativeMarking: 0,
  examDate: null,
  outcomes: [],
  subjectSlugs: ["physics"],
  status: "published",
};

describe("PATCH /api/teacher/courses/[courseId] subject cleanup", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getTeacherProfile.mockResolvedValue({ id: "teacher-1" });
    mocks.findAssignedCourseSubjects.mockResolvedValue([]);
    mocks.listTeacherCourses.mockResolvedValue([{ id: "course-1" }]);
    mocks.clearStudentStudyTrails.mockResolvedValue(undefined);

    const courseQueries = [
      query({ id: "course-1", status: "published", published_at: "2026-08-01" }),
      query(),
    ];
    const subjectLinkQueries = [
      query([
        { subject_slug: "control-system", subject_name: "Control System", folder_path: "control", position: 0 },
        { subject_slug: "physics", subject_name: "Physics", folder_path: "physics", position: 1 },
      ]),
      query(),
      query(),
    ];
    const tableCalls = new Map<string, number>();
    const admin = {
      from: vi.fn((table: string) => {
        const index = tableCalls.get(table) || 0;
        tableCalls.set(table, index + 1);
        if (table === "teacher_courses") return courseQueries[index];
        if (table === "teacher_subject_profiles") {
          return query([{ subject_slug: "physics", subject_name: "Physics", folder_path: "physics" }]);
        }
        if (table === "teacher_course_subjects") return subjectLinkQueries[index];
        if (table === "teacher_course_enrollments") return query([{ student_id: "student-1" }]);
        return query([]);
      }),
    };
    mocks.createSupabaseAdminClient.mockReturnValue(admin);
  });

  it("cleans every enrolled student's removed-subject trails before detaching the link", async () => {
    const response = await PATCH(
      new Request("http://localhost/api/teacher/courses/course-1", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      }),
      { params: Promise.resolve({ courseId: "course-1" }) },
    );

    expect(response.status).toBe(200);
    expect(mocks.clearStudentStudyTrails).toHaveBeenCalledWith(
      expect.anything(),
      ["student-1"],
      [{ subjectSlug: "control-system", subjectName: "Control System", courseId: "course-1" }],
      ["course-1"],
      "teacher-1",
    );
    const admin = mocks.createSupabaseAdminClient.mock.results[0].value;
    const linkQueries = admin.from.mock.results
      .filter((result: { value?: { delete?: ReturnType<typeof vi.fn> } }) => result.value?.delete)
      .map((result: { value: Record<string, any> }) => result.value);
    expect(linkQueries.some((item: Record<string, any>) =>
      item.in.mock.calls.some((call: unknown[]) =>
        call[0] === "subject_slug" && JSON.stringify(call[1]) === JSON.stringify(["control-system"]),
      ),
    )).toBe(true);
  });
});
