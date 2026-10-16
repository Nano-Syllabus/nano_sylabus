"use client";

import { Check, ChevronRight, RotateCcw } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { ConceptActivityCard } from "@/components/concept-activity";
import { readingChapter } from "@/components/concepts-reading";
import type { ConceptActivity } from "@/lib/concept-activities";
import { chapterStarts, parseSrt, type Cue } from "@/lib/interactive-video";
import { cn } from "@/lib/utils";

/*
 * THE INTERACTIVE VIDEO MODULE (user, 2026-10-16: "replace the static video
 * completely ... content (RAG) → interactive video → content presentation").
 *
 * The explainer plays in CHAPTERS — the reading's own lesson sections — and at
 * the end of each one it stops and hands the student that section's hands-on
 * piece (its figure to tap, its lab to drag, or its check), live, right under
 * the picture. "Continue" plays the next chapter. The narrator's words run
 * under the video as captions beside the logo + 🗣️. When the last chapter is
 * done the end card leads on to the reading (the content presentation).
 *
 * Chapter starts come from the narration's timed captions (lib/interactive-
 * video.ts); a video rendered before captions were kept shares its length
 * evenly between the chapters instead.
 */

const HANDS_ON = new Set(["figure", "experiment", "diagram", "bits"]);
const SPEEDS = [0.75, 1, 1.25] as const;

type Chapter = {
  title: string;
  number: number;
  /** What the video stops for at the end of this chapter, if anything. */
  piece: { number: number; activity: ConceptActivity } | null;
};

/** The reading's lesson sections, each with the one piece the video stops for:
 *  its first hands-on piece, else its first check. */
export function videoChapters(reading: string[]): Chapter[] {
  return readingChapter(reading)
    // The exam practice belongs to the exam step, not to the video.
    .sections.filter((section) => section.role === "lesson" && !/^exam practice$/i.test(section.title))
    .map((section, index) => {
      const activities = section.pieces.flatMap((piece) =>
        piece.kind === "activity" ? [{ number: piece.number, activity: piece.activity }] : [],
      );
      return {
        title: section.title,
        number: section.number ?? index + 1,
        piece:
          activities.find((a) => HANDS_ON.has(a.activity.kind)) ??
          activities.find((a) => a.activity.kind === "choice" || a.activity.kind === "numeric") ??
          null,
      };
    });
}

function readDone(key: string): number[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(key) || "[]");
    return Array.isArray(parsed) ? parsed.filter((n) => typeof n === "number") : [];
  } catch {
    return [];
  }
}

export function InteractiveVideo({
  challengeId,
  video,
  poster,
  captions,
  reading,
  stage = false,
  onVideo,
  endAction,
  onWatched,
}: {
  challengeId: string;
  video: string;
  poster: string | null;
  /** `/api/media/<hash>/captions.srt`, when the render kept its captions. */
  captions: string | null;
  reading: string[];
  stage?: boolean;
  onVideo?: (video: HTMLVideoElement | null) => void;
  endAction?: { label: string; onClick: () => void };
  onWatched?: () => void;
}) {
  const ref = useRef<HTMLVideoElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const chapters = useMemo(() => videoChapters(reading), [reading]);
  const [cues, setCues] = useState<Cue[]>([]);
  const [duration, setDuration] = useState(0);
  const [now, setNow] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [asking, setAsking] = useState<number | null>(null);
  const [passed, setPassed] = useState<number[]>([]);
  const [ended, setEnded] = useState(false);
  const [speed, setSpeed] = useState<(typeof SPEEDS)[number]>(1);
  const doneKey = `interactive-video:${challengeId}`;
  const [done, setDone] = useState<number[]>([]);

  useEffect(() => setDone(readDone(doneKey)), [doneKey]);
  useEffect(() => {
    onVideo?.(ref.current);
    return () => onVideo?.(null);
  }, [onVideo]);
  // Autoplay can load the metadata before this component is listening.
  useEffect(() => {
    const el = ref.current;
    if (el && el.readyState >= 1 && el.duration) setDuration(el.duration);
  }, []);
  useEffect(() => {
    if (ref.current) ref.current.playbackRate = speed;
  }, [speed]);
  useEffect(() => {
    if (!captions) return;
    let cancelled = false;
    fetch(captions)
      .then((response) => (response.ok ? response.text() : ""))
      .then((text) => {
        if (!cancelled) setCues(parseSrt(text));
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [captions]);
  useEffect(() => {
    if (asking !== null) panelRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [asking]);

  const starts = useMemo(
    () => chapterStarts(chapters.map((c) => c.title), cues, duration),
    [chapters, cues, duration],
  );
  // A chapter ends where the next begins; the last one just before the video does.
  const stopAt = (i: number) => (i + 1 < starts.length ? starts[i + 1] : Math.max(0, duration - 0.6));
  // While stopped, the chapter being practised; otherwise the one playing.
  const current = asking ?? (starts.length ? Math.max(0, starts.findLastIndex((s) => now >= s)) : 0);

  const askFor = (i: number) => {
    ref.current?.pause();
    setAsking(i);
  };
  const onTime = () => {
    const el = ref.current;
    if (!el) return;
    setNow(el.currentTime);
    if (!duration && el.duration) setDuration(el.duration);
    if (asking !== null || !duration) return;
    const due = chapters.findIndex(
      (c, i) => c.piece && !passed.includes(i) && el.currentTime >= stopAt(i) && el.currentTime < stopAt(i) + 1.5,
    );
    if (due >= 0) askFor(due);
  };
  const resume = () => {
    if (asking === null) return;
    const last = asking === chapters.length - 1;
    setPassed((p) => [...p, asking]);
    setAsking(null);
    if (last && ref.current && ref.current.ended) {
      setEnded(true);
      onWatched?.();
    } else void ref.current?.play();
  };
  const markDone = (number: number) =>
    setDone((list) => {
      if (list.includes(number)) return list;
      const next = [...list, number];
      try {
        localStorage.setItem(doneKey, JSON.stringify(next));
      } catch {
        /* Storage is optional. */
      }
      return next;
    });
  const jump = (i: number) => {
    const el = ref.current;
    if (!el || !starts.length) return;
    el.currentTime = starts[i] + 0.05;
    setPassed((p) => p.filter((n) => n < i));
    setEnded(false);
    void el.play();
  };

  const radius = stage ? "rounded-xl" : "rounded-[4px]";
  const piece = asking === null ? null : chapters[asking]?.piece;

  return (
    <figure className="m-0">
      <div className={cn("relative overflow-hidden bg-black", radius)}>
        <video
          ref={ref}
          src={video}
          poster={poster ?? undefined}
          controls={asking === null && !ended}
          autoPlay
          playsInline
          preload="metadata"
          onLoadedMetadata={(e) => setDuration(e.currentTarget.duration || 0)}
          onTimeUpdate={onTime}
          onPlay={() => {
            setPlaying(true);
            setEnded(false);
          }}
          onPause={() => setPlaying(false)}
          onEnded={() => {
            setPlaying(false);
            const last = chapters.length - 1;
            if (last >= 0 && chapters[last].piece && !passed.includes(last)) askFor(last);
            else {
              setEnded(true);
              onWatched?.();
            }
          }}
          onSeeked={() => {
            // Back past a stop asks it again; forward skips it.
            const at = ref.current?.currentTime ?? 0;
            setPassed((p) => p.filter((i) => stopAt(i) < at));
          }}
          className="block aspect-video w-full"
        />
        {piece ? (
          <div className="pointer-events-none absolute inset-0 flex items-end justify-center bg-black/55 p-4">
            <span className="mb-ui rounded-full bg-white px-3 py-1 text-sm font-semibold text-[#0f172a] shadow">
              Your turn — try it below ↓
            </span>
          </div>
        ) : null}
        {ended && endAction ? (
          // The video is done; the reading (the content presentation) is next.
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-[#0f172a]/90 p-6 text-center text-white">
            <p className="text-lg font-semibold sm:text-2xl">That’s the idea. Now try it yourself.</p>
            <div className="flex flex-wrap justify-center gap-3">
              <button
                type="button"
                onClick={() => jump(0)}
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
      </div>

      {/* The narrator: what is being said, as it is said. */}
      <div className="flex items-center gap-3 bg-[#0f172a] px-4 py-2.5 text-white sm:px-5">
        <span className="inline-flex shrink-0 items-center gap-1" aria-hidden="true">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/nano_logo.png" alt="" className="size-6" />
          <span
            className={cn(
              "inline-block text-lg leading-none",
              playing && "animate-bounce motion-reduce:animate-none [animation-duration:0.6s]",
            )}
          >
            🗣️
          </span>
        </span>
        {/* The words are burned into the picture already; this says where we are. */}
        <p className="min-h-6 min-w-0 flex-1 truncate text-sm leading-6 sm:text-[15px]">
          {chapters[current] ? (
            <>
              <span className="text-white/60">
                Chapter {current + 1} of {chapters.length} ·{" "}
              </span>
              {chapters[current].title}
            </>
          ) : null}
        </p>
        <span className="flex shrink-0 items-center gap-1" role="group" aria-label="Playback speed">
          {SPEEDS.map((s) => (
            <button
              key={s}
              type="button"
              aria-pressed={speed === s}
              onClick={() => setSpeed(s)}
              className={cn(
                "rounded-full px-2 py-0.5 text-xs font-semibold",
                speed === s ? "bg-white text-[#0f172a]" : "text-white/70 hover:bg-white/10",
              )}
            >
              {s}×
            </button>
          ))}
        </span>
      </div>

      {/* The chapters: the reading's sections, as the video's timeline. */}
      {chapters.length > 1 && starts.length ? (
        <ol
          className={cn("mt-2 grid gap-1.5", chapters.length > 4 ? "grid-cols-2 sm:grid-cols-4" : "")}
          style={chapters.length <= 4 ? { gridTemplateColumns: `repeat(${chapters.length}, minmax(0, 1fr))` } : undefined}
          aria-label="Chapters"
        >
          {chapters.map((chapter, i) => {
            const end = stopAt(i);
            const fill = now >= end ? 1 : now <= starts[i] ? 0 : (now - starts[i]) / Math.max(0.1, end - starts[i]);
            const reached = now >= starts[i] || passed.includes(i);
            return (
              <li key={i}>
                <button
                  type="button"
                  onClick={() => jump(i)}
                  disabled={!reached}
                  aria-current={i === current ? "step" : undefined}
                  className="w-full text-left disabled:cursor-default"
                >
                  <span className="block h-1 overflow-hidden rounded-full bg-border">
                    <span className="block h-full bg-blue-600" style={{ width: `${Math.round(fill * 100)}%` }} />
                  </span>
                  <span
                    className={cn(
                      "mt-1 flex items-center gap-1 truncate text-xs",
                      i === current ? "font-semibold text-text-primary" : "text-text-muted",
                    )}
                  >
                    {chapter.piece && done.includes(chapter.piece.number) ? (
                      <Check className="size-3 shrink-0 text-green-600" aria-hidden="true" />
                    ) : null}
                    <span className="truncate">
                      {chapter.number}. {chapter.title}
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ol>
      ) : null}

      {/* The stop: this chapter's hands-on piece, live. */}
      {piece && asking !== null ? (
        <div ref={panelRef} role="dialog" aria-label={`Try it: ${chapters[asking].title}`} className="mb mt-3 scroll-mt-4 overflow-hidden rounded-xl border-2 border-blue-600">
          <div className="mb-ui flex items-center justify-between gap-3 border-b border-[var(--mb-line)] bg-[var(--mb-card)] px-4 py-2.5 sm:px-6">
            <p className="text-sm font-semibold">
              Your turn · {chapters[asking].number}. {chapters[asking].title}
            </p>
            <p className="text-xs text-[var(--mb-muted)]">
              Chapter {asking + 1} of {chapters.length}
            </p>
          </div>
          <div className="px-4 py-4 sm:px-6">
            <ConceptActivityCard
              key={`${challengeId}-iv-${piece.number}`}
              activity={piece.activity}
              code={`${chapters[asking].number}`}
              tone={HANDS_ON.has(piece.activity.kind) ? "pa" : "ca"}
              complete={done.includes(piece.number)}
              storageKey={`${doneKey}:${piece.number}`}
              onComplete={() => markDone(piece.number)}
            />
            <div className="mb-ui mt-3 flex justify-end">
              <button
                type="button"
                onClick={resume}
                className={cn(
                  "inline-flex min-h-10 items-center gap-2 rounded-lg px-4 text-sm font-semibold",
                  done.includes(piece.number)
                    ? "bg-blue-600 text-white hover:bg-blue-700"
                    : "border border-border bg-bg-primary text-text-primary hover:bg-bg-tertiary",
                )}
              >
                {asking === chapters.length - 1 ? "Finish the video" : "Continue the video"}
                <ChevronRight className="size-4" aria-hidden="true" />
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </figure>
  );
}
