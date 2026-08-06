import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/** The classrooms this student has joined, with how much is waiting in each. */
export async function GET() {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const admin = createSupabaseAdminClient();
    const { data: memberships, error: memberError } = await admin
      .from("teacher_classroom_members")
      .select("classroom_id")
      .eq("student_id", user.id);
    if (memberError) throw memberError;

    const classroomIds = (memberships ?? [])
      .map((row) => row.classroom_id)
      .filter((id): id is string => typeof id === "string" && id.length > 0);
    if (!classroomIds.length) return NextResponse.json({ classrooms: [] });

    const [{ data: classrooms, error }, { data: assignments }, { data: members }] = await Promise.all([
      admin
        .from("teacher_classrooms")
        .select("id,name,subject_name,join_code,created_at,archived_at")
        .in("id", classroomIds)
        .order("created_at", { ascending: false }),
      admin.from("teacher_exam_assignments").select("id,classroom_id").in("classroom_id", classroomIds),
      admin.from("teacher_classroom_members").select("classroom_id").in("classroom_id", classroomIds),
    ]);
    if (error) throw error;

    const examCounts = new Map<string, number>();
    for (const row of assignments ?? []) {
      examCounts.set(row.classroom_id, (examCounts.get(row.classroom_id) ?? 0) + 1);
    }

    const memberCounts = new Map<string, number>();
    for (const row of members ?? []) {
      memberCounts.set(row.classroom_id, (memberCounts.get(row.classroom_id) ?? 0) + 1);
    }

    return NextResponse.json({
      classrooms: (classrooms ?? []).map((row) => ({
        id: row.id,
        name: row.name,
        subjectName: row.subject_name,
        joinCode: row.join_code,
        examCount: examCounts.get(row.id) ?? 0,
        memberCount: memberCounts.get(row.id) ?? 0,
        // Archived classrooms stay visible as "earlier", the way the term
        // switch worked, rather than vanishing from a student's history.
        archived: Boolean(row.archived_at),
        joinedAt: row.created_at,
      })),
    });
  } catch {
    return NextResponse.json({ error: "Could not load your classrooms." }, { status: 502 });
  }
}
