"use client";

import { BookOpen, X } from "lucide-react";
import { Fragment, useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { trimModelFiller } from "@/lib/model-filler";
import { AnswerFontPicker, answerFontStyle, useAnswerFont } from "@/components/answer-font-picker";
import { Markdown } from "@/components/markdown";
import {
  paperLabelClass,
  paperTextClass,
  workedAnswerClass,
} from "@/components/worked-example-card";
import { cn } from "@/lib/utils";
import { ConceptActivityCard } from "@/components/concept-activity";
import { ConceptRecall } from "@/components/concept-recall";
import { readingSections } from "@/lib/concept-study";
import {
  CONCEPT_ACTIVITY_FENCE,
  conceptProgressKey,
  parseConceptActivity,
  type ConceptActivity,
} from "@/lib/concept-activities";

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
  | { kind: "example"; number: number; text: string }
  | { kind: "activity"; activity: ConceptActivity; number: number };

/** The reading's paragraphs, with each worked example pulled out to be drawn as
 *  its own card and numbered in reading order. */
export function readingBlocks(reading: string[]): ReadingBlock[] {
  let examples = 0;
  let activities = 0;
  const prose = (raw: string): ReadingBlock => {
    const paragraph = trimModelFiller(raw);
    const label = paragraph.match(WORKED_EXAMPLE);
    const text = label ? paragraph.slice(label[0].length).trim() : "";
    if (!text) return { kind: "text", text: paragraph };
    examples += 1;
    return { kind: "example", number: examples, text };
  };
  return reading.flatMap((raw): ReadingBlock[] => {
    const blocks: ReadingBlock[] = [];
    let offset = 0;
    // Parse before the prose filter: compact JSON can contain hundreds of
    // words, which the filter would mistake for a runaway sentence.
    for (const match of raw.matchAll(CONCEPT_ACTIVITY_FENCE)) {
      const before = raw.slice(offset, match.index).trim();
      if (before) blocks.push(prose(before));
      const activity = parseConceptActivity(match[1]);
      blocks.push(
        activity
          ? { kind: "activity", activity, number: ++activities }
          : { kind: "text", text: "This activity is unavailable. Continue with the lesson notes." },
      );
      offset = match.index! + match[0].length;
    }
    const after = raw.slice(offset).trim();
    if (after) blocks.push(prose(after));
    return blocks;
  });
}

/**
 * Turn dense generated prose into scan-friendly notes without changing its
 * meaning. Structural Markdown (headings, equations, existing lists, tables,
 * figures and code) is already easy to scan and is left alone. Ordinary prose
 * becomes one bullet per sentence, including readings already cached before the
 * shorter generation brief was introduced.
 */
export function bulletPointReading(text: string) {
  let content = text.trim();
  if (!content) return content;
  if (/^(?:#{1,6}\s|[-*+]\s|\d+[.)]\s|\$\$|```|~~~|\||!\[|<)/.test(content)) return content;

  // The opening idea used to be a quote. It is more consistent with the rest of
  // the quick notes as the first bullet.
  content = content.replace(/^>\s*/, "");

  const italic = /^\*(?!\*)([\s\S]+)\*$/.exec(content);
  const prose = italic?.[1] ?? content;
  const sentences = prose
    .split(/(?<=[.!?])\s+(?=[A-Z0-9*_`(])/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
  return sentences.map((sentence) => `- ${italic ? `*${sentence}*` : sentence}`).join("\n");
}

export function readingMinutes(reading: string[]) {
  const words = reading
    .join(" ")
    .replace(CONCEPT_ACTIVITY_FENCE, "")
    .split(/\s+/)
    .filter(Boolean).length;
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
  const sections = useMemo(() => readingSections(blocks, source.title), [blocks, source.title]);
  const activityCount = blocks.filter((block) => block.kind === "activity").length;
  const progressKey = conceptProgressKey(source.id, source.reading);
  const [progress, setProgress] = useState<{
    key: string;
    done: number[];
    ratings: Record<string, "review" | "ready">;
  }>({ key: "", done: [], ratings: {} });
  const done = progress.key === progressKey ? progress.done : [];
  const ratings = progress.key === progressKey ? progress.ratings : {};
  const [covered, setCovered] = useState<number[]>([]);
  const [reviewOnly, setReviewOnly] = useState(false);
  const [activeSection, setActiveSection] = useState(0);
  const needsReview = (start: number, end: number) =>
    ratings[`section-${start}`] === "review" ||
    blocks
      .slice(start, end)
      .some(
        (block) => block.kind === "activity" && ratings[`activity-${block.number}`] === "review",
      );
  const reviewSections = sections.filter((section) => needsReview(section.start, section.end));
  const contentRef = useRef<HTMLDivElement>(null);
  const prefix = useId();

  const goToSection = (start: number) => {
    setReviewOnly(false);
    setCovered((current) => current.filter((n) => n !== start));
    setActiveSection(start);
    requestAnimationFrame(() => {
      const element = document.getElementById(`${prefix}-section-${start}`);
      if (!element || !contentRef.current) return;
      contentRef.current.scrollTo({
        top:
          element.getBoundingClientRect().top -
          contentRef.current.getBoundingClientRect().top +
          contentRef.current.scrollTop -
          20,
        behavior: "instant",
      });
      element.focus({ preventScroll: true });
    });
  };

  useEffect(() => {
    let stored: unknown;
    let storedRatings: unknown;
    try {
      stored = JSON.parse(localStorage.getItem(progressKey) || "[]");
      storedRatings = JSON.parse(localStorage.getItem(`${progressKey}:ratings`) || "{}");
    } catch {
      stored = [];
      storedRatings = {};
    }
    setProgress({
      key: progressKey,
      ratings:
        storedRatings && typeof storedRatings === "object" && !Array.isArray(storedRatings)
          ? Object.fromEntries(
              Object.entries(storedRatings).filter(
                ([key, value]) =>
                  /^(section|activity)-\d+$/.test(key) && (value === "review" || value === "ready"),
              ),
            )
          : {},
      done: Array.isArray(stored)
        ? Array.from(
            new Set(
              stored.filter((n): n is number => Number.isInteger(n) && n > 0 && n <= activityCount),
            ),
          )
        : [],
    });
    setCovered([]);
    setReviewOnly(false);
  }, [progressKey, activityCount]);

  const rate = (key: string, rating: "review" | "ready", number?: number) => {
    const next =
      number === undefined
        ? done
        : rating === "ready"
          ? Array.from(new Set([...done, number]))
          : done.filter((n) => n !== number);
    const nextRatings = { ...ratings, [key]: rating };
    setProgress({ key: progressKey, done: next, ratings: nextRatings });
    if (reviewOnly && rating === "ready") setReviewOnly(false);
    try {
      localStorage.setItem(progressKey, JSON.stringify(next));
      localStorage.setItem(`${progressKey}:ratings`, JSON.stringify(nextRatings));
    } catch {
      /* Works without browser storage. */
    }
  };

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
      const focusable = Array.from(
        panelRef.current.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), summary, [tabindex]:not([tabindex="-1"])',
        ),
      ).filter((element) => element.getClientRects().length > 0);
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
        data-nanoai-context="Concepts sheet open on screen"
        aria-labelledby={titleId}
        className="absolute inset-y-0 right-0 flex w-full max-w-[72rem] flex-col border-l border-border bg-bg-primary shadow-2xl animate-in slide-in-from-right duration-200 motion-reduce:animate-none"
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
        <div className="flex min-h-0 flex-1 flex-col md:flex-row">
          {sections.length > 1 && (
            <nav
              aria-label="Lesson sections"
              className="shrink-0 border-b border-border bg-bg-secondary px-4 py-3 md:w-52 md:overflow-y-auto md:border-b-0 md:border-r"
            >
              {activityCount > 0 && (
                <div className="mb-3">
                  <p className="mb-2 text-xs font-semibold text-text-secondary" aria-live="polite">
                    {done.length} / {activityCount} activities completed
                  </p>
                  <progress
                    className="h-1.5 w-full accent-blue-600"
                    value={done.length}
                    max={activityCount}
                    aria-label="Lesson activity progress"
                  />
                </div>
              )}
              <div className="mb-3 flex flex-wrap items-center gap-2 font-sans">
                <button
                  type="button"
                  aria-pressed={reviewOnly}
                  onClick={() => setReviewOnly(!reviewOnly)}
                  className="rounded-lg border border-border px-2 py-1.5 text-xs font-semibold text-text-secondary hover:bg-bg-tertiary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                >
                  {reviewOnly
                    ? "Show all sections"
                    : `Review difficult sections${reviewSections.length ? ` (${reviewSections.length})` : ""}`}
                </button>
                <p className="text-xs text-text-muted" aria-live="polite">
                  {
                    sections.filter((section) => ratings[`section-${section.start}`] === "ready")
                      .length
                  }{" "}
                  sections self-checked
                </p>
              </div>
              <div className="flex gap-2 overflow-x-auto md:flex-col md:overflow-visible">
                {sections.map((section) => (
                  <button
                    key={section.start}
                    type="button"
                    className={`shrink-0 rounded-lg px-2 py-2 text-left text-xs font-medium text-text-secondary hover:bg-bg-tertiary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 md:shrink ${activeSection === section.start ? "bg-blue-500/10 text-blue-600 dark:text-blue-400" : ""}`}
                    aria-current={activeSection === section.start ? "location" : undefined}
                    onClick={() => goToSection(section.start)}
                  >
                    {section.title}
                    {needsReview(section.start, section.end) && (
                      <span className="ml-1 text-amber-700 dark:text-amber-400"> · Revisit</span>
                    )}
                  </button>
                ))}
              </div>
            </nav>
          )}
          <div
            ref={contentRef}
            className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-5 sm:px-6"
          >
            {reviewOnly && !reviewSections.length && (
              <p
                role="status"
                className="mb-4 rounded-lg bg-bg-secondary p-4 text-sm text-text-secondary"
              >
                Nothing marked for review yet. Use the recall checks to note which sections need
                another pass.
              </p>
            )}
            <article className="answer-paper" style={answerFontStyle(answerFont)}>
              {activityCount > 0 && sections.length <= 1 && (
                <p className="mb-4 text-xs text-text-muted" aria-live="polite">
                  {done.length} / {activityCount} activities completed
                </p>
              )}
              {sections.map((section, sectionIndex) => (
                <section
                  key={`${progressKey}-${section.start}`}
                  id={`${prefix}-section-${section.start}`}
                  tabIndex={-1}
                  className="focus:outline-none"
                  hidden={reviewOnly && !needsReview(section.start, section.end)}
                  data-concept-section={section.start}
                >
                  {covered.includes(section.start) && (
                    <p className="mb-3 rounded-lg border border-dashed border-blue-500/40 p-4 font-sans text-sm text-text-secondary">
                      Notes covered for recall · {section.title}
                    </p>
                  )}
                  <div hidden={covered.includes(section.start)}>
                    {blocks.slice(section.start, section.end).map((block, offset) => {
                      const index = section.start + offset;
                      return block.kind === "activity" ? (
                        <ConceptActivityCard
                          key={`${source.id}-reading-${index}`}
                          activity={block.activity}
                          complete={done.includes(block.number)}
                        needsReview={ratings[`activity-${block.number}`] === "review"}
                          storageKey={`${progressKey}:activity-${block.number}`}
                          onComplete={() => rate(`activity-${block.number}`, "ready", block.number)}
                          onReview={() => rate(`activity-${block.number}`, "review", block.number)}
                        />
                      ) : block.kind === "example" ? (
                        <Fragment key={`${source.id}-reading-${index}`}>
                          <p className={paperLabelClass}>Example {block.number}</p>
                          <Markdown text={block.text} className={workedAnswerClass} />
                        </Fragment>
                      ) : (
                        <div
                          key={`${source.id}-reading-${index}`}
                          id={`${prefix}-block-${index}`}
                          tabIndex={-1}
                          className="focus:outline-none"
                        >
                          <Markdown
                            text={bulletPointReading(block.text)}
                            className={paperTextClass}
                          />
                        </div>
                      );
                    })}
                  </div>
                  {section.hasNotes && (
                    <ConceptRecall
                      title={section.title}
                      storageKey={`${progressKey}:section-${section.start}`}
                      covered={covered.includes(section.start)}
                      onCover={(cover) =>
                        setCovered((current) =>
                          cover
                            ? [...current, section.start]
                            : current.filter((n) => n !== section.start),
                        )
                      }
                      onRate={(rating) => rate(`section-${section.start}`, rating)}
                    />
                  )}
                  {!reviewOnly && sectionIndex < sections.length - 1 && (
                    <button
                      type="button"
                      className="mb-5 rounded-lg border border-border px-3 py-2 font-sans text-sm font-semibold text-text-secondary hover:bg-bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                      onClick={() => goToSection(sections[sectionIndex + 1].start)}
                    >
                      Continue to {sections[sectionIndex + 1].title}
                    </button>
                  )}
                </section>
              ))}
            </article>
          </div>
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
  translating = false,
  bare = false,
}: {
  source: ConceptsSource;
  className?: string;
  /** Roman Nepali is being written: the preview is held and the sheet waits. */
  translating?: boolean;
  /** No card surface: a heading and the button, on the page itself. */
  bare?: boolean;
}) {
  const [open, setOpen] = useState(false);
  // Stable, so the sheet's focus-and-scroll effect runs once per opening rather
  // than on every render of the screen behind it.
  const close = useCallback(() => setOpen(false), []);
  if (!source.reading.length) return null;
  return (
    <section className={cn(!bare && conceptsCardClass, className)}>
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="type-student-section-title">Concepts</h2>
        <span className="shrink-0 text-xs text-text-muted">
          {readingMinutes(source.reading)} min read
        </span>
      </div>
      {/* No preview line: the card is the way in, and two clipped sentences
          of the reading only repeated its first paragraph (user, 2026-09-24). */}
      <button
        type="button"
        disabled={translating}
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        className="mt-4 inline-flex min-h-10 items-center gap-2 rounded-lg bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-wait disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
      >
        <BookOpen className="size-4" aria-hidden="true" />
        {translating ? "Putting it into Roman Nepali…" : "Read concepts"}
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
  bare = false,
}: {
  source: ConceptsSource;
  readingError?: string | null;
  waiting?: boolean;
  /** Told when the reading lands, so a parent can keep it past an unmount. */
  onReading?: (reading: string[]) => void;
  className?: string;
  /** As on `ConceptsCard`: no card surface. */
  bare?: boolean;
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
        const response = await fetch(
          `/api/student/challenges/${encodeURIComponent(source.id)}/content`,
        );
        const payload = (await response.json().catch(() => ({}))) as {
          challenge?: {
            content?: { lesson?: { content?: string[] }; readingError?: string | null } | null;
          };
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

  if (reading.length) {
    return <ConceptsCard source={{ ...source, reading }} className={className} bare={bare} />;
  }
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
        bare
          ? "text-sm text-text-muted"
          : "rounded-xl border border-border bg-bg-secondary p-4 text-sm text-text-muted",
        className,
      )}
    >
      {note}
    </p>
  );
}
