import { challengeUpstreamScope } from "@/lib/data/student-challenges";
import {
  getTeacherChallengeMcq,
  requestTeacherExplainerAnimation,
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
 * wrong. The "why" is on request, as a short video made for that one answer
 * (`explainChallengeFundamental`), generated fresh every time and never reused.
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
 * A short animated explainer for ONE wrong answer — why the student's option is
 * wrong and the correct one right. `fresh`, so it is rendered for this request
 * and handed to no other; nothing about it is kept here. Refuses a correct
 * answer: there is nothing to explain and a render costs money.
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
  const correctText = optionText(question, question.correct);
  const reply = await requestTeacherExplainerAnimation(scope.collectionKey, {
    concept: clip(`Why "${correctText}" and not "${chosen}": ${question.text}`, 200),
    subject: scope.subject,
    notes: clip(
      [
        `A student studying "${scope.topicTitle}" (${scope.subject}) answered a multiple-choice question wrongly.`,
        `Question: ${question.text}`,
        `Options: ${question.options.map((option) => `${option.key}) ${option.text}`).join("  ")}`,
        `They chose ${selected}) ${chosen}. The correct answer is ${question.correct}) ${correctText}.`,
        question.explanation ? `Why it is correct: ${question.explanation}` : "",
        "Make the concept clear in under 15 seconds: show where the idea behind their choice goes wrong,",
        "then why the correct answer holds. One idea per beat; no quiz, no recap, no title card.",
      ]
        .filter(Boolean)
        .join("\n"),
      2000,
    ),
    // Under the 15-second ceiling the student was promised; the planner writes to
    // this number rather than to an exact frame count.
    seconds: 12,
    style: "card",
    fresh: true,
  });
  return {
    specHash: reply.spec_hash,
    status: reply.status,
    derivatives: reply.derivatives || {},
    error: reply.error || "",
  };
}

function clip(text: string, limit: number) {
  const clean = text.replace(/\s+\n/g, "\n").trim();
  return clean.length <= limit ? clean : `${clean.slice(0, limit - 1).trimEnd()}…`;
}
