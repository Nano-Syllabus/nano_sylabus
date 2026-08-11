import { NextResponse } from "next/server";
import { getTeacherProfile } from "@/app/teachers/actions";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getTeacherSubjects } from "@/lib/teacher-app/client";
import { teacherCourseInputSchema, teacherCourseRow } from "@/lib/teacher-courses";
import {
  courseStorageError,
  findAssignedCourseSubjects,
  isCourseSubjectOwnershipConflict,
  listTeacherCourses,
} from "@/lib/teacher-course-store";

type ApiRecord = Record<string, unknown>;
type RouteContext = { params: Promise<{ courseId: string }> };

function resolveSubjects(available: ApiRecord[], requestedSlugs: string[]) {
  const bySlug = new Map(available.map((subject) => [String(subject.slug || ""), subject]));
  return requestedSlugs.map((slug, position) => {
    const subject = bySlug.get(slug);
    if (!subject) throw new Error(`Indexed subject not found: ${slug}`);
    return {
      subject_slug: slug,
      subject_name: String(subject.name || slug),
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

    const teacherSubjects = await getTeacherSubjects(teacher.collection_sk);
    let subjects;
    try {
      subjects = resolveSubjects(teacherSubjects.subjects, parsed.data.subjectSlugs);
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
    const insertResult = await admin
      .from("teacher_course_subjects")
      .insert(
        subjects.map((subject) => ({ course_id: courseId, teacher_id: teacher.id, ...subject })),
      );
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
