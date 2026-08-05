import { NextResponse } from "next/server";
import { getTeacherProfile } from "@/app/teachers/actions";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { buildTeacherDashboard } from "@/lib/teacher-dashboard";

const classroomColumns = "id,subject_slug,subject_name,name,join_code,created_at,term_key,meeting_schedule,notice";

export async function GET() {
  try {
    const teacher = await getTeacherProfile();
    if (!teacher) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const admin = createSupabaseAdminClient();
    const linksResult = await admin.from("teacher_classroom_teachers").select("classroom_id").eq("teacher_id", teacher.id);
    if (linksResult.error) throw linksResult.error;
    const linkedIds = (linksResult.data || []).map((item) => item.classroom_id);
    const [ownResult, linkedResult, papersResult] = await Promise.all([
      admin.from("teacher_classrooms").select(classroomColumns).eq("teacher_id", teacher.id).is("archived_at", null).order("created_at", { ascending: false }),
      linkedIds.length ? admin.from("teacher_classrooms").select(classroomColumns).in("id", linkedIds).is("archived_at", null) : Promise.resolve({ data: [], error: null }),
      admin.from("teacher_exam_papers").select("id", { count: "exact", head: true }).eq("teacher_id", teacher.id).is("archived_at", null),
    ]);
    if (ownResult.error) throw ownResult.error;
    if (linkedResult.error) throw linkedResult.error;
    if (papersResult.error) throw papersResult.error;
    const classrooms = Array.from(new Map([...(ownResult.data || []), ...(linkedResult.data || [])].map((item) => [item.id, item])).values());
    const classroomIds = classrooms.map((classroom) => classroom.id);
    const [membersResult, assignmentsResult] = await Promise.all([
      classroomIds.length ? admin.from("teacher_classroom_members").select("classroom_id,student_id").in("classroom_id", classroomIds) : Promise.resolve({ data: [], error: null }),
      classroomIds.length ? admin.from("teacher_exam_assignments").select("id,classroom_id").in("classroom_id", classroomIds) : Promise.resolve({ data: [], error: null }),
    ]);
    if (membersResult.error) throw membersResult.error;
    if (assignmentsResult.error) throw assignmentsResult.error;
    const assignments = assignmentsResult.data || [];
    const assignmentIds = assignments.map((assignment) => assignment.id);
    const submissionsResult = assignmentIds.length
      ? await admin.from("teacher_exam_submissions").select("id,assignment_id,student_id,student_name,grade,created_at").in("assignment_id", assignmentIds).order("created_at", { ascending: false }).limit(500)
      : { data: [], error: null };
    if (submissionsResult.error) throw submissionsResult.error;
    const studentIds = Array.from(new Set((membersResult.data || []).map((member) => member.student_id)));
    const profilesResult = studentIds.length ? await admin.from("student_profiles").select("user_id,full_name").in("user_id", studentIds) : { data: [], error: null };
    if (profilesResult.error) throw profilesResult.error;
    return NextResponse.json(buildTeacherDashboard({
      classrooms,
      members: membersResult.data || [],
      assignments,
      submissions: submissionsResult.data || [],
      profiles: profilesResult.data || [],
      paperCount: papersResult.count || 0,
    }));
  } catch {
    return NextResponse.json({ error: "Could not load the teacher dashboard." }, { status: 502 });
  }
}
