import { NextResponse } from "next/server";
import { getTeacherProfile } from "@/app/teachers/actions";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
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
    .select("subject_slug,subject_name,folder_path,visibility")
    .eq("teacher_id", teacherId)
    .in("subject_slug", requestedSlugs);
  if (result.error) throw result.error;
  const bySlug = new Map((result.data || []).map((subject) => [String(subject.subject_slug || ""), subject]));
  return requestedSlugs.map((slug, position) => {
    const subject = bySlug.get(slug);
    if (!subject || subject.visibility !== "public") {
      throw new Error(`Only public created subjects can be added to a course: ${slug}`);
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
      .select("id,status,published_at")
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

    const row = teacherCourseRow(parsed.data);
    if (parsed.data.status === "draft") {
      row.published_at = null;
    } else if (ownerResult.data.status === "published") {
      row.published_at = ownerResult.data.published_at;
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
    const deleteResult = await admin
      .from("teacher_course_subjects")
      .delete()
      .eq("course_id", courseId);
    if (deleteResult.error) throw deleteResult.error;
    const insertResult = subjects.length
      ? await admin
          .from("teacher_course_subjects")
          .insert(
            subjects.map((subject) => ({
              course_id: courseId,
              teacher_id: teacher.id,
              ...subject,
            })),
          )
      : { error: null };
    if (insertResult.error) {
      if (oldSubjectsResult.data?.length) {
        await admin.from("teacher_course_subjects").insert(
          oldSubjectsResult.data.map((subject) => ({
            course_id: courseId,
            teacher_id: teacher.id,
            ...subject,
          })),
        );
      }
      if (isCourseSubjectOwnershipConflict(insertResult.error)) {
        return NextResponse.json(
          { error: "A selected subject was just assigned to another course." },
          { status: 409 },
        );
      }
      throw insertResult.error;
    }

    const oldSlugs = (oldSubjectsResult.data || []).map((subject) => subject.subject_slug);
    const removedSlugs = oldSlugs.filter((slug) => !parsed.data.subjectSlugs.includes(slug));
    if (parsed.data.subjectSlugs.length) {
      const publicResult = await admin
        .from("teacher_subject_profiles")
        .update({ visibility: "public", updated_at: new Date().toISOString() })
        .eq("teacher_id", teacher.id)
        .in("subject_slug", parsed.data.subjectSlugs);
      if (publicResult.error) throw publicResult.error;
    }
    if (removedSlugs.length) {
      const privateResult = await admin
        .from("teacher_subject_profiles")
        .update({ visibility: "private", updated_at: new Date().toISOString() })
        .eq("teacher_id", teacher.id)
        .in("subject_slug", removedSlugs);
      if (privateResult.error) throw privateResult.error;
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
    const subjectsResult = await admin
      .from("teacher_course_subjects")
      .select("subject_slug")
      .eq("course_id", courseId)
      .eq("teacher_id", teacher.id);
    if (subjectsResult.error) throw subjectsResult.error;
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
    const subjectSlugs = (subjectsResult.data || []).map((subject) => subject.subject_slug);
    if (subjectSlugs.length) {
      const profileResult = await admin
        .from("teacher_subject_profiles")
        .update({ visibility: "private", updated_at: new Date().toISOString() })
        .eq("teacher_id", teacher.id)
        .in("subject_slug", subjectSlugs);
      if (profileResult.error) throw profileResult.error;
    }
    return NextResponse.json({ deleted: true });
  } catch (error) {
    return NextResponse.json(
      { error: courseStorageError(error, "Could not delete the course.") },
      { status: 502 },
    );
  }
}
