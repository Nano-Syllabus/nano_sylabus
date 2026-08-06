import { NextResponse } from "next/server";
import { recordExamEvaluationForStudent } from "@/lib/data/student-exam-mastery";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { gradeTeacherPracticePaperFile, TeacherApiError } from "@/lib/teacher-app/client";
import { recordTeacherClassroomActivity } from "@/lib/teacher-classroom-activity";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

const MAX_UPLOAD_BYTES = 15 * 1024 * 1024;
const ACCEPTED = new Set(["application/pdf", "image/png", "image/jpeg", "image/jpg"]);

/**
 * Hands in a photo or scan of a handwritten answer sheet instead of typing.
 * The tenant transcribes the sheet, matches each answer to its question, then
 * grades it against the paper's cached reference answers.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ assignmentId: string }> },
) {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const form = await request.formData().catch(() => null);
    const file = form?.get("file");
    if (!(file instanceof File) || !file.size) {
      return NextResponse.json({ error: "Attach your answer sheet." }, { status: 400 });
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      return NextResponse.json({ error: "That file is larger than 15 MB." }, { status: 413 });
    }
    if (!ACCEPTED.has(file.type)) {
      return NextResponse.json({ error: "Upload a PDF, JPG, or PNG." }, { status: 415 });
    }

    const { assignmentId } = await params;
    const admin = createSupabaseAdminClient();

    const { data: assignment, error } = await admin
      .from("teacher_exam_assignments")
      .select("id,teacher_id,paper_id,classroom_id,opens_at,closes_at,max_attempts")
      .eq("id", assignmentId)
      .maybeSingle();
    if (error) throw error;
    if (!assignment) return NextResponse.json({ error: "Exam not found." }, { status: 404 });

    const { data: member } = await admin
      .from("teacher_classroom_members")
      .select("classroom_id")
      .eq("classroom_id", assignment.classroom_id)
      .eq("student_id", user.id)
      .maybeSingle();
    if (!member) {
      return NextResponse.json({ error: "Join the classroom before taking this exam." }, { status: 403 });
    }

    const { data: previousAttempts, error: attemptsError } = await admin
      .from("teacher_exam_submissions")
      .select("attempt_no")
      .eq("assignment_id", assignment.id)
      .eq("student_id", user.id)
      .order("attempt_no", { ascending: false });
    if (attemptsError) throw attemptsError;

    const maxAttempts = Math.max(1, Number(assignment.max_attempts) || 1);
    if ((previousAttempts || []).length >= maxAttempts) {
      return NextResponse.json(
        { error: `You have used all ${maxAttempts} allowed attempts.` },
        { status: 409 },
      );
    }
    const attemptNo =
      Math.max(0, ...(previousAttempts || []).map((item) => Number(item.attempt_no) || 0)) + 1;

    const now = Date.now();
    if (assignment.opens_at && new Date(assignment.opens_at).getTime() > now) {
      return NextResponse.json({ error: "This exam is not open yet." }, { status: 409 });
    }
    if (assignment.closes_at && new Date(assignment.closes_at).getTime() < now) {
      return NextResponse.json({ error: "This exam has closed." }, { status: 409 });
    }

    const [{ data: teacher }, { data: paper }] = await Promise.all([
      admin.from("teachers").select("collection_sk").eq("id", assignment.teacher_id).single(),
      admin.from("teacher_exam_papers").select("external_paper_id").eq("id", assignment.paper_id).single(),
    ]);
    if (!teacher || !paper) {
      return NextResponse.json({ error: "Exam workspace is unavailable." }, { status: 409 });
    }

    const grade = await gradeTeacherPracticePaperFile(teacher.collection_sk, paper.external_paper_id, {
      studentName: user.email || "Student",
      instruction:
        "Grade this classroom exam strictly according to the paper's marks and saved reference answers.",
      file: {
        name: file.name || "answer-sheet",
        mimeType: file.type,
        buffer: Buffer.from(await file.arrayBuffer()),
      },
    });

    const { error: saveError } = await admin.from("teacher_exam_submissions").insert({
      teacher_id: assignment.teacher_id,
      paper_id: assignment.paper_id,
      assignment_id: assignment.id,
      student_id: user.id,
      external_submission_id: typeof grade.submission_id === "string" ? grade.submission_id : null,
      student_name: user.email || "Student",
      source: "file",
      grade,
      attempt_no: attemptNo,
    });
    if (saveError) throw saveError;

    // Feed the knowledge graph as well — a classroom exam should move Today the
    // same way practice does. A failure here must not lose the submission.
    try {
      await recordExamEvaluationForStudent({
        admin,
        userId: user.id,
        classroomId: assignment.classroom_id,
        grade,
      });
    } catch {
      // Mastery is derived data; the graded submission above is the record.
    }

    await recordTeacherClassroomActivity(admin, {
      classroomId: assignment.classroom_id,
      actorId: user.id,
      actorKind: "student",
      eventType: "exam.submitted",
      summary: `Answer sheet uploaded for attempt ${attemptNo}`,
      metadata: { assignmentId: assignment.id, attemptNo, source: "file" },
    });

    return NextResponse.json({
      submitted: true,
      awaitingReview: true,
      attemptNo,
      attemptsRemaining: Math.max(0, maxAttempts - attemptNo),
    });
  } catch (error) {
    const apiError = error instanceof TeacherApiError ? error : null;
    return NextResponse.json(
      {
        error:
          apiError?.status === 404
            ? "Paper not found in the teacher collection."
            : "Could not grade your answer sheet.",
      },
      { status: apiError?.status === 404 ? 404 : 502 },
    );
  }
}
