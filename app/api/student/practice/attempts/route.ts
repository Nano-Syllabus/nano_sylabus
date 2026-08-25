import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  listCreatorPrivateSubjectAccess,
  listStudentCourseSubjects,
} from "@/lib/student-courses";

export const dynamic = "force-dynamic";

/** Postgres `undefined_table` — the migration has not been applied yet. */
const UNDEFINED_TABLE = "42P01";

function publicEvaluation(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { evaluation: value ?? null, hasDetails: false };
  }
  const { attempt_history: history, ...evaluation } = value as Record<string, unknown>;
  return { evaluation, hasDetails: Boolean(history) };
}

/** The student's own graded practice sittings, newest first. */
export async function GET() {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const admin = createSupabaseAdminClient();
    const [attemptsResult, courseSubjects, privateSubjects] = await Promise.all([
      admin
        .from("student_practice_attempts")
        .select("id, course_id, subject_slug, subject_name, source, total_score, total_marks, evaluation, created_at")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(50),
      listStudentCourseSubjects(user.id, admin),
      listCreatorPrivateSubjectAccess(user.id, admin),
    ]);
    const { data, error } = attemptsResult;

    if (error?.code === UNDEFINED_TABLE) return NextResponse.json({ attempts: [] });
    if (error) throw error;

    const courseIds = new Set(courseSubjects.map((subject) => subject.courseId));
    const accessibleSlugs = new Set(
      [...courseSubjects, ...privateSubjects].map((subject) => subject.subjectSlug),
    );
    return NextResponse.json({
      attempts: (data ?? [])
        .filter((row) =>
          row.course_id
            ? courseIds.has(String(row.course_id))
            : accessibleSlugs.has(String(row.subject_slug || "")),
        )
        .map((row) => {
        const { evaluation, hasDetails } = publicEvaluation(row.evaluation);
        return {
          id: row.id,
          subjectName: row.subject_name,
          source: row.source,
          totalScore: Number(row.total_score ?? 0),
          totalMarks: Number(row.total_marks ?? 0),
          evaluation,
          hasDetails,
          createdAt: row.created_at,
        };
        }),
    });
  } catch {
    return NextResponse.json({ error: "Could not load your practice history." }, { status: 502 });
  }
}
