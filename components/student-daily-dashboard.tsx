"use client";

import Link from "next/link";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  ArrowRight,
  BookOpen,
  Check,
  CircleGauge,
  CirclePlay,
  Clock3,
  FileText,
  Flame,
  LibraryBig,
  LockKeyholeOpen,
  Sparkles,
  Star,
  X,
} from "lucide-react";
import type { DailyExamDate, StudentDailyDashboard } from "@/lib/data/student-daily-dashboard";
import { rankSemesterSubjects } from "@/lib/data/student-semester-ranking";
import { cn } from "@/lib/utils";
import { useDashboard } from "@/lib/query/dashboard";
import { PracticeCalendar } from "@/components/practice-calendar";

const focusRing =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-strong focus-visible:ring-offset-2 focus-visible:ring-offset-bg-primary";

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

function StarterChallengeBanner({ dashboard }: { dashboard: StudentDailyDashboard }) {
  const challenge = [...dashboard.challenge.challenges]
    .filter((item) => item.status !== "completed")
    .sort(
      (left, right) =>
        Number(right.status === "started") - Number(left.status === "started") ||
        left.position - right.position,
    )[0];
  const community = dashboard.community ?? dashboard.challenge.community;
  const params = new URLSearchParams();
  if (community?.slug) params.set("community", community.slug);
  const fallbackHref = community
    ? `/app/challenges${params.toString() ? `?${params.toString()}` : ""}`
    : "/app/community";
  const action = challenge
    ? challenge.status === "started"
      ? "Continue challenge"
      : "Start a challenge"
    : community
      ? "Find a challenge"
      : "Browse communities";

  return (
    <section
      className="relative mt-5 overflow-hidden rounded-[24px] border border-black/10 bg-[#cbf738] px-6 py-5 sm:px-8 sm:py-6 lg:px-9 lg:py-6 text-black shadow-sm"
      aria-labelledby="starter-challenge-heading"
    >
      {/* Lighter organic curved hill / glow at the bottom matching reference */}
      <div
        className="pointer-events-none absolute -bottom-16 -left-12 h-48 w-[460px] rounded-[100%] bg-gradient-to-tr from-[#e5ff75]/80 via-[#daf955]/60 to-transparent blur-md"
        aria-hidden="true"
      />
      <svg
        className="pointer-events-none absolute bottom-0 left-0 h-20 w-full opacity-35"
        viewBox="0 0 1200 160"
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        <path d="M 0 160 Q 350 30 900 160 Z" fill="rgba(255, 255, 255, 0.4)" />
      </svg>

      <div className="relative grid gap-6 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
        {/* Left column: the automatically selected challenge and its CTA. */}
        <div className="max-w-xl">
          <h2 id="starter-challenge-heading" className="type-student-page-title text-black">
            One topic.
            <br />
            One small win.
          </h2>

          <div className="mt-2.5 max-w-md text-xs sm:text-sm font-medium leading-relaxed text-black/80">
            {community ? (
              <p className="font-semibold text-black/95 truncate">
                {community.university && community.faculty
                  ? `${community.university} · ${community.faculty}`
                  : community.university || community.faculty || community.name}
              </p>
            ) : challenge ? (
              <p className="font-semibold text-black/95 truncate">
                {challenge.subjectName}: {challenge.topicTitle}
              </p>
            ) : (
              <p>Choose a programme to get your next challenge.</p>
            )}
          </div>

          <Link
            href={fallbackHref}
            className={cn(
              "mt-4 sm:mt-5 inline-flex min-h-10 items-center justify-center gap-2 rounded-full bg-[#111215] px-6 text-xs sm:text-sm font-semibold text-white shadow-sm transition-all duration-150 hover:bg-black hover:scale-[1.02] active:scale-[0.98]",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black focus-visible:ring-offset-2 focus-visible:ring-offset-[#cbf738]",
            )}
          >
            {action}
            <ArrowRight className="size-3.5 sm:size-4" aria-hidden="true" />
          </Link>
        </div>

        {/* Right Column: Stacked Notebook Graphic & 3-Step Circles */}
        <div
          className="relative hidden items-center justify-end gap-5 select-none lg:flex xl:gap-7"
          aria-hidden="true"
        >
          {/* Stacked Notebook Illustration */}
          <div className="relative shrink-0">
            {/* Back page for stacked 3D effect */}
            <div className="absolute -bottom-1 -left-1 h-full w-full rotate-[-7deg] rounded-xl border-2 border-black bg-black/10" />
            <div className="absolute -bottom-0.5 -left-0.5 h-full w-full rotate-[-5deg] rounded-xl border-2 border-black bg-[#dcfb80]" />

            {/* Front notebook page */}
            <div className="relative rotate-[-3deg] rounded-xl border-2 border-black bg-[#faffeb] px-4 py-3 shadow-[3px_3px_0_rgba(0,0,0,0.06)] min-w-[110px]">
              {/* Binder marks on left spine */}
              <div className="absolute -left-1 top-3.5 h-1.5 w-1 rounded-sm bg-black" />
              <div className="absolute -left-1 top-6.5 h-1.5 w-1 rounded-sm bg-black" />
              <div className="absolute -left-1 top-9.5 h-1.5 w-1 rounded-sm bg-black" />

              {/* Topic badge */}
              <div className="inline-flex items-center rounded-full border border-black/80 bg-black/[0.04] px-2 py-0.5 text-[10px] font-bold text-black">
                Topic {String(challenge?.position ?? 1).padStart(2, "0")}
              </div>

              {/* Content lines */}
              <div className="mt-2.5 h-[2px] w-16 rounded-full bg-black" />
              <div className="mt-2 h-[2px] w-11 rounded-full bg-black/60" />
              <div className="mt-2 h-[2px] w-14 rounded-full bg-black/40" />
            </div>
          </div>

          {/* 3 Step Flow with Arrows */}
          <div className="flex items-center gap-2.5 xl:gap-3.5">
            {/* Step 1: Learn */}
            <div className="flex flex-col items-center">
              <div className="grid size-12 sm:size-13 place-items-center rounded-full border-2 border-black bg-white/40 shadow-xs backdrop-blur-xs transition-transform hover:scale-105">
                <BookOpen className="size-5 text-black stroke-[1.8]" />
              </div>
              <span className="mt-1.5 text-[11px] sm:text-xs font-bold text-black tracking-tight">
                Learn
              </span>
            </div>

            {/* Arrow 1 */}
            <ArrowRight className="size-3.5 shrink-0 text-black stroke-[2.2]" />

            {/* Step 2: Practice */}
            <div className="flex flex-col items-center">
              <div className="grid size-12 sm:size-13 place-items-center rounded-full border-2 border-black bg-white/40 shadow-xs backdrop-blur-xs transition-transform hover:scale-105">
                <FileText className="size-5 text-black stroke-[1.8]" />
              </div>
              <span className="mt-1.5 text-[11px] sm:text-xs font-bold text-black tracking-tight">
                Practice
              </span>
            </div>

            {/* Arrow 2 */}
            <ArrowRight className="size-3.5 shrink-0 text-black stroke-[2.2]" />

            {/* Step 3: Take the exam */}
            <div className="flex flex-col items-center">
              <div className="grid size-12 sm:size-13 place-items-center rounded-full border-2 border-black bg-white/40 shadow-xs backdrop-blur-xs transition-transform hover:scale-105">
                <Star className="size-5 text-black stroke-[1.8]" />
              </div>
              <span className="mt-1.5 text-[11px] sm:text-xs font-bold text-black tracking-tight whitespace-nowrap">
                Take the exam
              </span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function FirstTimeHereBanner({ userId }: { userId: string }) {
  const storageKey = `nano:today:first-time-banner:${userId}`;
  // Keep the guide visible on every app launch while onboarding is being tested.
  // Set this public flag to "true" when the production dismissal should persist again.
  const persistDismissal = process.env.NEXT_PUBLIC_PERSIST_FIRST_TIME_GUIDE_DISMISSAL === "true";
  const [visible, setVisible] = useState(true);
  const [guideOpen, setGuideOpen] = useState(false);
  const guideDialogRef = useRef<HTMLDialogElement>(null);
  const closeGuideRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!persistDismissal) return;

    try {
      if (window.localStorage.getItem(storageKey) === "dismissed") setVisible(false);
    } catch {
      // Keep the guide available when browser storage is unavailable.
    }
  }, [persistDismissal, storageKey]);

  useEffect(() => {
    const dialog = guideDialogRef.current;
    if (!dialog) return;

    if (guideOpen) {
      if (!dialog.open) dialog.showModal();
      closeGuideRef.current?.focus();
    } else if (dialog.open) {
      dialog.close();
    }
  }, [guideOpen]);

  function dismiss() {
    if (persistDismissal) {
      try {
        window.localStorage.setItem(storageKey, "dismissed");
      } catch {
        // The current page state still dismisses the banner.
      }
    }
    setGuideOpen(false);
    setVisible(false);
  }

  if (!visible) return null;

  return (
    <>
      <section
        className="mt-5 flex flex-col gap-3 rounded-2xl bg-[var(--community-accent)] px-4 py-3 text-[var(--community-accent-foreground)] sm:flex-row sm:items-center sm:px-5"
        aria-labelledby="first-time-heading"
      >
        <CirclePlay className="size-8 shrink-0" aria-hidden="true" />
        <div className="min-w-0 flex-1 sm:flex sm:items-center sm:gap-4">
          <h2 id="first-time-heading" className="text-lg font-semibold sm:text-xl">
            First time here?
          </h2>
          <p className="mt-0.5 text-base leading-6 opacity-90 sm:mt-0 sm:text-lg">
            See how <span className="font-semibold">NanoSyllabus</span> works in 60 seconds.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setGuideOpen(true)}
            className={cn(
              "inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-current/25 bg-bg-primary/10 px-4 text-sm font-semibold transition-colors hover:bg-bg-primary/20",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-current focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--community-accent)]",
            )}
          >
            <CirclePlay className="size-4" aria-hidden="true" />
            Watch how it works
          </button>
          <button
            type="button"
            onClick={dismiss}
            className={cn(
              "inline-flex size-11 shrink-0 items-center justify-center rounded-xl transition-colors hover:bg-bg-primary/15",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-current focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--community-accent)]",
            )}
            aria-label="Dismiss first-time guide"
          >
            <X className="size-5" aria-hidden="true" />
          </button>
        </div>
      </section>

      <dialog
        ref={guideDialogRef}
        onClose={() => setGuideOpen(false)}
        aria-labelledby="quick-guide-heading"
        className="m-auto w-[calc(100%-2rem)] max-w-lg rounded-2xl border border-border bg-card p-0 text-text-primary shadow-lg backdrop:bg-black/50"
      >
        <div className="p-5 sm:p-6">
          <section>
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="type-student-eyebrow text-text-muted">Quick guide</p>
                <h2 id="quick-guide-heading" className="type-student-section-title mt-2">
                  How NanoSyllabus works
                </h2>
              </div>
              <button
                ref={closeGuideRef}
                type="button"
                onClick={() => setGuideOpen(false)}
                className={cn(
                  "inline-flex size-11 shrink-0 items-center justify-center rounded-xl hover:bg-bg-secondary",
                  focusRing,
                )}
                aria-label="Close quick guide"
              >
                <X className="size-5" aria-hidden="true" />
              </button>
            </div>
            <ol className="mt-5 space-y-4">
              {[
                [
                  "Choose your community",
                  "Your programme keeps subjects and challenges in the right scope.",
                ],
                [
                  "Practice a small topic",
                  "Start or continue a daily challenge whenever you are ready.",
                ],
                [
                  "Track your readiness",
                  "Your subject progress updates as you practise, so you can focus next.",
                ],
              ].map(([title, description], index) => (
                <li key={title} className="flex gap-3">
                  <span className="grid size-7 shrink-0 place-items-center rounded-full bg-bg-secondary text-sm font-semibold text-text-secondary">
                    {index + 1}
                  </span>
                  <div>
                    <h3 className="text-sm font-semibold">{title}</h3>
                    <p className="mt-0.5 text-sm leading-6 text-text-secondary">{description}</p>
                  </div>
                </li>
              ))}
            </ol>
            <button
              type="button"
              onClick={() => setGuideOpen(false)}
              className={cn(
                "mt-6 inline-flex min-h-11 w-full items-center justify-center rounded-xl bg-text-primary px-4 text-sm font-semibold text-text-inverse hover:opacity-90",
                focusRing,
              )}
            >
              Got it
            </button>
          </section>
        </div>
      </dialog>
    </>
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
          <p className="type-student-body mt-1 text-text-secondary">
            Real topic readiness from your indexed subjects.
          </p>
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
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="text-sm font-semibold">{semester.label}</p>
              <p className="mt-1 text-sm text-text-secondary">
                {semester.subjects.length} subject{semester.subjects.length === 1 ? "" : "s"} ·{" "}
                {semester.measuredSubjects} with measurable readiness
              </p>
            </div>
            <div className="text-right">
              <p className="type-student-metric tabular-nums">
                {semester.readiness === null ? "—" : `${Math.round(semester.readiness)}%`}
              </p>
              <p className="type-student-meta text-text-muted">Average readiness</p>
            </div>
          </div>

          {rankedSubjects.length ? (
            <div className="mt-6 divide-y divide-border border-y border-border">
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
  communitySlug,
  selectedCommunitySlug,
  initialDashboard,
}: {
  userId: string;
  communityOptions?: import("@/lib/community-switch").CommunitySwitchOption[];
  fullName: string;
  creditBalance: number;
  hasUnlimitedAccess: boolean;
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
      />
    );

  return (
    <DashboardContent
      userId={userId}
      communityOptions={communityOptions}
      fullName={fullName}
      creditBalance={creditBalance}
      hasUnlimitedAccess={hasUnlimitedAccess}
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
}: {
  communityOptions?: import("@/lib/community-switch").CommunitySwitchOption[];
  selectedCommunitySlug?: string;
  fullName: string;
  creditBalance: number;
  hasUnlimitedAccess: boolean;
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
  dashboard,
}: {
  userId: string;
  communityOptions?: import("@/lib/community-switch").CommunitySwitchOption[];
  fullName: string;
  creditBalance: number;
  hasUnlimitedAccess: boolean;
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

      <FirstTimeHereBanner userId={userId} />
      <StarterChallengeBanner dashboard={dashboard} />

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
