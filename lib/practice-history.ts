import { z } from "zod";
import type { PracticeAttemptHistory } from "@/lib/data/student-mastery";
import type { StudentExam } from "@/lib/practice-sitting";

export const studentExamHistorySchema = z.object({
  id: z.string().min(1),
  subject: z.string().min(1),
  title: z.string().min(1),
  kind: z.string(),
  counts: z.boolean(),
  marks: z.number(),
  passMarks: z.number().optional(),
  minutes: z.number(),
  attempts: z.number().nullable(),
  window: z.enum(["before", "open", "done", "practice"]),
  windowLabel: z.string(),
  questions: z.array(
    z.object({
      id: z.string().min(1),
      type: z.enum(["choice", "short", "long"]),
      questionType: z.string().optional(),
      marks: z.number(),
      topic: z.string(),
      prompt: z.string(),
      options: z.array(z.string()).optional(),
      answer: z.number().optional(),
      marking: z.array(z.object({ label: z.string(), marks: z.number() })).optional(),
    }),
  ),
});

type GradedResult = {
  question_id: string;
  score: number;
  feedback: string;
  student_answer?: string;
};

export function createPracticeAttemptHistory(input: {
  exam: StudentExam;
  results?: GradedResult[];
  answers?: Array<{ questionId: string; answerText: string; selectedChoice?: number }>;
  studentName?: string;
}): PracticeAttemptHistory {
  const answerByQuestion = new Map(
    (input.answers ?? []).map((answer) => [answer.questionId, answer]),
  );

  return {
    exam: input.exam,
    results: input.exam.questions.map((question) => {
      const graded = input.results?.find((item) => item.question_id === question.id);
      return {
        question_id: question.id,
        score: Number(graded?.score ?? 0),
        feedback: graded?.feedback || "No feedback returned.",
        student_answer:
          graded?.student_answer ?? answerByQuestion.get(question.id)?.answerText ?? "",
        ...(answerByQuestion.get(question.id)?.selectedChoice === undefined
          ? {}
          : { selected_choice: answerByQuestion.get(question.id)?.selectedChoice }),
      };
    }),
    ...(input.studentName ? { studentName: input.studentName } : {}),
    handedInAt: new Date().toISOString(),
  };
}
