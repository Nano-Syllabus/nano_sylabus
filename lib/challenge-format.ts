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
export const CHALLENGE_HYBRID_MCQ_QUESTIONS = 5;
export const CHALLENGE_HYBRID_WRITTEN_QUESTIONS = 1;
export const CHALLENGE_MCQ_MARKS = 2;
