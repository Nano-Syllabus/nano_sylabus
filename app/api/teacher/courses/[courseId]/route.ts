import { NextResponse } from "next/server";
import { getTeacherProfile } from "@/app/teachers/actions";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createCourseInviteCode } from "@/lib/course-invites";
import { clearStudentStudyTrails, clearTeacherCourseTrails } from "@/lib/data/study-trail-cleanup";
import { teacherCourseInputSchema, teacherCourseRow } from "@/lib/teacher-courses";
import {
  courseStorageError,
  findAssignedCourseSubjects,
  isCourseSubjectOwnershipConflict,
  listTeacherCourses,
} from "@/lib/teacher-course-store";

type RouteContext = { params: Promise<{ courseId: string }> };

async function resolveSubjects(
  admin: ReturnType<typeof createSupabaseAdminClient>,
  teacherId: string,
  requestedSlugs: string[],
) {
  if (!requestedSlugs.length) return [];
  const result = await admin
    .from("teacher_subject_profiles")
    .select("subject_slug,subject_name,folder_path")
    .eq("teacher_id", teacherId)
    .in("subject_slug", requestedSlugs);
  if (result.error) throw result.error;
  const bySlug = new Map(
    (result.data || []).map((subject) => [String(subject.subject_slug || ""), subject]),
  );
  return requestedSlugs.map((slug, position) => {
    const subject = bySlug.get(slug);
    if (!subject) {
      throw new Error(`Subject is not in your teacher workspace: ${slug}`);
    }
    return {
      subject_slug: slug,
      subject_name: String(subject.subject_name || slug),
      folder_path: String(subject.folder_path || ""),
      position,
    };
  });
}

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const teacher = await getTeacherProfile();
    if (!teacher) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { courseId } = await context.params;
    const parsed = teacherCourseInputSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message || "Invalid course." },
        { status: 400 },
      );
    }

    const admin = createSupabaseAdminClient();
    const ownerResult = await admin
      .from("teacher_courses")
      .select("id,status,visibility,published_at,invite_code,invite_created_at")
      .eq("id", courseId)
      .eq("teacher_id", teacher.id)
      .is("archived_at", null)
      .maybeSingle();
    if (ownerResult.error) throw ownerResult.error;
    if (!ownerResult.data)
      return NextResponse.json({ error: "Course not found." }, { status: 404 });

    let subjects;
    try {
      subjects = await resolveSubjects(admin, teacher.id, parsed.data.subjectSlugs);
    } catch (error) {
      return NextResponse.json(
        { error: error instanceof Error ? error.message : "Subject not found." },
        { status: 400 },
      );
    }

    const assignedSubjects = await findAssignedCourseSubjects(
      admin,
      teacher.id,
      parsed.data.subjectSlugs,
      courseId,
    );
    if (assignedSubjects.length) {
      const names = subjects
        .filter((subject) =>
          assignedSubjects.some((assigned) => assigned.subject_slug === subject.subject_slug),
        )
        .map((subject) => subject.subject_name);
      return NextResponse.json(
        { error: `${names.join(", ")} already belongs to another course.` },
        { status: 409 },
      );
    }

    const row: Record<string, unknown> = teacherCourseRow(parsed.data);
    if (parsed.data.status === "draft") {
      row.published_at = null;
    } else if (ownerResult.data.status === "published") {
      row.published_at = ownerResult.data.published_at;
    }
    if (parsed.data.status === "published" && parsed.data.visibility === "unlisted") {
      const newlyInviteOnly =
        ownerResult.data.status !== "published" || ownerResult.data.visibility !== "unlisted";
      row.invite_code = newlyInviteOnly ? createCourseInviteCode() : ownerResult.data.invite_code;
      row.invite_created_at = newlyInviteOnly
        ? new Date().toISOString()
        : ownerResult.data.invite_created_at;
    } else {
      row.invite_code = null;
      row.invite_created_at = null;
    }
    const updateResult = await admin
      .from("teacher_courses")
      .update(row)
      .eq("id", courseId)
      .eq("teacher_id", teacher.id);
    if (updateResult.error) throw updateResult.error;

    const oldSubjectsResult = await admin
      .from("teacher_course_subjects")
      .select("subject_slug,subject_name,folder_path,position")
      .eq("course_id", courseId);
    if (oldSubjectsResult.error) throw oldSubjectsResult.error;
    const insertResult = subjects.length
      ? await admin.from("teacher_course_subjects").upsert(
          subjects.map((subject) => ({
            course_id: courseId,
            teacher_id: teacher.id,
            ...subject,
          })),
          { onConflict: "course_id,subject_slug" },
        )
      : { error: null };
    if (insertResult.error) {
      if (isCourseSubjectOwnershipConflict(insertResult.error)) {
        return NextResponse.json(
          { error: "A selected subject was just assigned to another course." },
          { status: 409 },
        );
      }
      throw insertResult.error;
    }

    const nextSlugs = new Set(subjects.map((subject) => subject.subject_slug));
    const removedSubjects = (oldSubjectsResult.data || [])
      .filter((subject) => !nextSlugs.has(String(subject.subject_slug || "")))
      .map((subject) => ({
        subjectSlug: String(subject.subject_slug || ""),
        subjectName: String(subject.subject_name || ""),
        courseId,
      }));
    if (removedSubjects.length) {
      const enrollmentsResult = await admin
        .from("teacher_course_enrollments")
        .select("student_id")
        .eq("course_id", courseId)
        .in("status", ["active", "completed"]);
      if (enrollmentsResult.error) throw enrollmentsResult.error;
      const studentIds = (enrollmentsResult.data || [])
        .map((row) => String(row.student_id || ""))
        .filter(Boolean);
      await clearStudentStudyTrails(admin, studentIds, removedSubjects, [courseId], teacher.id);

      const removedSlugs = removedSubjects.map((subject) => subject.subjectSlug);
      const deleteResult = await admin
        .from("teacher_course_subjects")
        .delete()
        .eq("course_id", courseId)
        .in("subject_slug", removedSlugs);
      if (deleteResult.error) throw deleteResult.error;
    }

    const courses = await listTeacherCourses(admin, teacher.id);
    return NextResponse.json({ course: courses.find((course) => course.id === courseId) });
  } catch (error) {
    return NextResponse.json({ error: courseStorageError(error) }, { status: 502 });
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  try {
    const teacher = await getTeacherProfile();
    if (!teacher) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { courseId } = await context.params;
    const admin = createSupabaseAdminClient();
    // Read all descendants before deleting the parent. Course deletion
    // cascades the enrollment/link rows, but chat, practice and exam trails
    // live in separate tables and would otherwise remain orphaned.
    const ownerResult = await admin
      .from("teacher_courses")
      .select("id")
      .eq("id", courseId)
      .eq("teacher_id", teacher.id)
      .is("archived_at", null)
      .maybeSingle();
    if (ownerResult.error) throw ownerResult.error;
    if (!ownerResult.data)
      return NextResponse.json({ error: "Course not found." }, { status: 404 });

    const [subjectsResult, enrollmentsResult] = await Promise.all([
      admin
        .from("teacher_course_subjects")
        .select("course_id,subject_slug,subject_name")
        .eq("course_id", courseId)
        .eq("teacher_id", teacher.id),
      admin.from("teacher_course_enrollments").select("student_id").eq("course_id", courseId),
    ]);
    if (subjectsResult.error) throw subjectsResult.error;
    if (enrollmentsResult.error) throw enrollmentsResult.error;

    const subjects = (subjectsResult.data || []).map((subject) => ({
      subjectSlug: String(subject.subject_slug || ""),
      subjectName: String(subject.subject_name || ""),
      courseId,
    }));
    const studentIds = (enrollmentsResult.data || [])
      .map((row) => String(row.student_id || ""))
      .filter(Boolean);
    await clearTeacherCourseTrails(
      admin,
      teacher.id,
      courseId,
      subjects,
      studentIds,
      teacher.user_id,
    );

    const result = await admin
      .from("teacher_courses")
      .delete()
      .eq("id", courseId)
      .eq("teacher_id", teacher.id)
      .is("archived_at", null)
      .select("id")
      .maybeSingle();
    if (result.error) throw result.error;
    if (!result.data) return NextResponse.json({ error: "Course not found." }, { status: 404 });
    return NextResponse.json({ deleted: true });
  } catch (error) {
    return NextResponse.json(
      { error: courseStorageError(error, "Could not delete the course.") },
      { status: 502 },
    );
  }
}
