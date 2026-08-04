import { NextResponse } from "next/server";
import { getTeacherProfile } from "@/app/teachers/actions";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export async function GET() {
  try {
    const teacher = await getTeacherProfile();
    if (!teacher) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const admin = createSupabaseAdminClient();
    const { data, error } = await admin
      .from("teacher_exam_papers")
      .select("paper,created_at")
      .eq("teacher_id", teacher.id)
      .order("created_at", { ascending: false })
      .limit(100);

    if (error) throw new Error(error.message);
    const papers = (data || []).flatMap((row) => {
      if (!row.paper || typeof row.paper !== "object") return [];
      return [{ ...row.paper, createdAt: row.created_at }];
    });
    return NextResponse.json({ papers });
  } catch {
    return NextResponse.json(
      { error: "Could not load generated papers. Apply the latest Supabase migration." },
      { status: 502 },
    );
  }
}
