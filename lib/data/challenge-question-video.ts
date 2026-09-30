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

/**
 * The CEILING, not the length (user, 2026-09-29): a memory video is as short as
 * makes the idea clear — the renderer's planner picks 10-30s and aims for 12-20.
 */
const VIDEO_SECONDS = 30;
/** Requests to the course API at once while preparing a paper's videos. The
 *  renderer queues and plans in parallel itself; this only bounds our fan-out. */
const PREPARE_CONCURRENCY = 4;

function clip(text: string, limit: number) {
  const clean = text.replace(/\s+\n/g, "\n").trim();
  return clean.length <= limit ? clean : `${clean.slice(0, limit - 1).trimEnd()}…`;
}

/**
 * A subject slug read as words, for the planner and the video's corner chip.
 * A creator's subject slug carries their collection in front of it
 * ("9165prashant_a9973_teacher_project_planning_…"), which the video printed
 * as its subject; only the part after `_teacher_` is the subject's name.
 */
export function subjectWords(subject: string) {
  const name = subject.includes("_teacher_") ? subject.slice(subject.indexOf("_teacher_") + 9) : subject;
  return name.replace(/[-_]+/g, " ").replace(/\s+/g, " ").trim();
}

/**
 * MEMORY VIDEOS (user, 2026-09-29). Both videos are pre-recorded visual hints
 * for the MCQ game, planned in the renderer's `memory` mode: a concept brief
 * first (key terms, core idea, the one object that changes, a memory line),
 * the object animated cause-to-effect in place, and a still recall card to end
 * on. The rules for that live in the renderer (ioevid prompts.MEMORY_BRIEF);
 * these lines only restate the two that must never slip, and give the inputs.
 */
const HINT_RULES = [
  "THIS VIDEO IS A HINT, NOT A SOLUTION. Never read out the question, never mention or discuss an option, never show an option letter, and never state or imply the correct answer — no 'therefore the answer is'.",
  "Teach the one foundational idea a beginner needs to try the question again, defining the key terms through the visual. The student makes the final connection.",
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
        `Subject and level: ${topic || "their course"}, first- or second-year engineering student, beginner on this topic. They got this multiple-choice question wrong and will try it again.`,
        `Question: ${question.text}`,
        `Options (context only — never shown, read or discussed): ${question.options.map((option) => `${option.key}) ${option.text}`).join("  ")}`,
        // Given so the planner checks its accuracy — it must never be shown.
        `Correct answer, for your internal accuracy check only (never show or say it): ${question.correct}) ${correctText}`,
        question.explanation ? `Why it is correct (for your accuracy check only): ${question.explanation}` : "",
        "Aim the visual at the misunderstanding that makes the most tempting wrong option look right, without naming that option.",
      ]
        .filter(Boolean)
        .join("\n"),
      2000,
    ),
    seconds: VIDEO_SECONDS,
    style: "card" as const,
    memory: true,
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
        `Subject and level: ${topic || "their course"}, first- or second-year engineering student, beginner on this topic. They are about to answer this multiple-choice question and want a hint first.`,
        `Question: ${question.text}`,
        "Do NOT answer the question, do NOT solve it, and do NOT state or imply the final result.",
      ].join("\n"),
      2000,
    ),
    seconds: VIDEO_SECONDS,
    style: "card" as const,
    memory: true,
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
