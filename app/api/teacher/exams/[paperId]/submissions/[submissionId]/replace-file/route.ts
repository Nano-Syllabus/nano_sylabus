import { NextResponse } from "next/server";
import { getTeacherProfile } from "@/app/teachers/actions";
import { recordTeacherClassroomActivity } from "@/lib/teacher-classroom-activity";
import { gradeTeacherPracticePaperFile, TeacherApiError } from "@/lib/teacher-app/client";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const allowedTypes = new Set(["application/pdf", "image/jpeg", "image/png"]);
const maxFileBytes = 20 * 1024 * 1024;

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? value as Record<string, unknown> : {};
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ paperId: string; submissionId: string }> },
) {
  let newStoragePath = "";
  try {
    const teacher = await getTeacherProfile();
    if (!teacher) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { paperId, submissionId } = await params;
    const formData = await request.formData();
    const file = formData.get("file");
    const instruction = String(formData.get("instruction") || "").trim();
    if (!(file instanceof File) || file.size === 0) return NextResponse.json({ error: "Choose a replacement answer sheet." }, { status: 400 });
    if (!allowedTypes.has(file.type)) return NextResponse.json({ error: "Use a PDF, JPG, or PNG answer sheet." }, { status: 400 });
    if (file.size > maxFileBytes) return NextResponse.json({ error: "Answer sheet must be 20 MB or smaller." }, { status: 413 });
    if (instruction.length > 1_000) return NextResponse.json({ error: "Grading instruction is too long." }, { status: 400 });

    const admin = createSupabaseAdminClient();
    const { data: paper, error: paperError } = await admin.from("teacher_exam_papers").select("id").eq("teacher_id", teacher.id).eq("external_paper_id", paperId).is("archived_at", null).maybeSingle();
    if (paperError) throw paperError;
    if (!paper) return NextResponse.json({ error: "Paper not found." }, { status: 404 });
    const { data: submission, error: submissionError } = await admin.from("teacher_exam_submissions").select("id,assignment_id,student_name,grade").eq("id", submissionId).eq("teacher_id", teacher.id).eq("paper_id", paper.id).maybeSingle();
    if (submissionError) throw submissionError;
    if (!submission) return NextResponse.json({ error: "Submission not found." }, { status: 404 });

    const fileBuffer = Buffer.from(await file.arrayBuffer());
    const grade = await gradeTeacherPracticePaperFile(teacher.collection_sk, paperId, {
      studentName: submission.student_name || "Student",
      instruction,
      file: { name: file.name || "answer-sheet", mimeType: file.type, buffer: fileBuffer },
    });
    const safeName = (file.name || "answer-sheet").replace(/[^a-zA-Z0-9._-]/g, "_");
    newStoragePath = `submissions/${teacher.id}/${paper.id}/${crypto.randomUUID()}-${safeName}`;
    const { error: uploadError } = await admin.storage.from("teacher-documents").upload(newStoragePath, fileBuffer, { contentType: file.type, upsert: false });
    if (uploadError) throw uploadError;

    const previousGrade = record(submission.grade);
    const previousReview = record(previousGrade._review);
    const previousSheet = record(previousGrade._answer_sheet);
    const nextGrade = {
      ...grade,
      _answer_sheet: { storage_path: newStoragePath, name: file.name || "answer-sheet", mime_type: file.type, size_bytes: file.size },
      _review: { ...previousReview, status: "pending", reviewed_at: null, published_at: null, annotations: [] },
    };
    const { error: updateError } = await admin.from("teacher_exam_submissions").update({
      source: "upload",
      external_submission_id: typeof grade.submission_id === "string" ? grade.submission_id : null,
      grade: nextGrade,
      updated_at: new Date().toISOString(),
    }).eq("id", submission.id).eq("teacher_id", teacher.id);
    if (updateError) {
      await admin.storage.from("teacher-documents").remove([newStoragePath]);
      throw updateError;
    }
    const oldStoragePath = typeof previousSheet.storage_path === "string" ? previousSheet.storage_path : "";
    if (oldStoragePath && oldStoragePath !== newStoragePath) await admin.storage.from("teacher-documents").remove([oldStoragePath]);
    if (submission.assignment_id) {
      const assignment = await admin.from("teacher_exam_assignments").select("classroom_id").eq("id", submission.assignment_id).maybeSingle();
      if (assignment.data?.classroom_id) await recordTeacherClassroomActivity(admin, { classroomId: assignment.data.classroom_id, actorId: teacher.id, eventType: "submission.scan_replaced", summary: "Answer sheet replaced and regraded", metadata: { submissionId } });
    }
    return NextResponse.json({ replaced: true, grade: nextGrade });
  } catch (error) {
    const apiError = error instanceof TeacherApiError ? error : null;
    return NextResponse.json({ error: apiError?.status === 401 ? "This teacher workspace key is no longer valid." : apiError?.status === 404 ? "This paper was not found in the teacher collection." : "Could not replace and regrade this answer sheet." }, { status: apiError?.status === 401 ? 409 : apiError?.status === 404 ? 404 : 502 });
  }
}
