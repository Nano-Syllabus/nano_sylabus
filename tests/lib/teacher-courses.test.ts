import { describe, expect, it } from "vitest";
import {
  mapTeacherCourse,
  teacherCourseInputSchema,
  teacherCourseRow,
  teacherCourseSlug,
} from "@/lib/teacher-courses";
import { isCourseSubjectOwnershipConflict } from "@/lib/teacher-course-store";

const validCourse = {
  name: "IOE Engineering Entrance",
  shortName: "IOE Entrance",
  category: "Entrance" as const,
  authority: "Institute of Engineering, TU",
  tagline: "Physics, Chemistry, Mathematics and English preparation.",
  description: "A complete entrance preparation track built from indexed subject material.",
  durationWeeks: 12,
  level: "Advanced" as const,
  languageModes: ["English" as const],
  accessModel: "free" as const,
  priceNpr: 0,
  visibility: "public" as const,
  diagnosticQuestionCount: 10,
  dailyMinutes: 20,
  passPercentage: 40,
  negativeMarking: 0.25,
  examDate: null,
  outcomes: ["Past-paper mock tests"],
  subjectSlugs: ["physics", "mathematics"],
  status: "draft" as const,
};

describe("teacher courses", () => {
  it("creates stable public slugs", () => {
    expect(teacherCourseSlug("  IOE Engineering Entrance  ")).toBe("ioe-engineering-entrance");
  });

  it("requires a real indexed subject", () => {
    const parsed = teacherCourseInputSchema.safeParse({ ...validCourse, subjectSlugs: [] });
    expect(parsed.success).toBe(false);
  });

  it("rejects duplicate subject links", () => {
    const parsed = teacherCourseInputSchema.safeParse({
      ...validCourse,
      subjectSlugs: ["physics", "physics"],
    });
    expect(parsed.success).toBe(false);
  });

  it("requires a price for paid access", () => {
    const parsed = teacherCourseInputSchema.safeParse({
      ...validCourse,
      accessModel: "paid",
      priceNpr: 0,
    });
    expect(parsed.success).toBe(false);
  });

  it("maps app fields to storage without losing grading settings", () => {
    const row = teacherCourseRow(validCourse);
    expect(row.price_paisa).toBe(0);
    expect(row.negative_marking).toBe(0.25);
    expect(row.diagnostic_question_count).toBe(10);
  });

  it("orders attached subjects for the teacher UI", () => {
    const course = mapTeacherCourse(
      {
        id: "course-1",
        slug: "ioe-engineering-entrance",
        name: validCourse.name,
        category: validCourse.category,
        authority: validCourse.authority,
        tagline: validCourse.tagline,
        description: validCourse.description,
        duration_weeks: 12,
        level: "Advanced",
        language_modes: ["English"],
        access_model: "free",
        visibility: "public",
        status: "draft",
        diagnostic_question_count: 10,
        daily_minutes: 20,
        pass_percentage: 40,
        negative_marking: 0.25,
      },
      [
        { subject_slug: "math", subject_name: "Mathematics", position: 1 },
        { subject_slug: "physics", subject_name: "Physics", position: 0 },
      ],
      8,
    );
    expect(course.subjects.map((subject) => subject.name)).toEqual(["Physics", "Mathematics"]);
    expect(course.enrollmentCount).toBe(8);
  });

  it("recognizes the database ownership constraint", () => {
    expect(
      isCourseSubjectOwnershipConflict({
        code: "23505",
        message:
          'duplicate key value violates unique constraint "teacher_course_subjects_teacher_slug_unique"',
      }),
    ).toBe(true);
    expect(isCourseSubjectOwnershipConflict({ code: "23505", message: "another constraint" })).toBe(
      false,
    );
  });
});
