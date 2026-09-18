/**
 * The two questions asked while an answer sheet is graded — the options and the
 * validation, shared by the modal (browser) and the route (server). Kept apart
 * from `lib/data/student-challenge-feedback.ts`, which holds the service-role
 * client and must never reach a browser bundle.
 */

export const EXPERIENCE_RATINGS = [1, 2, 3, 4, 5] as const;
export type ExperienceRating = (typeof EXPERIENCE_RATINGS)[number];

export const EXPECTED_SCORE_BANDS = ["0-25", "26-50", "51-75", "76-100"] as const;
export type ExpectedScoreBand = (typeof EXPECTED_SCORE_BANDS)[number];

export type ChallengeFeedbackInput =
  | { skipped: true }
  | { skipped: false; experienceRating: ExperienceRating; expectedScoreBand: ExpectedScoreBand };

/** The request body, or null when it is not one of the two shapes above. */
export function parseChallengeFeedback(body: unknown): ChallengeFeedbackInput | null {
  if (!body || typeof body !== "object") return null;
  const record = body as Record<string, unknown>;
  if (record.skipped === true) return { skipped: true };
  const rating = Number(record.experienceRating);
  const band = String(record.expectedScoreBand ?? "");
  if (!EXPERIENCE_RATINGS.includes(rating as ExperienceRating)) return null;
  if (!EXPECTED_SCORE_BANDS.includes(band as ExpectedScoreBand)) return null;
  return {
    skipped: false,
    experienceRating: rating as ExperienceRating,
    expectedScoreBand: band as ExpectedScoreBand,
  };
}
