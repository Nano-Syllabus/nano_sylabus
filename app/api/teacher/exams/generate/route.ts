import { NextResponse } from "next/server";
import { z } from "zod";
import { getTeacherProfile } from "@/app/teachers/actions";
import { getTenantApiEnv } from "@/lib/env";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import {
  generateTeacherPracticePaper,
  getTeacherSubjects,
  TeacherApiError,
  type ApiRecord,
} from "@/lib/teacher-app/client";

const bandSchema = z.object({
  label: z.string().trim().min(1).max(40),
  questionType: z.enum(["theory", "numerical"]),
  count: z.number().int().min(1).max(20),
  marksEach: z.number().min(0.5).max(100),
});

const requestSchema = z.object({
  subjectSlug: z.string().trim().min(1).max(200),
  title: z.string().trim().max(160).optional().default(""),
  instruction: z.string().trim().max(1_000).optional().default(""),
  passMarks: z.number().min(0).max(10_000).optional().default(0),
  bands: z.array(bandSchema).min(1).max(6),
});

function paperQuestion(value: unknown) {
  if (!value || typeof value !== "object") return null;
  const question = value as ApiRecord;
  return {
    id: String(question.id || ""),
    chapter: String(question.chapter || ""),
    bandLabel: String(question.band_label || ""),
    questionType: String(question.question_type || ""),
    marks: Number(question.marks) || 0,
    text: String(question.text || ""),
    referenceAnswer: String(question.reference_answer || ""),
  };
}

export async function POST(request: Request) {
  try {
    const teacher = await getTeacherProfile();
    if (!teacher) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const parsed = requestSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message || "Invalid exam settings." },
        { status: 400 },
      );
    }

    const subjects = await getTeacherSubjects(teacher.collection_sk);
    const subject = subjects.subjects.find((item) => item.slug === parsed.data.subjectSlug);
    if (!subject) {
      return NextResponse.json({ error: "Subject not found in this teacher collection." }, { status: 404 });
    }
    const subjectName = typeof subject.name === "string" ? subject.name : "";
    if (!subjectName) {
      return NextResponse.json({ error: "The subject is missing its backend name." }, { status: 409 });
    }

    const totalMarks = parsed.data.bands.reduce(
      (total, band) => total + band.count * band.marksEach,
      0,
    );
    if (parsed.data.passMarks > totalMarks) {
      return NextResponse.json({ error: "Pass marks cannot exceed total marks." }, { status: 400 });
    }

    const result = await generateTeacherPracticePaper(teacher.collection_sk, {
      subject: subjectName,
      title: parsed.data.title || `${subjectName} exam`,
      instruction: parsed.data.instruction,
      pass_marks: parsed.data.passMarks,
      bands: parsed.data.bands.map((band) => ({
        label: band.label,
        question_type: band.questionType,
        count: band.count,
        marks_each: band.marksEach,
      })),
    });
    const questions = Array.isArray(result.questions)
      ? result.questions.map(paperQuestion).filter((question) => question !== null)
      : [];

    const paperId = String(result.id || "");
    const { baseUrl } = getTenantApiEnv();
    const paper = {
      id: paperId,
      title: String(result.title || parsed.data.title || `${subjectName} exam`),
      subject: String(result.subject || subjectName),
      subjectSlug: parsed.data.subjectSlug,
      totalMarks: Number(result.total_marks) || totalMarks,
      passMarks: Number(result.pass_marks) || parsed.data.passMarks,
      warning: typeof result.warning === "string" ? result.warning : "",
      shareUrl: paperId
        ? new URL(`/exam/paper/${encodeURIComponent(paperId)}`, baseUrl).toString()
        : "",
      questions,
    };

    const admin = createSupabaseAdminClient();
    const { error: saveError } = await admin.from("teacher_exam_papers").upsert(
      {
        teacher_id: teacher.id,
        user_id: teacher.user_id,
        external_paper_id: paper.id,
        subject_slug: paper.subjectSlug,
        subject_name: paper.subject,
        title: paper.title,
        total_marks: paper.totalMarks,
        pass_marks: paper.passMarks,
        share_url: paper.shareUrl,
        paper,
      },
      { onConflict: "teacher_id,external_paper_id" },
    );

    return NextResponse.json({
      paper,
      persistenceWarning: saveError
        ? "Paper generated, but its app history could not be saved. Apply the latest Supabase migration."
        : "",
    });
  } catch (error) {
    const apiError = error instanceof TeacherApiError ? error : null;
    return NextResponse.json(
      {
        error:
          apiError?.status === 401
            ? "This teacher workspace key is no longer valid."
            : "Could not generate an exam from this subject's indexed material.",
      },
      { status: apiError?.status === 401 ? 409 : 502 },
    );
  }
}
