import { NextResponse } from "next/server";
import { z } from "zod";
import { getTeacherProfile } from "@/app/teachers/actions";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { gradeTeacherPracticePaper, TeacherApiError } from "@/lib/teacher-app/client";

const schema = z.object({
  studentName: z.string().trim().max(160).optional().default(""),
  instruction: z.string().trim().max(1_000).optional().default(""),
  answers: z.array(z.object({
    questionId: z.string().trim().min(1).max(200),
    answerText: z.string().max(20_000),
  })).min(1).max(100),
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ paperId: string }> },
) {
  try {
    const teacher = await getTeacherProfile();
    if (!teacher) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { paperId } = await params;
    const parsed = schema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message || "Invalid typed answers." },
        { status: 400 },
      );
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

    const grade = await gradeTeacherPracticePaper(teacher.collection_sk, paperId, {
      student_name: parsed.data.studentName || "Student",
      instruction: parsed.data.instruction,
      answers: parsed.data.answers.map((answer) => ({
        question_id: answer.questionId,
        answer_text: answer.answerText,
      })),
    });
    const externalSubmissionId =
      typeof grade.submission_id === "string" ? grade.submission_id : null;
    const { error } = await admin.from("teacher_exam_submissions").insert({
      teacher_id: teacher.id,
      paper_id: paper.id,
      external_submission_id: externalSubmissionId,
      student_name: parsed.data.studentName || "Student",
      source: "typed",
      grade,
    });
    if (error) throw error;
    return NextResponse.json({ grade });
  } catch (error) {
    const apiError = error instanceof TeacherApiError ? error : null;
    return NextResponse.json(
      { error: apiError?.status === 404 ? "Paper not found in this teacher collection." : "Could not grade typed answers." },
      { status: apiError?.status === 404 ? 404 : 502 },
    );
  }
}
