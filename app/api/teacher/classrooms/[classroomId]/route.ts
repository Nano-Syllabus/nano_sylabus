import { NextResponse } from "next/server";
import { z } from "zod";
import { getTeacherProfile } from "@/app/teachers/actions";
import { buildTeacherClassroomDetail } from "@/lib/teacher-classroom-detail";
import { createTeacherClassroomJoinCode } from "@/lib/teacher-classroom-code";
import { recordTeacherClassroomActivity } from "@/lib/teacher-classroom-activity";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

type Context = { params: Promise<{ classroomId: string }> };
const updateSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  termKey: z.string().trim().min(1).max(40).optional(),
  meetingSchedule: z.string().trim().max(240).optional(),
  notice: z.string().trim().max(1000).optional(),
  rotateJoinCode: z.literal(true).optional(),
}).refine((value) => Object.keys(value).length > 0, "Nothing to update.");

async function accessibleClassroom(classroomId: string, teacherId: string) {
  const admin = createSupabaseAdminClient();
  const result = await admin
    .from("teacher_classrooms")
    .select("id,teacher_id,subject_slug,subject_name,name,join_code,created_at,term_key,meeting_schedule,notice,notice_updated_at")
    .eq("id", classroomId)
    .is("archived_at", null)
    .maybeSingle();
  if (result.error || !result.data) return { admin, classroom: null, error: result.error, canManage: false };
  if (result.data.teacher_id === teacherId) return { admin, classroom: result.data, error: null, canManage: true };
  const membership = await admin
    .from("teacher_classroom_teachers")
    .select("role")
    .eq("classroom_id", classroomId)
    .eq("teacher_id", teacherId)
    .maybeSingle();
  return {
    admin,
    classroom: membership.data ? result.data : null,
    error: membership.error,
    canManage: membership.data?.role === "lead",
  };
}

export async function GET(_request: Request, { params }: Context) {
  try {
    const teacher = await getTeacherProfile();
    if (!teacher) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { classroomId } = await params;
    const { admin, classroom, error, canManage } = await accessibleClassroom(classroomId, teacher.id);
    if (error) throw error;
    if (!classroom) return NextResponse.json({ error: "Classroom not found." }, { status: 404 });

    const [membersResult, assignmentsResult, teacherLinksResult, syllabusResult, activityResult] = await Promise.all([
      admin.from("teacher_classroom_members").select("student_id,joined_at").eq("classroom_id", classroom.id).order("joined_at", { ascending: true }),
      admin.from("teacher_exam_assignments").select("id,opens_at,closes_at,max_attempts,created_at,teacher_exam_papers!inner(external_paper_id,paper)").eq("classroom_id", classroom.id).order("created_at", { ascending: false }),
      admin.from("teacher_classroom_teachers").select("teacher_id,role").eq("classroom_id", classroom.id).order("joined_at", { ascending: true }),
      admin.from("teacher_subject_syllabi").select("structure").eq("teacher_id", classroom.teacher_id).eq("subject_slug", classroom.subject_slug).maybeSingle(),
      admin.from("teacher_classroom_activity").select("id,actor_id,actor_kind,event_type,summary,metadata,created_at").eq("classroom_id", classroom.id).order("created_at", { ascending: false }).limit(100),
    ]);
    if (membersResult.error) throw membersResult.error;
    if (assignmentsResult.error) throw assignmentsResult.error;
    if (teacherLinksResult.error) throw teacherLinksResult.error;
    if (syllabusResult.error) throw syllabusResult.error;
    if (activityResult.error) throw activityResult.error;

    const members = membersResult.data || [];
    const assignments = assignmentsResult.data || [];
    const teacherLinks = teacherLinksResult.data || [];
    const studentIds = members.map((member) => member.student_id);
    const assignmentIds = assignments.map((assignment) => assignment.id);
    const teacherIds = teacherLinks.map((item) => item.teacher_id);
    const [profilesResult, submissionsResult, teacherProfilesResult, chatSessionsResult] = await Promise.all([
      studentIds.length ? admin.from("student_profiles").select("user_id,full_name").in("user_id", studentIds) : Promise.resolve({ data: [], error: null }),
      assignmentIds.length ? admin.from("teacher_exam_submissions").select("id,assignment_id,student_id,student_name,source,grade,attempt_no,created_at").in("assignment_id", assignmentIds).order("created_at", { ascending: false }) : Promise.resolve({ data: [], error: null }),
      teacherIds.length ? admin.from("teachers").select("id,handle").in("id", teacherIds) : Promise.resolve({ data: [], error: null }),
      studentIds.length ? admin.from("chat_sessions").select("id,user_id,subject_tags,subject_context").in("user_id", studentIds).limit(1000) : Promise.resolve({ data: [], error: null }),
    ]);
    if (profilesResult.error) throw profilesResult.error;
    if (submissionsResult.error) throw submissionsResult.error;
    if (teacherProfilesResult.error) throw teacherProfilesResult.error;
    if (chatSessionsResult.error) throw chatSessionsResult.error;

    const subjectTerms = [classroom.subject_slug, classroom.subject_name].map((value) => value.toLowerCase());
    const relevantSessions = (chatSessionsResult.data || []).filter((session) => {
      const tags = Array.isArray(session.subject_tags) ? session.subject_tags.map((tag) => String(tag).toLowerCase()) : [];
      const context = String(session.subject_context || "").toLowerCase();
      return subjectTerms.some((term) => tags.some((tag) => tag.includes(term) || term.includes(tag)) || context.includes(term));
    });
    const sessionIds = relevantSessions.map((session) => session.id);
    const messagesResult = sessionIds.length
      ? await admin.from("chat_messages").select("session_id,content").eq("role", "user").in("session_id", sessionIds).limit(3000)
      : { data: [], error: null };
    if (messagesResult.error) throw messagesResult.error;
    const sessionUsers = new Map(relevantSessions.map((session) => [session.id, session.user_id]));
    const handles = new Map((teacherProfilesResult.data || []).map((item) => [item.id, item.handle]));
    const detail = buildTeacherClassroomDetail({
      classroom,
      members,
      profiles: profilesResult.data || [],
      assignments,
      submissions: submissionsResult.data || [],
      classroomTeachers: teacherLinks.map((item) => ({ ...item, teachers: { handle: handles.get(item.teacher_id) || "Teacher" } })),
      syllabus: syllabusResult.data?.structure || [],
      chatEvidence: (messagesResult.data || []).flatMap((message) => {
        const userId = sessionUsers.get(message.session_id);
        return userId ? [{ user_id: userId, content: message.content }] : [];
      }),
    });
    const studentNames = new Map((profilesResult.data || []).map((item) => [item.user_id, item.full_name || "Student"]));
    return NextResponse.json({
      ...detail,
      canManage,
      activity: (activityResult.data || []).map((item) => ({
        id: item.id,
        eventType: item.event_type,
        summary: item.summary,
        actorKind: item.actor_kind,
        actorName: item.actor_kind === "teacher" ? handles.get(item.actor_id) || "Teacher" : item.actor_kind === "student" ? studentNames.get(item.actor_id) || "Student" : "System",
        metadata: item.metadata || {},
        createdAt: item.created_at,
      })),
    });
  } catch {
    return NextResponse.json({ error: "Could not load the classroom." }, { status: 502 });
  }
}

export async function PATCH(request: Request, { params }: Context) {
  try {
    const teacher = await getTeacherProfile();
    if (!teacher) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const parsed = updateSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message || "Check the classroom details." }, { status: 400 });
    const { classroomId } = await params;
    const { admin, classroom, error, canManage } = await accessibleClassroom(classroomId, teacher.id);
    if (error) throw error;
    if (!classroom) return NextResponse.json({ error: "Classroom not found." }, { status: 404 });
    if (!canManage) return NextResponse.json({ error: "Only a lead teacher can change classroom settings." }, { status: 403 });
    const updates: Record<string, string> = {};
    if (parsed.data.name !== undefined) updates.name = parsed.data.name;
    if (parsed.data.termKey !== undefined) updates.term_key = parsed.data.termKey;
    if (parsed.data.meetingSchedule !== undefined) updates.meeting_schedule = parsed.data.meetingSchedule;
    if (parsed.data.notice !== undefined) {
      updates.notice = parsed.data.notice;
      updates.notice_updated_at = new Date().toISOString();
    }
    let data = null;
    let updateError = null;
    for (let attempt = 0; attempt < (parsed.data.rotateJoinCode ? 3 : 1) && !data; attempt += 1) {
      const nextUpdates = parsed.data.rotateJoinCode
        ? { ...updates, join_code: createTeacherClassroomJoinCode() }
        : updates;
      const result = await admin.from("teacher_classrooms").update(nextUpdates).eq("id", classroomId).select("id,name,join_code,term_key,meeting_schedule,notice,notice_updated_at").single();
      data = result.data;
      updateError = result.error;
      if (updateError && updateError.code !== "23505") break;
    }
    if (updateError || !data) throw updateError || new Error("Could not allocate a classroom code.");
    const eventType = parsed.data.rotateJoinCode ? "classroom.join_code_rotated" : parsed.data.notice !== undefined ? "classroom.notice_updated" : parsed.data.name !== undefined ? "classroom.renamed" : "classroom.details_updated";
    const summary = parsed.data.rotateJoinCode ? "Join code changed" : parsed.data.notice !== undefined ? (parsed.data.notice ? "Classroom notice updated" : "Classroom notice removed") : parsed.data.name !== undefined ? `Classroom renamed to ${parsed.data.name}` : "Term or meeting details updated";
    await recordTeacherClassroomActivity(admin, { classroomId, actorId: teacher.id, eventType, summary });
    return NextResponse.json({ classroom: data });
  } catch {
    return NextResponse.json({ error: "Could not update the classroom." }, { status: 502 });
  }
}

export async function DELETE(_request: Request, { params }: Context) {
  try {
    const teacher = await getTeacherProfile();
    if (!teacher) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { classroomId } = await params;
    const { admin, classroom, error, canManage } = await accessibleClassroom(classroomId, teacher.id);
    if (error) throw error;
    if (!classroom) return NextResponse.json({ error: "Classroom not found." }, { status: 404 });
    if (!canManage) return NextResponse.json({ error: "Only a lead teacher can archive this classroom." }, { status: 403 });
    const { error: archiveError } = await admin.from("teacher_classrooms").update({ archived_at: new Date().toISOString() }).eq("id", classroomId);
    if (archiveError) throw archiveError;
    return NextResponse.json({ archived: true });
  } catch {
    return NextResponse.json({ error: "Could not archive the classroom." }, { status: 502 });
  }
}
