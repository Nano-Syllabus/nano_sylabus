import { NextResponse } from "next/server";
import { z } from "zod";
import {
  getStudentChallengeGradeContext,
  recordStudentChallengeGrade,
} from "@/lib/data/student-challenges";
import { recordPracticeEvaluation } from "@/lib/data/student-mastery";
import { createPracticeAttemptHistory } from "@/lib/practice-history";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { gradeTeacherPaper } from "@/lib/tenant/client";
import type { StudentExam } from "@/lib/practice-sitting";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const schema = z.object({
  answers: z
    .array(
      z.object({
        questionId: z.string().trim().min(1),
        answerText: z.string().trim().min(1).max(20_000),
      }),
    )
    .min(1),
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ challengeId: string }> },
) {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const parsed = schema.parse(await request.json());
    const { challengeId } = await params;
    const context = await getStudentChallengeGradeContext(user.id, challengeId);
    if (!context) return NextResponse.json({ error: "Challenge not found." }, { status: 404 });
    const { detail: challenge, externalPaperId } = context;
    if (challenge.status === "completed") {
      return NextResponse.json({ error: "This challenge is already complete." }, { status: 409 });
    }
    if (!challenge.lessonRead || !challenge.examplesReviewed) {
      return NextResponse.json(
        { error: "Finish the lesson and worked examples before taking the exam." },
        { status: 409 },
      );
    }
    if (!challenge.content || !externalPaperId) {
      return NextResponse.json({ error: "Start the challenge before submitting it." }, { status: 409 });
    }

    const expectedIds = new Set(challenge.content.examQuestions.map((question) => question.id));
    const answerById = new Map(parsed.answers.map((answer) => [answer.questionId, answer]));
    if (
      expectedIds.size !== answerById.size ||
      [...expectedIds].some((questionId) => !answerById.has(questionId))
    ) {
      return NextResponse.json({ error: "Answer every challenge question once." }, { status: 400 });
    }
    const answers = challenge.content.examQuestions.map((question) => answerById.get(question.id)!);
    const graded = await gradeTeacherPaper(externalPaperId, {
      student_name: String(user.user_metadata?.full_name || user.email || "Student"),
      answers: answers.map((answer) => ({
        question_id: answer.questionId,
        answer_text: answer.answerText,
      })),
      instruction: "Grade only the submitted daily challenge questions against their private reference answers.",
    });
    if (!graded.evaluation) {
      throw new Error("The grading API returned marks without a topic evaluation.");
    }

    const exam: StudentExam = {
      id: externalPaperId,
      subject: challenge.subjectName,
      title: challenge.title,
      kind: "challenge",
      counts: true,
      marks: graded.total_marks,
      passMarks: challenge.passMarks,
      minutes: challenge.durationMinutes,
      attempts: null,
      window: "practice",
      windowLabel: "Daily challenge",
      questions: challenge.content.examQuestions.map((question) => ({
        id: question.id,
        type: "short",
        questionType: question.questionType,
        marks: question.marks,
        topic: question.topic || challenge.topicTitle,
        prompt: question.question,
      })),
    };
    const attemptId = await recordPracticeEvaluation({
      userId: user.id,
      courseId: challenge.courseId,
      subjectSlug: challenge.subjectSlug,
      subjectName: challenge.subjectName,
      source: "challenge",
      sessionId: externalPaperId,
      totalScore: graded.total_score,
      totalMarks: graded.total_marks,
      evaluation: graded.evaluation,
      history: createPracticeAttemptHistory({
        exam,
        results: graded.results,
        answers: answers.map((answer) => ({
          questionId: answer.questionId,
          answerText: answer.answerText,
        })),
        studentName: String(user.user_metadata?.full_name || "Student"),
      }),
    });
    const updated = await recordStudentChallengeGrade({
      userId: user.id,
      challengeId,
      attemptId,
      score: graded.total_score,
      totalMarks: graded.total_marks,
    });
    if (!updated) throw new Error("The grade was saved, but the challenge could not be updated.");

    return NextResponse.json({
      challenge: updated,
      results: graded.results,
      evaluation: graded.evaluation,
      totalScore: graded.total_score,
      totalMarks: graded.total_marks,
      passed: updated.status === "completed",
    });
  } catch (error) {
    const message =
      error instanceof z.ZodError
        ? error.issues[0]?.message || "Invalid challenge answers."
        : error instanceof Error
          ? error.message
          : "Could not grade this challenge.";
    return NextResponse.json(
      { error: message },
      { status: error instanceof z.ZodError ? 400 : 502 },
    );
  }
}
