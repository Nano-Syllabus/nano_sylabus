import { NextResponse } from "next/server";
import { nextChallengeInSubject } from "@/lib/data/challenge-next-in-subject";
import { studentFacingBuildError } from "@/lib/data/student-challenges";
import {
  challengeExamExpired,
  getStudentChallengeGradeContext,
  refreshStudentChallengeExam,
  submitStudentChallengeFile,
} from "@/lib/data/student-challenges";
import { persistStudentChallengeGrade } from "@/lib/data/student-challenge-grading";
import {
  choiceQuestionsOf,
  combinedChallengeGrade,
  gradeChallengeChoices,
  parseChoiceSelections,
} from "@/lib/data/challenge-exam-format";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { TeacherApiError } from "@/lib/teacher-app/client";
import { getVerifiedUser } from "@/lib/supabase/verified-user";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const allowedTypes = new Set(["application/pdf", "image/jpeg", "image/png", "image/webp"]);
/** Exams `submitStudentChallengeFile` can grade from a scan; see the check below. */
const FILE_GRADED_EXAMS = new Set(["practice-paper-v1", "challenge-exam-v1"]);

export async function POST(
  request: Request,
  { params }: { params: Promise<{ challengeId: string }> },
) {
  try {
    const supabase = await createSupabaseServerClient();
    const { data: { user } } = await getVerifiedUser(supabase);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File) || !file.size) {
      return NextResponse.json({ error: "Upload a clear scan of your answer." }, { status: 400 });
    }
    if (file.size > 20 * 1024 * 1024) {
      return NextResponse.json({ error: "Upload a scan up to 20 MB." }, { status: 413 });
    }
    if (!allowedTypes.has(file.type)) {
      return NextResponse.json({ error: "Use a PDF, JPG, PNG, or WebP scan." }, { status: 400 });
    }
    const { challengeId } = await params;
    const context = await getStudentChallengeGradeContext(user.id, challengeId);
    if (!context) return NextResponse.json({ error: "Challenge not found." }, { status: 404 });
    const { detail: challenge, externalPaperId } = context;
    if (challenge.status === "completed") return NextResponse.json({ error: "This challenge is already complete." }, { status: 409 });
    if (!challenge.lessonRead || !challenge.examplesReviewed) {
      return NextResponse.json({ error: "Finish the lesson and worked examples before submitting." }, { status: 409 });
    }
    if (!challenge.content || !externalPaperId) return NextResponse.json({ error: "Start the challenge first." }, { status: 409 });
    // Both exams this route knows how to grade from a scan. Checking for the
    // legacy practice paper alone refused EVERY current challenge — they are all
    // `challenge-exam-v1` — and each refusal issued a fresh exam, so a student
    // who pressed Submit was handed a new paper and the same error, forever.
    if (!FILE_GRADED_EXAMS.has(String(challenge.content.examProvider || ""))) {
      const refreshed = await refreshStudentChallengeExam(user.id, challengeId);
      return NextResponse.json(
        {
          error: "Your answer-sheet grader was upgraded. A fresh compatible exam is ready.",
          challenge: refreshed,
        },
        { status: 409 },
      );
    }
    if (challengeExamExpired(challenge)) {
      const refreshed = await refreshStudentChallengeExam(user.id, challengeId);
      return NextResponse.json({ error: "That sitting expired. A fresh exam is ready.", challenge: refreshed }, { status: 409 });
    }
    let graded;
    try {
      graded = await submitStudentChallengeFile({
        userId: user.id,
        challengeId,
        studentName: String(user.user_metadata?.full_name || "Student"),
        file: { name: file.name, mimeType: file.type, buffer: Buffer.from(await file.arrayBuffer()) },
      });
    } catch (error) {
      if (error instanceof TeacherApiError && error.status === 404) {
        const refreshed = await refreshStudentChallengeExam(user.id, challengeId);
        return NextResponse.json({ error: "That sitting is no longer live. A fresh exam is ready.", challenge: refreshed }, { status: 409 });
      }
      throw error;
    }
    // A HYBRID paper: the multiple-choice part rides along with the scan and is
    // marked here, then joined to the written part the course API marked.
    const choiceQuestions = choiceQuestionsOf(challenge.content.examQuestions);
    if (choiceQuestions.length) {
      let picked: unknown = {};
      try {
        picked = JSON.parse(String(form.get("choices") || "{}"));
      } catch {
        picked = {};
      }
      graded = combinedChallengeGrade({
        attemptId: externalPaperId,
        subject: challenge.subjectName,
        passMarks: challenge.passMarks,
        choices: gradeChallengeChoices(
          challengeId,
          choiceQuestions,
          parseChoiceSelections(picked, choiceQuestions),
        ),
        written: graded,
      });
    }
    const updated = await persistStudentChallengeGrade({
      userId: user.id,
      studentName: String(user.user_metadata?.full_name || "Student"),
      challengeId,
      challenge,
      externalPaperId,
      graded,
    });
    // A pass frees the subject's card: its next topic is assigned now and handed
    // back, so the hub shows the way on without a reload.
    const nextInSubject = graded.passed ? await nextChallengeInSubject(user.id, challenge) : null;
    return NextResponse.json({
      challenge: updated,
      results: graded.results,
      evaluation: graded.evaluation,
      totalScore: graded.total_score,
      totalMarks: graded.total_marks,
      passed: graded.passed,
      xpAwarded: graded.passed ? 50 : 0,
      nextInSubject,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? studentFacingBuildError(error.message) : "Could not grade this scan." },
      { status: 502 },
    );
  }
}
