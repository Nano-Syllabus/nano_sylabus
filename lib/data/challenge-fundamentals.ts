import { challengeUpstreamScope } from "@/lib/data/student-challenges";
import { requestQuestionVideo, type QuestionVideoQuestion } from "@/lib/data/challenge-question-video";
import {
  getTeacherChallengeMcq,
  type TeacherAnimationReply,
  type TeacherChallengeMcqQuestion,
} from "@/lib/teacher-app/client";

/**
 * A challenge's FUNDAMENTALS CHECK: five MCQs on its micro-topic, in step one.
 *
 * The questions are set upstream (`/v1/collection/challenge/mcq`) once per topic
 * and cached there against the notes, so every student on "Mesh Analysis" gets
 * the same five with the same ids. That is what lets this module keep nothing on
 * the challenge row: the set is fetched, the key is stripped before anything
 * reaches the browser, and an answer is checked by fetching the set again here.
 * The row's `content` is sent to the client whole, so an answer key stored there
 * would be an answer key handed out.
 *
 * A wrong answer is told the correct option — not a lecture on why theirs was
 * wrong. The "why" is on request, as the question's short video
 * (`explainChallengeFundamental`), shared and cached per question.
 */

export type FundamentalsQuestion = {
  id: string;
  text: string;
  options: Array<{ key: string; text: string }>;
};

export type FundamentalsResult = {
  questionId: string;
  selected: string;
  correct: string;
  correctText: string;
  isCorrect: boolean;
  /** One sentence on what makes the correct option right. */
  explanation: string;
};

export type FundamentalsExplainer = {
  specHash: string;
  status: string;
  derivatives: TeacherAnimationReply["derivatives"];
  error: string;
};

/** The set changed upstream (its notes were re-indexed) since this was asked. */
export class FundamentalsChangedError extends Error {}

/** Shorter than it takes a student to finish the set, so a check is a lookup. */
const SET_TTL_MS = 10 * 60_000;
const MAX_HELD = 400;
const held = new Map<string, { at: number; questions: TeacherChallengeMcqQuestion[] }>();

type Scope = NonNullable<Awaited<ReturnType<typeof challengeUpstreamScope>>>;

async function fundamentalsSet(scope: Scope, refetch = false) {
  const key = `${scope.collectionKey}|${scope.subject}|${scope.topics.join(",")}`;
  const kept = held.get(key);
  if (kept && !refetch && Date.now() - kept.at < SET_TTL_MS) return kept.questions;
  const response = await getTeacherChallengeMcq(scope.collectionKey, {
    subject: scope.subject,
    topics: scope.topics,
  });
  const questions = (response.questions || []).filter(
    (question) => question.id && question.text && question.options?.length >= 2 && question.correct,
  );
  if (held.size >= MAX_HELD) held.delete(held.keys().next().value as string);
  held.set(key, { at: Date.now(), questions });
  return questions;
}

async function questionFor(scope: Scope, questionId: string) {
  const found = (await fundamentalsSet(scope)).find((question) => question.id === questionId);
  if (found) return found;
  // Held from before a re-index upstream: the set was re-written with new ids.
  const again = (await fundamentalsSet(scope, true)).find((question) => question.id === questionId);
  if (!again) throw new FundamentalsChangedError("These questions were updated. Reload them to continue.");
  return again;
}

function optionText(question: TeacherChallengeMcqQuestion, key: string) {
  return question.options.find((option) => option.key === key)?.text ?? "";
}

/** The set as the student sees it: no `correct`, no `explanation`. */
export async function getChallengeFundamentals(
  userId: string,
  challengeId: string,
): Promise<FundamentalsQuestion[] | null> {
  const scope = await challengeUpstreamScope(userId, challengeId);
  if (!scope) return null;
  return (await fundamentalsSet(scope)).map(({ id, text, options }) => ({
    id,
    text,
    options: options.map(({ key, text: optionTextValue }) => ({ key, text: optionTextValue })),
  }));
}

export async function checkChallengeFundamental(
  userId: string,
  challengeId: string,
  questionId: string,
  selected: string,
): Promise<FundamentalsResult | null> {
  const scope = await challengeUpstreamScope(userId, challengeId);
  if (!scope) return null;
  const question = await questionFor(scope, questionId);
  return {
    questionId,
    selected,
    correct: question.correct,
    correctText: optionText(question, question.correct),
    isCorrect: selected === question.correct,
    explanation: question.explanation?.trim() || "",
  };
}

/**
 * The short video for a wrong answer — the question's own, shared and cached.
 * Refuses a correct answer: the check already said so.
 */
export async function explainChallengeFundamental(
  userId: string,
  challengeId: string,
  questionId: string,
  selected: string,
): Promise<FundamentalsExplainer | null> {
  const scope = await challengeUpstreamScope(userId, challengeId);
  if (!scope) return null;
  const question = await questionFor(scope, questionId);
  const chosen = optionText(question, selected);
  if (!chosen || selected === question.correct) {
    throw new RangeError("An explainer is made for a wrong answer.");
  }
  return requestWrongAnswerVideo(scope, {
    text: question.text,
    options: question.options,
    correct: question.correct,
    explanation: question.explanation || "",
  }, selected);
}

/**
 * The video for a wrong answer to any challenge MCQ — the fundamentals check's,
 * or an MCQ community's paper. The QUESTION's video, shared and cached (see
 * `challenge-question-video.ts`); asked for `urgent` because a student is
 * waiting on it.
 */
export async function requestWrongAnswerVideo(
  scope: { collectionKey: string; subject: string },
  question: QuestionVideoQuestion,
  selected: string,
): Promise<FundamentalsExplainer> {
  if (!question.options.some((option) => option.key === selected) || selected === question.correct) {
    throw new RangeError("An explainer is made for a wrong answer.");
  }
  return requestQuestionVideo(scope, question, "urgent");
}
