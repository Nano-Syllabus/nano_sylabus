import { describe, expect, it, vi } from "vitest";
import {
  getStudentCourseSubjectAccess,
  getStudentCourseSubjectAccessForCourse,
  getStudentCourseSubjectAccessForDocumentPath,
} from "@/lib/student-courses";

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
  /**
   * THESE TESTS PIN THE VERDICT, NOT THE QUERY PLAN.
   *
   * They used to assert which tables were never read — `community_subjects` for
   * a non-member, `teacher_course_subjects` once community access had won. That
   * held while the reads were a waterfall, and it was the waterfall that made
   * this the slowest thing in front of every challenge request: the reads are
   * issued together now and the verdict is decided on the results.
   *
   * So each case below hands the read it used to skip a row that WOULD grant
   * access, and asserts the answer is unchanged. That is the property those
   * assertions were standing in for, and it is a stricter one — it fails if a
   * subject row is ever allowed to authorize a student whose membership or
   * enrollment does not.
   */
  it("denies subject access after membership and legacy enrollment are revoked", async () => {
    const queries = {
      communities: singleResult({ id: "community-1" }),
      community_memberships: singleResult(null),
      teacher_course_enrollments: singleResult(null),
      teacher_courses: singleResult({
        id: "community-course",
        teacher_id: "teacher-1",
        status: "published",
        visibility: "unlisted",
      }),
      // Both subject rows are present and grantable. Neither may stand in for
      // the membership and the enrollment that are gone.
      teacher_course_subjects: singleResult({
        course_id: "community-course",
        teacher_id: "teacher-1",
        subject_slug: "computer-programming",
        subject_name: "Computer Programming",
        folder_path: "Computer Programming",
      }),
      community_subjects: singleResult({
        teacher_id: "teacher-1",
        external_subject_slug: "computer-programming",
        name: "Computer Programming",
        folder_path: "Computer Programming",
      }),
    };
    const admin = { from: vi.fn((table: keyof typeof queries) => queries[table]) };
    expect(await getStudentCourseSubjectAccessForCourse("student-1", "community-course", "computer-programming", admin as never)).toBeNull();
    expect(queries.community_memberships.eq).toHaveBeenCalledWith("status", "active");
  });
  it("treats active community membership as access even if a legacy enrollment row is missing", async () => {
    const queries = {
      teacher_course_enrollments: singleResult(null),
      teacher_courses: singleResult({
        id: "community-course",
        teacher_id: "teacher-1",
        status: "published",
        visibility: "unlisted",
      }),
      // A course-subject row that would grant plain `course` access. Community
      // membership outranks it, and must keep doing so now that both are read.
      teacher_course_subjects: singleResult({
        course_id: "community-course",
        teacher_id: "teacher-1",
        subject_slug: "computer-programming",
        subject_name: "Computer Programming",
        folder_path: "Computer Programming",
      }),
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
      accessKind: "community",
    });
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
      accessKind: "community",
    });
    expect(queries.community_memberships.eq).toHaveBeenCalledWith("user_id", "student-1");
    expect(queries.community_subjects.eq).toHaveBeenCalledWith(
      "external_subject_slug",
      "computer-programming",
    );
  });

  it("resolves a community subject without a legacy course enrollment", async () => {
    const tables = {
      teachers: listResult(null),
      community_memberships: listResult([{ community_id: "community-1" }]),
      communities: listResult([
        { id: "community-1", study_course_id: "community-course" },
      ]),
      community_subjects: listResult([
        {
          community_id: "community-1",
          teacher_id: "teacher-1",
          external_subject_slug: "math",
          name: "Math",
          folder_path: "Math",
        },
      ]),
      // `listStudentCommunitySubjectAccess` now fetches terms for the student's
      // communities in parallel with the subjects, rather than afterwards by
      // term id, so this table is always touched even when no subject has a term.
      community_terms: listResult([]),
      teacher_course_enrollments: listResult([]),
    };
    const admin = {
      from: vi.fn((table: keyof typeof tables) => tables[table]),
    };

    await expect(
      getStudentCourseSubjectAccess("student-1", "math", admin as never),
    ).resolves.toMatchObject({
      courseId: "community-course",
      teacherId: "teacher-1",
      subjectSlug: "math",
      accessKind: "community",
    });
  });

  it("streams community subject documents without a legacy course enrollment", async () => {
    const tables = {
      teachers: listResult(null),
      community_memberships: listResult([{ community_id: "community-1" }]),
      communities: listResult([
        { id: "community-1", study_course_id: "community-course" },
      ]),
      community_subjects: listResult([
        {
          community_id: "community-1",
          teacher_id: "teacher-1",
          external_subject_slug: "math",
          name: "Math",
          folder_path: "Math",
        },
      ]),
      // `listStudentCommunitySubjectAccess` now fetches terms for the student's
      // communities in parallel with the subjects, rather than afterwards by
      // term id, so this table is always touched even when no subject has a term.
      community_terms: listResult([]),
      teacher_course_enrollments: listResult([]),
    };
    const admin = {
      from: vi.fn((table: keyof typeof tables) => tables[table]),
    };

    await expect(
      getStudentCourseSubjectAccessForDocumentPath(
        "student-1",
        "teacher-1",
        "Math/Notes/algebra.pdf",
        admin as never,
      ),
    ).resolves.toMatchObject({
      subjectSlug: "math",
      accessKind: "community",
    });
    expect(admin.from).not.toHaveBeenCalledWith("teacher_course_enrollments");
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
      // Still published, still attached to the community. Membership ended, so
      // it grants nothing.
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
    ).resolves.toBeNull();
  });
});

function listResult(data: Record<string, unknown>[] | Record<string, unknown> | null) {
  const result = { data, error: null };
  const query = {
    select: vi.fn(),
    eq: vi.fn(),
    in: vi.fn(),
    is: vi.fn(),
    order: vi.fn(),
    maybeSingle: vi.fn(async () => result),
    then: (
      resolve: (value: typeof result) => unknown,
      reject?: (reason: unknown) => unknown,
    ) => Promise.resolve(result).then(resolve, reject),
  };
  query.select.mockReturnValue(query);
  query.eq.mockReturnValue(query);
  query.in.mockReturnValue(query);
  query.is.mockReturnValue(query);
  query.order.mockReturnValue(query);
  return query;
}
