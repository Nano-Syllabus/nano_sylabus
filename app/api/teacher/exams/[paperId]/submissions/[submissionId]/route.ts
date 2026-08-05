import { NextResponse } from "next/server";
import { z } from "zod";
import { getTeacherProfile } from "@/app/teachers/actions";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { applySubmissionReview, submissionReviewStatus } from "@/lib/teacher-submission-review";
import { recordTeacherClassroomActivity } from "@/lib/teacher-classroom-activity";

const schema = z.object({
  status: z.enum(["pending", "reviewed", "published"]),
  teacherNote: z.string().max(2_000).optional().default(""),
  results: z.array(z.object({
    questionId: z.string().min(1).max(200),
    score: z.number().min(0).max(10_000),
    feedback: z.string().max(5_000).optional(),
  })).max(100).optional(),
  annotations: z.array(z.object({
    id: z.string().min(1).max(100),
    type: z.enum(["tick", "cross", "mark", "note"]),
    page: z.number().int().min(1).max(500),
    x: z.number().min(0).max(1),
    y: z.number().min(0).max(1),
    value: z.string().max(500),
  })).max(500).optional(),
});

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ paperId: string; submissionId: string }> },
) {
  try {
    const teacher = await getTeacherProfile();
    if (!teacher) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const parsed = schema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message || "Invalid review." }, { status: 400 });
    const { paperId, submissionId } = await params;
    const admin = createSupabaseAdminClient();
    const { data: paper, error: paperError } = await admin
      .from("teacher_exam_papers")
      .select("id")
      .eq("teacher_id", teacher.id)
      .eq("external_paper_id", paperId)
      .is("archived_at", null)
      .maybeSingle();
    if (paperError) throw paperError;
    if (!paper) return NextResponse.json({ error: "Paper not found." }, { status: 404 });
    const { data: submission, error: readError } = await admin
      .from("teacher_exam_submissions")
      .select("id,assignment_id,grade")
      .eq("id", submissionId)
      .eq("teacher_id", teacher.id)
      .eq("paper_id", paper.id)
      .maybeSingle();
    if (readError) throw readError;
    if (!submission) return NextResponse.json({ error: "Submission not found." }, { status: 404 });
    const grade = applySubmissionReview(submission.grade, parsed.data);
    const { error } = await admin
      .from("teacher_exam_submissions")
      .update({ grade, updated_at: new Date().toISOString() })
      .eq("id", submission.id)
      .eq("teacher_id", teacher.id);
    if (error) throw error;
    if (submission.assignment_id) {
      const assignment = await admin.from("teacher_exam_assignments").select("classroom_id").eq("id", submission.assignment_id).maybeSingle();
      if (assignment.data?.classroom_id) {
        await recordTeacherClassroomActivity(admin, { classroomId: assignment.data.classroom_id, actorId: teacher.id, eventType: parsed.data.status === "published" ? "result.published" : "submission.review_saved", summary: parsed.data.status === "published" ? "A result was published" : "Submission review saved", metadata: { submissionId } });
      }
    }
    return NextResponse.json({ submission: { id: submission.id, grade, reviewStatus: submissionReviewStatus(grade) } });
  } catch {
    return NextResponse.json({ error: "Could not save the submission review." }, { status: 502 });
  }
}
