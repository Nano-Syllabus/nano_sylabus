"use client";

import { Check, ChevronRight, Loader2, PlayCircle, RotateCcw, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Markdown } from "@/components/markdown";
import type { ConceptActivity } from "@/lib/concept-activities";
import { cn } from "@/lib/utils";

/** A quick question the video stops on: one of the chapter's own checks. */
export type VideoCheckpoint = {
  /** The chapter's activity number, so answering here completes it there too. */
  number: number;
  activity: Extract<ConceptActivity, { kind: "choice" }>;
};

/*
 * "Watch the explainer": the topic as a ~90 second animated video, planned by
 * Claude and drawn by the manim renderer. Asked for on the first click; the
 * backend caches it by content, so after the first student it is instant.
 */

type State =
  | { kind: "idle" }
  | { kind: "asking" }
  | { kind: "preparing"; hash: string; since: number }
  | { kind: "ready"; video: string; poster: string | null }
  | { kind: "error"; message: string };

type Reply = {
  explainer?: {
    hash: string;
    status: string;
    video: string | null;
    poster: string | null;
    error: string;
  };
  error?: string;
};

const POLL_MS = 4000;
const GIVE_UP_MS = 6 * 60_000;

export function ConceptExplainerVideo({
  challengeId,
  checkpoints = [],
  onAnswered,
  stage = false,
  waiting = false,
  onVideo,
  endAction,
}: {
  challengeId: string;
  checkpoints?: VideoCheckpoint[];
  /** A checkpoint answered correctly: complete the matching chapter activity. */
  onAnswered?: (number: number) => void;
  /**
   * The micro-topic player's first step: the video is the screen, so it is
   * asked for on mount (no Play card) and every state before it is ready is a
   * 16:9 placeholder where the picture will be.
   */
  stage?: boolean;
  /** Stage only: the reading the video is made from is still being written. */
  waiting?: boolean;
  /** The playing element, for controls outside the video (the step bar). */
  onVideo?: (video: HTMLVideoElement | null) => void;
  /** Stage only: the end card's way on. The video never takes it by itself. */
  endAction?: { label: string; onClick: () => void };
}) {
  const [state, setState] = useState<State>({ kind: "idle" });
  const timer = useRef<number>(0);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  // While it is being made: ask the media proxy for the job's status.
  useEffect(() => {
    if (state.kind !== "preparing") return;
    let cancelled = false;
    const poll = async () => {
      try {
        const response = await fetch(`/api/media/${state.hash}`, { cache: "no-store" });
        const job = (await response.json().catch(() => ({}))) as {
          status?: string;
          derivatives?: { mp4?: string; poster?: string };
          error?: string;
        };
        if (cancelled) return;
        if (job.derivatives?.mp4) {
          setState({
            kind: "ready",
            video: `/api/media/${state.hash}/animation.mp4`,
            poster: job.derivatives.poster ? `/api/media/${state.hash}/poster.png` : null,
          });
          return;
        }
        if (job.status === "failed" || job.status === "error") {
          setState({
            kind: "error",
            message: "The explainer couldn't be made for this topic. Try again later.",
          });
          return;
        }
      } catch {
        /* A dropped poll is not news; the next one asks again. */
      }
      if (cancelled) return;
      if (Date.now() - state.since > GIVE_UP_MS) {
        setState({
          kind: "error",
          message: "The explainer is taking longer than usual. Open it again in a few minutes.",
        });
        return;
      }
      timer.current = window.setTimeout(() => void poll(), POLL_MS);
    };
    timer.current = window.setTimeout(() => void poll(), POLL_MS);
    return () => {
      cancelled = true;
      window.clearTimeout(timer.current);
    };
  }, [state]);

  const ask = async () => {
    setState({ kind: "asking" });
    try {
      const response = await fetch(
        `/api/student/challenges/${encodeURIComponent(challengeId)}/explainer`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ priority: "urgent" }),
        },
      );
      const payload = (await response.json().catch(() => ({}))) as Reply;
      const explainer = payload.explainer;
      if (!response.ok || !explainer) {
        setState({
          kind: "error",
          message: payload.error || "The explainer couldn't be prepared. Try again.",
        });
        return;
      }
      if (explainer.video)
        setState({ kind: "ready", video: explainer.video, poster: explainer.poster });
      else setState({ kind: "preparing", hash: explainer.hash, since: Date.now() });
    } catch {
      setState({ kind: "error", message: "Couldn't reach NanoSyllabus. Try again." });
    }
  };

  // On the stage the video is asked for as soon as there is a reading to make
  // it from; once per challenge, so an error waits for "Try again".
  const autoAsked = useRef("");
  useEffect(() => {
    if (!stage || waiting || autoAsked.current === challengeId) return;
    autoAsked.current = challengeId;
    void ask();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per challenge
  }, [stage, waiting, challengeId]);

  if (state.kind === "ready") {
    return (
      <QuizVideo
        video={state.video}
        poster={state.poster}
        checkpoints={checkpoints.slice(0, 3)}
        onAnswered={onAnswered}
        onVideo={onVideo}
        endAction={endAction}
        stage={stage}
      />
    );
  }

  if (stage) {
    const busy = waiting || state.kind === "idle" || state.kind === "asking" || state.kind === "preparing";
    return (
      <div className="relative flex aspect-video w-full flex-col items-center justify-center gap-3 overflow-hidden rounded-xl bg-[#0f172a] p-6 text-center text-white">
        {busy ? (
          <Loader2 className="size-9 animate-spin text-white/80 motion-reduce:animate-none" aria-hidden="true" />
        ) : (
          <PlayCircle className="size-12 text-white/80" strokeWidth={1.4} aria-hidden="true" />
        )}
        <p aria-live="polite" className="text-base font-semibold sm:text-lg">
          {waiting
            ? "Writing this topic’s lesson…"
            : state.kind === "preparing"
              ? "Animating this topic for the first time"
              : state.kind === "error"
                ? state.message
                : "Getting the explainer ready…"}
        </p>
        <p className="max-w-md text-sm text-white/70">
          {waiting
            ? "The video is made from it, so it starts right after."
            : state.kind === "preparing"
              ? "It takes about a minute, and it is instant for everyone after you."
              : state.kind === "error"
                ? "You can still go on to the lab and the exam with Next."
                : "The idea, each part built up, and a worked example."}
        </p>
        {state.kind === "error" && !waiting ? (
          <button
            type="button"
            onClick={() => void ask()}
            className="mt-1 inline-flex min-h-10 items-center gap-2 rounded-lg bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-700"
          >
            Try again
          </button>
        ) : null}
        <span className="absolute bottom-3 right-4 flex items-center gap-1.5 opacity-80" aria-hidden="true">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/nano_logo.png" alt="" className="size-6" />
          <span className="text-lg leading-none">🗣️</span>
        </span>
      </div>
    );
  }

  return (
    <div className="mb-video flex flex-wrap items-center gap-4">
      <div className="min-w-0 flex-1">
        <p className="mb-ui text-base font-semibold">Watch the explainer</p>
        <p className="text-[15px] text-text-muted">
          {state.kind === "preparing"
            ? "Animating this topic for the first time. It takes about a minute, and it is instant for everyone after you."
            : state.kind === "error"
              ? state.message
              : "This topic as a 90-second animation: the idea, each part built up, and a worked example."}
        </p>
      </div>
      <button
        type="button"
        onClick={() => void ask()}
        disabled={state.kind === "asking" || state.kind === "preparing"}
        className="mb-ui inline-flex min-h-10 items-center gap-2 rounded-lg bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 disabled:cursor-wait disabled:opacity-70"
      >
        {state.kind === "asking" || state.kind === "preparing" ? (
          <Loader2 className="size-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />
        ) : (
          <PlayCircle className="size-4" aria-hidden="true" />
        )}
        {state.kind === "preparing" ? "Preparing…" : state.kind === "error" ? "Try again" : "Play"}
      </button>
    </div>
  );
}

const SPEEDS = [0.75, 1, 1.25] as const;

/**
 * The explainer with quiz checkpoints: playback stops at evenly spaced moments
 * and asks one of the chapter's questions over the picture. An answer is marked
 * at once, with the reason; "Continue" resumes. A right answer also completes
 * that question in the chapter below. Skipping is allowed: it is a nudge to
 * take part, not a gate.
 */
function QuizVideo({
  video,
  poster,
  checkpoints,
  onAnswered,
  onVideo,
  endAction,
  stage = false,
}: {
  video: string;
  poster: string | null;
  checkpoints: VideoCheckpoint[];
  onAnswered?: (number: number) => void;
  onVideo?: (video: HTMLVideoElement | null) => void;
  endAction?: { label: string; onClick: () => void };
  stage?: boolean;
}) {
  const [ended, setEnded] = useState(false);
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    onVideo?.(ref.current);
    return () => onVideo?.(null);
  }, [onVideo]);
  const panelRef = useRef<HTMLDivElement>(null);
  const [duration, setDuration] = useState(0);
  const [asking, setAsking] = useState<number | null>(null);
  const [passed, setPassed] = useState<number[]>([]);
  const [results, setResults] = useState<Record<number, boolean>>({});
  const [chosen, setChosen] = useState<number | null>(null);
  const [speed, setSpeed] = useState<(typeof SPEEDS)[number]>(1);
  // Evenly through the video, never in its first or last few seconds.
  const times = checkpoints.map((_, i) => (duration * (i + 1)) / (checkpoints.length + 1));

  useEffect(() => {
    if (ref.current) ref.current.playbackRate = speed;
  }, [speed]);

  // Bring the question into view when the video stops for it.
  useEffect(() => {
    if (asking !== null) panelRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [asking]);

  const onTime = () => {
    const el = ref.current;
    if (!el || asking !== null || !duration) return;
    const due = times.findIndex(
      (t, i) => !passed.includes(i) && el.currentTime >= t && el.currentTime < t + 1.5,
    );
    if (due >= 0) {
      el.pause();
      setChosen(null);
      setAsking(due);
    }
  };

  const resume = () => {
    if (asking === null) return;
    setPassed((p) => [...p, asking]);
    setAsking(null);
    void ref.current?.play();
  };

  const current = asking === null ? null : checkpoints[asking];
  const answered = Object.keys(results).length;
  const right = Object.values(results).filter(Boolean).length;

  return (
    <figure className="mb-video">
      <div className="relative">
        <video
          ref={ref}
          src={video}
          poster={poster ?? undefined}
          controls={asking === null && !ended}
          onEnded={() => setEnded(true)}
          onPlay={() => setEnded(false)}
          autoPlay
          playsInline
          preload="metadata"
          onLoadedMetadata={(e) => setDuration(e.currentTarget.duration || 0)}
          onTimeUpdate={onTime}
          onSeeked={() => {
            // Seeking back past a checkpoint asks it again; forward skips it.
            const at = ref.current?.currentTime ?? 0;
            setPassed((p) => p.filter((i) => times[i] < at));
          }}
          className={cn("aspect-video w-full bg-black", stage ? "rounded-xl" : "rounded-[4px]")}
        />
        {ended && endAction && asking === null ? (
          // The end card: the chapter is over, and only Next moves on.
          <div className={cn("absolute inset-0 flex flex-col items-center justify-center gap-4 bg-[#0f172a]/90 p-6 text-center text-white", stage ? "rounded-xl" : "rounded-[4px]")}>
            <p className="text-lg font-semibold sm:text-2xl">That’s the idea. Now try it yourself.</p>
            <p className="max-w-md text-sm text-white/75">Next is the lab: change the values and watch what happens.</p>
            <div className="flex flex-wrap justify-center gap-3">
              <button
                type="button"
                onClick={() => {
                  const el = ref.current;
                  if (!el) return;
                  el.currentTime = 0;
                  setPassed([]);
                  void el.play();
                }}
                className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-white/30 px-4 text-sm font-semibold text-white hover:bg-white/10"
              >
                <RotateCcw className="size-4" aria-hidden="true" /> Watch again
              </button>
              <button
                type="button"
                autoFocus
                onClick={endAction.onClick}
                className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-700"
              >
                {endAction.label} <ChevronRight className="size-4" aria-hidden="true" />
              </button>
            </div>
          </div>
        ) : null}
        {current && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center rounded-[4px] bg-black/55">
            <span className="mb-ui rounded-full bg-bg-primary px-3 py-1 text-sm font-semibold shadow">
              Paused for a quick check ↓
            </span>
          </div>
        )}
      </div>
      {current && (
        <div ref={panelRef} role="dialog" aria-label="Quick check" className="mt-3 scroll-mt-4">
          <div className="rounded-[6px] border-2 border-blue-600 bg-bg-primary p-4 sm:p-5">
            <p className="mb-ui text-xs font-semibold uppercase tracking-wide text-blue-700 dark:text-blue-300">
              Quick check {asking! + 1} of {checkpoints.length}
            </p>
            <Markdown
              text={current.activity.prompt || current.activity.title}
              className="mt-1 text-[16px] leading-[1.55]"
            />
            <div className="mt-3 grid gap-2">
              {current.activity.options.map((option, i) => {
                const isAnswer = i === current.activity.answer_index;
                const picked = chosen === i;
                return (
                  <button
                    key={i}
                    type="button"
                    disabled={chosen !== null}
                    onClick={() => {
                      setChosen(i);
                      setResults((r) => ({ ...r, [asking!]: isAnswer }));
                      if (isAnswer) onAnswered?.(current.number);
                    }}
                    className={cn(
                      "mb-ui flex items-center gap-2 rounded-lg border px-3 py-2 text-left text-[15px] disabled:cursor-default",
                      chosen !== null && isAnswer
                        ? "border-green-600 bg-green-500/10 dark:border-green-400"
                        : picked
                          ? "border-red-600 bg-red-500/10 dark:border-red-400"
                          : "border-border hover:bg-bg-tertiary",
                    )}
                  >
                    <span className="font-semibold text-text-muted">
                      {String.fromCharCode(65 + i)}
                    </span>
                    <Markdown text={option} className="flex-1 [&_p]:m-0" />
                    {chosen !== null && isAnswer && (
                      <Check className="size-4 text-green-600" aria-hidden="true" />
                    )}
                    {picked && !isAnswer && (
                      <X className="size-4 text-red-600" aria-hidden="true" />
                    )}
                  </button>
                );
              })}
            </div>
            {chosen !== null && (
              <div aria-live="polite" className="mt-3 text-[15px]">
                <p className="mb-ui font-semibold">
                  {chosen === current.activity.answer_index ? "Correct." : "Not quite."}
                </p>
                <Markdown text={current.activity.explanation} className="mt-1" />
              </div>
            )}
            <div className="mt-4 flex justify-end gap-2">
              {chosen === null && (
                <button
                  type="button"
                  onClick={resume}
                  className="mb-ui rounded-lg px-3 py-2 text-sm text-text-muted hover:bg-bg-tertiary"
                >
                  Skip
                </button>
              )}
              {chosen !== null && (
                <button
                  type="button"
                  autoFocus
                  onClick={resume}
                  className="mb-ui rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
                >
                  Continue the video
                </button>
              )}
            </div>
          </div>
        </div>
      )}
      <figcaption className="mb-ui mt-2 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-text-muted">
        {checkpoints.length > 0 && (
          <span aria-live="polite">
            Quick checks: {answered} of {checkpoints.length}
            {answered > 0 ? ` · ${right} right` : " · the video stops to ask you"}
          </span>
        )}
        <span className="flex items-center gap-1" role="group" aria-label="Playback speed">
          {SPEEDS.map((s) => (
            <button
              key={s}
              type="button"
              aria-pressed={speed === s}
              onClick={() => setSpeed(s)}
              className={cn(
                "rounded-full border px-2 py-0.5 text-xs font-semibold",
                speed === s
                  ? "border-blue-600 bg-blue-500/10 text-blue-700 dark:text-blue-300"
                  : "border-border",
              )}
            >
              {s}×
            </button>
          ))}
        </span>
      </figcaption>
    </figure>
  );
}
