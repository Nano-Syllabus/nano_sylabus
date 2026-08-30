import { describe, expect, it, vi } from "vitest";
import { getStudentCourseSubjectAccessForCourse } from "@/lib/student-courses";

function singleResult(data: Record<string, unknown> | null) {
  const query = {
    select: vi.fn(),
    eq: vi.fn(),
    in: vi.fn(),
    is: vi.fn(),
    maybeSingle: vi.fn(async () => ({ data, error: null })),
  };
  query.select.mockReturnValue(query);
  query.eq.mockReturnValue(query);
  query.in.mockReturnValue(query);
  query.is.mockReturnValue(query);
  return query;
}

describe("community challenge subject access", () => {
  it("treats active community membership as access even if a legacy enrollment row is missing", async () => {
    const queries = {
      teacher_course_enrollments: singleResult(null),
      teacher_courses: singleResult({
        id: "community-course",
        teacher_id: "teacher-1",
        status: "published",
        visibility: "unlisted",
      }),
      teacher_course_subjects: singleResult(null),
      communities: singleResult({ id: "community-1" }),
      community_memberships: singleResult({ status: "active" }),
      community_subjects: singleResult({
        teacher_id: "teacher-1",
        external_subject_slug: "computer-programming",
        name: "Computer Programming",
        folder_path: "Computer Programming",
      }),
    };
    const admin = {
      from: vi.fn((table: keyof typeof queries) => queries[table]),
    };

    await expect(
      getStudentCourseSubjectAccessForCourse(
        "student-1",
        "community-course",
        "computer-programming",
        admin as never,
      ),
    ).resolves.toMatchObject({
      courseId: "community-course",
      subjectSlug: "computer-programming",
    });
    expect(admin.from).not.toHaveBeenCalledWith("teacher_course_subjects");
  });

  it("resolves a Creator Workspace subject through active community membership", async () => {
    const queries = {
      teacher_course_enrollments: singleResult({ course_id: "community-course" }),
      teacher_courses: singleResult({
        id: "community-course",
        teacher_id: "teacher-1",
        status: "published",
        visibility: "unlisted",
      }),
      teacher_course_subjects: singleResult(null),
      communities: singleResult({ id: "community-1" }),
      community_memberships: singleResult({ status: "active" }),
      community_subjects: singleResult({
        teacher_id: "teacher-1",
        external_subject_slug: "computer-programming",
        name: "Computer Programming",
        folder_path: "Computer Programming",
      }),
    };
    const admin = {
      from: vi.fn((table: keyof typeof queries) => queries[table]),
    };

    await expect(
      getStudentCourseSubjectAccessForCourse(
        "student-1",
        "community-course",
        "computer-programming",
        admin as never,
      ),
    ).resolves.toEqual({
      courseId: "community-course",
      teacherId: "teacher-1",
      subjectSlug: "computer-programming",
      subjectName: "Computer Programming",
      folderPath: "Computer Programming",
    });
    expect(queries.community_memberships.eq).toHaveBeenCalledWith("user_id", "student-1");
    expect(queries.community_subjects.eq).toHaveBeenCalledWith(
      "external_subject_slug",
      "computer-programming",
    );
  });

  it("does not grant challenge access after community membership ends", async () => {
    const queries = {
      teacher_course_enrollments: singleResult({ course_id: "community-course" }),
      teacher_courses: singleResult({
        id: "community-course",
        teacher_id: "teacher-1",
        status: "published",
        visibility: "unlisted",
      }),
      teacher_course_subjects: singleResult(null),
      communities: singleResult({ id: "community-1" }),
      community_memberships: singleResult(null),
      community_subjects: singleResult(null),
    };
    const admin = {
      from: vi.fn((table: keyof typeof queries) => queries[table]),
    };

    await expect(
      getStudentCourseSubjectAccessForCourse(
        "student-1",
        "community-course",
        "computer-programming",
        admin as never,
      ),
    ).resolves.toBeNull();
    expect(admin.from).not.toHaveBeenCalledWith("community_subjects");
  });
});
