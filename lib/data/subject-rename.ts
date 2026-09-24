import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Renaming a creator's subject: every copy of its NAME follows, and nothing
 * that IDENTIFIES it moves.
 *
 * A subject has one identity everywhere — its slug (`subject_slug`, or
 * `external_subject_slug` on a community placement), which is also how the
 * course API is asked about it. The course API's own name for the subject is
 * deliberately left alone: its index files chunks under that name, so renaming
 * it there would cut the subject off from its own material. That is why every
 * upstream call asks by slug (see `resolveChallengeLane`), and why a rename is
 * this app's business alone.
 *
 * What the app does keep is the NAME in many places — the tables below store it
 * as a snapshot beside the slug, for display. A rename that missed one left a
 * student looking at the old name in one screen and the new one in the next,
 * and a name sent upstream from a stale copy failed outright ("subject '…' is
 * not pinned in this collection"). So the list is the single place a table that
 * stores a subject's name is registered, and `tests/lib/subject-rename.test.ts`
 * fails when a migration adds one that is not on it.
 */

export type SubjectNameSnapshot = {
  table: string;
  /** Where the display name is stored. */
  nameColumn: string;
  /** Where the subject's slug is stored — what the rename matches on. */
  slugColumn: string;
  /** Rows carry `teacher_id`, so the match is scoped to the creator. Tables
   *  without it are matched on the slug alone, which is collection-prefixed and
   *  so already unique to one creator. */
  teacherScoped: boolean;
  /** Bump `updated_at`. Not on student rows: their `updated_at` is the guard
   *  concurrent writes compare against, and a label is not a change to them. */
  touch?: boolean;
};

export const SUBJECT_NAME_SNAPSHOTS: readonly SubjectNameSnapshot[] = [
  { table: "teacher_subject_profiles", nameColumn: "subject_name", slugColumn: "subject_slug", teacherScoped: true, touch: true },
  { table: "community_subjects", nameColumn: "name", slugColumn: "external_subject_slug", teacherScoped: true, touch: true },
  { table: "teacher_course_subjects", nameColumn: "subject_name", slugColumn: "subject_slug", teacherScoped: true },
  { table: "teacher_classrooms", nameColumn: "subject_name", slugColumn: "subject_slug", teacherScoped: true },
  { table: "teacher_exam_papers", nameColumn: "subject_name", slugColumn: "subject_slug", teacherScoped: true },
  { table: "challenge_topic_pool", nameColumn: "subject_name", slugColumn: "subject_slug", teacherScoped: true },
  { table: "student_challenges", nameColumn: "subject_name", slugColumn: "subject_slug", teacherScoped: false },
  { table: "student_practice_attempts", nameColumn: "subject_name", slugColumn: "subject_slug", teacherScoped: false },
  { table: "student_topic_mastery", nameColumn: "subject_name", slugColumn: "subject_slug", teacherScoped: false },
  { table: "revision_notes", nameColumn: "subject_name", slugColumn: "subject_slug", teacherScoped: false },
];

/** Tables that carry a subject slug but deliberately no name to keep in step. */
export const SUBJECT_SLUG_ONLY_TABLES: readonly string[] = [
  "chat_sessions",
  "teacher_subject_syllabi",
];

/** A table or column this database does not have yet: its migration comes later. */
function isMissingRelation(error: { code?: string } | null) {
  return ["42P01", "PGRST205", "42703", "PGRST204"].includes(String(error?.code || ""));
}

export type SubjectRenameResult = {
  /** Rows renamed per table. */
  updated: Record<string, number>;
  /** Registered tables this database does not have yet. */
  skipped: string[];
};

/**
 * Rename a subject everywhere its name is kept. Throws on the first real
 * failure; a table not yet migrated is skipped and reported.
 */
export async function renameCreatorSubject(
  admin: SupabaseClient,
  input: { teacherId: string; subjectSlug: string; name: string },
): Promise<SubjectRenameResult> {
  const now = new Date().toISOString();
  const updated: Record<string, number> = {};
  const skipped: string[] = [];
  await Promise.all(
    SUBJECT_NAME_SNAPSHOTS.map(async (snapshot) => {
      let query = admin
        .from(snapshot.table)
        .update({ [snapshot.nameColumn]: input.name, ...(snapshot.touch ? { updated_at: now } : {}) })
        .eq(snapshot.slugColumn, input.subjectSlug);
      if (snapshot.teacherScoped) query = query.eq("teacher_id", input.teacherId);
      const { data, error } = await query.select(snapshot.slugColumn);
      if (isMissingRelation(error)) {
        skipped.push(snapshot.table);
        return;
      }
      if (error) throw error;
      updated[snapshot.table] = Array.isArray(data) ? data.length : 0;
    }),
  );
  return { updated, skipped };
}
