import { NextResponse } from "next/server";
import { z } from "zod";
import { getTeacherProfile } from "@/app/teachers/actions";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { recordTeacherClassroomActivity } from "@/lib/teacher-classroom-activity";

type Context = { params: Promise<{ classroomId: string }> };
const addSchema = z.object({ handle: z.string().trim().min(1).max(120) });

async function leadClassroom(classroomId: string, teacherId: string) {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.from("teacher_classrooms").select("id,teacher_id").eq("id", classroomId).is("archived_at", null).maybeSingle();
  if (error || !data) return { admin, classroom: null, error };
  if (data.teacher_id === teacherId) return { admin, classroom: data, error: null };
  const link = await admin.from("teacher_classroom_teachers").select("role").eq("classroom_id", classroomId).eq("teacher_id", teacherId).maybeSingle();
  return { admin, classroom: link.data?.role === "lead" ? data : null, error: link.error };
}

export async function POST(request: Request, { params }: Context) {
  try {
    const teacher = await getTeacherProfile();
    if (!teacher) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const parsed = addSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: "Enter the teacher's exact handle." }, { status: 400 });
    const { classroomId } = await params;
    const { admin, classroom, error } = await leadClassroom(classroomId, teacher.id);
    if (error) throw error;
    if (!classroom) return NextResponse.json({ error: "Only a lead teacher can add co-teachers." }, { status: 403 });
    const { data: helper, error: helperError } = await admin.from("teachers").select("id,handle").ilike("handle", parsed.data.handle).maybeSingle();
    if (helperError) throw helperError;
    if (!helper) return NextResponse.json({ error: "No teacher with that handle was found." }, { status: 404 });
    if (helper.id === classroom.teacher_id) return NextResponse.json({ error: "That teacher is already the lead teacher." }, { status: 409 });
    const { error: insertError } = await admin.from("teacher_classroom_teachers").upsert({ classroom_id: classroomId, teacher_id: helper.id, role: "helper" }, { onConflict: "classroom_id,teacher_id" });
    if (insertError) throw insertError;
    await recordTeacherClassroomActivity(admin, { classroomId, actorId: teacher.id, eventType: "teacher.added", summary: `${helper.handle} added as helper teacher`, metadata: { teacherId: helper.id } });
    return NextResponse.json({ teacher: { teacherId: helper.id, handle: helper.handle, role: "helper" } }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Could not add the co-teacher." }, { status: 502 });
  }
}

export async function DELETE(request: Request, { params }: Context) {
  try {
    const teacher = await getTeacherProfile();
    if (!teacher) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { classroomId } = await params;
    const teacherId = new URL(request.url).searchParams.get("teacherId") || "";
    if (!teacherId) return NextResponse.json({ error: "Choose a co-teacher to remove." }, { status: 400 });
    const { admin, classroom, error } = await leadClassroom(classroomId, teacher.id);
    if (error) throw error;
    if (!classroom) return NextResponse.json({ error: "Only a lead teacher can remove co-teachers." }, { status: 403 });
    if (teacherId === classroom.teacher_id) return NextResponse.json({ error: "The lead teacher cannot be removed." }, { status: 409 });
    const helperResult = await admin.from("teachers").select("handle").eq("id", teacherId).maybeSingle();
    const { error: deleteError } = await admin.from("teacher_classroom_teachers").delete().eq("classroom_id", classroomId).eq("teacher_id", teacherId).eq("role", "helper");
    if (deleteError) throw deleteError;
    await recordTeacherClassroomActivity(admin, { classroomId, actorId: teacher.id, eventType: "teacher.removed", summary: `${helperResult.data?.handle || "Helper teacher"} removed`, metadata: { teacherId } });
    return NextResponse.json({ removed: true });
  } catch {
    return NextResponse.json({ error: "Could not remove the co-teacher." }, { status: 502 });
  }
}
