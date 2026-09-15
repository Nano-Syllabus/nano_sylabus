"use client";

import { BookOpen, ChevronDown, ChevronRight, Menu, Search, X } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { Markdown } from "@/components/markdown";
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

function TopicPage({ topic }: { topic: RevisionDocTopic }) {
  const percent = formatPercent(topic.scorePercent);
  const completed = formatDate(topic.completedAt);
  return (
    <article className="mx-auto max-w-3xl px-4 py-8 sm:px-8">
      <p className="text-xs font-semibold uppercase tracking-wide text-blue-600 dark:text-blue-400">
        {topic.subjectName}
      </p>
      <h1 className="mt-1 font-display text-2xl font-semibold tracking-tight sm:text-3xl">
        {topic.title}
      </h1>
      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2 text-xs text-text-muted">
        {percent ? (
          <span className="inline-flex min-h-6 items-center rounded-full bg-success/15 px-2.5 font-semibold text-success">
            Passed · {percent}
          </span>
        ) : (
          <span className="inline-flex min-h-6 items-center rounded-full bg-success/15 px-2.5 font-semibold text-success">
            Passed
          </span>
        )}
        {completed ? <span>Completed {completed}</span> : null}
        {topic.attempts > 1 ? <span>· {topic.attempts} attempts</span> : null}
        {/* The id a student quotes when this specific page's material is wrong. */}
        <code className="select-all rounded bg-bg-secondary px-2 py-1 font-mono text-[11px] text-text-secondary">
          {topic.challengeId}
        </code>
      </div>

      {topic.bigIdea ? (
        <div className="mt-6 rounded-xl border border-blue-500/30 bg-blue-500/10 p-4 sm:p-5">
          <p className="text-xs font-semibold uppercase tracking-wide text-blue-600 dark:text-blue-400">
            The idea
          </p>
          <Markdown
            text={topic.bigIdea}
            className="mt-1 max-w-prose text-sm font-medium leading-6 text-text-primary"
          />
        </div>
      ) : null}

      {topic.reading.length ? (
        <section className="mt-8">
          <h2 className="font-display text-lg font-semibold">Concepts</h2>
          <div className="mt-3 space-y-3">
            {topic.reading.map((paragraph, index) => (
              <Markdown
                key={`${topic.challengeId}-reading-${index}`}
                text={paragraph}
                className="max-w-prose text-sm leading-7 text-text-secondary"
              />
            ))}
          </div>
        </section>
      ) : (
        <p className="mt-8 rounded-xl border border-border bg-bg-secondary p-5 text-sm text-text-muted">
          This challenge was passed before its reading was kept. Restart it from the Challenge Hub
          to file a fresh one here.
        </p>
      )}

      {topic.focus ? (
        <section className="mt-6 rounded-xl bg-blue-500/10 p-4 sm:p-5">
          <p className="text-xs font-semibold uppercase tracking-wide text-blue-600 dark:text-blue-400">
            What it tested
          </p>
          <Markdown
            text={topic.focus}
            className="mt-1 max-w-prose text-sm leading-6 text-text-secondary"
          />
        </section>
      ) : null}

      {topic.connections.length ? (
        <section className="mt-6 rounded-xl border border-border bg-bg-secondary p-4 sm:p-5">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-text-muted">
            How this connects
          </h2>
          <ul className="mt-3 space-y-2">
            {topic.connections.map((connection, index) => (
              <li key={`${topic.challengeId}-link-${index}`} className="flex gap-2">
                <span aria-hidden="true" className="text-text-muted">
                  ·
                </span>
                <Markdown
                  text={connection}
                  className="max-w-prose text-sm leading-6 text-text-secondary"
                />
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {topic.pastQuestions.length ? (
        <section className="mt-8">
          <h2 className="font-display text-lg font-semibold">Past questions on this topic</h2>
          <ol className="mt-3 space-y-3">
            {topic.pastQuestions.map((question, index) => (
              <li
                key={question.id}
                className="rounded-xl border border-border bg-bg-secondary p-4 sm:p-5"
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
        <section className="mt-8">
          <h2 className="font-display text-lg font-semibold">Worked examples</h2>
          <div className="mt-3 space-y-4">
            {topic.solvedExamples.map((example, index) => (
              <article
                key={`${topic.challengeId}-solved-${index}`}
                className="rounded-xl border border-border bg-bg-secondary p-4 sm:p-5"
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
                <div className="mt-3 rounded-lg bg-card p-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-text-muted">
                    Solution
                  </p>
                  <Markdown
                    text={example.solution}
                    className="mt-1 whitespace-pre-wrap text-sm leading-7 text-text-secondary"
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
      <div className="mx-auto max-w-2xl px-5 py-16 text-center">
        <h1 className="font-display text-2xl font-semibold">Revision docs are unavailable</h1>
        <p className="mt-3 text-sm text-text-secondary">
          The challenge history this section is built from could not be read. Try again shortly.
        </p>
      </div>
    );
  }

  if (!docs.topicCount) {
    return (
      <div className="mx-auto max-w-2xl px-5 py-16 text-center">
        <span className="mx-auto grid size-12 place-items-center rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-400">
          <BookOpen className="size-6" aria-hidden="true" />
        </span>
        <h1 className="mt-4 font-display text-2xl font-semibold">Nothing filed here yet</h1>
        <p className="mt-3 max-w-prose text-sm text-text-secondary">
          Pass a challenge and its reading is kept here — the concepts, the past questions and the
          worked examples — organised by semester, subject and unit.
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
    <div className="flex h-full flex-col">
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
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search topics"
            className="min-h-10 w-full rounded-lg border border-border bg-bg-primary pl-9 pr-3 text-sm text-text-primary placeholder:text-text-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
          />
        </div>
      </div>

      <nav aria-label="Revision docs" className="min-h-0 flex-1 overflow-y-auto p-2">
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
      </nav>

      <div className="border-t border-border p-3">
        <Link
          href="/app/notes/revision/cards"
          className="flex min-h-10 items-center justify-between rounded-lg px-2 text-sm font-medium text-text-secondary hover:bg-bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
        >
          Flashcards from your notes
          <ChevronRight className="size-4" aria-hidden="true" />
        </Link>
      </div>
    </div>
  );

  return (
    <div className="flex min-h-[calc(100vh-4rem)] w-full bg-bg-secondary text-text-primary">
      {/* Desktop: the tree is always there, like any documentation site. */}
      <aside className="sticky top-0 hidden h-[calc(100vh-4rem)] w-72 shrink-0 border-r border-border bg-bg-primary lg:block">
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

      <main className="min-w-0 flex-1 bg-bg-primary">
        <div className="sticky top-0 z-10 flex items-center gap-2 border-b border-border bg-bg-primary/95 px-4 py-2 backdrop-blur lg:hidden">
          <button
            type="button"
            onClick={() => setNavOpen(true)}
            className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-border px-3 text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
          >
            <Menu className="size-4" aria-hidden="true" />
            Browse
          </button>
          <p className="truncate text-sm text-text-muted">{selected?.title}</p>
        </div>

        {selected ? (
          <TopicPage topic={selected} />
        ) : (
          <div className="px-5 py-16 text-center text-sm text-text-muted">
            Choose a topic from the list.
          </div>
        )}
      </main>
    </div>
  );
}
