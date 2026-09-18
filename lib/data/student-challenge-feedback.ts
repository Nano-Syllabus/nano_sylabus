import type { ChallengeFeedbackInput } from "@/lib/challenge-feedback";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

/**
 * What a student is asked while their answer sheet is being graded: how the
 * challenge was to learn from, and what they expect to score. Both are chosen
 * from buttons, and a student may skip — which is recorded too.
 *
 * See supabase/migrations/20260918150000_challenge_feedback.sql.
 */

const UNIQUE_VIOLATION = "23505";
const MISSING_TABLE = new Set(["42P01", "PGRST205"]);

/**
 * Store one sitting's feedback.
 *
 * - `stored`: written.
 * - `duplicate`: this sitting already answered (a double click, a retry).
 * - `not_found`: no such challenge for this student.
 * - `unavailable`: the table is not there yet (migration not applied). The
 *   student is never shown an error for it — grading carries on regardless.
 */
export async function recordChallengeFeedback(
  userId: string,
  challengeId: string,
  input: ChallengeFeedbackInput,
): Promise<"stored" | "duplicate" | "not_found" | "unavailable"> {
  const admin = createSupabaseAdminClient();
  const { data: row, error: rowError } = await admin
    .from("student_challenges")
    .select("id,external_paper_id,last_attempt_id")
    .eq("id", challengeId)
    .eq("user_id", userId)
    .maybeSingle();
  if (rowError) throw rowError;
  if (!row) return "not_found";

  const { error } = await admin.from("student_challenge_feedback").insert({
    challenge_id: challengeId,
    user_id: userId,
    // The sitting the sheet went to. Grading may have finished first and moved
    // it to `last_attempt_id`; either names the same sitting.
    exam_attempt_id: String(row.external_paper_id || row.last_attempt_id || ""),
    skipped: input.skipped,
    experience_rating: input.skipped ? null : input.experienceRating,
    expected_score_band: input.skipped ? null : input.expectedScoreBand,
  });
  if (!error) return "stored";
  if (error.code === UNIQUE_VIOLATION) return "duplicate";
  if (error.code && MISSING_TABLE.has(error.code)) {
    console.warn("[challenge feedback] table missing — apply 20260918150000_challenge_feedback.sql");
    return "unavailable";
  }
  throw error;
}
