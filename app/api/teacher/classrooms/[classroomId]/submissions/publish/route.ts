import { NextResponse } from "next/server";
import { getTeacherProfile } from "@/app/teachers/actions";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { recordTeacherClassroomActivity } from "@/lib/teacher-classroom-activity";
import { applySubmissionReview, submissionReviewStatus } from "@/lib/teacher-submission-review";

type Context = { params: Promise<{ classroomId: string }> };

export async function POST(_request: Request, { params }: Context) {
  try {
    const teacher = await getTeacherProfile();
    if (!teacher) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { classroomId } = await params;
    const admin = createSupabaseAdminClient();
    const { data: classroom, error: classroomError } = await admin
      .from("teacher_classrooms")
      .select("id,teacher_id")
      .eq("id", classroomId)
      .is("archived_at", null)
      .maybeSingle();
    if (classroomError) throw classroomError;
    if (!classroom) {
      return NextResponse.json({ error: "Classroom not found." }, { status: 404 });
    }

    let canManage = classroom.teacher_id === teacher.id;
    if (!canManage) {
      const { data: link, error: linkError } = await admin
        .from("teacher_classroom_teachers")
        .select("role")
        .eq("classroom_id", classroomId)
        .eq("teacher_id", teacher.id)
        .maybeSingle();
      if (linkError) throw linkError;
      canManage = link?.role === "lead";
    }
    if (!canManage) {
      return NextResponse.json(
        { error: "Only a lead teacher can publish classroom results." },
        { status: 403 },
      );
    }

    const { data: assignments, error: assignmentError } = await admin
      .from("teacher_exam_assignments")
      .select("id")
      .eq("classroom_id", classroomId);
    if (assignmentError) throw assignmentError;
    const assignmentIds = (assignments || []).map((assignment) => assignment.id);
    if (!assignmentIds.length) return NextResponse.json({ published: 0 });

    const { data: submissions, error: submissionError } = await admin
      .from("teacher_exam_submissions")
      .select("id,grade")
      .eq("teacher_id", classroom.teacher_id)
      .in("assignment_id", assignmentIds);
    if (submissionError) throw submissionError;
    const waiting = (submissions || []).filter(
      (submission) => submissionReviewStatus(submission.grade) !== "published",
    );

    await Promise.all(
      waiting.map(async (submission) => {
        const grade = applySubmissionReview(submission.grade, { status: "published" });
        const { error } = await admin
          .from("teacher_exam_submissions")
          .update({ grade, updated_at: new Date().toISOString() })
          .eq("id", submission.id)
          .eq("teacher_id", classroom.teacher_id);
        if (error) throw error;
      }),
    );

    if (waiting.length) {
      await recordTeacherClassroomActivity(admin, {
        classroomId,
        actorId: teacher.id,
        eventType: "results.published",
        summary: `${waiting.length} classroom results published`,
        metadata: { count: waiting.length },
      });
    }
    return NextResponse.json({ published: waiting.length });
  } catch {
    return NextResponse.json(
      { error: "Could not publish the waiting classroom results." },
      { status: 502 },
    );
  }
}
