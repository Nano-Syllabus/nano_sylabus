import { describe, expect, it } from "vitest";
import { applySubmissionReview, studentVisibleGrade, submissionReviewStatus } from "@/lib/teacher-submission-review";

describe("teacher submission review", () => {
  it("keeps a grade private until the teacher publishes it", () => {
    const pending = { total_score: 4, total_marks: 5, results: [] };
    expect(submissionReviewStatus(pending)).toBe("pending");
    expect(studentVisibleGrade(pending)).toBeNull();
    const published = applySubmissionReview(pending, { status: "published", teacherNote: "Good work" }, "2026-08-05T00:00:00.000Z");
    expect(submissionReviewStatus(published)).toBe("published");
    expect(studentVisibleGrade(published)).toEqual(published);
  });

  it("safely adjusts per-question marks and recalculates the total", () => {
    const grade = applySubmissionReview({
      total_score: 2,
      total_marks: 10,
      results: [
        { question_id: "q-1", marks: 4, score: 2, feedback: "Partial" },
        { question_id: "q-2", marks: 6, score: 0, feedback: "Missing" },
      ],
    }, {
      status: "reviewed",
      results: [
        { questionId: "q-1", score: 9, feedback: "Adjusted" },
        { questionId: "q-2", score: 3 },
      ],
    });
    expect(grade.total_score).toBe(7);
    expect((grade.results as Record<string, unknown>[])[0]).toMatchObject({ score: 4, feedback: "Adjusted" });
    expect(submissionReviewStatus(grade)).toBe("reviewed");
  });

  it("stores scan annotations and keeps draft comments private", () => {
    const draft = applySubmissionReview({ total_score: 3, total_marks: 5 }, {
      status: "pending",
      teacherNote: "Check the second page again",
      annotations: [{ id: "mark-1", type: "tick", page: 2, x: 0.25, y: 0.6, value: "✓" }],
    });
    expect(draft._review).toMatchObject({
      status: "pending",
      teacher_note: "Check the second page again",
      annotations: [{ id: "mark-1", type: "tick", page: 2, x: 0.25, y: 0.6, value: "✓" }],
    });
    expect(studentVisibleGrade(draft)).toBeNull();
  });

  it("preserves annotations when a later score-only review is saved", () => {
    const first = applySubmissionReview({ total_score: 1, total_marks: 1 }, {
      status: "reviewed",
      annotations: [{ id: "note-1", type: "note", page: 1, x: 0.5, y: 0.5, value: "Show the unit" }],
    });
    const second = applySubmissionReview(first, { status: "published" });
    expect((second._review as Record<string, unknown>).annotations).toEqual((first._review as Record<string, unknown>).annotations);
  });
});
