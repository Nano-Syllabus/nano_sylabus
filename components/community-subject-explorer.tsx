"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, BarChart3, BookOpen, CalendarRange, Target, X } from "lucide-react";
import { academicOrdinalLabel } from "@/lib/academic";
import type { CommunityDetail, CommunitySubject, CommunityTerm } from "@/lib/communities";
import type { CommunitySubjectExplorerInsight } from "@/lib/data/community-subject-explorer";
import { titleCase } from "@/lib/utils";

const focusRing =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-strong focus-visible:ring-offset-2 focus-visible:ring-offset-bg-primary";

function readinessColor(readiness: number | null) {
  if (readiness === null) return "text-text-muted";
  if (readiness >= 70) return "text-success";
  if (readiness >= 40) return "text-warning";
  return "text-destructive";
}

function ReadinessRing({ readiness }: { readiness: number | null }) {
  const value = readiness === null ? 0 : Math.max(0, Math.min(100, readiness));
  const circumference = 2 * Math.PI * 20;
  const offset = circumference - (circumference * value) / 100;

  return (
    <div className={`relative size-14 shrink-0 ${readinessColor(readiness)}`}>
      <svg viewBox="0 0 48 48" className="size-14 -rotate-90" aria-hidden="true">
        <circle
          cx="24"
          cy="24"
          r="20"
          fill="none"
          stroke="currentColor"
          strokeOpacity="0.12"
          strokeWidth="3.5"
        />
        {readiness !== null ? (
          <circle
            cx="24"
            cy="24"
            r="20"
            fill="none"
            stroke="currentColor"
            strokeWidth="3.5"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
          />
        ) : null}
      </svg>
      <span className="absolute inset-0 flex items-center justify-center text-xs font-semibold">
        {readiness === null ? "—" : `${Math.round(readiness)}%`}
      </span>
      <span className="sr-only">
        {readiness === null ? "Readiness unavailable" : `${Math.round(readiness)} percent ready`}
      </span>
    </div>
  );
}

function metric(value: number | null, singular: string, plural = `${singular}s`) {
  if (value === null) return `— ${plural}`;
  return `${value} ${value === 1 ? singular : plural}`;
}

function TopicProgressRing({ percentage }: { percentage: number | null }) {
  const value = percentage === null ? 0 : Math.max(0, Math.min(100, percentage));
  const circumference = 2 * Math.PI * 15;
  return (
    <div className={`relative size-10 shrink-0 ${readinessColor(percentage)}`}>
      <svg viewBox="0 0 40 40" className="size-10 -rotate-90" aria-hidden="true">
        <circle
          cx="20"
          cy="20"
          r="15"
          fill="none"
          stroke="currentColor"
          strokeOpacity="0.12"
          strokeWidth="3"
        />
        {percentage !== null ? (
          <circle
            cx="20"
            cy="20"
            r="15"
            fill="none"
            stroke="currentColor"
            strokeWidth="3"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={circumference - (circumference * value) / 100}
          />
        ) : null}
      </svg>
      <span className="absolute inset-0 flex items-center justify-center text-[10px] font-semibold tabular-nums">
        {percentage === null ? "—" : `${Math.round(value)}%`}
      </span>
    </div>
  );
}

function topicStatus(status: CommunitySubjectExplorerInsight["topics"][number]["status"]) {
  if (status === "strong") {
    return { label: "Mastered", className: "bg-success/10 text-success" };
  }
  if (status === "developing") {
    return { label: "In progress", className: "bg-warning/10 text-warning" };
  }
  if (status === "weak") {
    return { label: "Needs work", className: "bg-destructive/10 text-destructive" };
  }
  if (status === "unavailable") {
    return { label: "Unavailable", className: "bg-bg-tertiary text-text-muted" };
  }
  return { label: "Not started", className: "bg-bg-tertiary text-text-secondary" };
}

function SubjectProgressModal({
  community,
  subject,
  term,
  insight,
  onClose,
}: {
  community: CommunityDetail;
  subject: CommunitySubject;
  term: CommunityTerm;
  insight: CommunitySubjectExplorerInsight | undefined;
  onClose: () => void;
}) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const previouslyFocused =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== "Tab") return;
      const focusable = dialogRef.current?.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])',
      );
      if (!focusable?.length) return;
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

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
      previouslyFocused?.focus();
    };
  }, [onClose]);

  const challengeHref =
    community.studyCourseId && subject.externalSubjectSlug
      ? `/app/challenges?courseId=${encodeURIComponent(community.studyCourseId)}&subject=${encodeURIComponent(subject.externalSubjectSlug)}`
      : null;
  const averageScore = insight?.averageScore ?? null;

  return (
    <div className="fixed inset-0 z-[100] grid place-items-center p-3 sm:p-6">
      <button
        type="button"
        aria-label="Close subject progress"
        onClick={onClose}
        className="absolute inset-0 size-full bg-black/50 backdrop-blur-[2px]"
      />
      <section
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="subject-progress-title"
        className="relative z-10 flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-border bg-bg-primary shadow-xl"
      >
        <header className="flex items-center gap-3 border-b border-border px-5 py-4 sm:px-6">
          <BarChart3 className="size-5 text-text-secondary" aria-hidden="true" />
          <h2 id="subject-progress-title" className="font-display text-xl font-semibold">
            Subject progress
          </h2>
          <span className="flex-1" />
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label="Close"
            className={`flex size-10 items-center justify-center rounded-lg border border-border bg-bg-primary text-text-secondary hover:bg-bg-secondary ${focusRing}`}
          >
            <X className="size-5" aria-hidden="true" />
          </button>
        </header>

        <div className="min-h-0 overflow-y-auto">
          <div className="p-5 sm:p-6">
            <div className="flex items-center gap-4">
              <ReadinessRing readiness={insight?.readiness ?? null} />
              <div className="min-w-0">
                <span className="inline-flex rounded-full bg-bg-secondary px-2.5 py-1 text-xs font-semibold text-text-secondary">
                  {subject.code || `Semester ${term.semesterNumber}`}
                </span>
                <h3 className="mt-2 font-display text-xl font-semibold text-text-primary">
                  {titleCase(subject.name)}
                </h3>
                <p className="mt-1 text-sm text-text-muted">
                  {metric(insight?.materialCount ?? null, "material")} ·{" "}
                  {metric(insight?.topicCount ?? null, "topic")}
                </p>
              </div>
            </div>

            <dl className="mt-6 grid gap-3 sm:grid-cols-3">
              {[
                [insight?.examsTaken ?? null, "Exams taken"],
                [averageScore === null ? null : `${Math.round(averageScore)}%`, "Average score"],
                [insight?.masteredTopicCount ?? null, "Topics mastered"],
              ].map(([value, label]) => (
                <div
                  key={String(label)}
                  className="rounded-xl border border-border bg-bg-secondary p-4 text-center"
                >
                  <dd className="font-display text-2xl font-semibold tabular-nums text-text-primary">
                    {value === null ? "—" : value}
                  </dd>
                  <dt className="mt-1 text-xs font-medium text-text-muted">{label}</dt>
                </div>
              ))}
            </dl>

            <div className="mt-7">
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-xs font-semibold uppercase tracking-widest text-text-muted">
                  Topic progress
                </h3>
                <span className="text-xs text-text-muted">
                  {insight?.practicedTopicCount === null ||
                  insight?.practicedTopicCount === undefined
                    ? "— practiced"
                    : `${insight.practicedTopicCount} practiced`}
                </span>
              </div>

              {insight?.topics.length ? (
                <div className="mt-3 divide-y divide-border border-y border-border">
                  {insight.topics.map((topic, index) => {
                    const status = topicStatus(topic.status);
                    return (
                      <div key={topic.key} className="flex min-h-20 items-center gap-3 py-3">
                        <TopicProgressRing percentage={topic.percentage} />
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium text-text-primary">
                            {index + 1}. {topic.title}
                          </p>
                          <p className="mt-1 text-xs text-text-muted">
                            {topic.unitNumber ? `Unit ${topic.unitNumber} · ` : ""}
                            {topic.attempts === null
                              ? "Attempts unavailable"
                              : `${topic.attempts} ${topic.attempts === 1 ? "attempt" : "attempts"}`}
                          </p>
                        </div>
                        <span
                          className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${status.className}`}
                        >
                          {status.label}
                        </span>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="mt-3 rounded-xl border border-dashed border-border bg-bg-secondary p-8 text-center">
                  <Target className="mx-auto size-7 text-text-muted" aria-hidden="true" />
                  <p className="mt-3 text-sm font-medium text-text-primary">
                    No extracted topics yet
                  </p>
                  <p className="mt-1 text-xs leading-5 text-text-muted">
                    Ask the community creator to refresh this subject&apos;s learning map.
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>

        {challengeHref ? (
          <footer className="flex flex-wrap justify-end gap-2 border-t border-border bg-bg-primary px-5 py-4 sm:px-6">
            <Link
              href={challengeHref}
              className={`inline-flex min-h-10 items-center rounded-lg border border-border bg-bg-primary px-4 text-sm font-medium text-text-primary hover:bg-bg-secondary ${focusRing}`}
            >
              Open challenges
            </Link>
          </footer>
        ) : null}
      </section>
    </div>
  );
}

export function CommunitySubjectExplorer({
  community,
  insights,
}: {
  community: CommunityDetail;
  insights: Record<string, CommunitySubjectExplorerInsight>;
}) {
  const availableTerms = useMemo(
    () => [...community.terms].sort((a, b) => a.position - b.position),
    [community.terms],
  );
  const initialTerm = availableTerms.find((term) => term.subjects.length > 0) || availableTerms[0];
  const [selectedTermId, setSelectedTermId] = useState(initialTerm?.id || "");
  const [selectedSubjectId, setSelectedSubjectId] = useState<string | null>(null);
  const selectedTerm =
    availableTerms.find((term) => term.id === selectedTermId) || initialTerm || null;
  const selectedSubject = selectedTerm?.subjects.find(
    (subject) => subject.id === selectedSubjectId,
  );

  return (
    <main className="w-full max-w-[1240px] px-4 pb-24 pt-5 lg:p-7">
      <header className="border-b border-border pb-6">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-text-muted">
              {community.university} · {community.faculty}
            </p>
            <h1 className="mt-2 font-display text-3xl font-semibold tracking-tight">
              Subject Explorer &amp; In-App Reader
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-text-secondary">
              Browse uploaded course material and query the AI tutor directly on course PDFs.
            </p>
          </div>
          {availableTerms.length > 0 ? (
            <div className="w-full lg:w-56">
              <label
                htmlFor="subject-explorer-semester"
                className="mb-2 block text-sm font-medium text-text-secondary"
              >
                Current Semester:
              </label>
              <select
                id="subject-explorer-semester"
                value={selectedTerm?.id || ""}
                onChange={(event) => setSelectedTermId(event.target.value)}
                className={`h-11 w-full rounded-lg border border-border bg-bg-primary px-3 text-sm text-text-primary ${focusRing}`}
              >
                {availableTerms.map((term) => (
                  <option key={term.id} value={term.id}>
                    Semester {term.semesterNumber}
                  </option>
                ))}
              </select>
            </div>
          ) : null}
        </div>
      </header>

      {availableTerms.length > 0 ? (
        <div className="overflow-x-auto border-b border-border" aria-label="Choose semester">
          <div
            className="flex min-w-max gap-1 pt-3"
            role="tablist"
            aria-label="Community semesters"
          >
            {availableTerms.map((term) => {
              const selected = term.id === selectedTerm?.id;
              return (
                <button
                  key={term.id}
                  type="button"
                  role="tab"
                  aria-selected={selected}
                  onClick={() => setSelectedTermId(term.id)}
                  className={`min-h-11 border-b-2 px-3 text-sm font-medium transition-colors motion-reduce:transition-none ${
                    selected
                      ? "border-text-primary text-text-primary"
                      : "border-transparent text-text-secondary hover:text-text-primary"
                  } ${focusRing}`}
                >
                  Semester {term.semesterNumber}
                  {selected ? " · current" : ""}
                </button>
              );
            })}
          </div>
        </div>
      ) : null}

      <section className="py-7" aria-labelledby="selected-semester-subjects-heading">
        {selectedTerm ? (
          <>
            <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
              <div>
                <p className="text-sm text-text-secondary">
                  {academicOrdinalLabel(selectedTerm.yearNumber, "Year")}
                </p>
                <h2
                  id="selected-semester-subjects-heading"
                  className="mt-1 font-display text-2xl font-semibold"
                >
                  Semester {selectedTerm.semesterNumber} subjects
                </h2>
              </div>
              <span className="text-sm text-text-muted">
                {selectedTerm.subjects.length} available
              </span>
            </div>

            {selectedTerm.subjects.length > 0 ? (
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {selectedTerm.subjects.map((subject) => {
                  const insight = insights[subject.id];
                  const readiness = insight?.readiness ?? null;
                  return (
                    <article
                      key={subject.id}
                      className="flex min-h-64 flex-col rounded-xl border border-border bg-bg-primary p-5 shadow-sm"
                    >
                      <div className="flex items-start gap-4">
                        <ReadinessRing readiness={readiness} />
                        <div className="min-w-0 flex-1 pt-1">
                          <span className="inline-flex rounded-full bg-bg-secondary px-2.5 py-1 text-xs font-semibold text-text-secondary">
                            {subject.code || "Community subject"}
                          </span>
                          <p className="mt-2 text-xs leading-5 text-text-muted">
                            {metric(insight?.materialCount ?? null, "material")} ·{" "}
                            {metric(insight?.topicCount ?? null, "topic")}
                          </p>
                        </div>
                      </div>
                      <h3 className="mt-5 font-display text-lg font-semibold text-text-primary">
                        {titleCase(subject.name)}
                      </h3>
                      <p className="mt-2 line-clamp-2 text-sm leading-6 text-text-secondary">
                        {readiness === null
                          ? "Start a challenge to build your readiness score."
                          : insight?.practicedTopicCount
                            ? `${insight.practicedTopicCount} topics practiced from this community subject.`
                            : "No topics practiced yet."}
                      </p>
                      <button
                        type="button"
                        onClick={() => setSelectedSubjectId(subject.id)}
                        className={`mt-auto inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-text-primary px-4 pt-px text-sm font-medium text-text-inverse no-underline transition-opacity hover:opacity-90 motion-reduce:transition-none ${focusRing}`}
                      >
                        View subject
                        <ArrowRight className="size-4" aria-hidden="true" />
                      </button>
                    </article>
                  );
                })}
              </div>
            ) : (
              <div className="rounded-xl border border-dashed border-border bg-bg-secondary p-10 text-center">
                <BookOpen className="mx-auto size-9 text-text-muted" aria-hidden="true" />
                <h3 className="mt-4 font-display text-lg font-semibold">
                  No subjects in this semester
                </h3>
                <p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-text-secondary">
                  The community creator has not attached subjects here yet. Choose another semester.
                </p>
              </div>
            )}
          </>
        ) : (
          <div className="rounded-xl border border-dashed border-border bg-bg-secondary p-10 text-center">
            <CalendarRange className="mx-auto size-9 text-text-muted" aria-hidden="true" />
            <h2
              id="selected-semester-subjects-heading"
              className="mt-4 font-display text-lg font-semibold"
            >
              No semesters available
            </h2>
            <p className="mt-2 text-sm text-text-secondary">
              The community creator has not configured its academic structure yet.
            </p>
          </div>
        )}
      </section>

      {selectedTerm && selectedSubject ? (
        <SubjectProgressModal
          community={community}
          term={selectedTerm}
          subject={selectedSubject}
          insight={insights[selectedSubject.id]}
          onClose={() => setSelectedSubjectId(null)}
        />
      ) : null}
    </main>
  );
}

export function CommunitySemesterSubjects({
  community,
  term,
}: {
  community: CommunityDetail;
  term: CommunityTerm;
}) {
  return (
    <main className="w-full max-w-[1240px] px-4 pb-24 pt-5 lg:p-7">
      <Link
        href={`/app/communities/${encodeURIComponent(community.slug)}`}
        className={`inline-flex min-h-10 items-center gap-2 rounded-md text-sm text-text-secondary hover:text-text-primary ${focusRing}`}
      >
        <ArrowLeft className="size-4" aria-hidden="true" />
        Subject Explorer
      </Link>

      <header className="border-b border-border pb-7 pt-4">
        <p className="text-sm font-medium text-text-secondary">
          {academicOrdinalLabel(term.yearNumber, "Year")} · {titleCase(community.name)}
        </p>
        <div className="mt-2 flex flex-wrap items-end gap-4">
          <div className="min-w-0 flex-1">
            <h1 className="font-display text-3xl font-semibold tracking-tight">
              {academicOrdinalLabel(term.semesterNumber, "Semester")} subjects
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-text-secondary">
              Open a subject to explore its learning map, study materials, challenges, and forum.
            </p>
          </div>
          <span className="text-sm text-text-muted">
            {term.subjects.length} {term.subjects.length === 1 ? "subject" : "subjects"}
          </span>
        </div>
      </header>

      <section className="py-8" aria-labelledby="semester-subjects-heading">
        <h2 id="semester-subjects-heading" className="sr-only">
          Available subjects
        </h2>
        {term.subjects.length ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {term.subjects.map((subject) => (
              <Link
                key={subject.id}
                href={`/app/communities/${encodeURIComponent(community.slug)}/subjects/${encodeURIComponent(subject.slug)}?term=${encodeURIComponent(term.id)}`}
                className={`group flex min-h-56 flex-col rounded-xl border border-border bg-bg-primary p-5 no-underline transition-colors hover:border-border-strong hover:bg-bg-secondary motion-reduce:transition-none ${focusRing}`}
              >
                <span className="flex size-11 items-center justify-center rounded-lg bg-bg-secondary text-text-secondary transition-colors group-hover:bg-bg-tertiary motion-reduce:transition-none">
                  <BookOpen className="size-5" aria-hidden="true" />
                </span>
                <p className="mt-5 text-xs font-medium uppercase tracking-widest text-text-muted">
                  {subject.code || "Community subject"}
                </p>
                <h3 className="mt-2 font-display text-lg font-semibold text-text-primary">
                  {titleCase(subject.name)}
                </h3>
                <p className="mt-2 line-clamp-2 text-sm leading-6 text-text-secondary">
                  {subject.description || "Open the subject workspace and learning materials."}
                </p>
                <span className="mt-auto inline-flex items-center gap-2 pt-5 text-sm font-medium text-text-primary">
                  View subject details
                  <ArrowRight
                    className="size-4 transition-transform group-hover:translate-x-0.5 motion-reduce:transition-none"
                    aria-hidden="true"
                  />
                </span>
              </Link>
            ))}
          </div>
        ) : (
          <div className="rounded-xl border border-dashed border-border bg-bg-secondary p-10 text-center">
            <BookOpen className="mx-auto size-8 text-text-muted" aria-hidden="true" />
            <h3 className="mt-4 font-display text-lg font-semibold">No subjects here yet</h3>
            <p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-text-secondary">
              The community creator has not added subjects to this semester yet.
            </p>
            <Link
              href={`/app/communities/${encodeURIComponent(community.slug)}`}
              className={`mt-5 inline-flex min-h-10 items-center rounded-full border border-border bg-bg-primary px-4 text-sm font-medium text-text-primary hover:bg-bg-tertiary ${focusRing}`}
            >
              Back to semesters
            </Link>
          </div>
        )}
      </section>
    </main>
  );
}
