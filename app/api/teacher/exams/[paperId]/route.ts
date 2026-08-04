import { NextResponse } from "next/server";
import { z } from "zod";
import { getTeacherProfile } from "@/app/teachers/actions";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

type Context = { params: Promise<{ paperId: string }> };

const updateSchema = z.object({
  title: z.string().trim().min(1).max(160),
  passMarks: z.number().min(0).max(10_000),
});

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
    if (parsed.data.passMarks > Number(row.total_marks || 0)) {
      return NextResponse.json({ error: "Pass marks cannot exceed total marks." }, { status: 400 });
    }

    const paper = {
      ...(row.paper && typeof row.paper === "object" ? row.paper : {}),
      title: parsed.data.title,
      passMarks: parsed.data.passMarks,
    };
    const updatedAt = new Date().toISOString();
    const { error } = await admin
      .from("teacher_exam_papers")
      .update({
        title: parsed.data.title,
        pass_marks: parsed.data.passMarks,
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
