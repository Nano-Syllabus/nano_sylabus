import { NextResponse } from "next/server";
import { getTeacherProfile } from "@/app/teachers/actions";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import {
  gradeTeacherPracticePaperFile,
  TeacherApiError,
} from "@/lib/teacher-app/client";

const allowedTypes = new Set(["application/pdf", "image/jpeg", "image/png"]);
const maxFileBytes = 20 * 1024 * 1024;

export async function POST(
  request: Request,
  { params }: { params: Promise<{ paperId: string }> },
) {
  try {
    const teacher = await getTeacherProfile();
    if (!teacher) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { paperId } = await params;
    if (!paperId.trim()) {
      return NextResponse.json({ error: "Paper ID is required." }, { status: 400 });
    }

    const formData = await request.formData();
    const file = formData.get("file");
    const studentName = String(formData.get("student_name") || "").trim();
    const instruction = String(formData.get("instruction") || "").trim();
    if (!(file instanceof File) || file.size === 0) {
      return NextResponse.json({ error: "Choose an answer-sheet file." }, { status: 400 });
    }
    if (!allowedTypes.has(file.type)) {
      return NextResponse.json({ error: "Use a PDF, JPG, or PNG answer sheet." }, { status: 400 });
    }
    if (file.size > maxFileBytes) {
      return NextResponse.json({ error: "Answer sheet must be 20 MB or smaller." }, { status: 413 });
    }
    if (studentName.length > 160 || instruction.length > 1_000) {
      return NextResponse.json({ error: "Student name or instruction is too long." }, { status: 400 });
    }

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

    const grade = await gradeTeacherPracticePaperFile(teacher.collection_sk, paperId, {
      studentName,
      instruction,
      file: {
        name: file.name || "answer-sheet",
        mimeType: file.type,
        buffer: Buffer.from(await file.arrayBuffer()),
      },
    });
    const { error: saveError } = await admin.from("teacher_exam_submissions").insert({
      teacher_id: teacher.id,
      paper_id: paper.id,
      external_submission_id:
        typeof grade.submission_id === "string" ? grade.submission_id : null,
      student_name: studentName || "Student",
      source: "upload",
      grade,
    });
    if (saveError) throw saveError;
    return NextResponse.json({ grade });
  } catch (error) {
    const apiError = error instanceof TeacherApiError ? error : null;
    return NextResponse.json(
      {
        error:
          apiError?.status === 401
            ? "This teacher workspace key is no longer valid."
            : apiError?.status === 404
              ? "This paper was not found in the teacher collection."
              : "Could not grade this answer sheet.",
      },
      { status: apiError?.status === 401 ? 409 : apiError?.status === 404 ? 404 : 502 },
    );
  }
}
