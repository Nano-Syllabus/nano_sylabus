"use client";

import {
  Check,
  ChevronLeft,
  ChevronRight,
  FlaskConical,
  Pause,
  Play,
  RotateCcw,
  Volume2,
  VolumeX,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { ConceptActivityCard } from "@/components/concept-activity";
import type { VideoCheckpoint } from "@/components/concept-explainer-video";
import { readingChapter } from "@/components/concepts-reading";
import type { ConceptActivity } from "@/lib/concept-activities";
import { cn } from "@/lib/utils";
import "@/components/microbook.css";

/*
 * A micro-topic as a course player (user, 2026-10-16: "like coursera … in the
 * video step 1 explanation, step 2 lab — how to interact with my own website and
 * tweak the values, step 3 exam where one clicks in that video kind of vibe").
 *
 * Every step PLAYS, like chapters of one video:
 *   1. Explanation: the explainer mp4, full width, asked for on open. It stops
 *      on an end card; it never rolls into the lab by itself.
 *   2. Lab: a played demo inside the REAL lab — a cursor drags the sliders and
 *      taps the figure while a narrator (🗣️, captions and the browser's voice)
 *      says what to watch — then "Your turn" hands the same lab to the student.
 *   3. Exam: a short played intro (what the paper is) whose cursor clicks
 *      "Start the exam"; the real paper then opens to be attempted.
 *
 * A step is left ONLY by Next. ⏯ in the bar pauses whichever chapter is on.
 */

export type MicroTopicStage = "explain" | "lab" | "exam";

export const MICRO_TOPIC_STAGES: { id: MicroTopicStage; label: string }[] = [
  { id: "explain", label: "Explanation" },
  { id: "lab", label: "Lab" },
  { id: "exam", label: "Exam" },
];

/** What the bar's ⏯ and the chip's progress line drive, on any step. */
export type StageMedia = {
  ready: boolean;
  playing: boolean;
  progress: number;
  toggle: () => void;
};

/** The reading's quick questions: the video stops on them. */
export function readingCheckpoints(reading: string[]): VideoCheckpoint[] {
  return readingChapter(reading).sections
    .filter((section) => section.role === "lesson")
    .flatMap((section) =>
      section.pieces.flatMap((piece) =>
        piece.kind === "activity" && piece.activity.kind === "choice"
          ? [{ number: piece.number, activity: piece.activity }]
          : [],
      ),
    );
}

export type LabItem = { number: number; section: string; activity: ConceptActivity };

const LAB_KINDS = new Set(["experiment", "figure", "diagram", "bits"]);
const NOT_LAB = new Set(["choice", "exam"]);

/**
 * The lab: the reading's hands-on pieces — graphs whose values the student
 * drags, figures whose parts they tap. A reading without any falls back to its
 * other worked activities (derivations, fill-ins); the quick questions stay in
 * the video and the exam pieces stay out.
 */
export function readingLabs(reading: string[]): LabItem[] {
  const all = readingChapter(reading).sections.flatMap((section) =>
    section.pieces.flatMap((piece) =>
      piece.kind === "activity" && !NOT_LAB.has(piece.activity.kind)
        ? [{ number: piece.number, section: section.title, activity: piece.activity }]
        : [],
    ),
  );
  const hands = all.filter((item) => LAB_KINDS.has(item.activity.kind));
  return hands.length ? hands : all;
}

/** Play state and progress of the explainer's <video>, as StageMedia. */
export function useStageVideo() {
  const [video, setVideo] = useState<HTMLVideoElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  useEffect(() => {
    if (!video) {
      setPlaying(false);
      return;
    }
    const sync = () => {
      setPlaying(!video.paused && !video.ended);
      setProgress(video.duration ? video.currentTime / video.duration : 0);
    };
    sync();
    const events = ["play", "pause", "ended", "timeupdate", "loadedmetadata"] as const;
    for (const name of events) video.addEventListener(name, sync);
    return () => {
      for (const name of events) video.removeEventListener(name, sync);
    };
  }, [video]);
  const toggle = useCallback(() => {
    if (!video) return;
    if (video.paused || video.ended) void video.play().catch(() => undefined);
    else video.pause();
  }, [video]);
  const media: StageMedia = { ready: Boolean(video), playing, progress, toggle };
  return { bind: setVideo, media };
}

/* ------------------------------------------------------------------------ */
/* The step bar                                                              */
/* ------------------------------------------------------------------------ */

const round =
  "inline-flex size-10 shrink-0 items-center justify-center rounded-full border border-border bg-card text-text-primary hover:bg-bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:cursor-not-allowed disabled:opacity-40";

/**
 * ‹ ⏯ ›, then a chip per step with a progress line under the current one —
 * the landing tour's control row, under the stage. › is the only way forward.
 */
export function MicroTopicStepBar({
  stage,
  reached,
  progress,
  onPrevious,
  onNext,
  onJump,
  nextDisabled,
  nextTitle,
  media,
}: {
  stage: MicroTopicStage;
  /** How far the student has got: chips up to here can be revisited. */
  reached: number;
  /** 0..1, drawn under the current chip. */
  progress: number;
  onPrevious: () => void;
  onNext: () => void;
  onJump: (stage: MicroTopicStage) => void;
  nextDisabled?: boolean;
  nextTitle?: string;
  /** Whatever is playing on this step, for ⏯. */
  media?: StageMedia | null;
}) {
  const current = MICRO_TOPIC_STAGES.findIndex((s) => s.id === stage);
  const last = current === MICRO_TOPIC_STAGES.length - 1;
  // On a phone the chips scroll sideways; keep the current one in sight.
  const currentRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const chip = currentRef.current;
    const row = chip?.closest("nav");
    if (chip && row) row.scrollLeft = Math.max(0, chip.offsetLeft - row.clientWidth / 2);
  }, [stage]);
  return (
    <nav aria-label="Micro-topic steps" className="flex items-center gap-2 overflow-x-auto py-1 sm:gap-3">
      <button
        type="button"
        onClick={onPrevious}
        disabled={current === 0}
        aria-label="Previous step"
        title="Previous step"
        className={round}
      >
        <ChevronLeft className="size-4" aria-hidden="true" />
      </button>
      <button
        type="button"
        onClick={media?.toggle}
        disabled={!media?.ready}
        aria-label={media?.playing ? "Pause" : "Play"}
        title={media?.ready ? (media.playing ? "Pause" : "Play") : "Nothing playing on this step"}
        className={cn(round, "border-transparent bg-text-primary text-bg-primary hover:bg-text-primary/90")}
      >
        {media?.playing ? (
          <Pause className="size-4" aria-hidden="true" />
        ) : (
          <Play className="size-4" aria-hidden="true" />
        )}
      </button>
      <button
        type="button"
        onClick={onNext}
        disabled={last || nextDisabled}
        aria-label="Next step"
        title={last ? "This is the last step" : nextTitle || "Next step"}
        className={round}
      >
        <ChevronRight className="size-4" aria-hidden="true" />
      </button>
      <ol className="flex min-w-0 items-center gap-2">
        {MICRO_TOPIC_STAGES.map((step, index) => {
          const isCurrent = index === current;
          const done = index < reached || index < current;
          const open = index <= reached && !isCurrent;
          return (
            <li key={step.id} className="shrink-0">
              <button
                ref={isCurrent ? currentRef : undefined}
                type="button"
                disabled={!open}
                aria-current={isCurrent ? "step" : undefined}
                onClick={() => onJump(step.id)}
                title={open ? `Back to ${step.label}` : isCurrent ? undefined : "Reached with Next"}
                className={cn(
                  "relative inline-flex min-h-10 items-center gap-1.5 overflow-hidden rounded-full border px-4 text-sm font-semibold disabled:cursor-default",
                  isCurrent
                    ? "border-blue-600 bg-blue-500/10 text-text-primary"
                    : open
                      ? "border-border bg-card text-text-primary hover:bg-bg-secondary"
                      : "border-border bg-card text-text-muted",
                )}
              >
                {done && !isCurrent ? (
                  <Check className="size-3.5 text-green-600 dark:text-green-400" aria-hidden="true" />
                ) : null}
                {index + 1}. {step.label}
                {isCurrent ? (
                  <span
                    aria-hidden="true"
                    className="absolute bottom-0 left-0 h-[3px] bg-blue-600 transition-[width] duration-300"
                    style={{ width: `${Math.round(Math.min(1, Math.max(0, progress)) * 100)}%` }}
                  />
                ) : null}
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

/* ------------------------------------------------------------------------ */
/* Played scenes: cursor, captions, narrator                                  */
/* ------------------------------------------------------------------------ */

const VOICE_KEY = "microtopic-voice";
const TICK = 50;

class Stopped extends Error {}

type Cursor = { x: number; y: number; shown: boolean; pressed: boolean; ripple: number };

/** What a scene script can do. Every wait honours ⏯ and stops on unmount. */
type Director = {
  sleep: (ms: number) => Promise<void>;
  tween: (ms: number, frame: (t: number) => void) => Promise<void>;
  say: (text: string) => void;
  /** Glide the cursor to an element (or a point inside it, 0..1 across). */
  point: (el: Element | null, across?: number) => Promise<void>;
  /** Put the cursor there at once (for riding a slider's thumb). */
  aim: (el: Element, across?: number) => void;
  press: (down: boolean) => void;
  click: (el: Element | null) => Promise<void>;
};

function readVoice() {
  try {
    return localStorage.getItem(VOICE_KEY) !== "off";
  } catch {
    return true;
  }
}

/**
 * Runs a scene script against a stage element: a moving cursor, a caption the
 * narrator speaks, ⏯ and a progress fraction. The script's `estimate` (ms) is
 * what progress is measured against.
 */
function useScene({
  stageRef,
  script,
  estimate,
  runKey,
  onMedia,
}: {
  stageRef: RefObject<HTMLElement | null>;
  script: ((d: Director) => Promise<void>) | null;
  estimate: number;
  /** Changing it restarts the scene. */
  runKey: string;
  onMedia?: (media: StageMedia | null) => void;
}) {
  const [cursor, setCursor] = useState<Cursor>({ x: 0, y: 0, shown: false, pressed: false, ripple: 0 });
  const [caption, setCaption] = useState("");
  const [speaking, setSpeaking] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [finished, setFinished] = useState(false);
  const [progress, setProgress] = useState(0);
  const [voice, setVoiceState] = useState(true);
  const paused = useRef(false);
  const voiceRef = useRef(true);
  const scriptRef = useRef(script);
  scriptRef.current = script;

  useEffect(() => {
    const on = readVoice();
    voiceRef.current = on;
    setVoiceState(on);
  }, []);

  const setVoice = useCallback((on: boolean) => {
    voiceRef.current = on;
    setVoiceState(on);
    try {
      localStorage.setItem(VOICE_KEY, on ? "on" : "off");
    } catch {
      /* Storage is optional. */
    }
    if (!on && typeof speechSynthesis !== "undefined") speechSynthesis.cancel();
  }, []);

  useEffect(() => {
    if (!script) return;
    const run = { stopped: false };
    let elapsed = 0;
    let lastReport = 0;
    paused.current = false;
    setPlaying(true);
    setFinished(false);
    setProgress(0);
    setCaption("");
    setCursor((c) => ({ ...c, shown: false, pressed: false }));

    const tick = () =>
      new Promise<void>((resolve, reject) =>
        window.setTimeout(() => (run.stopped ? reject(new Stopped()) : resolve()), TICK),
      );
    const sleep = async (ms: number) => {
      let left = ms;
      while (left > 0) {
        await tick();
        if (paused.current) continue;
        left -= TICK;
        elapsed += TICK;
        if (elapsed - lastReport >= 250) {
          lastReport = elapsed;
          setProgress(Math.min(0.98, elapsed / estimate));
        }
      }
    };
    const tween = async (ms: number, frame: (t: number) => void) => {
      const steps = Math.max(1, Math.round(ms / TICK));
      for (let i = 1; i <= steps; i += 1) {
        await sleep(TICK);
        frame(i / steps);
      }
    };
    const say = (text: string) => {
      setCaption(text);
      if (typeof speechSynthesis === "undefined") return;
      speechSynthesis.cancel();
      if (!voiceRef.current || !text) return;
      const line = new SpeechSynthesisUtterance(text);
      line.rate = 1.02;
      line.onstart = () => setSpeaking(true);
      line.onend = () => setSpeaking(false);
      line.onerror = () => setSpeaking(false);
      speechSynthesis.speak(line);
    };
    const where = (el: Element, across: number) => {
      const stage = stageRef.current?.getBoundingClientRect();
      const box = el.getBoundingClientRect();
      if (!stage) return { x: 0, y: 0 };
      return {
        x: box.left - stage.left + box.width * across,
        y: box.top - stage.top + box.height / 2,
      };
    };
    const point = async (el: Element | null, across = 0.5) => {
      if (!el) return;
      // Keep what the cursor is about to touch on screen, like a camera would.
      const box = el.getBoundingClientRect();
      if (box.top < 60 || box.bottom > window.innerHeight - 90)
        el.scrollIntoView({ block: "center", behavior: "smooth" });
      await sleep(box.top < 60 || box.bottom > window.innerHeight - 90 ? 450 : 0);
      setCursor((c) => ({ ...c, ...where(el, across), shown: true }));
      await sleep(650);
    };
    const aim = (el: Element, across = 0.5) => setCursor((c) => ({ ...c, ...where(el, across), shown: true }));
    const press = (down: boolean) => setCursor((c) => ({ ...c, pressed: down }));
    const click = async (el: Element | null) => {
      if (!el) return;
      await point(el);
      setCursor((c) => ({ ...c, pressed: true, ripple: c.ripple + 1 }));
      await sleep(160);
      el.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, view: window }));
      setCursor((c) => ({ ...c, pressed: false }));
      await sleep(250);
    };

    // Let the stage paint before the first measurement.
    window.setTimeout(() => {
      if (run.stopped) return;
      const current = scriptRef.current;
      if (!current) return;
      current({ sleep, tween, say, point, aim, press, click })
        .then(() => {
          setProgress(1);
          setPlaying(false);
          setFinished(true);
          setSpeaking(false);
          setCursor((c) => ({ ...c, pressed: false }));
        })
        .catch((error) => {
          if (!(error instanceof Stopped)) console.warn("[micro-topic] scene stopped", error);
        });
    }, 120);

    return () => {
      run.stopped = true;
      if (typeof speechSynthesis !== "undefined") speechSynthesis.cancel();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- one run per key
  }, [runKey, Boolean(script)]);

  // Stable whatever the script's identity, so reporting it up cannot loop.
  const hasScript = useRef(false);
  hasScript.current = Boolean(script);
  const toggle = useCallback(() => {
    if (!hasScript.current) return;
    paused.current = !paused.current;
    setPlaying(!paused.current);
    if (typeof speechSynthesis !== "undefined") {
      if (paused.current) speechSynthesis.pause();
      else speechSynthesis.resume();
    }
  }, []);

  const ready = Boolean(script) && !finished;
  useEffect(() => {
    onMedia?.({ ready, playing, progress, toggle });
  }, [onMedia, ready, playing, progress, toggle]);
  useEffect(() => () => onMedia?.(null), [onMedia]);

  return { cursor, caption, speaking, playing, finished, progress, voice, setVoice, toggle };
}

/** The pointer a scene moves: a real arrow cursor with a click ripple. */
function SceneCursor({ cursor }: { cursor: Cursor }) {
  return (
    <div
      aria-hidden="true"
      // Glides between targets; while "pressed" it rides a slider's thumb, so
      // it keeps up instead of trailing behind.
      className={cn(
        "pointer-events-none absolute left-0 top-0 z-30 transition-[transform,opacity] ease-[cubic-bezier(.4,0,.2,1)] motion-reduce:transition-none",
        cursor.pressed ? "duration-75" : "duration-[600ms]",
      )}
      style={{
        transform: `translate(${cursor.x}px, ${cursor.y}px)`,
        opacity: cursor.shown ? 1 : 0,
      }}
    >
      {cursor.ripple > 0 ? (
        <span
          key={cursor.ripple}
          className="absolute -left-4 -top-4 size-8 animate-ping rounded-full bg-blue-500/50 [animation-iteration-count:1]"
        />
      ) : null}
      <svg
        width="26"
        height="30"
        viewBox="0 0 26 30"
        className={cn("drop-shadow-md transition-transform duration-150", cursor.pressed && "scale-90")}
      >
        <path
          d="M2 2 L2 24 L8 18.5 L12 28 L16.5 26 L12.5 16.8 L21 16.5 Z"
          fill="#111827"
          stroke="white"
          strokeWidth="2"
          strokeLinejoin="round"
        />
      </svg>
    </div>
  );
}

/** The narrator: the logo with a speaking-head emoji that talks while it speaks. */
export function Narrator({ speaking, className }: { speaking?: boolean; className?: string }) {
  return (
    <span className={cn("inline-flex shrink-0 items-center gap-1", className)} aria-hidden="true">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/nano_logo.png" alt="" className="size-6" />
      <span
        className={cn(
          "inline-block text-lg leading-none",
          speaking && "animate-bounce motion-reduce:animate-none [animation-duration:0.6s]",
        )}
      >
        🗣️
      </span>
    </span>
  );
}

function CaptionBar({
  caption,
  speaking,
  voice,
  onVoice,
}: {
  caption: string;
  speaking: boolean;
  voice: boolean;
  onVoice: (on: boolean) => void;
}) {
  return (
    <div className="flex items-center gap-3 border-t border-white/10 bg-[#0f172a] px-4 py-2.5 text-white sm:px-5">
      <Narrator speaking={speaking} />
      <p aria-live="polite" className="min-h-6 min-w-0 flex-1 text-sm leading-6 sm:text-[15px]">
        {caption}
      </p>
      <button
        type="button"
        onClick={() => onVoice(!voice)}
        aria-label={voice ? "Mute the narrator" : "Turn the narrator's voice on"}
        title={voice ? "Mute voice" : "Voice on"}
        className="inline-flex size-8 shrink-0 items-center justify-center rounded-full text-white/80 hover:bg-white/10"
      >
        {voice ? <Volume2 className="size-4" aria-hidden="true" /> : <VolumeX className="size-4" aria-hidden="true" />}
      </button>
    </div>
  );
}

/* ------------------------------------------------------------------------ */
/* Step 2: the lab, played then handed over                                   */
/* ------------------------------------------------------------------------ */

function plainText(markdown: string) {
  return markdown
    .replace(/\$\$?([^$]*)\$\$?/g, "$1")
    .replace(/[*_`#>]/g, "")
    .replace(/\\[a-z]+/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Set a range input the way a drag does, so React's onChange sees it. */
function setRange(input: HTMLInputElement, value: number) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
  setter?.call(input, String(value));
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

function labelFor(input: HTMLInputElement) {
  const label = input.id ? document.querySelector(`label[for="${CSS.escape(input.id)}"] span`) : null;
  return (label?.textContent || "this value").trim();
}

/** The demo for one lab piece, and how long it should take (ms). */
function labScript(item: LabItem, card: () => HTMLElement | null) {
  const kind = item.activity.kind;
  if (kind === "experiment") {
    const params = item.activity.parameters.slice(0, 3);
    const output = item.activity.outputs[0]?.label ?? "the result";
    return {
      estimate: 3200 + params.length * 4300 + 2400,
      run: async (d: Director) => {
        d.say(`This is a live lab. Every number here is a control: drag it, and ${plainText(output)} and the graph move with it.`);
        await d.sleep(3200);
        const sliders = Array.from(card()?.querySelectorAll<HTMLInputElement>('input[type="range"]') ?? []).slice(0, 3);
        for (const input of sliders) {
          const min = Number(input.min);
          const max = Number(input.max);
          const start = Number(input.value);
          const across = (v: number) => (max > min ? (v - min) / (max - min) : 0.5);
          d.say(`Now drag ${plainText(labelFor(input))}. Watch how ${plainText(output)} changes on the graph.`);
          await d.point(input, across(start));
          d.press(true);
          const high = max;
          const low = min + (max - min) * 0.25;
          // The cursor rides the thumb as the value moves.
          const sweep = (from: number, to: number, ms: number) =>
            d.tween(ms, (t) => {
              const v = from + (to - from) * t;
              setRange(input, v);
              d.aim(input, across(v));
            });
          await sweep(start, high, 1300);
          await sweep(high, low, 1300);
          d.press(false);
          await d.sleep(500);
        }
        d.say("Your turn. Move the values yourself and see what changes. Press Next when you are ready for the exam.");
        await d.sleep(2400);
      },
    };
  }
  if (kind === "figure" || kind === "diagram") {
    return {
      estimate: 2600 + 2 * 3000 + 2400,
      run: async (d: Director) => {
        d.say(plainText(item.activity.prompt || "Every part of this figure can be tapped. Tap one to see what it does."));
        await d.sleep(2600);
        const parts = Array.from(card()?.querySelectorAll('[aria-label^="Explore "]') ?? []).slice(0, 2);
        for (const part of parts) {
          const name = (part.getAttribute("aria-label") || "").replace(/^Explore\s+/, "");
          d.say(`Tap ${plainText(name)}.`);
          await d.click(part);
          await d.sleep(2100);
        }
        d.say("Your turn. Tap the other parts yourself, then press Next for the exam.");
        await d.sleep(2400);
      },
    };
  }
  return {
    estimate: 4200 + 2400,
    run: async (d: Director) => {
      d.say(plainText(item.activity.prompt || item.activity.title));
      const target = card()?.querySelector("input, button:not([disabled]), [role='button']") ?? null;
      await d.point(target);
      await d.sleep(3500);
      d.say("Your turn. Try it yourself, then press Next for the exam.");
      await d.sleep(2400);
    },
  };
}

function readDone(key: string): number[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(key) || "[]");
    return Array.isArray(parsed) ? parsed.filter((n) => typeof n === "number") : [];
  } catch {
    return [];
  }
}

/**
 * The lab bench: one hands-on piece at a time on the micro-book's grid paper.
 * Each piece first PLAYS: the cursor works the real controls while the
 * narrator says what to watch. That run uses a scratch copy of the piece's
 * saved state and never completes it, so "Your turn" starts the student from
 * the starting values with nothing done for them.
 */
export function LabStage({
  challengeId,
  reading,
  waiting,
  onMedia,
}: {
  challengeId: string;
  reading: string[];
  /** The reading is still being written. */
  waiting: boolean;
  onMedia?: (media: StageMedia | null) => void;
}) {
  const labs = useMemo(() => readingLabs(reading), [reading]);
  const storageKey = `microtopic-lab:${challengeId}`;
  const [done, setDone] = useState<number[]>([]);
  const [at, setAt] = useState(0);
  const [phase, setPhase] = useState<"demo" | "yours">("demo");
  const [round, setRound] = useState(0);
  const stageRef = useRef<HTMLDivElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setDone(readDone(storageKey));
    setAt(0);
    setPhase("demo");
  }, [storageKey]);

  const item = labs.length ? labs[Math.min(at, labs.length - 1)] : null;
  const scripted = useMemo(() => (item ? labScript(item, () => cardRef.current) : null), [item]);
  const demoKey = item ? `${storageKey}:${item.number}:demo` : "";

  // The bar's progress: labs behind, plus how far this one's demo has got.
  const scene = useScene({
    stageRef,
    script: phase === "demo" && scripted ? scripted.run : null,
    estimate: scripted?.estimate ?? 1,
    runKey: `${challengeId}:${at}:${round}`,
    onMedia: useCallback(
      (media: StageMedia | null) => {
        onMedia?.(
          media && labs.length
            ? { ...media, progress: (at + (phase === "demo" ? media.progress : 1)) / labs.length }
            : labs.length
              ? { ready: false, playing: false, toggle: () => undefined, progress: (at + 1) / labs.length }
              : null,
        );
      },
      [onMedia, labs.length, at, phase],
    ),
  });

  // The demo ends → the student's turn, on fresh state.
  useEffect(() => {
    if (phase === "demo" && scene.finished) setPhase("yours");
  }, [phase, scene.finished]);
  useEffect(() => {
    if (phase !== "yours" || !demoKey) return;
    try {
      localStorage.removeItem(demoKey);
    } catch {
      /* Storage is optional. */
    }
  }, [phase, demoKey]);

  const markDone = (number: number) =>
    setDone((current) => {
      if (current.includes(number)) return current;
      const next = [...current, number];
      try {
        localStorage.setItem(storageKey, JSON.stringify(next));
      } catch {
        /* Storage is optional. */
      }
      return next;
    });

  const open = (index: number) => {
    setAt(index);
    setPhase("demo");
    setRound((r) => r + 1);
  };

  if (!item) {
    return (
      <div className="flex aspect-video w-full flex-col items-center justify-center gap-3 rounded-xl border border-border bg-bg-secondary p-6 text-center">
        <FlaskConical className="size-8 text-text-muted" aria-hidden="true" />
        <p className="text-base font-semibold text-text-primary">
          {waiting ? "Setting up this topic’s lab…" : "No lab for this topic"}
        </p>
        <p className="max-w-md text-sm text-text-muted">
          {waiting
            ? "The graphs and figures arrive with the lesson. You can go on to the exam meanwhile."
            : "There is nothing to tweak here. Press Next for the exam."}
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border border-border">
      <div ref={stageRef} className="mb relative">
        <div className="mb-ui flex flex-wrap items-center justify-between gap-3 border-b border-[var(--mb-line)] bg-[var(--mb-card)] px-4 py-2.5 sm:px-6">
          <p className="text-sm font-semibold">
            Lab {at + 1} of {labs.length}
            <span className="font-normal text-[var(--mb-muted)]"> · {item.section}</span>
          </p>
          <div className="flex items-center gap-3">
            <span
              className={cn(
                "rounded-full px-2.5 py-0.5 text-xs font-semibold",
                phase === "demo"
                  ? "bg-[var(--mb-accent-soft)] text-[var(--mb-accent)]"
                  : "bg-[var(--mb-ok-soft)] text-[var(--mb-ok)]",
              )}
            >
              {phase === "demo" ? "● Watch" : "Your turn"}
            </span>
            <div className="flex items-center gap-1.5" role="group" aria-label="Labs">
              {labs.map((lab, index) => (
                <button
                  key={lab.number}
                  type="button"
                  onClick={() => open(index)}
                  aria-label={`Lab ${index + 1}${done.includes(lab.number) ? ", done" : ""}`}
                  aria-current={index === at ? "true" : undefined}
                  className={cn(
                    "size-2.5 rounded-full border border-[var(--mb-blue)]",
                    index === at
                      ? "bg-[var(--mb-blue)]"
                      : done.includes(lab.number)
                        ? "border-[var(--mb-ok)] bg-[var(--mb-ok)]"
                        : "bg-transparent",
                  )}
                />
              ))}
            </div>
          </div>
        </div>
        <div
          ref={cardRef}
          // While it plays, the lab is the demo's: the student watches, then gets it.
          className={cn("mx-auto max-w-4xl px-4 py-5 sm:px-8 sm:py-7", phase === "demo" && "pointer-events-none select-none")}
          aria-busy={phase === "demo"}
        >
          <ConceptActivityCard
            key={`${challengeId}-lab-${item.number}-${phase}-${round}`}
            activity={item.activity}
            code={`${at + 1}`}
            tone="pa"
            complete={phase === "yours" && done.includes(item.number)}
            storageKey={phase === "demo" ? demoKey : `${storageKey}:${item.number}`}
            onComplete={() => {
              if (phase === "yours") markDone(item.number);
            }}
          />
          <div className="mb-ui mt-4 flex flex-wrap justify-between gap-3">
            <button
              type="button"
              disabled={at === 0}
              onClick={() => open(at - 1)}
              className="pointer-events-auto inline-flex min-h-10 items-center gap-1 rounded-lg border border-border bg-bg-primary px-3 text-sm font-semibold disabled:opacity-40"
            >
              <ChevronLeft className="size-4" aria-hidden="true" /> Previous lab
            </button>
            {phase === "yours" ? (
              <button
                type="button"
                onClick={() => open(at)}
                className="inline-flex min-h-10 items-center gap-1.5 rounded-lg border border-border bg-bg-primary px-3 text-sm font-semibold"
              >
                <RotateCcw className="size-4" aria-hidden="true" /> Watch the demo again
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setPhase("yours")}
                className="pointer-events-auto inline-flex min-h-10 items-center gap-1.5 rounded-lg border border-border bg-bg-primary px-3 text-sm font-semibold"
              >
                Skip the demo
              </button>
            )}
            <button
              type="button"
              disabled={at === labs.length - 1}
              onClick={() => open(at + 1)}
              className="pointer-events-auto inline-flex min-h-10 items-center gap-1 rounded-lg border border-border bg-bg-primary px-3 text-sm font-semibold disabled:opacity-40"
            >
              Next lab <ChevronRight className="size-4" aria-hidden="true" />
            </button>
          </div>
        </div>
        {phase === "demo" ? <SceneCursor cursor={scene.cursor} /> : null}
      </div>
      <CaptionBar
        caption={
          phase === "demo"
            ? scene.caption
            : "Your turn: change the values and watch what happens. Press Next for the exam."
        }
        speaking={phase === "demo" && scene.speaking}
        voice={scene.voice}
        onVoice={scene.setVoice}
      />
    </div>
  );
}

/* ------------------------------------------------------------------------ */
/* Step 3: the exam's played intro                                            */
/* ------------------------------------------------------------------------ */

/**
 * The exam as the last chapter: a short played intro — the topic, what the
 * paper holds, how it is answered — then the cursor clicks "Start the exam"
 * and the real paper opens. The student can click Start at any moment.
 */
export function ExamIntro({
  topic,
  facts,
  how,
  onStart,
  onMedia,
}: {
  topic: string;
  /** "5 questions · 20 marks", or "" when the paper is not issued yet. */
  facts: string;
  how: string;
  onStart: () => void;
  onMedia?: (media: StageMedia | null) => void;
}) {
  const stageRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [line, setLine] = useState(0);
  const startRef = useRef(onStart);
  startRef.current = onStart;
  const script = useCallback(
    async (d: Director) => {
      setLine(1);
      d.say(`Exam time. ${topic}.`);
      await d.sleep(2200);
      if (facts) {
        setLine(2);
        d.say(`${facts.replace(" · ", ", ")}.`);
        await d.sleep(2200);
      }
      setLine(3);
      d.say(how);
      await d.sleep(3000);
      d.say("Ready? Let's start.");
      await d.click(buttonRef.current);
      await d.sleep(300);
      startRef.current();
    },
    [topic, facts, how],
  );
  const scene = useScene({
    stageRef,
    script,
    estimate: 2200 + (facts ? 2200 : 0) + 3000 + 1700,
    runKey: topic,
    onMedia,
  });

  return (
    <div className="overflow-hidden rounded-xl">
      <div
        ref={stageRef}
        className="relative flex aspect-video w-full flex-col items-center justify-center gap-3 overflow-hidden bg-[#0f172a] p-6 text-center text-white"
      >
        <span
          aria-hidden="true"
          className="absolute inset-0 bg-[radial-gradient(circle_at_50%_40%,rgba(37,99,235,0.35),transparent_60%)]"
        />
        <p className="relative text-xs font-semibold uppercase tracking-[0.18em] text-white/60">Exam</p>
        <p
          className={cn(
            "relative max-w-2xl text-xl font-semibold transition-all duration-500 sm:text-3xl",
            line >= 1 ? "translate-y-0 opacity-100" : "translate-y-2 opacity-0",
          )}
        >
          {topic}
        </p>
        {facts ? (
          <p
            className={cn(
              "relative text-sm text-white/80 transition-all duration-500 sm:text-base",
              line >= 2 ? "translate-y-0 opacity-100" : "translate-y-2 opacity-0",
            )}
          >
            {facts}
          </p>
        ) : null}
        <p
          className={cn(
            "relative max-w-md text-sm text-white/70 transition-all duration-500 sm:text-base",
            line >= 3 ? "translate-y-0 opacity-100" : "translate-y-2 opacity-0",
          )}
        >
          {how}
        </p>
        <button
          ref={buttonRef}
          type="button"
          onClick={() => onStart()}
          className="relative mt-2 inline-flex min-h-11 items-center gap-2 rounded-lg bg-blue-600 px-5 text-sm font-semibold text-white shadow-lg hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white sm:text-base"
        >
          <Play className="size-4" aria-hidden="true" /> Start the exam
        </button>
        <SceneCursor cursor={scene.cursor} />
      </div>
      <CaptionBar caption={scene.caption} speaking={scene.speaking} voice={scene.voice} onVoice={scene.setVoice} />
    </div>
  );
}
