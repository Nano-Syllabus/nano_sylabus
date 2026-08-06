import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { recordTeacherClassroomActivity } from "@/lib/teacher-classroom-activity";

const schema = z.object({ code: z.string().trim().min(4).max(20) });

/**
 * Looks a code up without acting on it, so a student can see whose classroom
 * and which subject they are about to join before confirming.
 */
export async function GET(request: Request) {
  try {
    const supabase = await createSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const parsed = schema.safeParse({ code: new URL(request.url).searchParams.get("code") ?? "" });
    if (!parsed.success) return NextResponse.json({ error: "Enter a valid classroom code." }, { status: 400 });

    const admin = createSupabaseAdminClient();
    const { data: classroom, error } = await admin
      .from("teacher_classrooms")
      .select("id,name,subject_name,teacher_id")
      .eq("join_code", parsed.data.code.toUpperCase())
      .is("archived_at", null)
      .maybeSingle();
    if (error) throw error;
    if (!classroom) return NextResponse.json({ error: "Classroom code not found." }, { status: 404 });

    const [{ count: memberCount }, { data: teacher }, { data: membership }] = await Promise.all([
      admin
        .from("teacher_classroom_members")
        .select("student_id", { count: "exact", head: true })
        .eq("classroom_id", classroom.id),
      admin.from("teachers").select("handle").eq("id", classroom.teacher_id).maybeSingle(),
      admin
        .from("teacher_classroom_members")
        .select("student_id")
        .eq("classroom_id", classroom.id)
        .eq("student_id", user.id)
        .maybeSingle(),
    ]);

    return NextResponse.json({
      classroom: {
        name: classroom.name,
        subjectName: classroom.subject_name,
        teacherHandle: teacher?.handle ?? "",
        memberCount: memberCount ?? 0,
        alreadyJoined: Boolean(membership),
      },
    });
  } catch {
    return NextResponse.json({ error: "Could not look up that code." }, { status: 502 });
  }
}

export async function POST(request: Request) {
  try {
    const supabase = await createSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const parsed = schema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: "Enter a valid classroom code." }, { status: 400 });
    const admin = createSupabaseAdminClient();
    const { data: classroom, error } = await admin
      .from("teacher_classrooms")
      .select("id,name,subject_name")
      .eq("join_code", parsed.data.code.toUpperCase())
      .is("archived_at", null)
      .maybeSingle();
    if (error) throw error;
    if (!classroom) return NextResponse.json({ error: "Classroom code not found." }, { status: 404 });
    const { error: joinError } = await admin.from("teacher_classroom_members").upsert(
      { classroom_id: classroom.id, student_id: user.id },
      { onConflict: "classroom_id,student_id" },
    );
    if (joinError) throw joinError;
    await recordTeacherClassroomActivity(admin, { classroomId: classroom.id, actorId: user.id, actorKind: "student", eventType: "student.joined", summary: "A student joined the classroom" });
    return NextResponse.json({ classroom: { id: classroom.id, name: classroom.name, subjectName: classroom.subject_name } });
  } catch {
    return NextResponse.json({ error: "Could not join the classroom." }, { status: 502 });
  }
}
