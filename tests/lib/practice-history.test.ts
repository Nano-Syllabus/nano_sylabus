import { describe, expect, it } from "vitest";
import { createPracticeAttemptHistory, studentExamHistorySchema } from "@/lib/practice-history";
import type { StudentExam } from "@/lib/practice-sitting";

const exam: StudentExam = {
  id: "paper-1",
  subject: "Digital Logic",
  title: "Digital Logic practice",
  kind: "practice",
  counts: false,
  marks: 5,
  passMarks: 2,
  minutes: 20,
  attempts: null,
  window: "practice",
  windowLabel: "Practice",
  questions: [
    {
      id: "q1",
      type: "short",
      questionType: "theory",
      marks: 5,
      topic: "Logic gates",
      prompt: "What is a logic gate?",
    },
  ],
};

describe("practice attempt history", () => {
  it("keeps the paper and graded answer needed for a later result review", () => {
    const history = createPracticeAttemptHistory({
      exam,
      answers: [{ questionId: "q1", answerText: "A digital circuit." }],
      results: [{ question_id: "q1", score: 4, feedback: "Add an example." }],
      studentName: "Student",
    });

    expect(studentExamHistorySchema.parse(history.exam)).toEqual(exam);
    expect(history.results).toEqual([
      {
        question_id: "q1",
        score: 4,
        feedback: "Add an example.",
        student_answer: "A digital circuit.",
      },
    ]);
    expect(history.studentName).toBe("Student");
  });
});
