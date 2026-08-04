import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

function studentPaper(value: unknown) {
  if (!value || typeof value !== "object") return null;
  const paper = value as Record<string, unknown>;
  const questions = Array.isArray(paper.questions) ? paper.questions.map((item) => {
    const question = item && typeof item === "object" ? item as Record<string, unknown> : {};
    const { referenceAnswer: _referenceAnswer, ...safe } = question;
    return safe;
  }) : [];
  const { warning: _warning, ...safePaper } = paper;
  return { ...safePaper, questions };
}

export async function GET() {
  try {
    const supabase = await createSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const admin = createSupabaseAdminClient();
    const { data: memberships, error: memberError } = await admin
      .from("teacher_classroom_members")
      .select("classroom_id")
      .eq("student_id", user.id);
    if (memberError) throw memberError;
    const classroomIds = (memberships || []).map((item) => item.classroom_id);
    if (!classroomIds.length) return NextResponse.json({ assignments: [] });
    const { data, error } = await admin
      .from("teacher_exam_assignments")
      .select("id,opens_at,closes_at,created_at,teacher_exam_papers!inner(external_paper_id,paper),teacher_classrooms!inner(name,subject_name)")
      .in("classroom_id", classroomIds)
      .order("created_at", { ascending: false });
    if (error) throw error;
    const assignmentIds = (data || []).map((row) => row.id);
    const { data: submittedRows } = assignmentIds.length
      ? await admin.from("teacher_exam_submissions").select("assignment_id,grade").eq("student_id", user.id).in("assignment_id", assignmentIds)
      : { data: [] };
    const submitted = new Map((submittedRows || []).map((row) => [row.assignment_id, row.grade]));
    return NextResponse.json({
      assignments: (data || []).flatMap((row) => {
        const paperRow = Array.isArray(row.teacher_exam_papers) ? row.teacher_exam_papers[0] : row.teacher_exam_papers;
        const classroom = Array.isArray(row.teacher_classrooms) ? row.teacher_classrooms[0] : row.teacher_classrooms;
        const paper = studentPaper(paperRow?.paper);
        if (!paper) return [];
        return [{
          id: row.id,
          externalPaperId: paperRow.external_paper_id,
          paper,
          classroomName: classroom?.name || "Classroom",
          subjectName: classroom?.subject_name || "Subject",
          opensAt: row.opens_at,
          closesAt: row.closes_at,
          createdAt: row.created_at,
          submitted: submitted.has(row.id),
          grade: submitted.get(row.id) || null,
        }];
      }),
    });
  } catch {
    return NextResponse.json({ error: "Could not load teacher exams." }, { status: 502 });
  }
}
