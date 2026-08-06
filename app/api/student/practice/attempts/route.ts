import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/** Postgres `undefined_table` — the migration has not been applied yet. */
const UNDEFINED_TABLE = "42P01";

/** The student's own graded practice sittings, newest first. */
export async function GET() {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const admin = createSupabaseAdminClient();
    const { data, error } = await admin
      .from("student_practice_attempts")
      .select("id, subject_name, source, total_score, total_marks, evaluation, created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(50);

    if (error?.code === UNDEFINED_TABLE) return NextResponse.json({ attempts: [] });
    if (error) throw error;

    return NextResponse.json({
      attempts: (data ?? []).map((row) => ({
        id: row.id,
        subjectName: row.subject_name,
        source: row.source,
        totalScore: Number(row.total_score ?? 0),
        totalMarks: Number(row.total_marks ?? 0),
        evaluation: row.evaluation,
        createdAt: row.created_at,
      })),
    });
  } catch {
    return NextResponse.json({ error: "Could not load your practice history." }, { status: 502 });
  }
}
