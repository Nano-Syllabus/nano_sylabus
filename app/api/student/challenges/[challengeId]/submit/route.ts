import { NextResponse } from "next/server";
import { z } from "zod";
import {
  challengeExamExpired,
  getStudentChallengeGradeContext,
  recordStudentChallengeGrade,
  refreshStudentChallengeExam,
  submitStudentChallengeAttempt,
} from "@/lib/data/student-challenges";
import { recordPracticeEvaluation } from "@/lib/data/student-mastery";
import { createPracticeAttemptHistory } from "@/lib/practice-history";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { TeacherApiError } from "@/lib/teacher-app/client";
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
    if (challengeExamExpired(challenge)) {
      const refreshed = await refreshStudentChallengeExam(user.id, challengeId);
      return NextResponse.json(
        { error: "That sitting expired. A fresh challenge exam is ready.", challenge: refreshed },
        { status: 409 },
      );
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
    let graded;
    try {
      graded = await submitStudentChallengeAttempt({
        userId: user.id,
        challengeId,
        answers,
      });
    } catch (error) {
      if (error instanceof TeacherApiError && error.status === 404) {
        const refreshed = await refreshStudentChallengeExam(user.id, challengeId);
        return NextResponse.json(
          {
            error: "That sitting is no longer live. A fresh challenge exam is ready.",
            challenge: refreshed,
          },
          { status: 409 },
        );
      }
      throw error;
    }
    if (!graded.graded) {
      return NextResponse.json(
        { error: "Grading is temporarily unavailable. Your sitting is still live; try again." },
        { status: 503 },
      );
    }
    if (!graded.evaluation) {
      throw new Error("The challenge grader returned marks without a topic evaluation.");
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
      passed: graded.passed,
      passMarks: challenge.passMarks,
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
    let updated = await recordStudentChallengeGrade({
      userId: user.id,
      challengeId,
      attemptId,
      score: graded.total_score,
      totalMarks: graded.total_marks,
      passed: graded.passed,
    });
    if (!updated) throw new Error("The grade was saved, but the challenge could not be updated.");
    if (!graded.passed) {
      try {
        updated = (await refreshStudentChallengeExam(user.id, challengeId)) ?? updated;
      } catch {
        // The failed grade is already durable. Opening the challenge again
        // will issue the next live sitting if the API was briefly unavailable.
      }
    }

    return NextResponse.json({
      challenge: updated,
      results: graded.results,
      evaluation: graded.evaluation,
      totalScore: graded.total_score,
      totalMarks: graded.total_marks,
      passed: graded.passed,
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
