import type { SupabaseClient } from "@supabase/supabase-js";
import { mapTeacherCourse, type TeacherCourse } from "@/lib/teacher-courses";

const courseColumns =
  "id,teacher_id,slug,name,short_name,category,authority,tagline,description,duration_weeks,level,language_modes,access_model,price_paisa,visibility,status,diagnostic_question_count,daily_minutes,pass_percentage,negative_marking,exam_date,outcomes,created_at,updated_at,published_at";

export async function listTeacherCourses(
  admin: SupabaseClient,
  teacherId: string,
): Promise<TeacherCourse[]> {
  const coursesResult = await admin
    .from("teacher_courses")
    .select(courseColumns)
    .eq("teacher_id", teacherId)
    .is("archived_at", null)
    .order("updated_at", { ascending: false });
  if (coursesResult.error) throw coursesResult.error;

  const rows = (coursesResult.data || []) as Record<string, unknown>[];
  const ids = rows.map((row) => String(row.id));
  if (!ids.length) return [];

  const [subjectsResult, enrollmentsResult] = await Promise.all([
    admin
      .from("teacher_course_subjects")
      .select("course_id,subject_slug,subject_name,folder_path,position")
      .in("course_id", ids),
    admin
      .from("teacher_course_enrollments")
      .select("course_id")
      .in("course_id", ids)
      .eq("status", "active"),
  ]);
  if (subjectsResult.error) throw subjectsResult.error;
  if (enrollmentsResult.error) throw enrollmentsResult.error;

  const subjectsByCourse = new Map<string, Record<string, unknown>[]>();
  for (const subject of (subjectsResult.data || []) as Record<string, unknown>[]) {
    const courseId = String(subject.course_id || "");
    subjectsByCourse.set(courseId, [...(subjectsByCourse.get(courseId) || []), subject]);
  }

  const enrollmentCounts = new Map<string, number>();
  for (const enrollment of (enrollmentsResult.data || []) as Record<string, unknown>[]) {
    const courseId = String(enrollment.course_id || "");
    enrollmentCounts.set(courseId, (enrollmentCounts.get(courseId) || 0) + 1);
  }

  return rows.map((row) => {
    const id = String(row.id || "");
    return mapTeacherCourse(row, subjectsByCourse.get(id) || [], enrollmentCounts.get(id) || 0);
  });
}

export async function findAssignedCourseSubjects(
  admin: SupabaseClient,
  teacherId: string,
  subjectSlugs: string[],
  exceptCourseId?: string,
) {
  if (!subjectSlugs.length) return [];
  let query = admin
    .from("teacher_course_subjects")
    .select("course_id,subject_slug")
    .eq("teacher_id", teacherId)
    .in("subject_slug", subjectSlugs);
  if (exceptCourseId) query = query.neq("course_id", exceptCourseId);
  const result = await query;
  if (result.error) throw result.error;
  return (result.data || []) as { course_id: string; subject_slug: string }[];
}

export async function detachTeacherSubjectFromCourses(
  admin: SupabaseClient,
  teacherId: string,
  subjectSlug: string,
) {
  const result = await admin
    .from("teacher_course_subjects")
    .delete()
    .eq("teacher_id", teacherId)
    .eq("subject_slug", subjectSlug)
    .select("course_id");
  if (result.error) throw result.error;

  return Array.from(
    new Set(
      ((result.data || []) as Array<{ course_id?: unknown }>)
        .map((row) => String(row.course_id || ""))
        .filter(Boolean),
    ),
  );
}

export function courseStorageError(error: unknown, fallback = "Could not save the course.") {
  const message =
    error instanceof Error
      ? error.message
      : error && typeof error === "object" && "message" in error
        ? String(error.message)
        : String(error || "");
  if (message.includes("teacher_courses") || message.includes("teacher_course_subjects")) {
    return "Course storage is not ready. Apply the latest Supabase migration, then try again.";
  }
  return fallback;
}

export function isCourseSubjectOwnershipConflict(error: unknown) {
  if (!error || typeof error !== "object") return false;
  const record = error as { code?: unknown; message?: unknown };
  return (
    String(record.code || "") === "23505" &&
    String(record.message || "").includes("teacher_course_subjects_teacher_slug_unique")
  );
}
