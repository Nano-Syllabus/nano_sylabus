import type { SupabaseClient } from "@supabase/supabase-js";
import {
  challengeQuestionFormat,
  DEFAULT_CHALLENGE_QUESTION_FORMAT,
  type ChallengeQuestionFormat,
} from "@/lib/challenge-format";
import { CommunityError } from "@/lib/data/communities";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

/**
 * A community's challenge question format — QnA, MCQ or hybrid.
 *
 * Kept out of `communityColumns` in `lib/data/communities.ts` on purpose: those
 * reads sit in front of every community page, and naming a column the database
 * does not have yet fails the whole query with a 42703. Code ships before its
 * migration runs (`20260924120000_community_challenge_question_format.sql`), so
 * everything here degrades to the written exam instead of taking a page down.
 */

const UNDEFINED_COLUMN = "42703";
const POSTGREST_MISSING_COLUMN = "PGRST204";

function isMissingFormatColumn(error: { code?: string } | null) {
  return error?.code === UNDEFINED_COLUMN || error?.code === POSTGREST_MISSING_COLUMN;
}

export type CommunityChallengeFormatState = {
  format: ChallengeQuestionFormat;
  /** False until the creator has actually chosen; the default is not a choice. */
  confirmed: boolean;
  /** False on a database without the migration: the setting cannot be saved. */
  available: boolean;
};

function stateFromRow(row: Record<string, unknown> | null): CommunityChallengeFormatState {
  return {
    format: challengeQuestionFormat(row?.challenge_question_format),
    confirmed: Boolean(row?.challenge_question_format_set_at),
    available: true,
  };
}

const UNAVAILABLE: CommunityChallengeFormatState = {
  format: DEFAULT_CHALLENGE_QUESTION_FORMAT,
  confirmed: false,
  available: false,
};

export async function readCommunityChallengeFormat(
  slug: string,
  admin: SupabaseClient = createSupabaseAdminClient(),
): Promise<CommunityChallengeFormatState | null> {
  const { data, error } = await admin
    .from("communities")
    .select("id,challenge_question_format,challenge_question_format_set_at")
    .eq("slug", slug)
    .maybeSingle();
  if (isMissingFormatColumn(error)) {
    const exists = await admin.from("communities").select("id").eq("slug", slug).maybeSingle();
    if (exists.error) throw exists.error;
    return exists.data ? UNAVAILABLE : null;
  }
  if (error) throw error;
  return data ? stateFromRow(data as Record<string, unknown>) : null;
}

/** Only the community's creator may change it; every student follows the change. */
export async function setCommunityChallengeFormat(
  userId: string,
  slug: string,
  format: ChallengeQuestionFormat,
  admin: SupabaseClient = createSupabaseAdminClient(),
): Promise<CommunityChallengeFormatState> {
  const community = await admin
    .from("communities")
    .select("id,creator_id,status,study_course_id")
    .eq("slug", slug)
    .maybeSingle();
  if (community.error) throw community.error;
  if (!community.data || community.data.status !== "active") {
    throw new CommunityError("Community not found.", 404);
  }
  if (String(community.data.creator_id) !== userId) {
    throw new CommunityError("Only the community creator can change its challenge questions.", 403);
  }
  const now = new Date().toISOString();
  const { data, error } = await admin
    .from("communities")
    .update({
      challenge_question_format: format,
      challenge_question_format_set_at: now,
      updated_at: now,
    })
    .eq("id", community.data.id)
    .select("challenge_question_format,challenge_question_format_set_at")
    .single();
  if (isMissingFormatColumn(error)) {
    throw new CommunityError(
      "Challenge question types are not available yet. The database update must be installed first.",
      503,
    );
  }
  if (error) throw error;
  if (community.data.study_course_id) formatByCourse.delete(String(community.data.study_course_id));
  return stateFromRow(data as Record<string, unknown>);
}

/**
 * The format a challenge in this course is set in.
 *
 * Challenges reach their community through the course it owns
 * (`communities.study_course_id = student_challenges.course_id`). Held for 30s —
 * the window every other cache in the app agrees on — because it is read on
 * every challenge open, and a creator's change reaching students within half a
 * minute is soon enough. The creator's own server instance forgets it at once.
 */
const FORMAT_TTL_MS = 30_000;
const formatByCourse = new Map<string, { format: ChallengeQuestionFormat; at: number }>();

export async function challengeFormatForCourse(
  courseId: string | null,
  admin: SupabaseClient = createSupabaseAdminClient(),
): Promise<ChallengeQuestionFormat> {
  if (!courseId) return DEFAULT_CHALLENGE_QUESTION_FORMAT;
  const cached = formatByCourse.get(courseId);
  if (cached && Date.now() - cached.at < FORMAT_TTL_MS) return cached.format;
  const { data, error } = await admin
    .from("communities")
    .select("challenge_question_format")
    .eq("study_course_id", courseId)
    .maybeSingle();
  // A missing column or a failed read is the written exam, never an error: the
  // format decides what paper to set, and no paper at all is the worse outcome.
  const format = error ? DEFAULT_CHALLENGE_QUESTION_FORMAT : challengeQuestionFormat(data?.challenge_question_format);
  if (!error || isMissingFormatColumn(error)) formatByCourse.set(courseId, { format, at: Date.now() });
  return format;
}
