import { recordPracticeEvaluation } from "@/lib/data/student-mastery";
import type { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { PracticeEvaluation } from "@/lib/tenant/client";

type Admin = ReturnType<typeof createSupabaseAdminClient>;

function isEvaluation(value: unknown): value is PracticeEvaluation {
  return Boolean(value && typeof value === "object" && Array.isArray((value as PracticeEvaluation).chapters));
}

/**
 * Folds a graded classroom exam into the student's knowledge graph, so a paper
 * their teacher set counts towards Today the same way self-practice does.
 *
 * Recorded from the tenant's own marking. A teacher who later adjusts marks
 * changes the published result, not this record.
 */
export async function recordExamEvaluationForStudent(input: {
  admin: Admin;
  userId: string;
  classroomId: string;
  grade: unknown;
}) {
  const grade = input.grade as { evaluation?: unknown; total_score?: number; total_marks?: number } | null;
  if (!isEvaluation(grade?.evaluation)) return;

  const { data: classroom } = await input.admin
    .from("teacher_classrooms")
    .select("subject_slug, subject_name")
    .eq("id", input.classroomId)
    .maybeSingle();
  if (!classroom?.subject_slug) return;

  await recordPracticeEvaluation({
    userId: input.userId,
    subjectSlug: classroom.subject_slug,
    subjectName: classroom.subject_name || "",
    source: "teacher_exam",
    totalScore: Number(grade?.total_score ?? 0),
    totalMarks: Number(grade?.total_marks ?? 0),
    evaluation: grade!.evaluation as PracticeEvaluation,
  });
}
