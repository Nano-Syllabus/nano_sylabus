export type SubmissionReviewStatus = "pending" | "reviewed" | "published";
export type SubmissionAnnotation = {
  id: string;
  type: "tick" | "cross" | "mark" | "note";
  page: number;
  x: number;
  y: number;
  value: string;
};

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? value as Record<string, unknown> : {};
}

export function submissionReviewStatus(grade: unknown): SubmissionReviewStatus {
  const review = record(record(grade)._review);
  const status = review.status;
  return status === "reviewed" || status === "published" ? status : "pending";
}

export function studentVisibleGrade(grade: unknown) {
  if (submissionReviewStatus(grade) !== "published") return null;
  const { _answer_sheet: _answerSheet, ...visible } = record(grade);
  return visible;
}

export function applySubmissionReview(
  grade: unknown,
  input: {
    status: SubmissionReviewStatus;
    teacherNote?: string;
    results?: { questionId: string; score: number; feedback?: string }[];
    annotations?: SubmissionAnnotation[];
  },
  now = new Date().toISOString(),
) {
  const next = { ...record(grade) };
  const adjustments = new Map((input.results || []).map((result) => [result.questionId, result]));
  if (Array.isArray(next.results) && adjustments.size) {
    next.results = next.results.map((value, index) => {
      const result = record(value);
      const questionId = String(result.question_id || result.id || index);
      const adjustment = adjustments.get(questionId);
      if (!adjustment) return result;
      const marks = Number(result.marks) || 0;
      return {
        ...result,
        score: Math.max(0, Math.min(marks, adjustment.score)),
        feedback: adjustment.feedback === undefined ? result.feedback : adjustment.feedback,
      };
    });
    next.total_score = (next.results as Record<string, unknown>[]).reduce(
      (sum, result) => sum + (Number(result.score) || 0),
      0,
    );
  }
  const previous = record(next._review);
  next._review = {
    ...previous,
    status: input.status,
    teacher_note: input.teacherNote?.trim() || "",
    reviewed_at: input.status === "pending" ? null : now,
    published_at: input.status === "published" ? now : null,
    annotations: input.annotations === undefined ? previous.annotations || [] : input.annotations,
  };
  return next;
}
