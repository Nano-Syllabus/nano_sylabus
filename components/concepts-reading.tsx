"use client";

import { BookOpen, Check, X } from "lucide-react";
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { trimModelFiller } from "@/lib/model-filler";
import { Markdown } from "@/components/markdown";
import { cn } from "@/lib/utils";
import { ConceptActivityCard } from "@/components/concept-activity";
import { ConceptExplainerVideo } from "@/components/concept-explainer-video";
import "@/components/microbook.css";
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

export type ChapterPiece =
  | { kind: "lead"; text: string }
  | { kind: "text"; text: string }
  | { kind: "formula"; text: string }
  | { kind: "example"; number: number; text: string }
  | { kind: "tip"; text: string }
  | { kind: "activity"; activity: ConceptActivity; number: number };

export type ChapterSection = {
  /** Position among all sections; anchors and progress hang off it. */
  index: number;
  title: string;
  /** The lesson's own number ("### 2. Back EMF"), when it has one. */
  number: number | null;
  role: "lesson" | "practice" | "formulas" | "mistakes" | "other";
  pieces: ChapterPiece[];
};

export type Chapter = {
  why: string;
  ready: string[];
  idea: string;
  /** Anything before the first section that is not one of the three above. */
  opening: ChapterPiece[];
  sections: ChapterSection[];
};

const LABEL = (name: string) => new RegExp(`^(?:-\\s*)?\\*\\*${name}:?\\*\\*:?\\s*`, "i");
const WHY = LABEL("Why it matters");
const READY = LABEL("Be ready for");
const IDEA = LABEL("The idea");
const TIP = LABEL("(?:Exam tip|In the exam)");
const DISPLAY_MATH = /^\$\$[\s\S]+\$\$$/;
const LEAD = /^\*(?!\*)([\s\S]+)\*$/;

function sectionRole(title: string): ChapterSection["role"] {
  if (/^exam practice$/i.test(title)) return "practice";
  if (/^formulas?\b/i.test(title)) return "formulas";
  if (/^(?:common mistakes|where it goes wrong)$/i.test(title)) return "mistakes";
  return /^\d+\.\s/.test(title) ? "lesson" : "other";
}

/**
 * The reading's paragraphs as a micro-book chapter: the opening (why it matters,
 * what to be ready for, the one idea), then its sections, each piece typed so
 * the sheet can draw a formula as a formula and an exam tip as a tip.
 *
 * It reads the labels `_render_reading` in the API writes. A reading that has
 * none of them (an older one, or one translated with its labels) still renders:
 * unknown paragraphs are text, and text before any heading is the opening.
 */
export function readingChapter(reading: string[]): Chapter {
  const chapter: Chapter = { why: "", ready: [], idea: "", opening: [], sections: [] };
  let current: ChapterSection | null = null;
  const push = (piece: ChapterPiece) => (current ? current.pieces.push(piece) : chapter.opening.push(piece));

  for (const block of readingBlocks(reading)) {
    if (block.kind === "activity") {
      push(block);
      continue;
    }
    if (block.kind === "example") {
      push(block);
      continue;
    }
    const text = block.text.trim();
    const heading = /^#{1,3}\s+(.+)$/.exec(text);
    if (heading && !text.includes("\n")) {
      const title = heading[1].replace(/[*_`]/g, "").trim();
      const role = sectionRole(title);
      const numbered = /^(\d+)\.\s+(.+)$/.exec(title);
      current = {
        index: chapter.sections.length,
        title: numbered ? numbered[2] : title,
        number: numbered ? Number(numbered[1]) : null,
        role,
        pieces: [],
      };
      chapter.sections.push(current);
      continue;
    }
    if (!current && WHY.test(text)) chapter.why = text.replace(WHY, "");
    else if (!current && READY.test(text))
      chapter.ready = text
        .replace(READY, "")
        .split("\n")
        .map((line) => line.replace(/^[-*]\s*/, "").trim())
        .filter(Boolean);
    else if (!current && IDEA.test(text)) chapter.idea = text.replace(IDEA, "");
    else if (TIP.test(text)) push({ kind: "tip", text: text.replace(TIP, "") });
    else if (DISPLAY_MATH.test(text)) push({ kind: "formula", text });
    else if (current?.role === "lesson" && LEAD.test(text) && !text.includes("\n"))
      push({ kind: "lead", text: LEAD.exec(text)![1] });
    else push({ kind: "text", text });
  }
  return chapter;
}

const VISUAL_KINDS = new Set(["figure", "experiment", "diagram", "bits"]);

function ChapterPieceView({
  piece,
  code,
  tone,
  sourceId,
  progressKey,
  done,
  onDone,
}: {
  piece: ChapterPiece;
  code?: string;
  tone?: "pa" | "ca" | "ex";
  sourceId: string;
  progressKey: string;
  done: number[];
  onDone: (number: number) => void;
}) {
  switch (piece.kind) {
    case "lead":
      return <Markdown text={piece.text} className="mb-intuition text-[17px] leading-[1.65]" />;
    case "formula":
      return (
        <div className="mb-eq">
          <Markdown text={piece.text} className="text-[17px]" />
        </div>
      );
    case "example":
      return (
        <details className="mb-sol">
          <summary>Worked example</summary>
          <div>
            <Markdown text={piece.text} className="text-[16px] leading-[1.65]" />
          </div>
        </details>
      );
    case "tip":
      return (
        <div className="mb-tip">
          <Markdown text={`**Exam tip.** ${piece.text}`} className="text-[16px] leading-[1.6]" />
        </div>
      );
    case "activity":
      return (
        <ConceptActivityCard
          key={`${sourceId}-activity-${piece.number}`}
          activity={piece.activity}
          code={code}
          tone={tone}
          complete={done.includes(piece.number)}
          storageKey={`${progressKey}:activity-${piece.number}`}
          onComplete={() => onDone(piece.number)}
        />
      );
    default:
      return (
        <div className="mb-text">
          <Markdown text={bulletPointReading(piece.text)} className="text-[17px] leading-[1.65]" />
        </div>
      );
  }
}

/**
 * The sheet itself, full screen, laid out like the micro-book it is modelled on
 * (see components/microbook.css): a sticky progress rail, then the chapter on
 * grid paper — why it matters, the one idea, numbered sections each with its
 * figure or graph and a check, the exam practice, and a revision card.
 *
 * It is a dialog in the full sense: Escape closes it, focus moves into it and
 * stays there, the page behind does not scroll, and focus goes back to the
 * button that opened it.
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
  const contentRef = useRef<HTMLDivElement>(null);
  const prefix = useId();
  const chapter = useMemo(() => readingChapter(source.reading), [source.reading]);
  const activityNumbers = (section: ChapterSection) =>
    section.pieces.flatMap((piece) => (piece.kind === "activity" ? [piece.number] : []));
  const activityCount =
    chapter.sections.reduce((sum, s) => sum + activityNumbers(s).length, 0) +
    chapter.opening.filter((piece) => piece.kind === "activity").length;
  const progressKey = conceptProgressKey(source.id, source.reading);
  const [progress, setProgress] = useState<{ key: string; done: number[]; round: number }>({
    key: "",
    done: [],
    round: 0,
  });
  const done = progress.key === progressKey ? progress.done : [];
  const [active, setActive] = useState(0);

  // Lessons are numbered by the reading; the exam practice takes the next number.
  const lessons = chapter.sections.filter((s) => s.role === "lesson");
  const lastNumber = lessons.reduce((max, s) => Math.max(max, s.number ?? 0), 0);
  const numberOf = (s: ChapterSection) =>
    s.role === "practice" ? lastNumber + 1 : s.role === "lesson" ? s.number : null;
  const body = chapter.sections.filter((s) => s.role !== "formulas" && s.role !== "mistakes");
  const revision = chapter.sections.filter((s) => s.role === "formulas" || s.role === "mistakes");
  const navigable = body.filter((s) => s.role === "lesson" || s.role === "practice");

  useEffect(() => {
    let stored: unknown;
    try {
      stored = JSON.parse(localStorage.getItem(progressKey) || "[]");
    } catch {
      stored = [];
    }
    setProgress((current) => ({
      key: progressKey,
      round: current.round,
      done: Array.isArray(stored)
        ? Array.from(
            new Set(stored.filter((n): n is number => Number.isInteger(n) && n > 0 && n <= activityCount)),
          )
        : [],
    }));
  }, [progressKey, activityCount]);

  const markDone = (number: number) => {
    const next = Array.from(new Set([...done, number]));
    setProgress((current) => ({ ...current, key: progressKey, done: next }));
    try {
      localStorage.setItem(progressKey, JSON.stringify(next));
    } catch {
      /* Works without browser storage. */
    }
  };

  const resetProgress = () => {
    try {
      for (let i = localStorage.length - 1; i >= 0; i--) {
        const key = localStorage.key(i);
        if (key && (key === progressKey || key.startsWith(`${progressKey}:`))) localStorage.removeItem(key);
      }
    } catch {
      /* Nothing stored to clear. */
    }
    // A new round remounts every activity, so their own drafts start empty too.
    setProgress((current) => ({ key: progressKey, done: [], round: current.round + 1 }));
    contentRef.current?.scrollTo({ top: 0, behavior: "instant" });
  };

  const goTo = (index: number) => {
    setActive(index);
    const element = document.getElementById(`${prefix}-section-${index}`);
    const scroller = contentRef.current;
    if (!element || !scroller) return;
    scroller.scrollTo({
      top: element.getBoundingClientRect().top - scroller.getBoundingClientRect().top + scroller.scrollTop - 8,
      behavior: "instant",
    });
    element.focus({ preventScroll: true });
  };

  // The rail follows the reader: the last section whose top has scrolled past.
  useEffect(() => {
    const scroller = contentRef.current;
    if (!scroller) return;
    const onScroll = () => {
      const top = scroller.getBoundingClientRect().top + 120;
      let current = 0;
      for (const section of chapter.sections) {
        const element = document.getElementById(`${prefix}-section-${section.index}`);
        if (element && element.getBoundingClientRect().top <= top) current = section.index;
      }
      setActive(current);
    };
    scroller.addEventListener("scroll", onScroll, { passive: true });
    return () => scroller.removeEventListener("scroll", onScroll);
  }, [chapter.sections, prefix]);

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

  const percent = activityCount ? Math.round((done.length / activityCount) * 100) : 0;
  const sectionDone = (section: ChapterSection) => {
    const numbers = activityNumbers(section);
    return numbers.length > 0 && numbers.every((n) => done.includes(n));
  };
  const renderPieces = (section: ChapterSection | null, pieces: ChapterPiece[], keyBase: string) => {
    const n = section ? numberOf(section) : null;
    let order = 0;
    return pieces.map((p, i) => {
      const isActivity = p.kind === "activity";
      if (isActivity) order += 1;
      const tone: "pa" | "ca" | "ex" =
        section?.role === "practice" ? "ex" : isActivity && VISUAL_KINDS.has(p.activity.kind) ? "pa" : "ca";
      return (
        <ChapterPieceView
          key={`${keyBase}-${i}`}
          piece={p}
          code={isActivity && n !== null ? `${n}.${order}` : undefined}
          tone={tone}
          sourceId={`${source.id}-${progress.round}`}
          progressKey={progressKey}
          done={done}
          onDone={markDone}
        />
      );
    });
  };

  return (
    <div className="fixed inset-0 z-[70]">
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        data-nanoai-context="Concepts sheet open on screen"
        aria-labelledby={titleId}
        className="mb absolute inset-0 flex flex-col animate-in fade-in duration-150 motion-reduce:animate-none"
      >
        <header className="mb-top">
          <div className="min-w-0">
            <p className="mb-crumb mb-ui">Concepts{source.subjectName ? ` · ${source.subjectName}` : ""}</p>
            <h2 id={titleId} className="truncate">
              {source.title}
            </h2>
          </div>
          <button ref={closeRef} type="button" onClick={onClose} aria-label="Close concepts" className="mb-close">
            <X className="size-4" aria-hidden="true" />
          </button>
        </header>
        <div className="flex min-h-0 flex-1 flex-col md:grid md:grid-cols-[17.5rem_minmax(0,1fr)]">
          {(navigable.length > 1 || activityCount > 0) && (
            <aside aria-label="Chapter progress" className="mb-side shrink-0 border-b md:overflow-y-auto md:border-b-0">
              <div className="mb-brand hidden md:block">
                <strong>{source.subjectName || "Concepts"}</strong>
                <span>Interactive micro-topic</span>
              </div>
              {activityCount > 0 && (
                <>
                  <div className="mb-bar" aria-hidden="true">
                    <i style={{ width: `${percent}%` }} />
                  </div>
                  <p className="mb-count mb-ui" aria-live="polite">
                    {done.length} of {activityCount} activities complete
                  </p>
                </>
              )}
              <nav aria-label="Chapter sections" className="mb-nav">
                <ol className="flex gap-1 overflow-x-auto md:block md:overflow-visible">
                  {navigable.map((section) => (
                    <li key={section.index} className="shrink-0 md:shrink">
                      <button
                        type="button"
                        aria-current={active === section.index ? "location" : undefined}
                        onClick={() => goTo(section.index)}
                      >
                        <span className="mb-n">{numberOf(section)}</span>
                        <span className="whitespace-nowrap md:whitespace-normal">{section.title}</span>
                        {sectionDone(section) && (
                          <Check className="mb-done mt-0.5 size-4 shrink-0" aria-label="done" />
                        )}
                      </button>
                    </li>
                  ))}
                </ol>
              </nav>
              {done.length > 0 && (
                <button type="button" onClick={resetProgress} className="mb-link hidden md:block">
                  Reset progress
                </button>
              )}
            </aside>
          )}
          <div ref={contentRef} className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
            <article className="mb-col">
              <h1>{source.title}</h1>
              {chapter.why && <Markdown text={chapter.why} className="mb-lead text-[17px] leading-[1.65]" />}
              <ConceptExplainerVideo challengeId={source.id} />
              {/* No "Be ready for" list: a column of exam questions before any
                  teaching read as a quiz (user, 2026-10-15). */}
              {chapter.idea && (
                <div className="mb-rem">
                  <Markdown text={`**The idea.** ${chapter.idea}`} className="text-[17px] leading-[1.6]" />
                </div>
              )}
              {renderPieces(null, chapter.opening, "opening")}
              {body.map((section) => (
                <section
                  key={`${progressKey}-${progress.round}-${section.index}`}
                  id={`${prefix}-section-${section.index}`}
                  tabIndex={-1}
                  aria-labelledby={`${prefix}-heading-${section.index}`}
                  className="mb-sec focus:outline-none"
                  data-concept-section={section.role}
                >
                  <h3 id={`${prefix}-heading-${section.index}`}>
                    {numberOf(section) !== null && <span className="mb-sec-n">{numberOf(section)}</span>}
                    {section.title}
                  </h3>
                  {renderPieces(section, section.pieces, `${section.index}`)}
                </section>
              ))}
              {revision.length > 0 && (
                <aside className="mb-sheet" data-concept-section="revision" aria-label="Revision card">
                  <h4>Revision card</h4>
                  {revision.map((section) => (
                    <div key={section.index} className="mb-text">
                      <h5>{section.role === "formulas" ? "Formulas" : "Common mistakes"}</h5>
                      {renderPieces(section, section.pieces, `rev-${section.index}`)}
                    </div>
                  ))}
                </aside>
              )}
              {activityCount > 0 && done.length === activityCount && (
                <p role="status" className="mb-done-note">
                  Every activity in this chapter is complete. You’re ready for the questions.
                </p>
              )}
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
