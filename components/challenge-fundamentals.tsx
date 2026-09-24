"use client";

import { Check, ChevronRight, Loader2, Play, RotateCcw, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { MathText } from "@/components/math-text";
import type {
  FundamentalsExplainer,
  FundamentalsQuestion,
  FundamentalsResult,
} from "@/lib/data/challenge-fundamentals";
import { cn } from "@/lib/utils";

/**
 * Step one's FUNDAMENTALS CHECK: five MCQs on the challenge's micro-topic.
 *
 * One question at a time, in one card, so five of them do not push the worked
 * examples a screen down. Answering is final and instant to read: the key is
 * fetched only once an option is chosen (`/fundamentals/check`), and a wrong
 * answer is shown the correct option — which one, not a paragraph on why theirs
 * was wrong. The why is a short video, made on request for that exact answer.
 */

type Load =
  | { status: "loading" }
  | { status: "ready"; questions: FundamentalsQuestion[] }
  | { status: "error"; message: string };

const optionBase =
  "flex min-h-11 w-full items-start gap-3 rounded-lg border px-3 py-2.5 text-left text-sm leading-6 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500";

export function ChallengeFundamentals({ challengeId, className }: { challengeId: string; className?: string }) {
  const [load, setLoad] = useState<Load>({ status: "loading" });
  const [index, setIndex] = useState(0);
  const [results, setResults] = useState<Record<string, FundamentalsResult>>({});
  const [checking, setChecking] = useState<string | null>(null);
  const [checkError, setCheckError] = useState("");
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoad({ status: "loading" });
    (async () => {
      try {
        const response = await fetch(`/api/student/challenges/${encodeURIComponent(challengeId)}/fundamentals`);
        const payload = (await response.json().catch(() => ({}))) as {
          questions?: FundamentalsQuestion[];
          error?: string;
        };
        if (cancelled) return;
        if (!response.ok || !payload.questions) {
          setLoad({ status: "error", message: payload.error || "The fundamentals check couldn't be set right now." });
          return;
        }
        setLoad({ status: "ready", questions: payload.questions });
      } catch {
        if (!cancelled) setLoad({ status: "error", message: "Couldn't reach NanoSyllabus." });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [challengeId, attempt]);

  const answer = useCallback(
    async (question: FundamentalsQuestion, selected: string) => {
      setChecking(selected);
      setCheckError("");
      try {
        const response = await fetch(
          `/api/student/challenges/${encodeURIComponent(challengeId)}/fundamentals/check`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ questionId: question.id, selected }),
          },
        );
        const payload = (await response.json().catch(() => ({}))) as {
          result?: FundamentalsResult;
          error?: string;
          changed?: boolean;
        };
        if (payload.changed) {
          // Re-set upstream since this page loaded: start again on the new set.
          setResults({});
          setIndex(0);
          setAttempt((value) => value + 1);
          return;
        }
        if (!response.ok || !payload.result) {
          setCheckError(payload.error || "That answer couldn't be checked. Try again.");
          return;
        }
        const result = payload.result;
        setResults((current) => ({ ...current, [question.id]: result }));
      } catch {
        setCheckError("Couldn't reach NanoSyllabus. Try again.");
      } finally {
        setChecking(null);
      }
    },
    [challengeId],
  );

  if (load.status === "error") {
    return (
      <section className={cn("rounded-xl border border-border bg-bg-secondary p-4 sm:p-5", className)}>
        <h2 className="type-student-section-title">Fundamentals check</h2>
        <p className="mt-2 text-sm text-text-secondary">{load.message}</p>
        <button
          type="button"
          onClick={() => setAttempt((value) => value + 1)}
          className="mt-3 inline-flex min-h-10 items-center gap-2 rounded-lg border border-border px-3 text-sm font-semibold hover:bg-bg-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
        >
          <RotateCcw className="size-4" aria-hidden="true" />
          Try again
        </button>
      </section>
    );
  }

  if (load.status === "loading") {
    return (
      <section
        className={cn("rounded-xl border border-border bg-bg-secondary p-4 sm:p-5", className)}
        aria-busy="true"
      >
        <h2 className="type-student-section-title">Fundamentals check</h2>
        <div className="mt-4 h-4 w-4/5 animate-pulse rounded bg-border motion-reduce:animate-none" />
        <div className="mt-4 space-y-2">
          {[0, 1, 2, 3].map((row) => (
            <div key={row} className="h-11 animate-pulse rounded-lg bg-border motion-reduce:animate-none" />
          ))}
        </div>
      </section>
    );
  }

  const { questions } = load;
  if (!questions.length) return null;
  const finished = index >= questions.length;
  const correctCount = questions.filter((question) => results[question.id]?.isCorrect).length;

  return (
    <section className={cn("rounded-xl border border-border bg-bg-secondary p-4 sm:p-5", className)}>
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="type-student-section-title">Fundamentals check</h2>
        <span className="text-xs text-text-muted">
          {finished ? `${correctCount} of ${questions.length} right` : `${index + 1} of ${questions.length}`}
        </span>
      </div>
      <ol className="mt-3 flex gap-1.5" aria-label="Progress">
        {questions.map((question, position) => {
          const result = results[question.id];
          return (
            <li
              key={question.id}
              aria-label={`Question ${position + 1}: ${result ? (result.isCorrect ? "right" : "wrong") : "not answered"}`}
              className={cn(
                "h-1.5 flex-1 rounded-full",
                result ? (result.isCorrect ? "bg-success" : "bg-destructive") : "bg-border",
                position === index && !result ? "bg-blue-500" : "",
              )}
            />
          );
        })}
      </ol>

      {finished ? (
        <div className="mt-4">
          <p className="text-sm text-text-secondary">
            {correctCount === questions.length
              ? "Every one right. The basics are solid — the worked examples below build on them."
              : "Go back over the ones you missed before the worked examples below."}
          </p>
          <button
            type="button"
            onClick={() => {
              setResults({});
              setIndex(0);
            }}
            className="mt-3 inline-flex min-h-10 items-center gap-2 rounded-lg border border-border px-3 text-sm font-semibold hover:bg-bg-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
          >
            <RotateCcw className="size-4" aria-hidden="true" />
            Try again
          </button>
        </div>
      ) : (
        <Question
          key={questions[index].id}
          challengeId={challengeId}
          question={questions[index]}
          result={results[questions[index].id]}
          checking={checking}
          checkError={checkError}
          onAnswer={(selected) => void answer(questions[index], selected)}
          onNext={() => setIndex((value) => value + 1)}
          last={index === questions.length - 1}
        />
      )}
    </section>
  );
}

function Question({
  challengeId,
  question,
  result,
  checking,
  checkError,
  onAnswer,
  onNext,
  last,
}: {
  challengeId: string;
  question: FundamentalsQuestion;
  result: FundamentalsResult | undefined;
  checking: string | null;
  checkError: string;
  onAnswer: (selected: string) => void;
  onNext: () => void;
  last: boolean;
}) {
  const answered = Boolean(result);
  return (
    <div className="mt-4">
      <MathText as="div" text={question.text} className="text-[15px] font-semibold leading-6 text-text-primary" />
      <ul className="mt-3 space-y-2">
        {question.options.map((option) => {
          const isCorrect = result?.correct === option.key;
          const isChosenWrong = result && result.selected === option.key && !result.isCorrect;
          return (
            <li key={option.key}>
              <button
                type="button"
                disabled={answered || checking !== null}
                aria-pressed={result?.selected === option.key}
                onClick={() => onAnswer(option.key)}
                className={cn(
                  optionBase,
                  isCorrect
                    ? "border-success bg-success/10"
                    : isChosenWrong
                      ? "border-destructive bg-destructive/10"
                      : "border-border bg-bg-primary",
                  !answered && checking === null ? "hover:border-blue-500/60" : "",
                  answered && !isCorrect && !isChosenWrong ? "opacity-60" : "",
                  checking === option.key ? "animate-pulse motion-reduce:animate-none" : "",
                )}
              >
                <span
                  className={cn(
                    "grid size-6 shrink-0 place-items-center rounded-full border text-xs font-semibold",
                    isCorrect
                      ? "border-success bg-success text-white"
                      : isChosenWrong
                        ? "border-destructive bg-destructive text-white"
                        : "border-border text-text-secondary",
                  )}
                >
                  {isCorrect ? (
                    <Check className="size-3.5" strokeWidth={3} aria-hidden="true" />
                  ) : isChosenWrong ? (
                    <X className="size-3.5" strokeWidth={3} aria-hidden="true" />
                  ) : (
                    option.key
                  )}
                  {/* The letter is still the option's name once an icon stands in for it. */}
                  {isCorrect || isChosenWrong ? <span className="sr-only">{option.key}</span> : null}
                </span>
                <MathText text={option.text} className="min-w-0 flex-1 text-text-primary" />
                {isCorrect ? (
                  <span className="sr-only">(correct answer)</span>
                ) : isChosenWrong ? (
                  <span className="sr-only">(your answer, incorrect)</span>
                ) : null}
              </button>
            </li>
          );
        })}
      </ul>
      {checkError ? <p className="mt-2 text-sm text-destructive">{checkError}</p> : null}

      {result ? (
        <div className="mt-4 space-y-3" aria-live="polite">
          {result.isCorrect ? (
            <p className="text-sm font-semibold text-success">Correct.</p>
          ) : (
            <div className="rounded-lg border border-success/40 bg-success/10 p-3">
              <p className="text-sm font-semibold text-success">Correct answer: {result.correct}</p>
              <MathText as="div" text={result.correctText} className="mt-0.5 text-sm text-text-primary" />
              {result.explanation ? (
                <MathText as="div" text={result.explanation} className="mt-1.5 text-xs leading-5 text-text-secondary" />
              ) : null}
            </div>
          )}
          {result.isCorrect ? null : (
            <Explainer challengeId={challengeId} questionId={question.id} selected={result.selected} />
          )}
          <div className="flex justify-end">
            <button
              type="button"
              onClick={onNext}
              className="inline-flex min-h-10 items-center gap-1.5 rounded-lg bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
            >
              {last ? "See how you did" : "Next question"}
              <ChevronRight className="size-4" aria-hidden="true" />
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

type Stage = "starting" | "queued" | "planning" | "rendering" | "finishing";

type Video =
  | { status: "idle" }
  | { status: "making"; stage: Stage; poster?: string }
  | { status: "ready"; mp4: string; poster?: string }
  | { status: "error"; message: string };

const POLL_MS = 2500;
/** A 12-second render is about a minute; past this it is not coming. */
const GIVE_UP_MS = 6 * 60_000;

/** What the render is doing, in words — so a wait reads as progress. */
const STAGE_TEXT: Record<Stage, string> = {
  starting: "Starting",
  queued: "Waiting for a free slot",
  planning: "Planning the explanation",
  rendering: "Drawing the animation",
  finishing: "Putting the video together",
};
/** Where the bar starts for each stage; it creeps on from there with time. */
const STAGE_FLOOR: Record<Stage, number> = { starting: 4, queued: 8, planning: 18, rendering: 45, finishing: 75 };

function stageOf(status: string | undefined, poster: string | undefined): Stage {
  if (poster) return "finishing";
  if (status === "rendering") return "rendering";
  if (status === "planning") return "planning";
  if (status === "queued") return "queued";
  return "starting";
}

/** Faint behind the spinner: a first frame shown plainly looked like the video. */
function LoadingFrame({ poster, title, detail, progress }: { poster?: string; title: string; detail: string; progress?: number }) {
  return (
    <div className="relative aspect-video overflow-hidden rounded-lg border border-border bg-bg-primary">
      {poster ? (
        // eslint-disable-next-line @next/next/no-img-element -- a same-origin render frame, not a layout image
        <img src={poster} alt="" className="absolute inset-0 h-full w-full object-contain opacity-20" />
      ) : null}
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 px-4 text-center">
        <Loader2
          className="size-8 animate-spin text-blue-600 motion-reduce:animate-none dark:text-blue-400"
          aria-hidden="true"
        />
        <p className="text-sm font-semibold text-text-primary">{title}</p>
        <p className="text-xs text-text-secondary">{detail}</p>
      </div>
      {progress !== undefined ? (
        <div className="absolute inset-x-0 bottom-0 h-1 bg-border">
          <div
            className="h-full bg-blue-600 transition-[width] duration-700 ease-out motion-reduce:transition-none dark:bg-blue-400"
            style={{ width: `${progress}%` }}
          />
        </div>
      ) : null}
    </div>
  );
}

/**
 * The why, as a short video made for this answer — only when the student asks
 * for it. Generated then, never ahead of time, never shared with another
 * student's identical answer; polled at `/api/media/<hash>` until the mp4 lands.
 *
 * The wait is said as a wait. Showing the first frame on its own while the mp4
 * rendered read as "it says video, why only an image" — so until the video can
 * actually play, it is a loading state with the step it is on and the seconds
 * it has taken, and the frame is only a faint hint behind it.
 */
/**
 * "Why? Understand it with a video" under a wrong answer. `endpoint` is where the
 * render is asked for: the fundamentals check's route by default, or an MCQ
 * community paper's (`/choices/explain`), which reads the recorded pick itself.
 */
export function Explainer({
  challengeId,
  questionId,
  selected,
  endpoint,
}: {
  challengeId: string;
  questionId: string;
  selected: string;
  endpoint?: string;
}) {
  const [video, setVideo] = useState<Video>({ status: "idle" });
  const [specHash, setSpecHash] = useState("");
  const [startedAt, setStartedAt] = useState(0);
  const [now, setNow] = useState(0);
  const [playable, setPlayable] = useState(false);
  const making = video.status === "making";

  useEffect(() => {
    if (!making) return;
    const tick = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(tick);
  }, [making]);

  useEffect(() => {
    if (!specHash) return;
    let cancelled = false;
    let timer: number | undefined;
    const started = Date.now();
    const poll = async () => {
      try {
        const response = await fetch(`/api/media/${specHash}`, { cache: "no-store" });
        if (cancelled) return;
        if (response.status === 404) {
          setVideo({ status: "error", message: "The video was lost on the way. Try making it again." });
          return;
        }
        const state = (await response.json().catch(() => null)) as {
          status?: string;
          derivatives?: FundamentalsExplainer["derivatives"];
        } | null;
        if (cancelled) return;
        if (state?.derivatives?.mp4) {
          setVideo({ status: "ready", mp4: state.derivatives.mp4, poster: state.derivatives.poster });
          return;
        }
        if (state?.status === "failed") {
          setVideo({ status: "error", message: "This one couldn't be animated. The correct answer above still stands." });
          return;
        }
        setVideo({
          status: "making",
          stage: stageOf(state?.status, state?.derivatives?.poster),
          poster: state?.derivatives?.poster,
        });
      } catch {
        /* one failed poll is not a failed video */
      }
      if (Date.now() - started > GIVE_UP_MS) {
        setVideo({ status: "error", message: "The video is taking too long. Try again in a little while." });
        return;
      }
      timer = window.setTimeout(() => void poll(), POLL_MS);
    };
    void poll();
    return () => {
      cancelled = true;
      if (timer) window.clearTimeout(timer);
    };
  }, [specHash]);

  const make = async () => {
    setStartedAt(Date.now());
    setNow(Date.now());
    setPlayable(false);
    setVideo({ status: "making", stage: "starting" });
    try {
      const response = await fetch(
        endpoint ?? `/api/student/challenges/${encodeURIComponent(challengeId)}/fundamentals/explain`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ questionId, selected }),
        },
      );
      const payload = (await response.json().catch(() => ({}))) as {
        explainer?: FundamentalsExplainer;
        error?: string;
      };
      if (!response.ok || !payload.explainer?.specHash) {
        setVideo({ status: "error", message: payload.error || "The video couldn't be started." });
        return;
      }
      setSpecHash(payload.explainer.specHash);
    } catch {
      setVideo({ status: "error", message: "Couldn't reach NanoSyllabus." });
    }
  };

  if (video.status === "idle" || video.status === "error") {
    return (
      <div>
        <button
          type="button"
          onClick={() => void make()}
          className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-border bg-bg-primary px-3 text-sm font-semibold hover:border-blue-500/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
        >
          <Play className="size-4 text-blue-600 dark:text-blue-400" aria-hidden="true" />
          {video.status === "error" ? "Try the video again" : "Why? Understand it with a video"}
        </button>
        {video.status === "error" ? <p className="mt-2 text-xs text-text-secondary">{video.message}</p> : null}
      </div>
    );
  }

  if (video.status === "making") {
    const seconds = Math.max(0, Math.round((now - startedAt) / 1000));
    const progress = Math.min(95, STAGE_FLOOR[video.stage] + Math.min(20, seconds / 2));
    return (
      <div className="mx-auto w-full max-w-xl" role="status" aria-live="polite" aria-busy="true">
        <LoadingFrame
          poster={video.poster}
          title="Loading your video…"
          detail={`${STAGE_TEXT[video.stage]} · ${seconds}s`}
          progress={progress}
        />
        <p className="mt-2 text-xs text-text-secondary">
          Please wait — a short video is being made for this answer. It usually takes under a minute.
        </p>
      </div>
    );
  }

  return (
    <div className="relative mx-auto w-full max-w-xl">
      <video
        src={video.mp4}
        poster={video.poster}
        controls
        autoPlay
        muted
        playsInline
        preload="auto"
        onCanPlay={() => setPlayable(true)}
        className="block aspect-video w-full rounded-lg border border-border bg-black"
      />
      {/* Made, but not yet downloaded far enough to play: still a wait. */}
      {playable ? null : (
        <div className="absolute inset-0" role="status" aria-live="polite">
          <LoadingFrame poster={video.poster} title="Loading your video…" detail="Almost there" />
        </div>
      )}
    </div>
  );
}
