import { NextResponse } from "next/server";
import { z } from "zod";
import { getTeacherProfile } from "@/app/teachers/actions";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { applySubmissionReview, submissionReviewStatus } from "@/lib/teacher-submission-review";

const schema = z.object({
  questionId: z.string().min(1).max(200),
  scoreDelta: z.number().min(-10_000).max(10_000),
  feedback: z.string().max(5_000).optional(),
});

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? value as Record<string, unknown> : {};
}

export async function POST(request: Request, { params }: { params: Promise<{ paperId: string }> }) {
  try {
    const teacher = await getTeacherProfile();
    if (!teacher) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const parsed = schema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: "Choose a question and valid mark adjustment." }, { status: 400 });
    const { paperId } = await params;
    const admin = createSupabaseAdminClient();
    const { data: paper, error: paperError } = await admin.from("teacher_exam_papers").select("id").eq("teacher_id", teacher.id).eq("external_paper_id", paperId).is("archived_at", null).maybeSingle();
    if (paperError) throw paperError;
    if (!paper) return NextResponse.json({ error: "Paper not found." }, { status: 404 });
    const { data: submissions, error } = await admin.from("teacher_exam_submissions").select("id,grade").eq("teacher_id", teacher.id).eq("paper_id", paper.id);
    if (error) throw error;
    let updated = 0;
    await Promise.all((submissions || []).map(async (submission) => {
      const grade = record(submission.grade);
      const results = Array.isArray(grade.results) ? grade.results.map(record) : [];
      const result = results.find((item, index) => String(item.question_id || item.id || index) === parsed.data.questionId);
      if (!result) return;
      const nextGrade = applySubmissionReview(grade, {
        status: submissionReviewStatus(grade),
        teacherNote: String(record(grade._review).teacher_note || ""),
        results: [{ questionId: parsed.data.questionId, score: (Number(result.score) || 0) + parsed.data.scoreDelta, feedback: parsed.data.feedback === undefined ? String(result.feedback || "") : parsed.data.feedback }],
      });
      const { error: updateError } = await admin.from("teacher_exam_submissions").update({ grade: nextGrade }).eq("id", submission.id).eq("teacher_id", teacher.id);
      if (updateError) throw updateError;
      updated += 1;
    }));
    return NextResponse.json({ updated });
  } catch {
    return NextResponse.json({ error: "Could not adjust this question across submissions." }, { status: 502 });
  }
}
