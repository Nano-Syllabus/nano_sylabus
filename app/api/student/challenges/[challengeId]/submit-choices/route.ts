import { NextResponse } from "next/server";
import { studentFacingBuildError } from "@/lib/data/student-challenges";
import {
  challengeExamExpired,
  getStudentChallengeGradeContext,
  refreshStudentChallengeExam,
} from "@/lib/data/student-challenges";
import {
  choiceQuestionsOf,
  choiceTally,
  combinedChallengeGrade,
  gradeChallengeChoices,
  parseChoiceSelections,
} from "@/lib/data/challenge-exam-format";
import { persistStudentChallengeGrade } from "@/lib/data/student-challenge-grading";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getVerifiedUser } from "@/lib/supabase/verified-user";

export const dynamic = "force-dynamic";

/**
 * Hand in an all-MCQ challenge exam — the format a community's creator chose.
 * Marked here from the sealed key (`lib/data/challenge-exam-format.ts`), so it
 * needs no scan, no upstream attempt and no model call.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ challengeId: string }> },
) {
  try {
    const supabase = await createSupabaseServerClient();
    const { data: { user } } = await getVerifiedUser(supabase);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const body = (await request.json().catch(() => null)) as { answers?: unknown } | null;
    const { challengeId } = await params;
    const context = await getStudentChallengeGradeContext(user.id, challengeId);
    if (!context) return NextResponse.json({ error: "Challenge not found." }, { status: 404 });
    const { detail: challenge, externalPaperId } = context;
    if (challenge.status === "completed") return NextResponse.json({ error: "This challenge is already complete." }, { status: 409 });
    if (!challenge.content || !externalPaperId) return NextResponse.json({ error: "Start the challenge first." }, { status: 409 });
    // An MCQ community's challenge is one page — concepts and questions — with
    // no worked-examples step to have passed. Any other paper keeps its order.
    const singlePage = challenge.content.examFormat === "mcq";
    if (!singlePage && (!challenge.lessonRead || !challenge.examplesReviewed)) {
      return NextResponse.json({ error: "Finish the lesson and worked examples before submitting." }, { status: 409 });
    }
    if (challenge.content.examProvider !== "challenge-mcq-v1") {
      const refreshed = await refreshStudentChallengeExam(user.id, challengeId);
      return NextResponse.json(
        { error: "This community's challenge questions changed. A fresh exam is ready.", challenge: refreshed },
        { status: 409 },
      );
    }
    if (challengeExamExpired(challenge)) {
      const refreshed = await refreshStudentChallengeExam(user.id, challengeId);
      return NextResponse.json({ error: "That sitting expired. A fresh exam is ready.", challenge: refreshed }, { status: 409 });
    }
    const questions = choiceQuestionsOf(challenge.content.examQuestions);
    // The picks recorded as each question was answered are final: the student
    // saw the key the moment they chose, so the browser's copy only fills in
    // questions answered before picks were recorded.
    const selections = {
      ...parseChoiceSelections(body?.answers, questions),
      ...parseChoiceSelections(challenge.content.examPicks ?? {}, questions),
    };
    if (!Object.keys(selections).length) {
      return NextResponse.json({ error: "Choose an answer for at least one question." }, { status: 400 });
    }
    const choices = gradeChallengeChoices(
      challengeId,
      questions,
      selections,
      challenge.content.examNegativePercent ?? 0,
    );
    const graded = combinedChallengeGrade({
      attemptId: externalPaperId,
      subject: challenge.subjectName,
      passMarks: challenge.passMarks,
      choices,
    });
    const updated = await persistStudentChallengeGrade({
      userId: user.id,
      studentName: String(user.user_metadata?.full_name || "Student"),
      challengeId,
      challenge,
      externalPaperId,
      graded,
      answers: choices.map((item) => ({
        questionId: item.question_id,
        answerText: item.student_answer || "[Not answered]",
      })),
    });
    return NextResponse.json({
      challenge: updated,
      results: graded.results,
      evaluation: graded.evaluation,
      totalScore: graded.total_score,
      totalMarks: graded.total_marks,
      passed: graded.passed,
      xpAwarded: graded.passed ? 50 : 0,
      // What the result screen leads with, and each question's verdict.
      tally: { ...choiceTally(choices), negativePercent: challenge.content.examNegativePercent ?? 0 },
      review: choices.map((item) => ({
        questionId: item.question_id,
        outcome: item.outcome,
        chosen: item.chosen_key,
        correct: item.correct_key,
        score: item.score,
      })),
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? studentFacingBuildError(error.message) : "Could not mark these answers." },
      { status: 502 },
    );
  }
}
