import { NextResponse } from "next/server";
import { z } from "zod";
import { getTeacherProfile } from "@/app/teachers/actions";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { recordTeacherClassroomActivity } from "@/lib/teacher-classroom-activity";

type Context = { params: Promise<{ classroomId: string; assignmentId: string }> };
const schema = z.object({
  opensAt: z.string().datetime().nullable(),
  closesAt: z.string().datetime().nullable(),
  maxAttempts: z.number().int().min(1).max(10),
});

async function ownedAssignment(classroomId: string, assignmentId: string, teacherId: string) {
  const admin = createSupabaseAdminClient();
  const result = await admin
    .from("teacher_exam_assignments")
    .select("id")
    .eq("id", assignmentId)
    .eq("classroom_id", classroomId)
    .eq("teacher_id", teacherId)
    .maybeSingle();
  return { admin, ...result };
}

export async function PATCH(request: Request, { params }: Context) {
  try {
    const teacher = await getTeacherProfile();
    if (!teacher) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const parsed = schema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: "Choose valid opening and closing times." }, { status: 400 });
    if (parsed.data.opensAt && parsed.data.closesAt && parsed.data.closesAt <= parsed.data.opensAt) {
      return NextResponse.json({ error: "Close time must be after open time." }, { status: 400 });
    }
    const { classroomId, assignmentId } = await params;
    const { admin, data, error } = await ownedAssignment(classroomId, assignmentId, teacher.id);
    if (error) throw error;
    if (!data) return NextResponse.json({ error: "Assigned exam not found." }, { status: 404 });
    const { data: assignment, error: updateError } = await admin
      .from("teacher_exam_assignments")
      .update({ opens_at: parsed.data.opensAt, closes_at: parsed.data.closesAt, max_attempts: parsed.data.maxAttempts })
      .eq("id", data.id)
      .select("id,opens_at,closes_at,max_attempts")
      .single();
    if (updateError) throw updateError;
    await recordTeacherClassroomActivity(admin, { classroomId, actorId: teacher.id, eventType: "exam.window_updated", summary: "Exam opening and closing times updated", metadata: { assignmentId } });
    return NextResponse.json({ assignment });
  } catch {
    return NextResponse.json({ error: "Could not update the exam window." }, { status: 502 });
  }
}

export async function DELETE(_request: Request, { params }: Context) {
  try {
    const teacher = await getTeacherProfile();
    if (!teacher) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { classroomId, assignmentId } = await params;
    const { admin, data, error } = await ownedAssignment(classroomId, assignmentId, teacher.id);
    if (error) throw error;
    if (!data) return NextResponse.json({ error: "Assigned exam not found." }, { status: 404 });
    const { error: deleteError } = await admin.from("teacher_exam_assignments").delete().eq("id", data.id);
    if (deleteError) throw deleteError;
    await recordTeacherClassroomActivity(admin, { classroomId, actorId: teacher.id, eventType: "exam.unpublished", summary: "Exam removed from classroom", metadata: { assignmentId } });
    return NextResponse.json({ unpublished: true });
  } catch {
    return NextResponse.json({ error: "Could not remove the exam from this classroom." }, { status: 502 });
  }
}
