/**
 * What kind of questions a community's challenge exams ask.
 *
 * Chosen by the community's creator (when the community is created, in its
 * settings, or when uploading its content) and applied to EVERY student in it:
 * a student's open exam in another format is re-issued at their next sitting.
 * See `lib/data/community-challenge-format.ts`.
 */
export const challengeQuestionFormats = ["qna", "mcq", "hybrid"] as const;

export type ChallengeQuestionFormat = (typeof challengeQuestionFormats)[number];

/** What a community that has never chosen runs on: the original written exam. */
export const DEFAULT_CHALLENGE_QUESTION_FORMAT: ChallengeQuestionFormat = "qna";

export function isChallengeQuestionFormat(value: unknown): value is ChallengeQuestionFormat {
  return typeof value === "string" && (challengeQuestionFormats as readonly string[]).includes(value);
}

export function challengeQuestionFormat(value: unknown): ChallengeQuestionFormat {
  return isChallengeQuestionFormat(value) ? value : DEFAULT_CHALLENGE_QUESTION_FORMAT;
}

export const challengeQuestionFormatLabels: Record<
  ChallengeQuestionFormat,
  { title: string; description: string }
> = {
  qna: {
    title: "Written (QnA)",
    description: "Students write answers on paper and upload a photo. Graded against the course material.",
  },
  mcq: {
    title: "Multiple choice (MCQ)",
    description: "Students pick an option on screen and see their result instantly.",
  },
  hybrid: {
    title: "Hybrid",
    description: "Multiple-choice questions on screen plus one written answer uploaded as a photo.",
  },
};

/**
 * The paper each format sets. Every format totals about twenty marks, the same
 * as the original two-question written paper, so a pass means the same thing
 * whichever the creator picked.
 */
export const CHALLENGE_MCQ_EXAM_QUESTIONS = 10;

/** How many MCQs an MCQ community's challenge sets — the creator's choice. */
export const CHALLENGE_MCQ_COUNT_MIN = 5;
export const CHALLENGE_MCQ_COUNT_MAX = 30;

/**
 * Negative marking: the share of a question's marks taken off for a WRONG
 * answer. An unanswered question is never penalised. 0 turns it off; licence
 * exams commonly take 20%.
 */
export const challengeNegativeMarkingOptions = [0, 10, 20, 25, 33, 50] as const;

export function clampMcqCount(value: unknown) {
  const count = Math.round(Number(value));
  if (!Number.isFinite(count)) return CHALLENGE_MCQ_EXAM_QUESTIONS;
  return Math.min(CHALLENGE_MCQ_COUNT_MAX, Math.max(CHALLENGE_MCQ_COUNT_MIN, count));
}

export function negativeMarkingPercent(value: unknown) {
  const percent = Math.round(Number(value));
  return (challengeNegativeMarkingOptions as readonly number[]).includes(percent) ? percent : 0;
}
export const CHALLENGE_HYBRID_MCQ_QUESTIONS = 5;
export const CHALLENGE_HYBRID_WRITTEN_QUESTIONS = 1;
export const CHALLENGE_MCQ_MARKS = 2;
