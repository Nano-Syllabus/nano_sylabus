import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { studentVisibleGrade, submissionReviewStatus } from "@/lib/teacher-submission-review";

type SubmittedAttempt = { id: string; assignment_id: string; attempt_no: number; grade: unknown; created_at: string };

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
      .select("id,opens_at,closes_at,created_at,max_attempts,teacher_exam_papers!inner(external_paper_id,paper),teacher_classrooms!inner(name,subject_name)")
      .in("classroom_id", classroomIds)
      .order("created_at", { ascending: false });
    if (error) throw error;
    const assignmentIds = (data || []).map((row) => row.id);
    const { data: submittedRows } = assignmentIds.length
      ? await admin.from("teacher_exam_submissions").select("id,assignment_id,attempt_no,grade,created_at").eq("student_id", user.id).in("assignment_id", assignmentIds).order("attempt_no", { ascending: false })
      : { data: [] };
    const attemptsByAssignment = new Map<string, SubmittedAttempt[]>();
    for (const row of submittedRows || []) {
      const attempts = attemptsByAssignment.get(row.assignment_id) || [];
      attempts.push({ id: row.id, assignment_id: row.assignment_id, attempt_no: row.attempt_no, grade: row.grade, created_at: row.created_at });
      attemptsByAssignment.set(row.assignment_id, attempts);
    }
    return NextResponse.json({
      assignments: (data || []).flatMap((row) => {
        const paperRow = Array.isArray(row.teacher_exam_papers) ? row.teacher_exam_papers[0] : row.teacher_exam_papers;
        const classroom = Array.isArray(row.teacher_classrooms) ? row.teacher_classrooms[0] : row.teacher_classrooms;
        const paper = studentPaper(paperRow?.paper);
        if (!paper) return [];
        const attempts = attemptsByAssignment.get(row.id) || [];
        const latest = attempts[0];
        const latestPublished = attempts.find((attempt) => studentVisibleGrade(attempt.grade));
        const maxAttempts = Math.max(1, Number(row.max_attempts) || 1);
        return [{
          id: row.id,
          externalPaperId: paperRow.external_paper_id,
          paper,
          classroomName: classroom?.name || "Classroom",
          subjectName: classroom?.subject_name || "Subject",
          opensAt: row.opens_at,
          closesAt: row.closes_at,
          createdAt: row.created_at,
          submitted: attempts.length > 0,
          canAttempt: attempts.length < maxAttempts,
          attemptCount: attempts.length,
          maxAttempts,
          attempts: attempts.map((attempt) => ({ id: attempt.id, attemptNo: attempt.attempt_no, reviewStatus: submissionReviewStatus(attempt.grade), grade: studentVisibleGrade(attempt.grade), createdAt: attempt.created_at })),
          reviewStatus: latest ? submissionReviewStatus(latest.grade) : null,
          grade: latestPublished ? studentVisibleGrade(latestPublished.grade) : null,
        }];
      }),
    });
  } catch {
    return NextResponse.json({ error: "Could not load teacher exams." }, { status: 502 });
  }
}
