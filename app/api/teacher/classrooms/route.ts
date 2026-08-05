import { NextResponse } from "next/server";
import { z } from "zod";
import { getTeacherProfile } from "@/app/teachers/actions";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getTeacherSubjects } from "@/lib/teacher-app/client";
import { createTeacherClassroomJoinCode } from "@/lib/teacher-classroom-code";
import { recordTeacherClassroomActivity } from "@/lib/teacher-classroom-activity";

const schema = z.object({
  subjectSlug: z.string().trim().min(1).max(200),
  name: z.string().trim().min(1).max(120),
  termKey: z.string().trim().min(1).max(40).default(String(new Date().getFullYear())),
  meetingSchedule: z.string().trim().max(240).default(""),
});

export async function GET() {
  try {
    const teacher = await getTeacherProfile();
    if (!teacher) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const admin = createSupabaseAdminClient();
    const linksResult = await admin.from("teacher_classroom_teachers").select("classroom_id").eq("teacher_id", teacher.id);
    if (linksResult.error) throw linksResult.error;
    const helperIds = (linksResult.data || []).map((item) => item.classroom_id);
    const ownResult = await admin
      .from("teacher_classrooms")
      .select("id,subject_slug,subject_name,name,join_code,created_at,term_key,meeting_schedule,notice")
      .eq("teacher_id", teacher.id)
      .is("archived_at", null)
      .order("created_at", { ascending: false });
    if (ownResult.error) throw ownResult.error;
    const helperResult = helperIds.length
      ? await admin.from("teacher_classrooms").select("id,subject_slug,subject_name,name,join_code,created_at,term_key,meeting_schedule,notice").in("id", helperIds).is("archived_at", null)
      : { data: [], error: null };
    if (helperResult.error) throw helperResult.error;
    const byId = new Map([...(ownResult.data || []), ...(helperResult.data || [])].map((row) => [row.id, row]));
    const data = Array.from(byId.values()).sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
    const ids = data.map((row) => row.id);
    const { data: members } = ids.length
      ? await admin.from("teacher_classroom_members").select("classroom_id").in("classroom_id", ids)
      : { data: [] };
    const counts = new Map<string, number>();
    (members || []).forEach((row) => counts.set(row.classroom_id, (counts.get(row.classroom_id) || 0) + 1));
    return NextResponse.json({
      classrooms: (data || []).map((row) => ({
        id: row.id,
        subjectSlug: row.subject_slug,
        subjectName: row.subject_name,
        name: row.name,
        joinCode: row.join_code,
        memberCount: counts.get(row.id) || 0,
        createdAt: row.created_at,
        termKey: row.term_key,
        meetingSchedule: row.meeting_schedule,
        notice: row.notice,
      })),
    });
  } catch {
    return NextResponse.json({ error: "Could not load classrooms." }, { status: 502 });
  }
}

export async function POST(request: Request) {
  try {
    const teacher = await getTeacherProfile();
    if (!teacher) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const parsed = schema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message || "Invalid classroom." },
        { status: 400 },
      );
    }
    const subjects = await getTeacherSubjects(teacher.collection_sk);
    const subject = subjects.subjects.find((item) => item.slug === parsed.data.subjectSlug);
    if (!subject || typeof subject.name !== "string") {
      return NextResponse.json({ error: "Subject not found." }, { status: 404 });
    }
    const admin = createSupabaseAdminClient();
    let created = null;
    for (let attempt = 0; attempt < 3 && !created; attempt += 1) {
      const { data, error } = await admin
        .from("teacher_classrooms")
        .insert({
          teacher_id: teacher.id,
          subject_slug: parsed.data.subjectSlug,
          subject_name: subject.name,
          name: parsed.data.name,
          join_code: createTeacherClassroomJoinCode(),
          term_key: parsed.data.termKey,
          meeting_schedule: parsed.data.meetingSchedule,
        })
        .select("id,subject_slug,subject_name,name,join_code,created_at,term_key,meeting_schedule,notice")
        .single();
      if (!error) created = data;
      else if (error.code !== "23505") throw error;
    }
    if (!created) throw new Error("Could not allocate a classroom code.");
    const { error: leadError } = await admin.from("teacher_classroom_teachers").upsert({ classroom_id: created.id, teacher_id: teacher.id, role: "lead" }, { onConflict: "classroom_id,teacher_id" });
    if (leadError) throw leadError;
    await recordTeacherClassroomActivity(admin, { classroomId: created.id, actorId: teacher.id, eventType: "classroom.created", summary: "Classroom created" });
    return NextResponse.json({
      classroom: {
        id: created.id,
        subjectSlug: created.subject_slug,
        subjectName: created.subject_name,
        name: created.name,
        joinCode: created.join_code,
        memberCount: 0,
        createdAt: created.created_at,
        termKey: created.term_key,
        meetingSchedule: created.meeting_schedule,
        notice: created.notice,
      },
    }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Could not create the classroom." }, { status: 502 });
  }
}
