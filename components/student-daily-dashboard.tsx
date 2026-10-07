"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { Pencil, Plus, Quote } from "lucide-react";
import type { DailyExamDate, StudentDailyDashboard } from "@/lib/data/student-daily-dashboard";
import { useDashboard } from "@/lib/query/dashboard";
import { PracticeCalendar } from "@/components/practice-calendar";

const STUDY_QUOTE_LIMIT = 140;

function StudyQuoteCard({ initialQuote = "" }: { initialQuote?: string }) {
  const [quote, setQuote] = useState(() => initialQuote.trim().slice(0, STUDY_QUOTE_LIMIT));
  const [draft, setDraft] = useState(quote);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const quoteInputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (editing) quoteInputRef.current?.focus();
  }, [editing]);

  function startEditing() {
    setDraft(quote);
    setError("");
    setStatus("");
    setEditing(true);
  }

  function cancelEditing() {
    setDraft(quote);
    setError("");
    setEditing(false);
  }

  async function persist(nextQuote: string) {
    setSaving(true);
    setError("");
    setStatus("");

    try {
      const response = await fetch("/api/student/profile/study-quote", {
        method: "PUT",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ quote: nextQuote || null }),
      });
      const result = (await response.json().catch(() => null)) as {
        quote?: string;
        error?: string;
      } | null;
      if (!response.ok)
        throw new Error(result?.error || "Could not save your quote. Please try again.");

      const savedQuote = typeof result?.quote === "string" ? result.quote : "";

      setQuote(savedQuote);
      setDraft(savedQuote);
      setEditing(false);
      setStatus(savedQuote ? "Saved to your profile." : "Quote removed.");
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "Could not save your quote. Please try again.",
      );
    } finally {
      setSaving(false);
    }
  }

  function saveQuote(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextQuote = draft.trim();

    if (!nextQuote) {
      setError("Write a short study reminder before saving.");
      return;
    }

    void persist(nextQuote);
  }

  return (
    <section
      className={`relative mt-5 overflow-hidden bg-[var(--community-accent)] text-[var(--community-accent-foreground)] shadow-sm ${
        editing
          ? "rounded-[27px] px-6 py-[22px] sm:px-10"
          : quote
            ? "rounded-2xl px-5 py-4 sm:px-6"
            : "rounded-2xl px-4 py-2.5 sm:px-5"
      }`}
      aria-labelledby="study-quote-heading"
    >
      <div
        className="pointer-events-none absolute -bottom-32 -right-16 size-80 rounded-full border border-current/15"
        aria-hidden="true"
      />
      <div
        className="pointer-events-none absolute -bottom-44 -right-2 size-[25rem] rounded-full border border-current/10"
        aria-hidden="true"
      />

      {editing ? (
        <form className="relative" onSubmit={saveQuote}>
          <label htmlFor="study-quote-input" className="text-sm font-semibold">
            Your study reminder
          </label>
          <textarea
            ref={quoteInputRef}
            id="study-quote-input"
            value={draft}
            maxLength={STUDY_QUOTE_LIMIT}
            rows={3}
            onChange={(event) => setDraft(event.target.value)}
            placeholder="You do not have to finish everything today. Just begin one topic."
            aria-invalid={error ? "true" : undefined}
            aria-describedby={error ? "study-quote-hint study-quote-error" : "study-quote-hint"}
            className="mt-2 block min-h-24 w-full resize-y rounded-2xl border border-current/35 bg-bg-primary px-4 py-3 text-base text-text-primary placeholder:text-text-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-current focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--community-accent)]"
          />
          <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-sm opacity-90">
            <p id="study-quote-hint">Make it yours. A short line is easiest to remember.</p>
            <span className="tabular-nums">
              {draft.length} / {STUDY_QUOTE_LIMIT}
            </span>
          </div>
          {error ? (
            <p id="study-quote-error" role="alert" className="mt-2 text-sm font-medium">
              {error}
            </p>
          ) : null}
          <div className="mt-4 flex flex-wrap items-center gap-2">
            {quote ? (
              <button
                type="button"
                onClick={() => void persist("")}
                disabled={saving}
                className="inline-flex min-h-11 items-center justify-center rounded-xl px-4 text-sm font-semibold underline underline-offset-4 transition-opacity hover:opacity-80 disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-current focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--community-accent)]"
              >
                Remove quote
              </button>
            ) : null}
            <button
              type="button"
              onClick={cancelEditing}
              disabled={saving}
              className="inline-flex min-h-11 items-center justify-center rounded-xl px-4 text-sm font-semibold transition-opacity hover:opacity-80 disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-current focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--community-accent)]"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving || !draft.trim()}
              aria-busy={saving}
              className="inline-flex min-h-11 items-center justify-center rounded-xl border border-current/45 bg-bg-primary/10 px-4 text-sm font-semibold transition-colors hover:bg-bg-primary/20 disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-current focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--community-accent)]"
            >
              {saving ? "Saving..." : "Save quote"}
            </button>
          </div>
        </form>
      ) : quote ? (
        <div className="relative flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-center gap-3">
            <span
              className="grid size-10 shrink-0 place-items-center rounded-full border-2 border-current/80"
              aria-hidden="true"
            >
              <Quote className="size-4" fill="currentColor" />
            </span>
            <blockquote
              id="study-quote-heading"
              className="min-w-0 max-w-4xl break-words font-sans text-lg font-semibold leading-snug tracking-[-0.01em] sm:text-xl"
            >
              {quote}
            </blockquote>
          </div>
          <button
            type="button"
            onClick={startEditing}
            className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 self-start rounded-xl border border-current/45 bg-bg-primary/10 px-4 text-sm font-semibold transition-colors hover:bg-bg-primary/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-current focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--community-accent)] sm:self-auto"
          >
            <Pencil className="size-4" aria-hidden="true" />
            Edit quote
          </button>
        </div>
      ) : (
        <div className="relative flex flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <span
              className="grid size-8 shrink-0 place-items-center rounded-full border-[1.5px] border-current/80"
              aria-hidden="true"
            >
              <Quote className="size-3.5" fill="currentColor" />
            </span>
            <h2 id="study-quote-heading" className="min-w-0 text-base font-semibold">
              What words help you keep going?
            </h2>
          </div>
          <button
            type="button"
            onClick={startEditing}
            className="inline-flex min-h-9 shrink-0 items-center justify-center gap-1.5 rounded-full border-[1.5px] border-current/45 bg-bg-primary/10 px-4 text-sm font-semibold transition-colors hover:bg-bg-primary/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-current focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--community-accent)]"
          >
            <Plus className="size-4" aria-hidden="true" />
            Add your quote
          </button>
        </div>
      )}

      {/* Announced to screen readers only: the quote appearing IS the visible confirmation. */}
      <p className="sr-only" role="status">
        {status}
      </p>
    </section>
  );
}

function firstName(value: string) {
  return value.trim().split(/\s+/)[0] || "Student";
}

/**
 * The dashboard, driven by a cached query rather than by a server await.
 *
 * WHY THIS WRAPPER EXISTS
 * -----------------------
 * `/app/today` used to compute `dashboard` inside its server component, which
 * meant the RSC payload could not start streaming until the slowest read in the
 * product had finished — so `loading.tsx` covered the whole screen on every
 * single visit, including a return five seconds after leaving. Client caching
 * cannot help with that, because the thing being waited on is the server render
 * itself.
 *
 * Now the page renders its shell immediately and this reads the data from
 * TanStack Query. The consequences, in the order a student meets them:
 *
 *   - Returning to the dashboard inside the 60s window: no request at all, the
 *     previous answer is still in memory and paints on the first frame.
 *   - Returning later: the cached answer paints FIRST and is revalidated
 *     underneath it. `data` survives while `isFetching` is true, so there is
 *     never a flash back to a skeleton.
 *   - Hovering the sidebar link: `prefetchDashboard` has already started the
 *     request, so the click usually lands on data that has arrived.
 *
 * The skeleton below is reached only when there is genuinely nothing cached —
 * a cold load, or a first-ever visit that was not prefetched.
 */
export function StudentDailyDashboardView({
  userId,
  communityOptions = [],
  fullName,
  creditBalance,
  hasUnlimitedAccess,
  studyQuote,
  communitySlug,
  selectedCommunitySlug,
  initialDashboard,
}: {
  userId: string;
  communityOptions?: import("@/lib/community-switch").CommunitySwitchOption[];
  fullName: string;
  creditBalance: number;
  hasUnlimitedAccess: boolean;
  studyQuote?: string;
  /** What the URL asked for — the query key. `undefined` means "the default". */
  communitySlug?: string;
  /** What that resolved to — for the switcher's selected value only. */
  selectedCommunitySlug?: string;
  initialDashboard?: StudentDailyDashboard;
}) {
  const { data, isError, isFetching, refetch } = useDashboard(communitySlug, initialDashboard);
  const dashboard = data?.dashboard;

  // Failed with nothing to show: say so. The skeleton alone read as "still
  // loading" for as long as the tab stayed open (reported 2026-09-29).
  if (!dashboard && isError)
    return (
      <main className="student-page-frame">
        <h1 className="type-student-page-title pt-2">
          Welcome, {fullName.trim().split(/\s+/)[0] || "there"}.
        </h1>
        <div role="alert" className="mt-5 rounded-2xl border border-border bg-card p-6">
          <p className="text-base font-semibold text-text-primary">
            Your dashboard didn&apos;t load
          </p>
          <p className="mt-1 text-sm text-text-secondary">
            The server took too long to answer. Your progress is safe.
          </p>
          <button
            type="button"
            onClick={() => void refetch()}
            disabled={isFetching}
            className="mt-4 inline-flex min-h-10 items-center rounded-full bg-text-primary px-4 text-sm font-semibold text-text-inverse disabled:opacity-60"
          >
            {isFetching ? "Trying again…" : "Try again"}
          </button>
        </div>
      </main>
    );

  if (!dashboard)
    return (
      <DashboardDataSkeleton
        communityOptions={communityOptions}
        selectedCommunitySlug={selectedCommunitySlug}
        fullName={fullName}
        creditBalance={creditBalance}
        hasUnlimitedAccess={hasUnlimitedAccess}
        studyQuote={studyQuote}
      />
    );

  return (
    <DashboardContent
      userId={userId}
      communityOptions={communityOptions}
      fullName={fullName}
      creditBalance={creditBalance}
      hasUnlimitedAccess={hasUnlimitedAccess}
      studyQuote={studyQuote}
      dashboard={dashboard}
    />
  );
}

/**
 * The dashboard before its data lands — real everywhere it can be.
 *
 * THE RULE: shimmer a VALUE, never a container, and never something already
 * known. Almost half of this screen does not depend on the slow query at all —
 * the student's name comes from the session, the NanoAI Credits figure from
 * their credit balance, and every tile's label and icon are constants in this
 * file. Greying all of that out while waiting throws away information the
 * reader could have been using, and makes a page that is half-ready look
 * entirely broken.
 *
 * So the header is the real header, the access tile shows its real number, and
 * the five tiles that need the query keep their labels and icons and shimmer
 * only the figure. The two panels keep their titles and their exact final
 * dimensions, which also means nothing jumps when the data arrives — the
 * layout is already correct, only the ink is missing.
 */
function DashboardDataSkeleton({
  communityOptions = [],
  selectedCommunitySlug,
  fullName,
  creditBalance,
  hasUnlimitedAccess,
  studyQuote,
}: {
  communityOptions?: import("@/lib/community-switch").CommunitySwitchOption[];
  selectedCommunitySlug?: string;
  fullName: string;
  creditBalance: number;
  hasUnlimitedAccess: boolean;
  studyQuote?: string;
}) {
  const line = "animate-pulse rounded-full bg-border motion-reduce:animate-none";
  return (
    <main className="student-page-frame" aria-busy="true">
      {/*
        The real switcher, not a placeholder. Its options come from the page's
        server render, so it is usable before the dashboard data exists — and
        rendering it here is what stops the whole page jumping down by its
        height the moment the query lands. A skeleton that changes the layout it
        was standing in for has not saved the reader anything.
      */}
      <header className="pt-2">
        <div>
          <h1 className="type-student-page-title">
            Welcome, {fullName.trim().split(/\s+/)[0] || "there"}.
          </h1>
        </div>
      </header>

      <StudyQuoteCard initialQuote={studyQuote} />

      <section
        className="mt-5 min-h-[190px] animate-pulse rounded-[24px] bg-border motion-reduce:animate-none"
        aria-label="Loading your next challenge"
      />

      <div className="mt-6 grid items-start gap-6 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <section className="rounded-2xl border border-border bg-card p-5">
          <h2 className="type-student-section-title">Practice calendar</h2>
          <div className={`mt-2 h-3 w-52 ${line}`} aria-hidden="true" />
          <div className="mt-5 grid grid-cols-7 gap-2" aria-hidden="true">
            {Array.from({ length: 35 }).map((_, index) => (
              <div
                key={index}
                className="h-12 rounded-lg bg-border animate-pulse motion-reduce:animate-none"
              />
            ))}
          </div>
        </section>

        {/* The exam card's footprint (it replaced the programme map). */}
        <section
          className="min-h-[150px] animate-pulse rounded-[20px] bg-border motion-reduce:animate-none"
          aria-label="Loading your exam day"
        />
      </div>
      <span className="sr-only">Loading your dashboard</span>
    </main>
  );
}

function DashboardContent({
  userId,
  communityOptions = [],
  fullName,
  creditBalance,
  hasUnlimitedAccess,
  studyQuote,
  dashboard,
}: {
  userId: string;
  communityOptions?: import("@/lib/community-switch").CommunitySwitchOption[];
  fullName: string;
  creditBalance: number;
  hasUnlimitedAccess: boolean;
  studyQuote?: string;
  dashboard: StudentDailyDashboard;
}) {
  const queryClient = useQueryClient();
  const community = dashboard.community;
  const challenge = dashboard.challenge;

  function handleExamDatesChange(examDates: DailyExamDate[]) {
    queryClient.setQueriesData<{ dashboard: StudentDailyDashboard }>(
      { queryKey: ["student", "dashboard"] },
      (previous) => (previous ? { dashboard: { ...previous.dashboard, examDates } } : previous),
    );
  }
  return (
    <main className="student-page-frame">
      <header className="pt-2">
        <div>
          <h1 className="type-student-page-title">Welcome, {firstName(fullName)}.</h1>
        </div>
      </header>

      <StudyQuoteCard initialQuote={studyQuote} />


      <div className="mt-6 grid items-start gap-6 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <PracticeCalendar
          initialDays={dashboard.activity}
          examDates={dashboard.examDates ?? []}
          userId={userId}
          communitySlug={challenge.community?.slug}
          semesters={community?.semesters ?? []}
          currentSemesterId={community?.currentSemesterId}
          onExamDatesChange={handleExamDatesChange}
          // One track (Entrance, License) = one MCQ exam day, no subjects.
          singleExam={community?.termNoun === null}
        />
      </div>
    </main>
  );
}
