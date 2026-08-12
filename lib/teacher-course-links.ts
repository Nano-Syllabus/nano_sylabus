import type { SupabaseClient } from "@supabase/supabase-js";

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
