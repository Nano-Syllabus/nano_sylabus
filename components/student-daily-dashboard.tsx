"use client";

import Link from "next/link";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import {
  ArrowRight,
  Check,
  CircleGauge,
  Clock3,
  Flame,
  LibraryBig,
  LockKeyholeOpen,
  Pencil,
  Plus,
  Quote,
  Sparkles,
} from "lucide-react";
import type { DailyExamDate, StudentDailyDashboard } from "@/lib/data/student-daily-dashboard";
import { rankSemesterSubjects } from "@/lib/data/student-semester-ranking";
import { cn } from "@/lib/utils";
import { useDashboard } from "@/lib/query/dashboard";
import { PracticeCalendar } from "@/components/practice-calendar";

const focusRing =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-strong focus-visible:ring-offset-2 focus-visible:ring-offset-bg-primary";

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
      const result = (await response.json().catch(() => null)) as
        | { quote?: string; error?: string }
        | null;
      if (!response.ok) throw new Error(result?.error || "Could not save your quote. Please try again.");

      const savedQuote = typeof result?.quote === "string" ? result.quote : "";

      setQuote(savedQuote);
      setDraft(savedQuote);
      setEditing(false);
      setStatus(savedQuote ? "Saved to your profile." : "Quote removed.");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Could not save your quote. Please try again.");
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
      className="relative mt-5 overflow-hidden rounded-[27px] bg-[var(--community-accent)] px-6 py-[22px] text-[var(--community-accent-foreground)] shadow-sm sm:px-10"
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
            <span className="tabular-nums">{draft.length} / {STUDY_QUOTE_LIMIT}</span>
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
        <div className="relative flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-start gap-4">
            <span className="grid size-[58px] shrink-0 place-items-center rounded-full border-2 border-current/80" aria-hidden="true">
              <Quote className="size-6" fill="currentColor" />
            </span>
            <div className="min-w-0">
              <p className="text-xs font-bold uppercase tracking-[0.16em] opacity-80">Your study reminder</p>
              <blockquote
                id="study-quote-heading"
                className="mt-1 max-w-4xl break-words font-sans text-[clamp(21px,2.3vw,30px)] font-semibold leading-[1.3] tracking-[-0.025em]"
              >
                {quote}
              </blockquote>
            </div>
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
        <div className="relative flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
          <div className="flex min-w-0 items-center gap-4 sm:gap-6">
            <span className="grid size-14 shrink-0 place-items-center rounded-full border-2 border-current/80" aria-hidden="true">
              <Quote className="size-7" fill="currentColor" />
            </span>
            <h2 id="study-quote-heading" className="min-w-0 text-2xl font-semibold tracking-tight sm:text-3xl">
              What words help you keep going?
            </h2>
          </div>
          <button
            type="button"
            onClick={startEditing}
            className="inline-flex min-h-12 shrink-0 items-center justify-center gap-2 self-start rounded-full border-2 border-current/45 bg-bg-primary/10 px-5 text-base font-semibold transition-colors hover:bg-bg-primary/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-current focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--community-accent)] sm:self-auto"
          >
            <Plus className="size-5" aria-hidden="true" />
            Add your quote
          </button>
        </div>
      )}

      {status ? <p className="relative mt-3 text-sm font-medium" role="status">{status}</p> : null}
    </section>
  );
}

function formatNumber(value: number, maximumFractionDigits = 0) {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits }).format(value);
}

function firstName(value: string) {
  return value.trim().split(/\s+/)[0] || "Student";
}

/**
 * True for a moment after `value` changes, false the rest of the time.
 *
 * This is what makes an update read as A NUMBER MOVING rather than a screen
 * reloading. The dashboard is now patched in place when a student finishes a
 * challenge — the streak and the "Today" count change without any request — and
 * without a cue that is invisible: the figure simply differs from what the eye
 * last registered, which reads as "was it always that?" rather than "I just did
 * that."
 *
 * A shimmer would be exactly the wrong signal here. Shimmer means "this is
 * absent and is being fetched"; nothing is absent, the value is already correct.
 * What is wanted is the opposite gesture — draw the eye to a value that is
 * newly right.
 *
 * Ref-compared rather than stored in state, so a re-render that does not change
 * the value cannot retrigger the highlight. The timer is cleared on every
 * change, so rapid successive updates extend the highlight instead of stacking
 * timers.
 */
function useValueChanged(value: string) {
  const previous = useRef(value);
  const [changed, setChanged] = useState(false);

  useEffect(() => {
    if (previous.current === value) return;
    previous.current = value;
    setChanged(true);
    const timer = window.setTimeout(() => setChanged(false), 1100);
    return () => window.clearTimeout(timer);
  }, [value]);

  return changed;
}

/**
 * `pending` shimmers only the NUMBER, never the card.
 *
 * A tile's label and icon are known before its value is — they are constants in
 * this file, not data — so greying the whole card while waiting throws away
 * information the reader could already have used. Keeping the frame, the label
 * and the icon solid means the dashboard arrives as a real page with five
 * recognisable tiles whose figures are still landing, rather than as six grey
 * rectangles that could be anything.
 *
 * It also removes the layout shift: the card is exactly the size it will be, so
 * nothing moves when the value arrives.
 */
function MetricCard({
  icon,
  label,
  value,
  accent,
  pending,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  accent?: boolean;
  pending?: boolean;
}) {
  const justChanged = useValueChanged(value);

  if (pending) {
    return (
      <article className="min-w-0 rounded-2xl border border-border bg-card p-4">
        <div className="flex items-center justify-between gap-3">
          <span className="type-student-eyebrow text-text-muted">{label}</span>
          <span className="text-text-secondary" aria-hidden="true">
            {icon}
          </span>
        </div>
        <div
          className="mt-5 h-8 w-20 animate-pulse rounded-lg bg-border motion-reduce:animate-none"
          aria-hidden="true"
        />
        <span className="sr-only">{label} is still loading</span>
      </article>
    );
  }

  return (
    <article
      className={cn(
        "min-w-0 rounded-2xl border p-4",
        accent
          ? "border-[var(--community-accent)]/35 bg-[color-mix(in_srgb,var(--community-accent)_7%,var(--bg-primary))]"
          : "border-border bg-card",
      )}
    >
      <div className="flex items-center justify-between gap-3">
        <span className="type-student-eyebrow text-text-muted">{label}</span>
        <span className="text-text-secondary" aria-hidden="true">
          {icon}
        </span>
      </div>
      <p
        className={cn(
          "type-student-metric mt-5 truncate tabular-nums",
          // The settle is slower than the lift, so the number arrives with a
          // small flourish and then calms down rather than snapping back.
          "transition-[color,transform,text-shadow] duration-700 ease-out motion-reduce:transition-none",
          justChanged &&
            "scale-[1.06] text-[var(--community-accent,#1d57fd)] [text-shadow:0_0_18px_color-mix(in_srgb,var(--community-accent,#1d57fd)_45%,transparent)] duration-200",
        )}
        style={{ transformOrigin: "left center" }}
      >
        {value}
      </p>
    </article>
  );
}

function SemesterProgress({
  dashboard,
  compact = false,
}: {
  dashboard: StudentDailyDashboard;
  compact?: boolean;
}) {
  const community = dashboard.community;
  const [semesterId, setSemesterId] = useState(community?.currentSemesterId ?? "");
  useEffect(() => {
    setSemesterId(community?.currentSemesterId ?? "");
  }, [community?.currentSemesterId, community?.slug]);
  const semester = useMemo(
    () => community?.semesters.find((item) => item.id === semesterId) ?? community?.semesters[0],
    [community, semesterId],
  );
  const rankedSubjects = useMemo(
    () => (semester ? rankSemesterSubjects(semester.subjects) : []),
    [semester],
  );

  if (!community) {
    return (
      <section className="rounded-2xl border border-dashed border-border p-7 text-center">
        <LibraryBig className="mx-auto size-7 text-text-muted" aria-hidden="true" />
        <h2 className="type-student-section-title mt-3">
          Semester progress starts with a community
        </h2>
        <p className="type-student-body mx-auto mt-2 max-w-xl text-text-secondary">
          Semester-to-subject mappings come from your joined programme community, so nothing is
          guessed from profile text.
        </p>
      </section>
    );
  }

  return (
    <section
      className="overflow-hidden rounded-2xl border border-border bg-card"
      aria-labelledby="semester-progress-heading"
    >
      <div
        className={cn(
          "flex flex-col gap-4 border-b border-border px-5 py-5",
          !compact && "sm:flex-row sm:items-end sm:justify-between sm:px-6",
        )}
      >
        <div className="min-w-0">
          <p className="type-student-eyebrow text-text-muted">Programme map</p>
          <h2 id="semester-progress-heading" className="type-student-section-title mt-2">
            Semester progress
          </h2>
        </div>
        <label
          className={cn(
            "grid gap-1.5 text-xs font-medium text-text-secondary",
            compact && "w-full",
          )}
        >
          Semester
          <select
            value={semester?.id ?? ""}
            onChange={(event) => setSemesterId(event.target.value)}
            className={cn(
              "min-h-11 rounded-xl border border-border bg-bg-primary px-3 text-sm text-text-primary",
              compact ? "w-full min-w-0" : "min-w-[220px]",
              focusRing,
            )}
          >
            {community.semesters.map((item) => (
              <option key={item.id} value={item.id}>
                {item.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      {semester ? (
        <div className="p-5 sm:p-6">
          {rankedSubjects.length ? (
            <div className="divide-y divide-border border-y border-border">
              {rankedSubjects.map((subject) => (
                <article
                  key={subject.id}
                  className="grid gap-4 py-5 md:grid-cols-[minmax(0,1fr)_auto] md:items-center"
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                      {subject.code ? (
                        <span className="rounded-md bg-border px-2 py-1 text-[11px] font-semibold text-text-secondary">
                          {subject.code}
                        </span>
                      ) : null}
                      <h3 className="type-student-card-title break-words">{subject.name}</h3>
                    </div>
                    <div
                      className="mt-3 h-2 overflow-hidden rounded-full bg-border"
                      role="progressbar"
                      aria-label={`${subject.name} readiness`}
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-valuenow={subject.readiness ?? undefined}
                    >
                      {subject.readiness !== null ? (
                        <div
                          className="h-full rounded-full bg-[var(--community-accent)]"
                          style={{ width: `${Math.max(0, Math.min(100, subject.readiness))}%` }}
                        />
                      ) : null}
                    </div>
                    <div className="type-student-meta mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-text-muted">
                      <span>
                        {subject.topicCount === null
                          ? "Topics syncing"
                          : `${formatNumber(subject.topicCount)} topics`}{" "}
                        ·{" "}
                        {subject.materialCount === null
                          ? "Materials syncing"
                          : `${formatNumber(subject.materialCount)} materials`}
                      </span>
                      <span>
                        {subject.readiness === null
                          ? "No graded practice yet"
                          : `${Math.round(subject.readiness)}% ready`}
                      </span>
                    </div>
                  </div>
                  <Link
                    href={`/app/chat?community=${encodeURIComponent(community.slug)}&semester=${encodeURIComponent(semester.id)}&librarySubject=${encodeURIComponent(subject.slug)}`}
                    className={cn(
                      "inline-flex min-h-10 items-center gap-1.5 justify-self-start text-sm font-semibold md:justify-self-end",
                      focusRing,
                    )}
                  >
                    Open <ArrowRight className="size-4" aria-hidden="true" />
                  </Link>
                </article>
              ))}
            </div>
          ) : (
            <div className="mt-6 rounded-xl border border-dashed border-border p-6 text-center">
              <p className="text-sm font-medium">No subjects mapped to this semester yet.</p>
              <p className="mt-1 text-sm text-text-secondary">
                A community creator can attach real indexed subjects.
              </p>
            </div>
          )}
        </div>
      ) : null}
    </section>
  );
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
  const { data } = useDashboard(communitySlug, initialDashboard);
  const dashboard = data?.dashboard;

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

      <section
        className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4"
        aria-label="Daily learning metrics"
      >
        <MetricCard pending icon={<Flame className="size-4" />} label="Current streak" value="" />
        {/* Known from the session — no reason to hide it. */}
        <MetricCard
          icon={<LockKeyholeOpen className="size-4" />}
          label="NanoAI Credits"
          value={hasUnlimitedAccess ? "Unlimited" : formatNumber(creditBalance)}
        />
        <MetricCard
          pending
          icon={<CircleGauge className="size-4" />}
          label="Challenges / day"
          value=""
        />
        <MetricCard pending icon={<Clock3 className="size-4" />} label="Today" value="" />
      </section>

      <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
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

        <section className="rounded-2xl border border-border bg-card p-5">
          <div className="flex flex-col gap-4">
            <div>
              <div className={`h-3 w-24 ${line}`} aria-hidden="true" />
              <h2 className="type-student-section-title mt-2">Semester progress</h2>
              <div className={`mt-2 h-3 w-44 ${line}`} aria-hidden="true" />
            </div>
            <div className={`h-11 w-full rounded-xl ${line}`} aria-hidden="true" />
          </div>
          <div className="mt-5 space-y-4" aria-hidden="true">
            {Array.from({ length: 4 }).map((_, index) => (
              <div key={index} className="border-t border-border pt-4">
                <div className={`h-3 w-40 ${line}`} />
                <div className={`mt-2 h-3 w-28 ${line}`} />
                <div className={`mt-3 h-2 w-full ${line}`} />
              </div>
            ))}
          </div>
        </section>
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
  const accessValue = hasUnlimitedAccess ? "Unlimited" : formatNumber(creditBalance);

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

      <section
        className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4"
        aria-label="Daily learning metrics"
      >
        <MetricCard
          icon={<Flame className="size-4" />}
          label="Current streak"
          value={`${challenge.currentStreak}d`}
        />
        <MetricCard
          icon={<LockKeyholeOpen className="size-4" />}
          label="NanoAI Credits"
          value={accessValue}
        />
        <MetricCard
          icon={<CircleGauge className="size-4" />}
          label="Challenges / day"
          value={formatNumber(challenge.practicePerDay, 1)}
        />
        <MetricCard
          icon={
            dashboard.todayChallengeCompletions ? (
              <Check className="size-4" />
            ) : (
              <Clock3 className="size-4" />
            )
          }
          label="Today"
          value={formatNumber(dashboard.todayChallengeCompletions)}
          accent={dashboard.todayChallengeCompletions > 0}
        />
      </section>

      <div className="mt-6 grid items-start gap-6 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <PracticeCalendar
          initialDays={dashboard.activity}
          examDates={dashboard.examDates ?? []}
          userId={userId}
          communitySlug={challenge.community?.slug}
          semesters={community?.semesters ?? []}
          currentSemesterId={community?.currentSemesterId}
          onExamDatesChange={handleExamDatesChange}
        />
        <SemesterProgress dashboard={dashboard} compact />
      </div>
    </main>
  );
}
