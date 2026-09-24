import { createHmac, timingSafeEqual } from "node:crypto";
import { CHALLENGE_MCQ_MARKS } from "@/lib/challenge-format";
import {
  getTeacherChallengeMcq,
  type TeacherChallengeGradeResponse,
  type TeacherChallengeMcqQuestion,
} from "@/lib/teacher-app/client";
import type { PracticeEvaluation } from "@/lib/tenant/client";

/**
 * Multiple-choice challenge exams — for communities whose creator chose MCQ or
 * hybrid challenge questions (`lib/challenge-format.ts`).
 *
 * THE ANSWER KEY NEVER TOUCHES THE ROW IN THE CLEAR.
 * `student_challenges.content` is shipped to the student's browser whole
 * (`rowContent`), so a stored `correct: "B"` would be the answer sheet handed
 * out with the paper. Each question instead carries `answerCheck`, an HMAC of
 * the challenge, the question and its correct option under a server-only
 * secret. Marking tries each option against it; the browser, without the
 * secret, cannot. That also means marking needs nothing upstream — no set that
 * a backend restart could lose, and no model call.
 */

export type ChallengeChoiceOption = { key: string; text: string };

export type ChallengeChoiceQuestion = {
  id: string;
  question: string;
  topic: string;
  marks: number;
  questionType: string;
  options: ChallengeChoiceOption[];
  answerCheck: string;
};

export class ChallengeMcqUnavailableError extends Error {
  constructor(message = "Multiple-choice challenge exams need the latest course service.") {
    super(message);
    this.name = "ChallengeMcqUnavailableError";
  }
}

function answerSecret() {
  const explicit = (process.env.CHALLENGE_ANSWER_SECRET || "").trim();
  if (explicit) return explicit;
  const serviceKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
  if (!serviceKey) throw new Error("The challenge answer key cannot be sealed on this deployment.");
  // Derived and one-way, like `sweepSecret`: no new variable to configure, and
  // the value opens nothing but these checks.
  return createHmac("sha256", serviceKey).update("challenge-answer-check:v1").digest("hex");
}

export function sealAnswer(challengeId: string, questionId: string, optionKey: string) {
  return createHmac("sha256", answerSecret())
    .update(`${challengeId}\u0000${questionId}\u0000${optionKey.trim().toUpperCase()}`)
    .digest("hex")
    .slice(0, 32);
}

function matches(a: string, b: string) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

/** The correct option's key, recovered from the seal; "" when none matches. */
export function unsealAnswer(challengeId: string, question: ChallengeChoiceQuestion) {
  return (
    question.options.find((option) =>
      matches(sealAnswer(challengeId, question.id, option.key), question.answerCheck || ""),
    )?.key ?? ""
  );
}

function shuffled<T>(items: T[]) {
  const copy = [...items];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(Math.random() * (index + 1));
    [copy[index], copy[swap]] = [copy[swap], copy[index]];
  }
  return copy;
}

export function sealedChoiceQuestion(
  challengeId: string,
  question: TeacherChallengeMcqQuestion,
  topic: string,
  marks: number,
): ChallengeChoiceQuestion {
  return {
    id: question.id,
    question: question.text,
    topic,
    marks,
    questionType: "Multiple choice",
    options: question.options.map((option) => ({ key: option.key, text: option.text })),
    answerCheck: sealAnswer(challengeId, question.id, question.correct),
  };
}

/**
 * Set the MCQ part of a challenge exam.
 *
 * `variant` rotates with the attempt so a retake is a different paper; students
 * on the same variant share one cached set upstream. The order is shuffled per
 * student so two students sitting side by side do not share question 1.
 */
export async function issueChallengeChoiceQuestions(input: {
  collectionKey: string;
  challengeId: string;
  subject: string;
  topicKeys: string[];
  topicTitle: string;
  count: number;
  attemptNumber: number;
}): Promise<ChallengeChoiceQuestion[]> {
  const response = await getTeacherChallengeMcq(input.collectionKey, {
    subject: input.subject,
    topics: input.topicKeys,
    purpose: "exam",
    count: input.count,
    variant: Math.max(0, input.attemptNumber - 1) % 3,
  });
  // An older course service ignores `purpose` and answers with the step-one
  // fundamentals set — which the student has already been shown the answers to.
  if (response.purpose !== "exam") throw new ChallengeMcqUnavailableError();
  const marks = Number(response.marks) || CHALLENGE_MCQ_MARKS;
  const usable = (response.questions || []).filter(
    (question) =>
      question.id &&
      question.text &&
      question.options?.length >= 2 &&
      question.options.some((option) => option.key === question.correct),
  );
  if (!usable.length) throw new Error("The course API could not set multiple-choice questions for this topic.");
  return shuffled(usable)
    .slice(0, input.count)
    .map((question) => sealedChoiceQuestion(input.challengeId, question, input.topicTitle, marks));
}

type GradedItem = {
  question_id: string;
  topic: string;
  question: string;
  marks: number;
  score: number;
  student_answer: string;
  feedback: string;
  answered: boolean;
};

/** Mark the MCQ part. `selections` maps question id → chosen option key. */
export function gradeChallengeChoices(
  challengeId: string,
  questions: ChallengeChoiceQuestion[],
  selections: Record<string, string>,
): GradedItem[] {
  return questions.map((question) => {
    const correct = unsealAnswer(challengeId, question);
    const chosen = String(selections[question.id] || "").trim().toUpperCase();
    const chosenOption = question.options.find((option) => option.key === chosen);
    const correctOption = question.options.find((option) => option.key === correct);
    const right = Boolean(correct) && chosen === correct;
    return {
      question_id: question.id,
      topic: question.topic,
      question: question.question,
      marks: question.marks,
      score: right ? question.marks : 0,
      student_answer: chosenOption ? `${chosenOption.key}. ${chosenOption.text}` : "",
      feedback: right
        ? "Correct."
        : correctOption
          ? `${chosenOption ? "Not quite." : "Not answered."} The correct answer is ${correctOption.key}. ${correctOption.text}`
          : "This question could not be marked.",
      answered: Boolean(chosenOption),
    };
  });
}

const STRONG_THRESHOLD = 0.75;
const WEAK_THRESHOLD = 0.5;

function round(value: number, places = 2) {
  const factor = 10 ** places;
  return Math.round((Number(value) || 0) * factor) / factor;
}

function status(percentage: number, answered: number) {
  if (answered === 0) return "not_attempted" as const;
  if (percentage >= STRONG_THRESHOLD) return "strong" as const;
  if (percentage > WEAK_THRESHOLD) return "developing" as const;
  return "weak" as const;
}

/**
 * The topic breakdown, computed the way the course API computes it
 * (`services/evaluation.py`, `evaluate_by_chapter`) so a challenge marked here
 * reads the same on the mastery screens as one marked upstream.
 */
export function evaluateByTopic(items: Array<Pick<GradedItem, "topic" | "marks" | "score" | "answered">>): PracticeEvaluation {
  const order: string[] = [];
  const buckets = new Map<string, { questions: number; answered: number; marks: number; score: number }>();
  for (const item of items) {
    const marks = Number(item.marks) || 0;
    if (marks <= 0) continue;
    const chapter = item.topic.trim() || "General";
    let bucket = buckets.get(chapter);
    if (!bucket) {
      order.push(chapter);
      bucket = { questions: 0, answered: 0, marks: 0, score: 0 };
      buckets.set(chapter, bucket);
    }
    bucket.questions += 1;
    bucket.answered += item.answered ? 1 : 0;
    bucket.marks += marks;
    bucket.score += Math.max(0, Math.min(Number(item.score) || 0, marks));
  }
  const totalMarks = [...buckets.values()].reduce((sum, bucket) => sum + bucket.marks, 0);
  const totalScore = [...buckets.values()].reduce((sum, bucket) => sum + bucket.score, 0);
  const chapters = order.map((chapter) => {
    const bucket = buckets.get(chapter)!;
    const lost = Math.max(0, bucket.marks - bucket.score);
    const percentage = bucket.marks > 0 ? bucket.score / bucket.marks : 0;
    return {
      chapter,
      topic_key: "",
      questions: bucket.questions,
      questions_answered: bucket.answered,
      marks: round(bucket.marks),
      score: round(bucket.score),
      marks_lost: round(lost),
      percentage: round(percentage, 4),
      weightage: totalMarks > 0 ? round(bucket.marks / totalMarks, 4) : 0,
      lost_weightage: totalMarks > 0 ? round(lost / totalMarks, 4) : 0,
      status: status(percentage, bucket.answered),
    };
  });
  const pct = totalMarks > 0 ? Math.round((totalScore / totalMarks) * 100) : 0;
  const lostTotal = Math.max(0, totalMarks - totalScore);
  return {
    total_score: round(totalScore),
    total_marks: round(totalMarks),
    percentage: totalMarks > 0 ? round(totalScore / totalMarks, 4) : 0,
    marks_lost: round(lostTotal),
    questions: chapters.reduce((sum, chapter) => sum + chapter.questions, 0),
    questions_answered: chapters.reduce((sum, chapter) => sum + chapter.questions_answered, 0),
    chapters,
    strong_topics: chapters
      .filter((chapter) => chapter.status === "strong")
      .sort((a, b) => b.percentage - a.percentage || b.weightage - a.weightage),
    weak_topics: chapters
      .filter((chapter) => chapter.status === "weak")
      .sort((a, b) => b.lost_weightage - a.lost_weightage || a.percentage - b.percentage),
    not_attempted: chapters.filter((chapter) => chapter.status === "not_attempted"),
    summary:
      totalMarks <= 0
        ? "Nothing to evaluate — this paper carries no marks."
        : lostTotal <= 0
          ? `Scored ${round(totalScore, 1)}/${round(totalMarks, 1)} (${pct}%) — full marks.`
          : `Scored ${round(totalScore, 1)}/${round(totalMarks, 1)} (${pct}%), losing ${round(lostTotal, 1)} mark(s).`,
  };
}

/**
 * One grade for the whole sitting: the MCQ part marked here, plus — on a hybrid
 * paper — the written part as the course API marked it from the scan.
 */
export function combinedChallengeGrade(input: {
  attemptId: string;
  subject: string;
  passMarks: number;
  choices: GradedItem[];
  written?: TeacherChallengeGradeResponse | null;
}): TeacherChallengeGradeResponse {
  const written = (input.written?.results || []).map((result) => ({
    question_id: result.question_id,
    topic: result.topic || "",
    question: result.question,
    marks: Number(result.marks) || 0,
    score: Number(result.score) || 0,
    student_answer: result.student_answer || "[Handwritten answer]",
    feedback: result.feedback,
    answered: true,
  }));
  const items = [...input.choices, ...written];
  const evaluation = evaluateByTopic(items);
  const totalScore = evaluation.total_score;
  const totalMarks = evaluation.total_marks;
  return {
    attempt_id: input.attemptId,
    subject: input.subject,
    results: items.map((item) => ({
      question_id: item.question_id,
      topic: item.topic,
      question: item.question,
      marks: item.marks,
      student_answer: item.student_answer,
      score: item.score,
      feedback: item.feedback,
    })),
    total_score: totalScore,
    total_marks: totalMarks,
    percentage: totalMarks > 0 ? (totalScore / totalMarks) * 100 : 0,
    pass_marks: input.passMarks,
    passed: totalScore >= input.passMarks,
    graded: input.written ? input.written.graded : true,
    stored: false,
    evaluation,
  };
}

/** The multiple-choice questions of a stored sitting, in paper order. */
export function choiceQuestionsOf(
  questions: Array<{ id: string; question: string; topic: string; marks: number; questionType: string; options?: ChallengeChoiceOption[]; answerCheck?: string }>,
): ChallengeChoiceQuestion[] {
  return questions.filter(
    (question): question is ChallengeChoiceQuestion =>
      Array.isArray(question.options) && question.options.length > 0 && Boolean(question.answerCheck),
  );
}

/** A browser's `{questionId: "B"}` map, cleaned: unknown ids and non-letters dropped. */
export function parseChoiceSelections(value: unknown, questions: ChallengeChoiceQuestion[]) {
  const record = value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
  const selections: Record<string, string> = {};
  for (const question of questions) {
    const chosen = String(record[question.id] ?? "").trim().toUpperCase();
    if (question.options.some((option) => option.key === chosen)) selections[question.id] = chosen;
  }
  return selections;
}
