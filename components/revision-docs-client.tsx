"use client";

import { BookOpen, ChevronDown, ChevronRight, Menu, Search, X } from "lucide-react";
import Link from "next/link";
import { useMemo, useState, type ReactNode } from "react";
import { AnswerFontPicker, answerFontStyle, useAnswerFont } from "@/components/answer-font-picker";
import { normalizeQuestionText } from "@/lib/challenge-learn-questions";
import {
  StudyLanguageSwitch,
  inStudyLanguage,
  useRomanNepali,
  useStudyLanguage,
} from "@/components/study-language";
import { AwaitedConceptsCard, ConceptsCard, conceptsCardClass } from "@/components/concepts-reading";
import { Markdown } from "@/components/markdown";
import { WorkedSolution } from "@/components/worked-solution";
import type {
  RevisionDocSemester,
  RevisionDocTopic,
  StudentRevisionDocs,
} from "@/lib/data/student-revision-docs";

/**
 * The revision section, as documentation.
 *
 * Laid out the way an API reference is laid out, because it is the same problem:
 * a body of material with a structure the reader already knows, where the job is
 * to get from "I want the thing about Laplace transforms" to that thing without
 * reading anything else. A tree on the left, one page on the right, and the
 * tree's levels are the course's own — semester, subject, unit, topic.
 *
 * Everything in it has been earned. A topic is here because its challenge was
 * passed, so the page never has to explain what a locked or empty entry means.
 */

function formatPercent(value: number | null) {
  if (value === null) return null;
  return `${Math.round(value)}%`;
}

function formatDate(value: string) {
  if (!value) return "";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime())
    ? ""
    : parsed.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

function matches(topic: RevisionDocTopic, needle: string) {
  if (!needle) return true;
  const haystack = `${topic.title} ${topic.subjectName} ${topic.bigIdea}`.toLowerCase();
  return haystack.includes(needle);
}

/** The tree, filtered to a search term. Empty branches are dropped rather than
 *  shown empty — a subject with no match is not a subject with no topics. */
function filterSemesters(semesters: RevisionDocSemester[], needle: string) {
  if (!needle) return semesters;
  return semesters.flatMap((semester) => {
    const subjects = semester.subjects.flatMap((subject) => {
      const units = subject.units.flatMap((unit) => {
        const topics = unit.topics.filter((topic) => matches(topic, needle));
        return topics.length ? [{ ...unit, topics }] : [];
      });
      return units.length ? [{ ...subject, units }] : [];
    });
    return subjects.length ? [{ ...semester, subjects }] : [];
  });
}

/*
 * The docs' layout and chrome, shared by the page and its route skeleton
 * (`RevisionDocsSkeleton`, below). The skeleton used to be the generic notes grid
 * — nine cards, for a page that is a tree and one document — so a first visit
 * drew a different page and then swapped it out. Built from the same pieces, it
 * cannot drift from the page again.
 */
const docsRootClass = "flex min-h-full w-full bg-bg-secondary text-text-primary";
const docsAsideClass =
  "sticky top-0 hidden h-[100dvh] w-72 shrink-0 border-r border-border bg-bg-primary lg:block";
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
    <div className="border-b border-border p-3">
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
          className="min-h-10 w-full rounded-lg border border-border bg-bg-primary pl-9 pr-3 text-sm text-text-primary placeholder:text-text-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
        />
      </div>
    </div>
  );
}

function TreeFooter() {
  return (
    <div className="border-t border-border p-3">
      {/* The student's OWN corpus, reachable from the tree rather than from a
          header that made the reader choose a mode before seeing anything. */}
      <Link
        href="/app/notes/saved"
        className="flex min-h-10 items-center justify-between rounded-lg px-2 text-sm font-medium text-text-secondary hover:bg-bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
      >
        My saved notes
        <ChevronRight className="size-4" aria-hidden="true" />
      </Link>
      <Link
        href="/app/notes/revision/cards"
        className="flex min-h-10 items-center justify-between rounded-lg px-2 text-sm font-medium text-text-secondary hover:bg-bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
      >
        Flashcards from your notes
        <ChevronRight className="size-4" aria-hidden="true" />
      </Link>
    </div>
  );
}

/** Search on top, the tree in the middle, the corpus links at the foot. */
function TreeFrame({ search, children }: { search: ReactNode; children: ReactNode }) {
  return (
    <div className="flex h-full flex-col">
      {search}
      <nav aria-label="Revision docs" className="min-h-0 flex-1 overflow-y-auto p-2">
        {children}
      </nav>
      <TreeFooter />
    </div>
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
  const percent = formatPercent(topic.scorePercent);
  const completed = formatDate(topic.completedAt);
  return (
    <article className="student-reading-frame">
      <p className="text-xs font-semibold uppercase tracking-wide text-blue-600 dark:text-blue-400">
        {topic.subjectName}
      </p>
      <h1 className="type-student-page-title mt-1">
        {topic.title}
      </h1>
      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2 text-xs text-text-muted">
        {/* Started and passed are both here, and must never look alike: the whole
            claim of these docs is that a page says what you already worked
            through, and calling an open challenge "Passed" would be the one lie
            the page cannot afford. */}
        {topic.inProgress ? (
          <span className="inline-flex min-h-6 items-center rounded-full bg-blue-500/10 px-2.5 font-semibold text-blue-700 dark:text-blue-300">
            In progress
          </span>
        ) : percent ? (
          <span className="inline-flex min-h-6 items-center rounded-full bg-success/15 px-2.5 font-semibold text-success">
            Passed · {percent}
          </span>
        ) : (
          <span className="inline-flex min-h-6 items-center rounded-full bg-success/15 px-2.5 font-semibold text-success">
            Passed
          </span>
        )}
        {completed ? (
          <span>
            {topic.inProgress ? "Last opened" : "Completed"} {completed}
          </span>
        ) : null}
        {topic.attempts > 1 ? <span>· {topic.attempts} attempts</span> : null}
        {/* The id support needs when this specific page's material is wrong. On
            the row it is a hover; here there is room for it, and this is the page
            a student is actually looking at when they report one. */}
        <code className="select-all rounded bg-bg-secondary px-2 py-1 font-mono text-[11px] text-text-secondary">
          {topic.challengeId}
        </code>
      </div>

      <StudyLanguageSwitch
        className="mt-6"
        value={studyLanguage}
        onChange={setStudyLanguage}
        translation={romanNepali}
      />

      {topic.reading.length ? (
        <ConceptsCard
          className="mt-4"
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
          className="mt-4"
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

      {topic.solvedExamples.length ? (
        <section className="mt-8" style={answerFontStyle(answerFont)}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="type-student-section-title">Worked examples</h2>
            <AnswerFontPicker value={answerFont} onChange={setAnswerFont} />
          </div>
          <div className="mt-3 space-y-4">
            {topic.solvedExamples.map((example, index) => (
              <article
                key={`${topic.challengeId}-solved-${index}`}
                className={docsItemCardClass}
              >
                <p className="text-xs font-semibold uppercase tracking-wide text-text-muted">
                  Example {index + 1}
                  {example.year ? ` · ${example.year}` : ""}
                  {example.marks ? ` · ${example.marks} marks` : ""}
                </p>
                <Markdown
                  text={example.question}
                  className="mt-2 max-w-prose text-sm font-semibold leading-6"
                />
                {/* The answer, and only the answer, handwritten on ruled paper:
                    it reads as a worked solution, set apart from the question
                    above it and from the rest of the docs. */}
                <div className="answer-paper mt-3">
                  <p className="answer-paper-label text-xs font-semibold uppercase tracking-wide text-text-muted">
                    Solution
                  </p>
                  <WorkedSolution
                    challengeId={topic.challengeId}
                    question={example.question}
                    solution={example.solution}
                    text={inStudyLanguage(
                      studyLanguage,
                      romanNepali,
                      (data) => data.solutions[normalizeQuestionText(example.question)],
                      example.solution,
                    )}
                    className="answer-paper-body font-revision-answer whitespace-pre-wrap text-sm text-text-secondary"
                  />
                </div>
              </article>
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
  const [selectedId, setSelectedId] = useState(
    () => docs.semesters[0]?.subjects[0]?.units[0]?.topics[0]?.challengeId ?? "",
  );
  // Closed branches are the exception, not the rule: a reader who has just
  // arrived should see the shape of what they have done, not a row of arrows.
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  const needle = query.trim().toLowerCase();
  const semesters = useMemo(
    () => filterSemesters(docs.semesters, needle),
    [docs.semesters, needle],
  );

  const allTopics = useMemo(
    () =>
      docs.semesters.flatMap((semester) =>
        semester.subjects.flatMap((subject) => subject.units.flatMap((unit) => unit.topics)),
      ),
    [docs.semesters],
  );
  const visibleTopics = useMemo(
    () =>
      semesters.flatMap((semester) =>
        semester.subjects.flatMap((subject) => subject.units.flatMap((unit) => unit.topics)),
      ),
    [semesters],
  );
  // A search that hides the open page selects the first thing it did find, so
  // the reading pane is never showing something the tree no longer lists.
  const selected =
    visibleTopics.find((topic) => topic.challengeId === selectedId) ??
    visibleTopics[0] ??
    allTopics.find((topic) => topic.challengeId === selectedId) ??
    null;

  const toggle = (key: string) => setCollapsed((current) => ({ ...current, [key]: !current[key] }));

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
    <TreeFrame search={<TreeSearch value={query} onChange={setQuery} />}>
        {semesters.length ? (
          <ul className="space-y-1">
            {semesters.map((semester) => {
              const semesterClosed = collapsed[semester.id];
              return (
                <li key={semester.id}>
                  <button
                    type="button"
                    aria-expanded={!semesterClosed}
                    onClick={() => toggle(semester.id)}
                    className="flex min-h-10 w-full items-center gap-1.5 rounded-lg px-2 text-left hover:bg-bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                  >
                    {semesterClosed ? (
                      <ChevronRight
                        className="size-4 shrink-0 text-text-muted"
                        aria-hidden="true"
                      />
                    ) : (
                      <ChevronDown className="size-4 shrink-0 text-text-muted" aria-hidden="true" />
                    )}
                    <span className="truncate text-xs font-semibold uppercase tracking-wide text-text-secondary">
                      {semester.label}
                    </span>
                    <span className="ml-auto shrink-0 font-mono text-[11px] text-text-muted">
                      {semester.topicCount}
                    </span>
                  </button>

                  {semesterClosed ? null : (
                    <ul className="mt-0.5 space-y-0.5 pl-3">
                      {semester.subjects.map((subject) => {
                        const subjectKey = `${semester.id}:${subject.courseId}:${subject.subjectSlug}`;
                        const subjectClosed = collapsed[subjectKey];
                        return (
                          <li key={subjectKey}>
                            <button
                              type="button"
                              aria-expanded={!subjectClosed}
                              onClick={() => toggle(subjectKey)}
                              className="flex min-h-9 w-full items-center gap-1.5 rounded-lg px-2 text-left hover:bg-bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                            >
                              {subjectClosed ? (
                                <ChevronRight
                                  className="size-3.5 shrink-0 text-text-muted"
                                  aria-hidden="true"
                                />
                              ) : (
                                <ChevronDown
                                  className="size-3.5 shrink-0 text-text-muted"
                                  aria-hidden="true"
                                />
                              )}
                              <span className="truncate text-sm font-semibold text-text-primary">
                                {subject.name}
                              </span>
                            </button>

                            {subjectClosed ? null : (
                              <ul className="mt-0.5 space-y-1 pl-4">
                                {subject.units.map((unit) => (
                                  <li key={`${subjectKey}:${unit.unitNumber}`}>
                                    <p className="px-2 pb-0.5 pt-1.5 text-[11px] font-semibold uppercase tracking-wide text-text-muted">
                                      {unit.label}
                                    </p>
                                    <ul className="space-y-0.5 border-l border-border pl-2">
                                      {unit.topics.map((topic) => {
                                        const isActive =
                                          selected?.challengeId === topic.challengeId;
                                        return (
                                          <li key={topic.challengeId}>
                                            <button
                                              type="button"
                                              aria-current={isActive ? "page" : undefined}
                                              onClick={() => {
                                                setSelectedId(topic.challengeId);
                                                setNavOpen(false);
                                              }}
                                              className={`flex min-h-9 w-full items-center rounded-lg px-2 text-left text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
                                                isActive
                                                  ? "bg-blue-500/10 font-semibold text-blue-700 dark:text-blue-300"
                                                  : "text-text-secondary hover:bg-bg-secondary"
                                              }`}
                                            >
                                              <span className="truncate">{topic.title}</span>
                                            </button>
                                          </li>
                                        );
                                      })}
                                    </ul>
                                  </li>
                                ))}
                              </ul>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="px-3 py-6 text-sm text-text-muted">Nothing matches “{query.trim()}”.</p>
        )}
    </TreeFrame>
  );

  return (
    // Full height of the scroll area. These heights used to subtract 4rem for the
    // app's top bar; with the bar gone, that 4rem showed as a grey band under the
    // tree.
    <div className={docsRootClass}>
      {/* Desktop: the tree is always there, like any documentation site. */}
      <aside className={docsAsideClass}>
        {tree}
      </aside>

      {/* Mobile: the same tree, as a sheet over the page it navigates. */}
      {navOpen ? (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            type="button"
            aria-label="Close navigation"
            onClick={() => setNavOpen(false)}
            className="absolute inset-0 bg-black/40"
          />
          <div className="absolute inset-y-0 left-0 flex w-[min(20rem,85vw)] flex-col bg-bg-primary shadow-xl">
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

      <main className={docsMainClass}>
        <div className={docsMobileBarClass}>
          <button
            type="button"
            onClick={() => setNavOpen(true)}
            className={browseButtonClass}
          >
            <Menu className="size-4" aria-hidden="true" />
            Browse
          </button>
          <p className="truncate text-sm text-text-muted">{selected?.title}</p>
        </div>

        {selected ? (
          <TopicPage key={selected.challengeId} topic={selected} />
        ) : (
          <div className="px-5 py-16 text-center text-sm text-text-muted">
            Choose a topic from the list.
          </div>
        )}
      </main>
    </div>
  );
}

const pulse = "animate-pulse bg-border motion-reduce:animate-none";
const bar = `${pulse} rounded`;

/**
 * The route skeleton for Revision, drawn from the page's own pieces.
 *
 * What the page knows before the query — the search box, the corpus links at
 * the foot of the tree, the section headings, the shape of every box — renders
 * for real and in place. What it does not — the tree's semesters, subjects and
 * topics, and the open topic's words — pulses, at the size of what replaces it.
 * Placeholder fill is `bg-border`: `bg-bg-secondary` vanishes inside the cards,
 * which are that colour in the dark theme.
 */
export function RevisionDocsSkeleton() {
  return (
    <div className={docsRootClass} aria-busy="true" aria-label="Loading revision docs">
      <aside className={docsAsideClass}>
        <TreeFrame search={<TreeSearch value="" disabled />}>
          <div className="space-y-5 px-2 py-1.5">
            {[3, 2].map((topics, group) => (
              <div key={group}>
                {/* Semester, then a subject under it, then its unit and topics. */}
                <div className={`h-3 w-32 ${bar}`} />
                <div className={`ml-3 mt-3 h-4 w-36 ${bar}`} />
                <div className={`ml-5 mt-3 h-2.5 w-12 ${bar}`} />
                <div className="ml-5 mt-2 space-y-2.5 border-l border-border pl-3">
                  {Array.from({ length: topics }).map((_, index) => (
                    <div key={index} className={`h-4 ${index % 2 ? "w-40" : "w-48"} max-w-full ${bar}`} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </TreeFrame>
      </aside>

      <main className={docsMainClass}>
        <div className={docsMobileBarClass}>
          <span className={`${browseButtonClass} text-text-muted`} aria-hidden="true">
            <Menu className="size-4" aria-hidden="true" />
            Browse
          </span>
        </div>

        <article className="student-reading-frame">
          {/* Subject, title, then status · date · id — the page's own header. */}
          <div className={`h-3 w-28 ${bar}`} />
          <div className={`mt-2 h-8 w-4/5 max-w-xl ${bar}`} />
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <div className={`h-6 w-24 rounded-full ${pulse}`} />
            <div className={`h-3.5 w-36 ${bar}`} />
            <div className={`h-6 w-64 max-w-full ${bar}`} />
          </div>

          <section className={`mt-8 ${conceptsCardClass}`}>
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
    </div>
  );
}
