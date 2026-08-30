import { NextResponse } from "next/server";
import {
  challengeExamExpired,
  getStudentChallengeGradeContext,
  refreshStudentChallengeExam,
  submitStudentChallengeFile,
} from "@/lib/data/student-challenges";
import { persistStudentChallengeGrade } from "@/lib/data/student-challenge-grading";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { TeacherApiError } from "@/lib/teacher-app/client";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const allowedTypes = new Set(["application/pdf", "image/jpeg", "image/png", "image/webp"]);

export async function POST(
  request: Request,
  { params }: { params: Promise<{ challengeId: string }> },
) {
  try {
    const supabase = await createSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();
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
    const updated = await persistStudentChallengeGrade({
      userId: user.id,
      studentName: String(user.user_metadata?.full_name || "Student"),
      challengeId,
      challenge,
      externalPaperId,
      graded,
    });
    return NextResponse.json({
      challenge: updated,
      results: graded.results,
      evaluation: graded.evaluation,
      totalScore: graded.total_score,
      totalMarks: graded.total_marks,
      passed: graded.passed,
      xpAwarded: graded.passed ? 50 : 0,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not grade this scan." },
      { status: 502 },
    );
  }
}
