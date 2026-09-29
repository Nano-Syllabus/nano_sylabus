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

/** Long enough for one idea and its first step; short enough that it stays a hint. */
const VIDEO_SECONDS = 15;
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

/**
 * HINTS, NOT ANSWERS (2026-09-29). Both videos give away only about 30% of the
 * way to the answer — the idea the question rests on and the first move — and
 * then hand the rest to the student. A video that walks the whole solution is
 * one the student watches instead of thinking; a nudge is one they finish.
 *
 * These lines lead the planner's `notes` because the renderer's own brief tells
 * it to "answer" the concept and to close by answering its hook.
 */
const HINT_RULES = [
  "THIS VIDEO IS A HINT, NOT A SOLUTION. Never state the answer on screen or in the narration: no option letter, no option text, no final value, nothing a student could copy.",
  "Give only about 30% of the way to the answer: the one idea the question rests on and the FIRST step of using it. Stop there. Do not carry the working through, do not reach a result, do not show the last steps.",
  "Make it intuitive before it is formal: open on a picture, an everyday analogy or a tiny example the eye can follow, then name the idea in one plain sentence.",
  'End by handing the next step to the student — one short line such as "Now try that on the question" or a question that points where to look — instead of closing with a conclusion.',
];

const STYLE_RULES = [
  "Plain words a first-year student understands. Define a symbol the moment it appears. Short on-screen text, large and readable.",
  "Three beats, one idea each. No quiz, no recap, no title card, no 'in this video'.",
];

/** The request for a question's video. Exported for the test that pins it. */
export function questionVideoSpec(subject: string, question: QuestionVideoQuestion) {
  const correctText = question.options.find((option) => option.key === question.correct)?.text ?? "";
  const topic = subjectWords(subject);
  return {
    concept: clip(`A hint (never the answer) that nudges a student toward: ${question.text}`, 200),
    subject: clip(topic, 120),
    notes: clip(
      [
        ...HINT_RULES,
        `A student revising ${topic || "their course"} got this multiple-choice question wrong and wants a nudge, not the full working.`,
        `Question: ${question.text}`,
        `Options: ${question.options.map((option) => `${option.key}) ${option.text}`).join("  ")}`,
        // Given so the planner steers the right way — it must never be shown.
        `Correct answer (for your direction only, never show or say it): ${question.correct}) ${correctText}`,
        question.explanation ? `Why it is correct (for your direction only): ${question.explanation}` : "",
        `Make the nudge clear within ${VIDEO_SECONDS + 2} seconds:`,
        "1. Show the slip that makes the most tempting wrong choice look right, as a picture or tiny example — without naming the option or its value.",
        "2. Show the idea that fixes it and take the FIRST step of the right reasoning, on a different small example rather than this question's own values.",
        "3. Hand the student the rest: point at what to check next in the question, and stop.",
        ...STYLE_RULES,
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
 * The solution video above knows the answer, so it stays locked until the
 * question is answered. The hint is built from the question text alone — never
 * the options, the key or the explanation — so there is nothing in its request
 * that could give the answer away, and it is safe to hand out on an open
 * question. Like the solution, it is a pure function of the question, so one
 * render serves the whole cohort.
 */
export function questionHintSpec(subject: string, question: Pick<QuestionVideoQuestion, "text">) {
  const topic = subjectWords(subject);
  return {
    concept: clip(`A hint (never the answer) for the first step of: ${question.text}`, 200),
    subject: clip(topic, 120),
    notes: clip(
      [
        ...HINT_RULES,
        `A student revising ${topic || "their course"} is about to answer this multiple-choice question and wants a hint first.`,
        `Question: ${question.text}`,
        "Do NOT answer the question, do NOT solve it, do NOT state or imply the final result, and do NOT mention any option.",
        `Make the hint clear within ${VIDEO_SECONDS + 2} seconds:`,
        "1. Open on the core idea as a picture, analogy or tiny worked number — something the student already knows.",
        "2. Show the FIRST step of applying it, on a different small example (not this question's own values or wording).",
        "3. Point at what to look for in this question next, and stop — the student works out the rest.",
        ...STYLE_RULES,
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
