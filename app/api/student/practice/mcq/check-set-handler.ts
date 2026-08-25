import { NextResponse } from "next/server";
import { z } from "zod";
import { recordPracticeEvaluation } from "@/lib/data/student-mastery";
import { createPracticeAttemptHistory, studentExamHistorySchema } from "@/lib/practice-history";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  checkMcqSet,
  findTenantSubjectForCourseSubject,
  listTenantSubjects,
  type McqCheckResult,
} from "@/lib/tenant/client";
import { getStudentCourseSubjectAccess } from "@/lib/student-courses";

export const mcqSetCheckSchema = z.object({
  subject: z.string().trim().min(1),
  exam: studentExamHistorySchema.optional(),
  answers: z.array(z.object({
    questionId: z.string().trim().min(1),
    selected: z.string().trim().min(1).max(1000),
    selectedChoice: z.number().int().nonnegative().optional(),
  })).max(60),
});

function resultFeedback(result: McqCheckResult) {
  const correct = result.correct_option || result.correct;
  const verdict = result.attempted === false
    ? "Unattempted."
    : result.is_correct || result.score >= result.marks ? "Correct." : "Incorrect.";
  return [verdict, correct ? `Correct answer: ${correct}.` : "", result.explanation || ""]
    .filter(Boolean).join(" ");
}

export async function handleMcqSetCheck(setId: string, payload: unknown) {
  try {
    const supabase = await createSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const parsed = mcqSetCheckSchema.parse(payload);
    const access = await getStudentCourseSubjectAccess(user.id, parsed.subject);
    if (!access) {
      return NextResponse.json(
        { error: "Enroll in a course containing this subject first." },
        { status: 403 },
      );
    }
    const subject = findTenantSubjectForCourseSubject(await listTenantSubjects(), access);
    if (!subject) {
      return NextResponse.json({ error: "That course subject is not available." }, { status: 404 });
    }

    const checked = await checkMcqSet(setId, {
      answers: parsed.answers.map((answer) => ({
        question_id: answer.questionId,
        selected: answer.selected,
      })),
    });
    const results = checked.results.map((result) => ({
      ...result,
      feedback: resultFeedback(result),
      student_answer: result.selected_option || result.selected || "",
    }));

    let progressSaved = true;
    if (checked.evaluation) {
      try {
        await recordPracticeEvaluation({
          userId: user.id,
          courseId: access.accessKind === "owner-private" ? null : access.courseId,
          subjectSlug: subject.slug,
          subjectName: subject.name,
          source: "practice",
          sessionId: setId,
          totalScore: checked.total_score,
          totalMarks: checked.total_marks,
          evaluation: checked.evaluation,
          history: parsed.exam
            ? createPracticeAttemptHistory({
                exam: parsed.exam,
                results,
                answers: parsed.answers.map((answer) => ({
                  questionId: answer.questionId,
                  answerText: answer.selected,
                  selectedChoice: answer.selectedChoice,
                })),
              })
            : undefined,
        });
      } catch {
        progressSaved = false;
      }
    }

    return NextResponse.json({
      results,
      totalScore: checked.total_score,
      totalMarks: checked.total_marks,
      penalty: checked.penalty ?? 0,
      negativeMarks: checked.negative_marks ?? 0,
      correctCount: checked.correct_count ?? null,
      wrongCount: checked.wrong_count ?? null,
      unattemptedCount: checked.unattempted_count ?? null,
      evaluation: checked.evaluation ?? null,
      progressSaved,
    });
  } catch (error) {
    const message = error instanceof z.ZodError
      ? error.issues[0]?.message || "Invalid MCQ answers."
      : error instanceof Error ? error.message : "Could not check this MCQ quiz.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
