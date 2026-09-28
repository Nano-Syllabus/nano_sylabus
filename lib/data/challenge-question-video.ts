import { after } from "next/server";
import { requestTeacherExplainerAnimation } from "@/lib/teacher-app/client";

/**
 * THE VIDEO FOR ONE MCQ — one per question, shared by everyone who gets it.
 *
 * It used to be one per WRONG ANSWER, rendered on the click and never reused
 * ("fresh"): every student waited through a full render, and two students who
 * slipped the same way paid for two. Now the video explains the QUESTION — the
 * idea behind the right option and the slip behind the most tempting wrong one —
 * so its spec is built from the question alone. Same question, same spec, same
 * hash, and the render service hands back the one already made (or already
 * building). Exam sets are cached per topic and variant upstream, so a topic's
 * questions recur across a whole cohort and so do their videos.
 *
 * Every input here must be a pure function of the question: anything per-student
 * (their pick, their name, the time) would split the cache back into one render
 * per student.
 *
 * Made AHEAD: when a paper is issued, `prepareQuestionVideos` queues every
 * question's hint and video in the background, so by the time a student gets one wrong it
 * is usually ready. A student asking for one marks it `urgent`, which moves it
 * to the front if it is still waiting.
 *
 * The spec hash is never sent to the browser before the question is answered:
 * the video teaches the answer, so a hash on an open question would be a key.
 */

export type QuestionVideoQuestion = {
  text: string;
  options: Array<{ key: string; text: string }>;
  correct: string;
  explanation: string;
};

export type QuestionVideo = {
  specHash: string;
  status: string;
  derivatives: Partial<Record<"poster" | "gif" | "mp4", string>>;
  error: string;
};

/** Long enough to teach one idea with one example; short enough to watch. */
const VIDEO_SECONDS = 18;
/** Requests to the course API at once while preparing a paper's videos. The
 *  renderer queues and plans in parallel itself; this only bounds our fan-out. */
const PREPARE_CONCURRENCY = 4;

function clip(text: string, limit: number) {
  const clean = text.replace(/\s+\n/g, "\n").trim();
  return clean.length <= limit ? clean : `${clean.slice(0, limit - 1).trimEnd()}…`;
}

/** A subject slug read as words, for the planner ("digital-logic" → "digital logic"). */
function subjectWords(subject: string) {
  return subject.replace(/[-_]+/g, " ").replace(/\s+/g, " ").trim();
}

/** The request for a question's video. Exported for the test that pins it. */
export function questionVideoSpec(subject: string, question: QuestionVideoQuestion) {
  const correctText = question.options.find((option) => option.key === question.correct)?.text ?? "";
  const topic = subjectWords(subject);
  return {
    concept: clip(`The principle that decides this question (never state its answer): ${question.text}`, 200),
    subject: clip(topic, 120),
    notes: clip(
      [
        // First, because the renderer's own brief says to "answer" the concept.
        "NEVER state the answer on screen or in the narration: no option letter, no option text, no final value for this question. The student sees the correct option on the page; the video teaches the reasoning that gets there, and the hook and last beat are about the principle, not this question's result.",
        `A student revising ${topic || "their course"} met this multiple-choice question.`,
        `Question: ${question.text}`,
        `Options: ${question.options.map((option) => `${option.key}) ${option.text}`).join("  ")}`,
        `Correct answer: ${question.correct}) ${correctText}`,
        question.explanation ? `Why it is correct: ${question.explanation}` : "",
        `Teach it so the idea is clear within ${VIDEO_SECONDS + 2} seconds:`,
        "1. Open straight on the core idea in one plain sentence, shown as a picture, diagram or small worked number — no title card.",
        "2. Make it concrete with ONE example the eye can follow step by step.",
        "3. Show the reasoning that leads to the right choice, and the slip that makes the most tempting wrong choice look right — without naming either option or its value.",
        "Plain words a first-year student understands. Define a symbol the moment it appears. Short on-screen text, large and readable.",
        "Three or four beats, one idea each. No quiz, no recap, no 'in this video'.",
      ]
        .filter(Boolean)
        .join("\n"),
      2000,
    ),
    seconds: VIDEO_SECONDS,
    style: "card" as const,
  };
}

/**
 * THE HINT — the video a student may watch BEFORE answering (2026-09-28).
 *
 * The solution video above teaches the answer, so it stays locked until the
 * question is answered. The hint teaches only the idea the question rests on:
 * it is built from the question text alone — never the options, the key or the
 * explanation — so there is nothing in its request that could give the answer
 * away, and it is safe to hand out on an open question. Like the solution, it is
 * a pure function of the question, so one render serves the whole cohort.
 */
export function questionHintSpec(subject: string, question: Pick<QuestionVideoQuestion, "text">) {
  const topic = subjectWords(subject);
  return {
    concept: clip(`The principle a student needs for this question (never answer it): ${question.text}`, 200),
    subject: clip(topic, 120),
    notes: clip(
      [
        // First, because the renderer's own brief says to "answer" the concept.
        "NEVER answer this question, on screen or in the narration: no final value, no result, nothing a student could copy as the answer. The hook and the last beat are about the general principle, not this question.",
        `A student revising ${topic || "their course"} is about to answer this multiple-choice question and wants to learn the idea first.`,
        `Question: ${question.text}`,
        "This is a HINT, watched BEFORE answering. Do NOT answer the question, do NOT solve it, do NOT state or imply the final result, and do NOT mention any option.",
        `Teach the underlying concept so it is clear within ${VIDEO_SECONDS + 2} seconds:`,
        "1. Open straight on the core idea in one plain sentence, shown as a picture, diagram or small worked number — no title card.",
        "2. Make it concrete with ONE different example (not this question's own values or wording) the eye can follow step by step.",
        "3. End on what to look for in a question like this one, leaving the student to work out the answer.",
        "Plain words a first-year student understands. Define a symbol the moment it appears. Short on-screen text, large and readable.",
        "Three or four beats, one idea each. No quiz, no recap, no 'in this video'.",
      ].join("\n"),
      2000,
    ),
    seconds: VIDEO_SECONDS,
    style: "card" as const,
  };
}

export async function requestQuestionHint(
  scope: { collectionKey: string; subject: string },
  question: Pick<QuestionVideoQuestion, "text">,
  priority: "urgent" | "background",
): Promise<QuestionVideo> {
  const reply = await requestTeacherExplainerAnimation(scope.collectionKey, {
    ...questionHintSpec(scope.subject, question),
    priority,
  });
  return {
    specHash: reply.spec_hash,
    status: reply.status,
    derivatives: reply.derivatives || {},
    error: reply.error || "",
  };
}

export async function requestQuestionVideo(
  scope: { collectionKey: string; subject: string },
  question: QuestionVideoQuestion,
  priority: "urgent" | "background",
): Promise<QuestionVideo> {
  if (!question.options.some((option) => option.key === question.correct)) {
    throw new RangeError("This question has no answer to explain.");
  }
  const reply = await requestTeacherExplainerAnimation(scope.collectionKey, {
    ...questionVideoSpec(scope.subject, question),
    priority,
  });
  return {
    specHash: reply.spec_hash,
    status: reply.status,
    derivatives: reply.derivatives || {},
    error: reply.error || "",
  };
}

/**
 * Queue a paper's videos behind the response that issued it. Never throws and
 * never delays the paper: a video not prepared is made when it is asked for.
 * The render service declines background work first when it is busy, which is
 * that fallback working as intended.
 */
export function prepareQuestionVideos(
  scope: { collectionKey: string; subject: string },
  questions: QuestionVideoQuestion[],
) {
  if (!questions.length) return;
  const work = async () => {
    // Hints first: they are watched before answering, the solutions only after.
    const queue: Array<() => Promise<unknown>> = [
      ...questions.map((question) => () => requestQuestionHint(scope, question, "background")),
      ...questions.map((question) => () => requestQuestionVideo(scope, question, "background")),
    ];
    const lane = async () => {
      for (let job = queue.shift(); job; job = queue.shift()) {
        await job().catch(() => null);
      }
    };
    await Promise.all(Array.from({ length: Math.min(PREPARE_CONCURRENCY, queue.length) }, lane));
  };
  try {
    // After the response when there is one, so the paper is not held for it...
    after(work);
  } catch {
    // ...and straight away when this runs outside a request (a background build).
    void work().catch(() => undefined);
  }
}
