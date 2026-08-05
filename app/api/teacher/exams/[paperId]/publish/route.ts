import { NextResponse } from "next/server";
import { z } from "zod";
import { getTeacherProfile } from "@/app/teachers/actions";
import { recordTeacherClassroomActivity } from "@/lib/teacher-classroom-activity";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const schema = z.object({
  classroomId: z.string().uuid(),
  opensAt: z.string().datetime().nullable().optional(),
  closesAt: z.string().datetime().nullable().optional(),
  maxAttempts: z.number().int().min(1).max(10).optional().default(1),
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ paperId: string }> },
) {
  try {
    const teacher = await getTeacherProfile();
    if (!teacher) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { paperId } = await params;
    const parsed = schema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: "Choose a valid classroom and dates." }, { status: 400 });
    if (parsed.data.opensAt && parsed.data.closesAt && parsed.data.closesAt <= parsed.data.opensAt) {
      return NextResponse.json({ error: "Close time must be after open time." }, { status: 400 });
    }
    const admin = createSupabaseAdminClient();
    const [{ data: paper, error: paperError }, { data: classroom, error: classroomError }] = await Promise.all([
      admin.from("teacher_exam_papers").select("id,subject_slug,title").eq("teacher_id", teacher.id).eq("external_paper_id", paperId).is("archived_at", null).maybeSingle(),
      admin.from("teacher_classrooms").select("id,subject_slug,name").eq("teacher_id", teacher.id).eq("id", parsed.data.classroomId).is("archived_at", null).maybeSingle(),
    ]);
    if (paperError || classroomError) throw paperError || classroomError;
    if (!paper || !classroom) return NextResponse.json({ error: "Paper or classroom not found." }, { status: 404 });
    if (paper.subject_slug !== classroom.subject_slug) {
      return NextResponse.json({ error: "Publish this paper to a classroom for the same subject." }, { status: 409 });
    }
    const { data, error } = await admin.from("teacher_exam_assignments").upsert({
      teacher_id: teacher.id,
      paper_id: paper.id,
      classroom_id: classroom.id,
      opens_at: parsed.data.opensAt || null,
      closes_at: parsed.data.closesAt || null,
      max_attempts: parsed.data.maxAttempts,
    }, { onConflict: "paper_id,classroom_id" }).select("id,opens_at,closes_at,created_at").single();
    if (error) throw error;
    await recordTeacherClassroomActivity(admin, {
      classroomId: classroom.id,
      actorId: teacher.id,
      eventType: "exam.assigned",
      summary: `${paper.title || "Exam"} assigned`,
      metadata: { paperId, maxAttempts: parsed.data.maxAttempts },
    });
    return NextResponse.json({ assignment: data });
  } catch {
    return NextResponse.json({ error: "Could not publish this paper." }, { status: 502 });
  }
}
