import { NextResponse } from "next/server";
import { getTeacherProfile } from "@/app/teachers/actions";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ paperId: string }> },
) {
  try {
    const teacher = await getTeacherProfile();
    if (!teacher) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { paperId } = await params;
    const admin = createSupabaseAdminClient();
    const { data: paper, error: paperError } = await admin
      .from("teacher_exam_papers")
      .select("id")
      .eq("teacher_id", teacher.id)
      .eq("external_paper_id", paperId)
      .maybeSingle();
    if (paperError) throw paperError;
    if (!paper) return NextResponse.json({ error: "Paper not found." }, { status: 404 });

    const { data, error } = await admin
      .from("teacher_exam_submissions")
      .select("id,student_name,source,grade,created_at")
      .eq("teacher_id", teacher.id)
      .eq("paper_id", paper.id)
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) throw error;
    return NextResponse.json({
      submissions: (data || []).map((row) => ({
        id: row.id,
        studentName: row.student_name,
        source: row.source,
        grade: row.grade,
        createdAt: row.created_at,
      })),
    });
  } catch {
    return NextResponse.json({ error: "Could not load paper submissions." }, { status: 502 });
  }
}
