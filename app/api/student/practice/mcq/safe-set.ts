import type { McqSetResponse } from "@/lib/tenant/client";

export function safeMcqSet(set: McqSetResponse) {
  return {
    setId: set.set_id,
    questions: set.questions.map((question) => ({
      id: question.id || question.question_id || "",
      chapter: question.chapter || question.topic || "",
      marks: question.marks,
      text: question.text || question.question || "",
      options: question.options.map((option) =>
        typeof option === "string"
          ? option
          : { key: String(option.key || ""), text: String(option.text || "") },
      ),
    })),
    totalMarks: set.total_marks,
    negativeMarks: set.negative_marks ?? 0,
    expiresAt: set.expires_at,
    warning: set.warning ?? null,
  };
}
