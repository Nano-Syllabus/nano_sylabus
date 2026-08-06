import { createSupabaseAdminClient } from "@/lib/supabase/admin";

/** Postgres `undefined_table` — the migration has not been applied yet. */
const UNDEFINED_TABLE = "42P01";

/**
 * Every paper this student has handed in: self-practice sittings plus exams a
 * teacher set for their classroom.
 */
export async function countStudentExamsSat(userId: string) {
  const admin = createSupabaseAdminClient();

  const [practice, assigned] = await Promise.all([
    admin
      .from("student_practice_attempts")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId),
    admin
      .from("teacher_exam_submissions")
      .select("id", { count: "exact", head: true })
      .eq("student_id", userId),
  ]);

  const practiceCount = practice.error?.code === UNDEFINED_TABLE ? 0 : practice.count ?? 0;
  const assignedCount = assigned.error ? 0 : assigned.count ?? 0;

  return practiceCount + assignedCount;
}
