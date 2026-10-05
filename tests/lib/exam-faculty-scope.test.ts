import { describe, expect, it } from "vitest";
import { learningDatabase } from "../helpers/learning-database";
import {
  getStudentCommunityLearningScope,
  listStudentCommunitySubjectAccess,
  getStudentCourseSubjectAccessForCourse,
  getStudentCourseSubjectAccess,
} from "@/lib/student-courses";

describe("locked exam faculty scope", () => {
  it("ignores a preferred slug or course from a second owned community", async () => {
    const db = learningDatabase({
      student_exam_enrollments: [{ user_id: "student", community_id: "bct" }],
      community_memberships: [
        { user_id: "student", community_id: "bei", role: "creator", status: "active" },
        { user_id: "student", community_id: "bct", role: "member", status: "active" },
      ],
      communities: [
        {
          id: "bct",
          slug: "bct-license",
          name: "BCT License",
          status: "active",
          study_course_id: "bct-course",
        },
        {
          id: "bei",
          slug: "bei-license",
          name: "BEI License",
          status: "active",
          study_course_id: "bei-course",
        },
      ],
      community_subjects: [
        {
          community_id: "bct",
          teacher_id: "teacher",
          external_subject_slug: "networks",
          name: "Networks",
          folder_path: "Networks",
          status: "active",
          publication_status: "published",
        },
        {
          community_id: "bei",
          teacher_id: "teacher",
          external_subject_slug: "electronics",
          name: "Electronics",
          folder_path: "Electronics",
          status: "active",
          publication_status: "published",
        },
      ],
      community_terms: [],
    });
    const scope = await getStudentCommunityLearningScope("student", db.admin, {
      communitySlug: "bei-license",
      courseId: "bei-course",
    });
    expect(scope?.communityId).toBe("bct");
    const subjects = await listStudentCommunitySubjectAccess("student", db.admin);
    expect(subjects.map((s) => s.subjectSlug)).toEqual(["networks"]);
  });
  it("refuses a direct course URL and subject from another faculty despite an old enrollment", async () => {
    const db = learningDatabase({
      student_exam_enrollments: [{ user_id: "student", community_id: "bct" }],
      communities: [{ id: "bct", study_course_id: "bct-course", status: "active" }],
      community_memberships: [],
      teacher_course_enrollments: [
        { student_id: "student", course_id: "bei-course", status: "active" },
      ],
    });
    expect(
      await getStudentCourseSubjectAccessForCourse(
        "student",
        "bei-course",
        "electronics",
        db.admin,
      ),
    ).toBeNull();
    expect(await getStudentCourseSubjectAccess("student", "electronics", db.admin)).toBeNull();
    expect(db.admin.from).not.toHaveBeenCalledWith("teacher_course_subjects");
  });
});
