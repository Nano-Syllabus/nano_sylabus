import { describe, expect, it } from "vitest";
import { buildTeacherClassroomDetail } from "@/lib/teacher-classroom-detail";

describe("teacher classroom detail aggregation", () => {
  it("builds a real roster and exam summary", () => {
    const detail = buildTeacherClassroomDetail({
      classroom: {
        id: "room-1",
        subject_slug: "physics",
        subject_name: "Physics",
        name: "Section A",
        join_code: "JOIN",
        created_at: "2026-08-01",
      },
      members: [
        { student_id: "student-1", joined_at: "2026-08-01" },
        { student_id: "student-2", joined_at: "2026-08-02" },
      ],
      profiles: [{ user_id: "student-1", full_name: "Anjali" }],
      assignments: [
        {
          id: "assignment-1",
          opens_at: null,
          closes_at: null,
          created_at: "2026-08-03",
          teacher_exam_papers: {
            external_paper_id: "paper-1",
            paper: { title: "Midterm", total_marks: 10, questions: [{ id: "q1" }] },
          },
        },
      ],
      submissions: [
        {
          id: "sub-1",
          assignment_id: "assignment-1",
          student_id: "student-1",
          student_name: "old@example.com",
          source: "typed",
          grade: { total_score: 4, total_marks: 10 },
          created_at: "2026-08-04",
        },
      ],
    });

    expect(detail.classroom).toMatchObject({
      memberCount: 2,
      averagePercent: 40,
      actionRequiredCount: 1,
    });
    expect(detail.roster[0]).toMatchObject({ name: "Student", status: "not-started" });
    expect(detail.roster[1]).toMatchObject({
      name: "Anjali",
      averagePercent: 40,
      status: "needs-attention",
    });
    expect(detail.roster[1].submissions[0]).toMatchObject({
      title: "Midterm",
      percentage: 40,
      source: "typed",
    });
    expect(detail.exams[0]).toMatchObject({
      title: "Midterm",
      questionCount: 1,
      submissionCount: 1,
      averagePercent: 40,
      actionRequiredCount: 1,
      onPaperCount: 0,
    });
  });

  it("keeps chapter evidence separate per student and combines real chat evidence", () => {
    const detail = buildTeacherClassroomDetail({
      classroom: {
        id: "room-1",
        subject_slug: "logic",
        subject_name: "Logic",
        name: "Section A",
        join_code: "JOIN",
        created_at: "2026-08-01",
        term_key: "2026",
        meeting_schedule: "Sun 10:00",
        notice: "Bring notes",
      },
      members: [
        { student_id: "student-1", joined_at: "2026-08-01" },
        { student_id: "student-2", joined_at: "2026-08-01" },
      ],
      profiles: [
        { user_id: "student-1", full_name: "Anjali" },
        { user_id: "student-2", full_name: "Bina" },
      ],
      assignments: [
        {
          id: "assignment-1",
          opens_at: null,
          closes_at: null,
          created_at: "2026-08-03",
          teacher_exam_papers: {
            external_paper_id: "paper-1",
            paper: {
              title: "Quiz",
              total_marks: 10,
              questions: [{ id: "q1", chapter: "Binary arithmetic", marks: 10 }],
            },
          },
        },
      ],
      submissions: [
        {
          id: "sub-1",
          assignment_id: "assignment-1",
          student_id: "student-1",
          student_name: "Anjali",
          source: "typed",
          grade: {
            total_score: 2,
            total_marks: 10,
            results: [{ question_id: "q1", score: 2, marks: 10 }],
          },
          created_at: "2026-08-04",
        },
        {
          id: "sub-2",
          assignment_id: "assignment-1",
          student_id: "student-2",
          student_name: "Bina",
          source: "typed",
          grade: {
            total_score: 9,
            total_marks: 10,
            results: [{ question_id: "q1", score: 9, marks: 10 }],
          },
          created_at: "2026-08-04",
        },
      ],
      syllabus: [
        { title: "Unit 1", topics: [{ name: "Binary arithmetic" }, { name: "Boolean algebra" }] },
      ],
      chatEvidence: [
        { user_id: "student-1", content: "Please explain Boolean algebra with an example" },
      ],
      classroomTeachers: [
        { teacher_id: "teacher-1", role: "lead", teachers: { handle: "anima-teacher" } },
      ],
    });

    expect(detail.classroom).toMatchObject({
      termKey: "2026",
      meetingSchedule: "Sun 10:00",
      notice: "Bring notes",
    });
    expect(detail.roster.find((student) => student.studentId === "student-1")?.topics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: "Binary arithmetic", percentage: 20, tested: true }),
        expect.objectContaining({
          name: "Boolean algebra",
          percentage: null,
          asked: true,
          tested: false,
        }),
      ]),
    );
    expect(detail.roster.find((student) => student.studentId === "student-2")?.topics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: "Binary arithmetic", percentage: 90 }),
      ]),
    );
    expect(detail.topics.find((topic) => topic.name === "Binary arithmetic")).toMatchObject({
      percentage: 55,
      testedStudentCount: 2,
      strugglingStudents: [{ studentId: "student-1", name: "Anjali", percentage: 20 }],
    });
    expect(detail.topics.find((topic) => topic.name === "Boolean algebra")).toMatchObject({
      percentage: null,
      askedStudentCount: 1,
      testedStudentCount: 0,
    });
    expect(detail.teachers[0]).toEqual({
      teacherId: "teacher-1",
      handle: "anima-teacher",
      role: "lead",
    });
  });
});
