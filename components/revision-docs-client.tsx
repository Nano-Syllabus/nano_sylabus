"use client";

import { BookOpen, Check, ChevronsUpDown, Menu, Search, X } from "lucide-react";
import Link from "next/link";
import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { AnswerFontPicker, answerFontStyle, useAnswerFont } from "@/components/answer-font-picker";
import { normalizeQuestionText } from "@/lib/challenge-learn-questions";
import {
  StudyLanguageSwitch,
  inStudyLanguage,
  useRomanNepali,
  isTranslating,
  useStudyLanguage,
} from "@/components/study-language";
import { AwaitedConceptsCard, ConceptsCard } from "@/components/concepts-reading";
import { Markdown } from "@/components/markdown";
import { Explainer } from "@/components/challenge-fundamentals";
import { cn } from "@/lib/utils";
import { publishNanoAiTopic } from "@/lib/nanoai-topic";
import { WorkedExampleCard, workedAnswerClass } from "@/components/worked-example-card";
import { WorkedSolution } from "@/components/worked-solution";
import type {
  RevisionDocSemester,
  RevisionDocSubject,
  RevisionDocTopic,
  RevisionDocUnit,
  StudentRevisionDocs,
} from "@/lib/data/student-revision-docs";

/**
 * The revision section, as documentation.
 *
 * Laid out the way an API reference is laid out, because it is the same problem:
 * a body of material with a structure the reader already knows, where the job is
 * to get from "I want the thing about Laplace transforms" to that thing without
 * reading anything else. One page on the left, a navigator on the right.
 *
 * The navigator holds ONE subject at a time — its units and topics — and a
 * "Select subject" button above it opens every subject to choose from. The whole
 * course in one tree (semester → subject → unit → topic) ran to several screens
 * of mostly-closed branches for a student several subjects in, and a revision
 * sitting is one subject anyway.
 *
 * Everything in it has been earned. A topic is here because its challenge was
 * passed, so the page never has to explain what a locked or empty entry means.
 */

/** Within one subject, so the subject's own name is not in the haystack: it
 *  would match every topic in the navigator. */
function matches(topic: RevisionDocTopic, needle: string) {
  if (!needle) return true;
  const haystack = `${topic.title} ${topic.bigIdea}`.toLowerCase();
  return haystack.includes(needle);
}

/** One subject's units, filtered to a search term. Empty units are dropped
 *  rather than shown empty — a unit with no match is not a unit with no topics. */
function filterUnits(units: RevisionDocUnit[], needle: string) {
  if (!needle) return units;
  return units.flatMap((unit) => {
    const topics = unit.topics.filter((topic) => matches(topic, needle));
    return topics.length ? [{ ...unit, topics }] : [];
  });
}

type SubjectEntry = {
  /** Semester, course and slug: two courses can each have a "Year 1 · Semester
   *  1" and a subject of the same name, and they are different shelves. */
  key: string;
  semesterLabel: string;
  subject: RevisionDocSubject;
};

function listSubjects(semesters: RevisionDocSemester[]): SubjectEntry[] {
  return semesters.flatMap((semester) =>
    semester.subjects.map((subject) => ({
      key: `${semester.id}:${subject.courseId}:${subject.subjectSlug}`,
      semesterLabel: semester.label,
      subject,
    })),
  );
}

/*
 * The subject last chosen, remembered in this browser so a reload does not throw
 * the reader back to the first one. A preference, like the answer font — an
 * opaque key, and one a different account on the same machine simply will not
 * match, falling back to its own first subject.
 */
const SUBJECT_STORAGE_KEY = "ns-revision-subject";
const subjectListeners = new Set<() => void>();
let unsavedSubject: string | null = null;

function readRememberedSubject() {
  if (unsavedSubject !== null) return unsavedSubject;
  try {
    return window.localStorage.getItem(SUBJECT_STORAGE_KEY) ?? "";
  } catch {
    return "";
  }
}

function subscribeRememberedSubject(onChange: () => void) {
  subjectListeners.add(onChange);
  window.addEventListener("storage", onChange);
  return () => {
    subjectListeners.delete(onChange);
    window.removeEventListener("storage", onChange);
  };
}

function useRememberedSubject() {
  const key = useSyncExternalStore(subscribeRememberedSubject, readRememberedSubject, () => "");
  const setKey = useCallback((next: string) => {
    try {
      window.localStorage.setItem(SUBJECT_STORAGE_KEY, next);
      unsavedSubject = null;
    } catch {
      unsavedSubject = next;
    }
    subjectListeners.forEach((listener) => listener());
  }, []);
  return [key, setKey] as const;
}

/*
 * The docs' layout and chrome, shared by the page and its route skeleton
 * (`RevisionDocsSkeleton`, below). The skeleton used to be the generic notes grid
 * — nine cards, for a page that is a tree and one document — so a first visit
 * drew a different page and then swapped it out. Built from the same pieces, it
 * cannot drift from the page again.
 */
const docsRootClass = "flex min-h-full w-full bg-bg-secondary text-text-primary";
/** The navigator, on the right: the app's own sidebar already holds the left
 *  edge, and two stacked navigations there read as one confusing column. */
const docsAsideClass =
  "sticky top-0 hidden h-[100dvh] w-72 shrink-0 border-l border-border bg-bg-primary lg:block";
const docsMainClass = "min-w-0 flex-1 bg-bg-primary";
const docsMobileBarClass =
  "sticky top-0 z-10 flex items-center gap-2 border-b border-border bg-bg-primary/95 px-4 py-2 backdrop-blur lg:hidden";
const browseButtonClass =
  "inline-flex min-h-10 items-center gap-2 rounded-lg border border-border px-3 text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500";
/** A past question, and a worked example: the same box. */
const docsItemCardClass = "rounded-xl border border-border bg-bg-secondary p-4 sm:p-5";

function TreeSearch({
  value,
  onChange,
  disabled = false,
}: {
  value: string;
  onChange?: (value: string) => void;
  disabled?: boolean;
}) {
  return (
    <div className="border-b border-border px-3 pb-3 pt-2">
      <label htmlFor="revision-docs-search" className="sr-only">
        Search your revision docs
      </label>
      <div className="relative">
        <Search
          className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-text-muted"
          aria-hidden="true"
        />
        <input
          id="revision-docs-search"
          type="search"
          value={value}
          onChange={(event) => onChange?.(event.target.value)}
          readOnly={!onChange}
          disabled={disabled}
          placeholder="Search topics"
          className="min-h-9 w-full rounded-lg border border-transparent bg-bg-secondary pl-9 pr-3 text-sm text-text-primary placeholder:text-text-muted focus-visible:border-blue-500/60 focus-visible:bg-bg-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/30"
        />
      </div>
    </div>
  );
}

/** Opens the subject picker. Names the subject the navigator is showing, so the
 *  button is also the navigator's heading. Just the name: the year, semester and
 *  topic count were noise here, and the topics are listed right below it. */
function SubjectButton({
  name,
  onClick,
  disabled = false,
}: {
  name: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
}) {
  return (
    <div className="px-3 pt-3">
      <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        aria-haspopup="dialog"
        className="group flex w-full items-center gap-3 rounded-xl border border-border bg-bg-primary p-2.5 text-left shadow-sm transition-colors hover:border-blue-500/50 hover:bg-bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:cursor-default disabled:hover:border-border disabled:hover:bg-bg-primary"
      >
        <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-blue-500/10 text-blue-600 dark:text-blue-400">
          <BookOpen className="size-4" aria-hidden="true" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[11px] font-medium text-text-muted">Subject</span>
          <span className="block truncate text-sm font-semibold text-text-primary">{name}</span>
        </span>
        <ChevronsUpDown
          className="size-4 shrink-0 text-text-muted transition-colors group-hover:text-text-primary"
          aria-hidden="true"
        />
      </button>
    </div>
  );
}

/**
 * Every subject with something filed, to choose the one the navigator shows.
 *
 * Grouped by semester LABEL rather than by semester: two courses each have their
 * own "Year 1 · Semester 1", and two headings reading the same, one under the
 * other, look like a bug. Choosing is a radio group and "Revise" confirms it, so
 * arrowing through the list never swaps the page underneath.
 */
function SubjectPicker({
  subjects,
  currentKey,
  onRevise,
  onClose,
}: {
  subjects: SubjectEntry[];
  currentKey: string;
  onRevise: (key: string) => void;
  onClose: () => void;
}) {
  const titleId = useId();
  const radioName = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const [choice, setChoice] = useState(currentKey);
  const groups = useMemo(() => {
    const byLabel = new Map<string, SubjectEntry[]>();
    for (const entry of subjects) {
      byLabel.set(entry.semesterLabel, [...(byLabel.get(entry.semesterLabel) ?? []), entry]);
    }
    return [...byLabel].map(([label, entries]) => ({ label, entries }));
  }, [subjects]);

  useEffect(() => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const panel = panelRef.current;
    (panel?.querySelector<HTMLElement>("input:checked") ?? panel?.querySelector<HTMLElement>("input"))?.focus();
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
        'button:not([disabled]), input:checked, [tabindex]:not([tabindex="-1"])',
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
    <div className="fixed inset-0 z-[70] flex items-end justify-center sm:items-center sm:p-4">
      <button
        type="button"
        tabIndex={-1}
        aria-label="Close subject list"
        onClick={onClose}
        className="absolute inset-0 bg-black/40 animate-in fade-in duration-200 motion-reduce:animate-none"
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="relative flex max-h-[calc(100dvh-2rem)] w-full max-w-lg flex-col rounded-t-2xl border border-border bg-bg-primary shadow-2xl animate-in fade-in slide-in-from-bottom-4 duration-200 motion-reduce:animate-none sm:max-h-[min(40rem,calc(100dvh-2rem))] sm:rounded-2xl"
      >
        <form
          className="flex min-h-0 flex-1 flex-col"
          onSubmit={(event) => {
            event.preventDefault();
            if (choice) onRevise(choice);
          }}
        >
          <header className="flex items-center justify-between gap-3 px-5 pb-2 pt-4">
            <h2 id={titleId} className="type-student-card-title text-text-primary">
              Select a subject
            </h2>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close subject list"
              className="inline-flex size-10 shrink-0 items-center justify-center rounded-lg text-text-muted hover:bg-bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
            >
              <X className="size-4" aria-hidden="true" />
            </button>
          </header>

          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain px-3 pb-3 pt-1">
            {groups.map((group) => (
              <fieldset key={group.label}>
                <legend className="px-2 text-xs font-medium text-text-muted">{group.label}</legend>
                <div className="mt-1.5 space-y-0.5">
                  {group.entries.map((entry) => {
                    const checked = choice === entry.key;
                    return (
                      <label
                        key={entry.key}
                        className={`flex min-h-11 cursor-pointer items-center gap-3 rounded-lg px-2.5 transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-blue-500 ${
                          checked ? "bg-blue-500/10" : "hover:bg-bg-secondary"
                        }`}
                      >
                        <input
                          type="radio"
                          name={radioName}
                          value={entry.key}
                          checked={checked}
                          onChange={() => setChoice(entry.key)}
                          className="sr-only"
                        />
                        <span
                          className={`min-w-0 flex-1 truncate text-sm ${
                            checked ? "font-semibold text-blue-700 dark:text-blue-300" : "font-medium text-text-primary"
                          }`}
                        >
                          {entry.subject.name}
                        </span>
                        {checked ? (
                          <Check className="size-4 shrink-0 text-blue-600 dark:text-blue-400" strokeWidth={2.5} aria-hidden="true" />
                        ) : null}
                      </label>
                    );
                  })}
                </div>
              </fieldset>
            ))}
          </div>

          <footer className="border-t border-border px-5 py-3">
            <button
              type="submit"
              disabled={!choice}
              className="inline-flex min-h-11 w-full items-center justify-center rounded-lg bg-blue-600 px-5 text-sm font-semibold text-white hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 disabled:opacity-50"
            >
              Revise
            </button>
          </footer>
        </form>
      </div>
    </div>
  );
}

/** The subject on top, then search, the tree in the middle, the corpus links at
 *  the foot. */
function TreeFrame({
  subject,
  search,
  children,
}: {
  subject: ReactNode;
  search: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="flex h-full flex-col">
      {subject}
      {search}
      <nav aria-label="Revision docs" className="min-h-0 flex-1 overflow-y-auto px-2 py-3">
        {children}
      </nav>
    </div>
  );
}

/** The sittings a solved question was set in — "2072 Ashwin, 2075 Baisakh" —
 *  or "" for one no paper is known to have asked. */
function askedIn(example: RevisionDocTopic["solvedExamples"][number]) {
  const years = [...new Set([...(example.years ?? []), example.year].map((year) => year?.trim()).filter(Boolean))];
  return years.join(", ");
}

/**
 * The paper's MCQs, answer open: the right option ticked, a wrong pick struck
 * through beside it, and the one-line reason under the options.
 */
function McqReview({ challengeId, mcqs }: { challengeId: string; mcqs: RevisionDocTopic["mcqs"] }) {
  const right = mcqs.filter((item) => item.picked && item.picked === item.correct).length;
  const answered = mcqs.filter((item) => item.picked).length;
  const waiting = mcqs.filter((item) => !item.correct).length;
  return (
    <section className="mt-8">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="type-student-section-title">MCQs from your paper</h2>
        {answered ? (
          <p className="text-sm text-text-muted">
            {right} of {answered} right
            {waiting ? ` · ${waiting} still to answer` : ""}
          </p>
        ) : null}
      </div>
      <ol className="mt-3 divide-y divide-border border-y border-border">
        {mcqs.map((item, index) => {
          const missed = item.picked && item.picked !== item.correct;
          return (
            <li key={item.id} className="py-5">
              <div className="flex gap-3">
                <span className="w-6 shrink-0 pt-0.5 text-sm tabular-nums text-text-muted">{index + 1}.</span>
                <div className="min-w-0 flex-1">
                  <Markdown text={item.question} className="text-sm font-semibold leading-6 text-text-primary" />
                  <ul className="mt-2 space-y-1">
                    {item.options.map((option) => {
                      const correct = option.key === item.correct;
                      const wrongPick = missed && option.key === item.picked;
                      return (
                        <li
                          key={option.key}
                          className={cn(
                            "flex items-start gap-2 text-sm leading-6",
                            correct
                              ? "font-medium text-emerald-700 dark:text-emerald-400"
                              : wrongPick
                                ? "text-red-600 line-through decoration-1 dark:text-red-400"
                                : "text-text-secondary",
                          )}
                        >
                          <span className="w-4 shrink-0 font-mono text-xs leading-6">{option.key}</span>
                          <span className="min-w-0 flex-1">{option.text}</span>
                          {correct ? <Check className="mt-1 h-4 w-4 shrink-0" aria-label="Correct answer" /> : null}
                          {wrongPick ? <span className="shrink-0 text-xs no-underline">your pick</span> : null}
                        </li>
                      );
                    })}
                  </ul>
                  {!item.correct ? (
                    <p className="mt-2 text-sm text-text-muted">
                      Not answered yet — its answer shows here once you answer it in the challenge.
                    </p>
                  ) : null}
                  {item.explanation ? (
                    <Markdown
                      text={item.explanation}
                      className="mt-2 max-w-prose text-sm leading-6 text-text-muted"
                    />
                  ) : null}
                  {/* The same short video a wrong pick gets on the paper. */}
                  {missed && item.picked ? (
                    <Explainer
                      challengeId={challengeId}
                      questionId={item.id}
                      selected={item.picked}
                      endpoint={`/api/student/challenges/${encodeURIComponent(challengeId)}/choices/explain`}
                    />
                  ) : null}
                </div>
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

function TopicPage({ topic }: { topic: RevisionDocTopic }) {
  const [answerFont, setAnswerFont] = useAnswerFont();
  // The same choice, and the same translation, as the challenge's own step 1.
  const [studyLanguage, setStudyLanguage] = useStudyLanguage();
  const romanNepali = useRomanNepali(
    topic.challengeId,
    `${topic.reading.length}:${topic.solvedExamples.filter((example) => example.solution).length}`,
    studyLanguage === "rn",
  );
  const translating = isTranslating(studyLanguage, romanNepali);
  const languageSwitch = (
    <StudyLanguageSwitch
      value={studyLanguage}
      onChange={setStudyLanguage}
      translation={romanNepali}
    />
  );
  return (
    <article className="student-reading-frame">
      {/* With no solved questions there is no font row to sit beside. */}
      {topic.solvedExamples.length ? null : <div className="mb-4">{languageSwitch}</div>}
      {/* No title, status or dates (user, 2026-09-24): the navigator already
          names the open topic, and the page is for reading, not for its record.
          The language switch sits beside the answer font, below. */}
      {topic.reading.length ? (
        <ConceptsCard
          bare
          translating={translating}
          className="mt-1"
          source={{
            id: topic.challengeId,
            title: topic.title,
            subjectName: topic.subjectName,
            reading: inStudyLanguage(studyLanguage, romanNepali, (data) => data.reading, topic.reading),
          }}
        />
      ) : (
        /* Every challenge gets its reading. One still being written, or never
           written (a build that died after its paper, a challenge older than the
           reading), is asked for and drawn when it lands — no reload, and no
           telling a student to restart a challenge to get it. */
        <AwaitedConceptsCard
          bare
          className="mt-1"
          readingError={topic.readingError}
          source={{
            id: topic.challengeId,
            title: topic.title,
            subjectName: topic.subjectName,
            reading: [],
          }}
        />
      )}

      {topic.pastQuestions.length ? (
        <section className="mt-8">
          <h2 className="type-student-section-title">Past questions on this topic</h2>
          <ol className="mt-3 space-y-3">
            {topic.pastQuestions.map((question, index) => (
              <li
                key={question.id}
                className={docsItemCardClass}
              >
                <div className="flex flex-wrap items-center gap-x-2 text-xs font-semibold uppercase tracking-wide text-text-muted">
                  <span className="text-blue-600 dark:text-blue-400">Question {index + 1}</span>
                  {question.year ? <span>· {question.year}</span> : null}
                  {question.marks ? <span>· {question.marks} marks</span> : null}
                </div>
                <Markdown
                  text={question.question}
                  className="mt-2 max-w-prose text-sm font-semibold leading-6 text-text-primary"
                />
              </li>
            ))}
          </ol>
        </section>
      ) : null}

      {topic.mcqs.length ? <McqReview challengeId={topic.challengeId} mcqs={topic.mcqs} /> : null}

      {topic.solvedExamples.length ? (
        <section className="mt-8" style={answerFontStyle(answerFont)}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="type-student-section-title">Solved Old Questions</h2>
            <div className="flex flex-wrap items-center gap-2">
              {languageSwitch}
              <AnswerFontPicker value={answerFont} onChange={setAnswerFont} />
            </div>
          </div>
          <div className="mt-3 space-y-4">
            {topic.solvedExamples.map((example, index) => (
              <WorkedExampleCard
                key={`${topic.challengeId}-solved-${index}`}
                label={[
                  `Question ${index + 1}`,
                  askedIn(example),
                  example.marks ? `${example.marks} marks` : "",
                ]
                  .filter(Boolean)
                  .join(" · ")}
                question={example.question}
              >
                <WorkedSolution
                  challengeId={topic.challengeId}
                  question={example.question}
                  solution={example.solution}
                  translating={translating}
                  text={inStudyLanguage(
                    studyLanguage,
                    romanNepali,
                    (data) => data.solutions[normalizeQuestionText(example.question)],
                    example.solution,
                  )}
                  className={workedAnswerClass}
                />
              </WorkedExampleCard>
            ))}
          </div>
        </section>
      ) : null}
    </article>
  );
}

export function RevisionDocsClient({ docs }: { docs: StudentRevisionDocs }) {
  const [query, setQuery] = useState("");
  const [navOpen, setNavOpen] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [rememberedSubject, setRememberedSubject] = useRememberedSubject();
  // "" until a topic is clicked: the open page falls back to the first topic of
  // whichever subject the navigator is showing.
  const [selectedId, setSelectedId] = useState("");
  const closePicker = useCallback(() => setPickerOpen(false), []);

  const subjects = useMemo(() => listSubjects(docs.semesters), [docs.semesters]);
  // A remembered subject that is gone (left the community, another account on
  // this browser) falls back to the first one rather than an empty navigator.
  const active = subjects.find((entry) => entry.key === rememberedSubject) ?? subjects[0] ?? null;

  const needle = query.trim().toLowerCase();
  const units = useMemo(() => filterUnits(active?.subject.units ?? [], needle), [active, needle]);

  const subjectTopics = useMemo(
    () => active?.subject.units.flatMap((unit) => unit.topics) ?? [],
    [active],
  );
  const visibleTopics = useMemo(() => units.flatMap((unit) => unit.topics), [units]);
  // A search that hides the open page selects the first thing it did find, so
  // the reading pane is never showing something the navigator no longer lists.
  const selected =
    visibleTopics.find((topic) => topic.challengeId === selectedId) ??
    visibleTopics[0] ??
    subjectTopics.find((topic) => topic.challengeId === selectedId) ??
    subjectTopics[0] ??
    null;

  // Ask AI reads the open topic, so it can start from it.
  const openSubject = selected?.subjectName ?? "";
  const openTopic = selected?.title ?? "";
  useEffect(() => {
    publishNanoAiTopic(openTopic ? { subjectName: openSubject, topicTitle: openTopic } : null);
  }, [openSubject, openTopic]);
  useEffect(() => () => publishNanoAiTopic(null), []);

  const revise = (key: string) => {
    const entry = subjects.find((candidate) => candidate.key === key);
    setRememberedSubject(key);
    setQuery("");
    setSelectedId(entry?.subject.units[0]?.topics[0]?.challengeId ?? "");
    setPickerOpen(false);
  };

  if (docs.unavailable) {
    return (
      <div className="student-reading-frame max-w-2xl py-16 text-center">
        <h1 className="type-student-page-title">Revision docs are unavailable</h1>
        <p className="mt-3 text-sm text-text-secondary">
          The challenge history this section is built from could not be read. Try again shortly.
        </p>
      </div>
    );
  }

  if (!docs.topicCount) {
    return (
      <div className="student-reading-frame max-w-2xl py-16 text-center">
        <span className="mx-auto grid size-12 place-items-center rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-400">
          <BookOpen className="size-6" aria-hidden="true" />
        </span>
        <h1 className="type-student-page-title mt-4">Nothing filed here yet</h1>
        <p className="mt-3 max-w-prose text-sm text-text-secondary">
          Open a challenge and its reading is filed here as you go — the concepts, the past
          questions and the worked examples — organised by semester, subject and unit. Passing it
          keeps it; you do not have to wait until then to come back to it.
        </p>
        <Link
          href="/app/challenges"
          className="mt-6 inline-flex min-h-10 items-center rounded-lg bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
        >
          Start a challenge
        </Link>
      </div>
    );
  }

  const tree = (
    <TreeFrame
      subject={
        <SubjectButton
          name={active?.subject.name ?? "Choose a subject"}
          onClick={() => setPickerOpen(true)}
        />
      }
      search={<TreeSearch value={query} onChange={setQuery} />}
    >
      {units.length ? (
        <ul className="space-y-4">
          {units.map((unit) => (
            <li key={unit.unitNumber || "unplaced"}>
              {/* Number and name on one line, cut short like the topics under
                  it; the whole name is the hover. */}
              {/* A subject that names no units is one plain list. */}
              {unit.label ? (
                <p
                  title={unit.title ? `${unit.label} · ${unit.title}` : undefined}
                  className="flex min-w-0 items-center gap-2 px-2 pb-1.5"
                >
                  <span className="shrink-0 rounded-md bg-bg-secondary px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-text-muted">
                    {unit.label}
                  </span>
                  {unit.title ? (
                    <span className="truncate text-xs font-semibold text-text-secondary">{unit.title}</span>
                  ) : null}
                </p>
              ) : null}
              <ul className="space-y-0.5">
                {unit.topics.map((topic) => {
                  const isActive = selected?.challengeId === topic.challengeId;
                  return (
                    <li key={topic.challengeId}>
                      <button
                        type="button"
                        aria-current={isActive ? "page" : undefined}
                        onClick={() => {
                          setSelectedId(topic.challengeId);
                          setNavOpen(false);
                        }}
                        title={topic.title}
                        className={`flex min-h-10 w-full items-start gap-2.5 rounded-lg py-2 pl-3 pr-2 text-left text-sm leading-5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
                          isActive
                            ? "bg-blue-500/[0.07] font-semibold text-blue-700 ring-1 ring-inset ring-blue-500/25 dark:text-blue-300"
                            : "text-text-secondary hover:bg-bg-secondary hover:text-text-primary"
                        }`}
                      >
                        {/* A quiet dot per topic; the open one glows. */}
                        <span
                          className={`mt-[7px] size-1.5 shrink-0 rounded-full transition-shadow ${
                            isActive
                              ? "bg-blue-600 ring-4 ring-blue-500/20 dark:bg-blue-400"
                              : "bg-text-muted/40"
                          }`}
                          aria-hidden="true"
                        />
                        <span className="line-clamp-2 min-w-0">{topic.title}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </li>
          ))}
        </ul>
      ) : (
        <p className="px-3 py-6 text-sm text-text-muted">
          Nothing in {active?.subject.name ?? "this subject"} matches “{query.trim()}”.
        </p>
      )}
    </TreeFrame>
  );

  return (
    // Full height of the scroll area. These heights used to subtract 4rem for the
    // app's top bar; with the bar gone, that 4rem showed as a grey band under the
    // tree.
    <div className={docsRootClass}>
      <main className={docsMainClass}>
        <div className={docsMobileBarClass}>
          <p className="min-w-0 flex-1 truncate text-sm text-text-muted">{selected?.title}</p>
          <button
            type="button"
            onClick={() => setNavOpen(true)}
            className={browseButtonClass}
          >
            <Menu className="size-4" aria-hidden="true" />
            Browse
          </button>
        </div>

        {selected ? (
          <TopicPage key={selected.challengeId} topic={selected} />
        ) : (
          <div className="px-5 py-16 text-center text-sm text-text-muted">
            Choose a topic from the list.
          </div>
        )}
      </main>

      {/* Desktop: the navigator is always there, like any documentation site. */}
      <aside className={docsAsideClass}>
        {tree}
      </aside>

      {/* Mobile: the same navigator, as a sheet from the side it sits on. */}
      {navOpen ? (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            type="button"
            aria-label="Close navigation"
            onClick={() => setNavOpen(false)}
            className="absolute inset-0 bg-black/40"
          />
          <div className="absolute inset-y-0 right-0 flex w-[min(20rem,85vw)] flex-col bg-bg-primary shadow-xl">
            <div className="flex items-center justify-between border-b border-border px-3 py-2">
              <p className="text-sm font-semibold">Revision docs</p>
              <button
                type="button"
                onClick={() => setNavOpen(false)}
                aria-label="Close navigation"
                className="inline-flex size-10 items-center justify-center rounded-lg text-text-muted hover:bg-bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
              >
                <X className="size-4" aria-hidden="true" />
              </button>
            </div>
            <div className="min-h-0 flex-1">{tree}</div>
          </div>
        </div>
      ) : null}

      {pickerOpen ? (
        <SubjectPicker
          subjects={subjects}
          currentKey={active?.key ?? ""}
          onRevise={revise}
          onClose={closePicker}
        />
      ) : null}
    </div>
  );
}

const pulse = "animate-pulse bg-border motion-reduce:animate-none";
const bar = `${pulse} rounded`;

/**
 * The route skeleton for Revision, drawn from the page's own pieces.
 *
 * What the page knows before the query — the subject button's label, the search
 * box, the corpus links at the foot of the navigator, the section headings, the
 * shape of every box — renders for real and in place. What it does not — which
 * subject is open, its units and topics, and the open topic's words — pulses, at
 * the size of what replaces it.
 * Placeholder fill is `bg-border`: `bg-bg-secondary` vanishes inside the cards,
 * which are that colour in the dark theme.
 */
export function RevisionDocsSkeleton() {
  return (
    <div className={docsRootClass} aria-busy="true" aria-label="Loading revision docs">
      <main className={docsMainClass}>
        <div className={docsMobileBarClass}>
          <div className={`h-3.5 w-40 flex-1 ${bar}`} />
          <span className={`${browseButtonClass} text-text-muted`} aria-hidden="true">
            <Menu className="size-4" aria-hidden="true" />
            Browse
          </span>
        </div>

        <article className="student-reading-frame">
          {/* No header: the page opens on its concepts (see TopicPage). */}
          <section className="mt-1">
            <div className="flex items-baseline justify-between gap-3">
              <h2 className="type-student-section-title">Concepts</h2>
              <div className={`h-3 w-16 ${bar}`} />
            </div>
            <div className={`mt-3 h-3.5 w-full max-w-prose ${bar}`} />
            <div className={`mt-2 h-3.5 w-2/3 ${bar}`} />
            <div className={`mt-4 h-10 w-40 rounded-lg ${pulse}`} />
          </section>

          <section className="mt-8">
            <h2 className="type-student-section-title">Past questions on this topic</h2>
            <div className="mt-3 space-y-3">
              {[0, 1, 2].map((index) => (
                <div key={index} className={docsItemCardClass}>
                  <div className={`h-3 w-40 ${bar}`} />
                  <div className={`mt-3 h-4 ${index === 1 ? "w-3/5" : "w-4/5"} ${bar}`} />
                </div>
              ))}
            </div>
          </section>
        </article>
      </main>

      <aside className={docsAsideClass}>
        <TreeFrame
          subject={
            <SubjectButton
              disabled
              name={<span className={`mt-1 block h-4 w-36 ${bar}`} />}
            />
          }
          search={<TreeSearch value="" disabled />}
        >
          <div className="space-y-5 px-2 py-1.5">
            {[3, 2].map((topics, group) => (
              <div key={group}>
                {/* A unit and its name, then its topics. */}
                <div className={`h-2.5 w-40 ${bar}`} />
                <div className="mt-3 space-y-3 pl-3">
                  {Array.from({ length: topics }).map((_, index) => (
                    <div key={index} className={`h-4 ${index % 2 ? "w-40" : "w-48"} max-w-full ${bar}`} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </TreeFrame>
      </aside>
    </div>
  );
}
