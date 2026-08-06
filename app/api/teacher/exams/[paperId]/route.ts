import { NextResponse } from "next/server";
import { z } from "zod";
import { getTeacherProfile } from "@/app/teachers/actions";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getTeacherCollectionPaper, getTeacherSubjects, TeacherApiError } from "@/lib/teacher-app/client";
import { normalizeTeacherBackendPaper } from "@/lib/teacher-paper-api";
import { getTenantApiEnv } from "@/lib/env";

type Context = { params: Promise<{ paperId: string }> };

const updateSchema = z.object({
  title: z.string().trim().min(1).max(160).optional(),
  passMarks: z.number().min(0).max(10_000).optional(),
  kind: z.enum(["exam", "class-test", "assignment", "quiz"]).optional(),
  timeLimitMinutes: z.number().int().min(5).max(300).optional(),
  questions: z.array(z.record(z.unknown())).optional(),
}).refine((data) => Object.keys(data).length > 0, "Nothing to update.");

export async function GET(_request: Request, context: Context) {
  try {
    const teacher = await getTeacherProfile();
    if (!teacher) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { paperId } = await context.params;
    const id = paperId.trim();
    if (!id || id.length > 240) return NextResponse.json({ error: "Invalid paper." }, { status: 400 });

    const admin = createSupabaseAdminClient();
    const { data: local, error: localError } = await admin
      .from("teacher_exam_papers")
      .select("id,paper,subject_slug,created_at,archived_at")
      .eq("teacher_id", teacher.id)
      .eq("external_paper_id", id)
      .maybeSingle();
    if (localError) throw localError;
    if (local?.archived_at) return NextResponse.json({ error: "Paper is archived." }, { status: 404 });

    try {
      const remote = await getTeacherCollectionPaper(teacher.collection_sk, id);
      let subjectSlug = local?.subject_slug || "";
      const remoteSubject = typeof remote.subject === "string" ? remote.subject : "";
      if (!subjectSlug && remoteSubject) {
        const subjects = await getTeacherSubjects(teacher.collection_sk);
        const match = subjects.subjects.find((subject) =>
          subject.name === remoteSubject || subject.slug === remoteSubject,
        );
        subjectSlug = typeof match?.slug === "string" ? match.slug : "";
      }
      const normalized = normalizeTeacherBackendPaper(remote, subjectSlug);
      if (!normalized) return NextResponse.json({ error: "The backend paper response was incomplete." }, { status: 502 });
      const { baseUrl } = getTenantApiEnv();
      const remotePaper = {
        ...normalized,
        shareUrl: normalized.shareUrl || new URL(`/exam/paper/${encodeURIComponent(id)}`, baseUrl).toString(),
      };
      const paper = local?.paper && typeof local.paper === "object"
        ? { ...remotePaper, ...local.paper }
        : remotePaper;

      if (!local) {
        const { data: saved, error: saveError } = await admin.from("teacher_exam_papers").insert({
          teacher_id: teacher.id,
          user_id: teacher.user_id,
          external_paper_id: id,
          subject_slug: subjectSlug,
          subject_name: remotePaper.subject,
          title: remotePaper.title,
          total_marks: remotePaper.totalMarks,
          pass_marks: remotePaper.passMarks,
          share_url: remotePaper.shareUrl,
          paper: remotePaper,
        }).select("id,created_at").single();
        if (!saveError && saved) {
          return NextResponse.json({ paper: { ...paper, appPaperId: saved.id, createdAt: saved.created_at } });
        }
      }
      return NextResponse.json({
        paper: { ...paper, appPaperId: local?.id || "", createdAt: local?.created_at || remotePaper.createdAt },
      });
    } catch (error) {
      if (local?.paper && typeof local.paper === "object") {
        return NextResponse.json({
          paper: { ...local.paper, appPaperId: local.id, createdAt: local.created_at },
          syncWarning: "Showing the saved app copy because backend paper detail is unavailable.",
        });
      }
      throw error;
    }
  } catch (error) {
    const apiError = error instanceof TeacherApiError ? error : null;
    return NextResponse.json(
      {
        error: apiError?.status === 401
          ? "This teacher workspace key is no longer valid."
          : apiError?.status === 404
            ? "Paper not found in this teacher collection."
            : "Could not load the paper.",
      },
      { status: apiError?.status === 401 ? 409 : apiError?.status === 404 ? 404 : 502 },
    );
  }
}

export async function PATCH(request: Request, context: Context) {
  try {
    const teacher = await getTeacherProfile();
    if (!teacher) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { paperId } = await context.params;
    const parsed = updateSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message || "Invalid paper details." },
        { status: 400 },
      );
    }

    const admin = createSupabaseAdminClient();
    const { data: row, error: readError } = await admin
      .from("teacher_exam_papers")
      .select("id,paper,total_marks")
      .eq("teacher_id", teacher.id)
      .eq("external_paper_id", paperId)
      .is("archived_at", null)
      .maybeSingle();
    if (readError) throw readError;
    if (!row) return NextResponse.json({ error: "Paper not found." }, { status: 404 });

    const currentPaper = (row.paper && typeof row.paper === "object" ? row.paper : {}) as Record<string, unknown>;
    const nextQuestions = parsed.data.questions ?? (Array.isArray(currentPaper.questions) ? currentPaper.questions : []);
    const newTotalMarks = parsed.data.questions
      ? nextQuestions.reduce((sum: number, q: unknown) => {
          const m = q && typeof q === "object" && "marks" in q ? Number((q as { marks: unknown }).marks) || 0 : 0;
          return sum + m;
        }, 0)
      : Number(currentPaper.totalMarks || row.total_marks || 0);

    const nextPassMarks = parsed.data.passMarks ?? Number(currentPaper.passMarks || 0);
    if (nextPassMarks > newTotalMarks) {
      return NextResponse.json({ error: "Pass marks cannot exceed total marks." }, { status: 400 });
    }

    const paper = {
      ...currentPaper,
      ...(parsed.data.title !== undefined && { title: parsed.data.title }),
      ...(parsed.data.passMarks !== undefined && { passMarks: parsed.data.passMarks }),
      ...(parsed.data.kind !== undefined && { kind: parsed.data.kind }),
      ...(parsed.data.timeLimitMinutes !== undefined && { timeLimitMinutes: parsed.data.timeLimitMinutes }),
      ...(parsed.data.questions !== undefined && { questions: nextQuestions }),
      totalMarks: newTotalMarks,
    };
    const updatedAt = new Date().toISOString();
    const { error } = await admin
      .from("teacher_exam_papers")
      .update({
        title: paper.title as string,
        pass_marks: paper.passMarks as number,
        total_marks: newTotalMarks,
        paper,
        updated_at: updatedAt,
      })
      .eq("id", row.id)
      .eq("teacher_id", teacher.id);
    if (error) throw error;
    return NextResponse.json({ paper: { ...paper, appPaperId: row.id, updatedAt } });
  } catch {
    return NextResponse.json({ error: "Could not update the paper." }, { status: 502 });
  }
}

export async function DELETE(_request: Request, context: Context) {
  try {
    const teacher = await getTeacherProfile();
    if (!teacher) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { paperId } = await context.params;
    const admin = createSupabaseAdminClient();
    const { data, error } = await admin
      .from("teacher_exam_papers")
      .update({ archived_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq("teacher_id", teacher.id)
      .eq("external_paper_id", paperId)
      .is("archived_at", null)
      .select("id")
      .maybeSingle();
    if (error) throw error;
    if (!data) return NextResponse.json({ error: "Paper not found." }, { status: 404 });
    return NextResponse.json({ archived: true });
  } catch {
    return NextResponse.json({ error: "Could not archive the paper." }, { status: 502 });
  }
}
