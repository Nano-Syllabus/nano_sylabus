"use client";

import { BookOpen, X } from "lucide-react";
import { Fragment, useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AnswerFontPicker, answerFontStyle, useAnswerFont } from "@/components/answer-font-picker";
import { Markdown } from "@/components/markdown";
import { paperLabelClass, paperTextClass, workedAnswerClass } from "@/components/worked-example-card";
import { cn } from "@/lib/utils";

/**
 * A topic's concepts reading: a short card, and the full reading in a sheet from
 * the right.
 *
 * Shared by the two places a student reads it — step 1 of a challenge and the
 * challenge's page in Revision — so the card, the sheet and the way it closes are
 * the same thing in both, not two copies that drift apart.
 *
 * The reading is the longest thing on either screen by far. Inline, it pushed
 * what the screen is FOR — the past questions and the worked examples — several
 * screens down. Behind a button it is one click away and out of the way.
 */

/** The card's frame, exported so a loading skeleton draws the same box. */
export const conceptsCardClass = "rounded-xl border border-border bg-bg-secondary p-4 sm:p-5";

export type ConceptsSource = {
  /** The challenge the reading belongs to; keys the paragraphs. */
  id: string;
  title: string;
  subjectName: string;
  reading: string[];
};

/** The reading's first plain paragraph as text, for the card. Skips the opening
 *  idea line — a one-line quote reads badly cut to two lines of preview — and
 *  headings, and drops the markup a preview has no room to render. */
export function readingPreview(reading: string[]) {
  const first =
    reading.find((paragraph) => {
      const text = paragraph.trim();
      return text && !text.startsWith(">") && !text.startsWith("#");
    }) ?? "";
  return first
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/\${1,2}([^$]+)\${1,2}/g, "$1")
    .replace(/[*_`#>]+/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** How the reading marks a step's worked example (`_render_reading` in the API's
 *  routers/challenge.py). The Roman Nepali translation keeps the label. */
const WORKED_EXAMPLE = /^\*\*Worked(?: example)?:?\*\*:?\s*/i;

export type ReadingBlock =
  | { kind: "text"; text: string }
  | { kind: "example"; number: number; text: string };

/** The reading's paragraphs, with each worked example pulled out to be drawn as
 *  its own card and numbered in reading order. */
export function readingBlocks(reading: string[]): ReadingBlock[] {
  let examples = 0;
  return reading.map((paragraph) => {
    const label = paragraph.match(WORKED_EXAMPLE);
    const text = label ? paragraph.slice(label[0].length).trim() : "";
    if (!text) return { kind: "text", text: paragraph };
    examples += 1;
    return { kind: "example", number: examples, text };
  });
}

export function readingMinutes(reading: string[]) {
  const words = reading.join(" ").split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / 200));
}

/**
 * The sheet itself, as a dialog in the full sense: Escape and the backdrop close
 * it, focus moves into it and stays there, the page behind does not scroll, and
 * focus goes back to the button that opened it — a keyboard reader must not land
 * at the top of the page after reading.
 *
 * ESCAPE IS CAUGHT FIRST AND KEPT. In a challenge's focus mode Escape also means
 * "exit the challenge", and both listen on `window`. Registered in the capture
 * phase, this one runs before the challenge's and stops the key there, so closing
 * the reading never also throws the student out to the hub.
 */
export function ConceptsDrawer({
  source,
  onClose,
}: {
  source: ConceptsSource;
  onClose: () => void;
}) {
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const [answerFont, setAnswerFont] = useAnswerFont();
  const blocks = useMemo(() => readingBlocks(source.reading), [source.reading]);

  useEffect(() => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    closeRef.current?.focus();
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        onClose();
        return;
      }
      if (event.key !== "Tab" || !panelRef.current) return;
      const focusable = panelRef.current.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input, select, textarea, [tabindex]:not([tabindex="-1"])',
      );
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => {
      window.removeEventListener("keydown", onKeyDown, true);
      document.body.style.overflow = overflow;
      opener?.focus();
    };
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-[70]">
      <button
        type="button"
        tabIndex={-1}
        aria-label="Close concepts"
        onClick={onClose}
        className="absolute inset-0 bg-black/40 animate-in fade-in duration-200 motion-reduce:animate-none"
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="absolute inset-y-0 right-0 flex w-full max-w-[52.5rem] flex-col border-l border-border bg-bg-primary shadow-2xl animate-in slide-in-from-right duration-200 motion-reduce:animate-none"
      >
        {/* The font picker sits beside the close button on a wide sheet and on
            its own row under the title on a phone, where beside it would
            squeeze the title. */}
        <header className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-x-3 gap-y-3 border-b border-border px-5 py-4 sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:px-6">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wide text-blue-600 dark:text-blue-400">
              Concepts{source.subjectName ? ` · ${source.subjectName}` : ""}
            </p>
            <h2 id={titleId} className="type-student-card-title mt-1 text-text-primary">
              {source.title}
            </h2>
          </div>
          <div className="col-span-2 row-start-2 justify-self-start sm:col-span-1 sm:col-start-2 sm:row-start-1 sm:self-center">
            <AnswerFontPicker value={answerFont} onChange={setAnswerFont} />
          </div>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label="Close concepts"
            className="col-start-2 row-start-1 inline-flex size-10 shrink-0 items-center justify-center rounded-lg text-text-muted hover:bg-bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 sm:col-start-3"
          >
            <X className="size-4" aria-hidden="true" />
          </button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-5 sm:px-6">
          {/* The whole reading is written out on one ruled sheet, the way the
              worked examples are: a page of notes rather than a web page. A
              worked example is a labelled stretch of the same sheet, not a card
              laid on top of it. */}
          <article className="answer-paper" style={answerFontStyle(answerFont)}>
            {blocks.map((block, index) =>
              block.kind === "example" ? (
                <Fragment key={`${source.id}-reading-${index}`}>
                  <p className={paperLabelClass}>Example {block.number}</p>
                  <Markdown text={block.text} className={workedAnswerClass} />
                </Fragment>
              ) : (
                <Markdown
                  key={`${source.id}-reading-${index}`}
                  text={block.text}
                  className={paperTextClass}
                />
              ),
            )}
          </article>
        </div>
      </div>
    </div>
  );
}

/**
 * The card: a two-line preview, how long the reading is, and the button that
 * opens the sheet. Renders nothing when there is no reading to open.
 *
 * The sheet is portalled to `document.body`. A challenge in focus mode is its own
 * fixed, scrolling layer, and a sheet rendered inside it would sit in that
 * layer's stacking context and let the challenge scroll behind the backdrop.
 */
export function ConceptsCard({
  source,
  className,
}: {
  source: ConceptsSource;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  // Stable, so the sheet's focus-and-scroll effect runs once per opening rather
  // than on every render of the screen behind it.
  const close = useCallback(() => setOpen(false), []);
  if (!source.reading.length) return null;
  const preview = readingPreview(source.reading);
  return (
    <section
      className={cn(conceptsCardClass, className)}
    >
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="type-student-section-title">Concepts</h2>
        <span className="shrink-0 text-xs text-text-muted">
          {readingMinutes(source.reading)} min read
        </span>
      </div>
      {preview ? (
        <p className="mt-2 line-clamp-2 max-w-prose text-sm leading-6 text-text-secondary">
          {preview}
        </p>
      ) : null}
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        className="mt-4 inline-flex min-h-10 items-center gap-2 rounded-lg bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
      >
        <BookOpen className="size-4" aria-hidden="true" />
        Read concepts
      </button>
      {open
        ? createPortal(<ConceptsDrawer source={source} onClose={close} />, document.body)
        : null}
    </section>
  );
}

/** Widening, as the challenge screen's own poll: tight while the reading is
 *  plausibly seconds away, slow after, and it gives up on a tab left open. */
function readingPollDelay(attempt: number) {
  return attempt < 3 ? 2_000 : attempt < 8 ? 4_000 : 8_000;
}
const READING_POLL_LIMIT = 40;

/**
 * The Concepts card for a challenge whose reading is not on it yet.
 *
 * Every challenge gets its reading, but it is written after everything the
 * student waits for — and a pass that died after that, or a row built before the
 * reading was, has none. Asking the challenge's row (`/content`) is what has the
 * server write it (`scheduleChallengeReadingBackfill`), so this says it is being
 * written, asks until it lands, and then IS the Concepts card — the same card,
 * without a reload. A topic whose material cannot produce a reading says so and
 * stops asking.
 *
 * `waiting` holds the polling off while the challenge's own build is running:
 * that build writes the reading itself, and the screen is already polling it.
 */
export function AwaitedConceptsCard({
  source,
  readingError,
  waiting = false,
  onReading,
  className,
}: {
  source: ConceptsSource;
  readingError?: string | null;
  waiting?: boolean;
  /** Told when the reading lands, so a parent can keep it past an unmount. */
  onReading?: (reading: string[]) => void;
  className?: string;
}) {
  const [reading, setReading] = useState<string[]>(source.reading);
  const [error, setError] = useState(readingError || "");
  const [gaveUp, setGaveUp] = useState(false);
  const onReadingRef = useRef(onReading);
  useEffect(() => {
    onReadingRef.current = onReading;
  }, [onReading]);

  useEffect(() => {
    if (waiting || reading.length || error) return;
    let cancelled = false;
    let attempt = 0;
    let timer = 0;
    const tick = async () => {
      attempt += 1;
      try {
        const response = await fetch(`/api/student/challenges/${encodeURIComponent(source.id)}/content`);
        const payload = (await response.json().catch(() => ({}))) as {
          challenge?: { content?: { lesson?: { content?: string[] }; readingError?: string | null } | null };
        };
        if (cancelled) return;
        const landed = payload.challenge?.content?.lesson?.content ?? [];
        if (landed.length) {
          setReading(landed);
          onReadingRef.current?.(landed);
          return;
        }
        if (payload.challenge?.content?.readingError) {
          setError(payload.challenge.content.readingError);
          return;
        }
      } catch {
        // A dropped poll is not worth surfacing; the next tick asks again.
      }
      if (cancelled) return;
      if (attempt >= READING_POLL_LIMIT) {
        setGaveUp(true);
        return;
      }
      timer = window.setTimeout(() => void tick(), readingPollDelay(attempt));
    };
    // The first ask is immediate: it is what starts the reading being written.
    void tick();
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [source.id, waiting, reading.length, error]);

  if (reading.length) return <ConceptsCard source={{ ...source, reading }} className={className} />;
  const note = error
    ? "The concepts reading for this topic couldn't be written from your course material yet. It will be tried again the next time you open it."
    : gaveUp
      ? "The concepts reading for this topic is taking longer than usual. Open it again in a little while."
      : "The concepts reading for this topic is being written from your course material. It will appear here in a moment.";
  return (
    <p
      role="status"
      aria-live="polite"
      className={cn(
        "rounded-xl border border-border bg-bg-secondary p-4 text-sm text-text-muted",
        className,
      )}
    >
      {note}
    </p>
  );
}
