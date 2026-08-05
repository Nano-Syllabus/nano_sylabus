import { describe, expect, it } from "vitest";
import { buildTeacherDashboard, submissionPercentage } from "@/lib/teacher-dashboard";

describe("teacher dashboard aggregation", () => {
  it("calculates a bounded percentage from a grading response", () => {
    expect(submissionPercentage({ total_score: 8, total_marks: 10 })).toBe(80);
    expect(submissionPercentage({ total_score: 12, total_marks: 10 })).toBe(100);
    expect(submissionPercentage({ total_score: 1, total_marks: 0 })).toBeNull();
  });

  it("returns real classroom totals, submission counts, and struggling students", () => {
    const dashboard = buildTeacherDashboard({
      classrooms: [
        { id: "class-1", subject_slug: "physics", subject_name: "Physics", name: "Section A", join_code: "JOIN1", created_at: "2026-08-05" },
        { id: "class-2", subject_slug: "logic", subject_name: "Digital Logic", name: "Section B", join_code: "JOIN2", created_at: "2026-08-04" },
      ],
      members: [
        { classroom_id: "class-1", student_id: "student-1" },
        { classroom_id: "class-2", student_id: "student-1" },
        { classroom_id: "class-1", student_id: "student-2" },
      ],
      assignments: [
        { id: "assignment-1", classroom_id: "class-1" },
        { id: "assignment-2", classroom_id: "class-2" },
      ],
      submissions: [
        { id: "submission-1", assignment_id: "assignment-1", student_id: "student-1", student_name: "old@example.com", grade: { total_score: 4, total_marks: 10 }, created_at: "2026-08-05" },
        { id: "submission-2", assignment_id: "assignment-2", student_id: "student-2", student_name: "Two", grade: { total_score: 9, total_marks: 10 }, created_at: "2026-08-04" },
      ],
      profiles: [{ user_id: "student-1", full_name: "Anjali" }],
      paperCount: 3,
    });

    expect(dashboard.summary).toEqual({
      classroomCount: 2,
      studentCount: 2,
      paperCount: 3,
      submissionCount: 2,
      actionRequiredCount: 2,
      needsAttentionCount: 1,
    });
    expect(dashboard.classrooms[0]).toMatchObject({ memberCount: 2, assignmentCount: 1, submissionCount: 1 });
    expect(dashboard.needsAttention[0]).toMatchObject({ name: "Anjali", averagePercent: 40 });
  });
});
