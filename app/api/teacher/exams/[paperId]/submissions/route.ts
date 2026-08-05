import { NextResponse } from "next/server";
import { getTeacherProfile } from "@/app/teachers/actions";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { submissionReviewStatus } from "@/lib/teacher-submission-review";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ paperId: string }> },
) {
  try {
    const teacher = await getTeacherProfile();
    if (!teacher) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { paperId } = await params;
    const admin = createSupabaseAdminClient();
    const { data: paper, error: paperError } = await admin
      .from("teacher_exam_papers")
      .select("id")
      .eq("teacher_id", teacher.id)
      .eq("external_paper_id", paperId)
      .maybeSingle();
    if (paperError) throw paperError;
    if (!paper) return NextResponse.json({ error: "Paper not found." }, { status: 404 });

    const { data, error } = await admin
      .from("teacher_exam_submissions")
      .select("id,assignment_id,student_id,student_name,source,grade,attempt_no,created_at,updated_at")
      .eq("teacher_id", teacher.id)
      .eq("paper_id", paper.id)
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) throw error;
    const assignmentIds = Array.from(new Set((data || []).flatMap((row) => row.assignment_id ? [row.assignment_id] : [])));
    const assignmentsResult = assignmentIds.length
      ? await admin.from("teacher_exam_assignments").select("id,classroom_id").in("id", assignmentIds)
      : { data: [], error: null };
    if (assignmentsResult.error) throw assignmentsResult.error;
    const classroomIds = Array.from(new Set((assignmentsResult.data || []).map((item) => item.classroom_id)));
    const classroomsResult = classroomIds.length
      ? await admin.from("teacher_classrooms").select("id,name").in("id", classroomIds)
      : { data: [], error: null };
    if (classroomsResult.error) throw classroomsResult.error;
    const classroomNames = new Map((classroomsResult.data || []).map((item) => [item.id, item.name]));
    const assignmentGroups = new Map((assignmentsResult.data || []).map((item) => [item.id, classroomNames.get(item.classroom_id) || "Classroom"]));
    const attemptCounts = new Map<string, number>();
    for (const row of data || []) {
      const key = `${row.assignment_id || "unassigned"}:${row.student_id || row.student_name}`;
      attemptCounts.set(key, (attemptCounts.get(key) || 0) + 1);
    }
    const submissions = await Promise.all((data || []).map(async (row) => {
      const grade = row.grade && typeof row.grade === "object" ? row.grade as Record<string, unknown> : {};
      const answerSheet = grade._answer_sheet && typeof grade._answer_sheet === "object" ? grade._answer_sheet as Record<string, unknown> : {};
      const storagePath = typeof answerSheet.storage_path === "string" ? answerSheet.storage_path : "";
      const signed = storagePath ? await admin.storage.from("teacher-documents").createSignedUrl(storagePath, 60 * 15) : { data: null };
      return {
        id: row.id,
        studentId: row.student_id,
        assignmentId: row.assignment_id,
        groupName: row.assignment_id ? assignmentGroups.get(row.assignment_id) || "Classroom" : "Unassigned grading",
        studentName: row.student_name,
        source: row.source,
        grade: row.grade,
        reviewStatus: submissionReviewStatus(row.grade),
        answerSheetUrl: signed.data?.signedUrl || null,
        answerSheetName: typeof answerSheet.name === "string" ? answerSheet.name : null,
        answerSheetMimeType: typeof answerSheet.mime_type === "string" ? answerSheet.mime_type : null,
        attemptNo: row.attempt_no || 1,
        attemptCount: attemptCounts.get(`${row.assignment_id || "unassigned"}:${row.student_id || row.student_name}`) || 1,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      };
    }));
    return NextResponse.json({ submissions });
  } catch {
    return NextResponse.json({ error: "Could not load paper submissions." }, { status: 502 });
  }
}
