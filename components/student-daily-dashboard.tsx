"use client";
import { CommunitySwitcher } from "@/components/community-switcher";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  ArrowRight,
  BookOpen,
  Check,
  CircleGauge,
  Clock3,
  FileText,
  Flame,
  LibraryBig,
  LoaderCircle,
  LockKeyholeOpen,
  Sparkles,
  Star,
  X,
  Zap,
} from "lucide-react";
import type {
  DailyExamDate,
  StudentDailyDashboard,
} from "@/lib/data/student-daily-dashboard";
import type { SubscriptionPlan } from "@/lib/types";
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

function formatPrice(plan: SubscriptionPlan) {
  return new Intl.NumberFormat("en-NP", {
    style: "currency",
    currency: plan.currency,
    currencyDisplay: "code",
    maximumFractionDigits: 0,
  }).format(plan.price);
}

function billingInterval(plan: SubscriptionPlan) {
  if (plan.billingType === "monthly") return "/ month";
  return "one-time";
}

function UpgradeModal({
  open,
  plan,
  onClose,
}: {
  open: boolean;
  plan: SubscriptionPlan;
  onClose: () => void;
}) {
  const router = useRouter();
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const creatingInvoiceRef = useRef(false);
  const [creatingInvoice, setCreatingInvoice] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    const previousFocus =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeButtonRef.current?.focus();

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && !creatingInvoiceRef.current) {
        onClose();
        return;
      }
      if (event.key !== "Tab" || !dialogRef.current) return;
      const focusable = Array.from(
        dialogRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
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
    }

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", onKeyDown);
      previousFocus?.focus();
    };
  }, [onClose, open]);

  if (!open) return null;

  async function startPaidUpgrade() {
    creatingInvoiceRef.current = true;
    setCreatingInvoice(true);
    setError("");
    try {
      const response = await fetch("/api/billing/invoices", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ planId: plan.id, paymentMethod: "bank_transfer" }),
      });
      const payload = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        setError(payload.error || "Could not prepare your upgrade. Try again.");
        return;
      }
      router.push("/app/billing");
    } catch {
      setError("Could not reach NanoSyllabus. Check your connection and try again.");
    } finally {
      creatingInvoiceRef.current = false;
      setCreatingInvoice(false);
    }
  }

  function openReferral() {
    onClose();
    router.push("/app/community?invite=referral");
  }

  const price = formatPrice(plan);

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/55 p-4"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !creatingInvoice) onClose();
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="upgrade-dialog-title"
        aria-describedby="upgrade-dialog-description"
        className="max-h-[min(720px,calc(100dvh-2rem))] w-full max-w-xl overflow-y-auto rounded-3xl border border-border bg-bg-primary p-5 shadow-2xl sm:p-7"
      >
        <div className="flex items-start justify-between gap-5">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-text-muted">
              {plan.name}
            </p>
            <h2 id="upgrade-dialog-title" className="mt-2 font-display text-2xl font-semibold">
              Upgrade to Unlimited
            </h2>
          </div>
          <button
            ref={closeButtonRef}
            type="button"
            onClick={onClose}
            disabled={creatingInvoice}
            className={cn(
              "flex size-10 shrink-0 items-center justify-center rounded-full bg-border text-text-secondary hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-50",
              focusRing,
            )}
            aria-label="Close upgrade dialog"
          >
            <X className="size-4" aria-hidden="true" />
          </button>
        </div>

        <p id="upgrade-dialog-description" className="mt-3 text-sm leading-6 text-text-secondary">
          Choose the official paid plan or invite a peer. Both paths use your real billing account.
        </p>

        <section className="mt-6 rounded-2xl border border-border bg-border p-5">
          <div className="flex flex-wrap items-end justify-between gap-2">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-text-muted">
                Pay with official QR
              </p>
              <p className="mt-2 font-display text-3xl font-semibold tabular-nums">{price}</p>
            </div>
            <p className="pb-1 text-sm text-text-secondary">{billingInterval(plan)}</p>
          </div>
          {plan.features.length ? (
            <ul className="mt-4 grid gap-2 text-sm text-text-secondary">
              {plan.features.slice(0, 4).map((feature) => (
                <li key={feature} className="flex items-start gap-2">
                  <Check className="mt-0.5 size-4 shrink-0 text-success" aria-hidden="true" />
                  <span>{feature}</span>
                </li>
              ))}
            </ul>
          ) : null}
          <button
            type="button"
            onClick={() => void startPaidUpgrade()}
            disabled={creatingInvoice}
            aria-busy={creatingInvoice}
            className={cn(
              "mt-5 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-full bg-text-primary px-5 text-sm font-semibold text-text-inverse hover:opacity-90 disabled:cursor-wait disabled:opacity-60",
              focusRing,
            )}
          >
            {creatingInvoice ? (
              <LoaderCircle
                className="size-4 animate-spin motion-reduce:animate-none"
                aria-hidden="true"
              />
            ) : (
              <Zap className="size-4" aria-hidden="true" />
            )}
            {creatingInvoice ? "Preparing invoice…" : `Continue with ${price}`}
          </button>
        </section>

        <section className="mt-3 rounded-2xl border border-border p-5">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-text-muted">
            Free via peer referral
          </p>
          <p className="mt-2 text-sm leading-6 text-text-secondary">
            Active paid Pro members can share a tracked link. When your friend buys one month of
            Individual Pro, they get 60 days total and you get 30 extra days after payment approval.
          </p>
          <button
            type="button"
            onClick={openReferral}
            disabled={creatingInvoice}
            className={cn(
              "mt-4 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-full border border-border px-5 text-sm font-semibold hover:bg-border disabled:opacity-50",
              focusRing,
            )}
          >
            Create referral link <ArrowRight className="size-4" aria-hidden="true" />
          </button>
        </section>

        {error ? (
          <p
            role="alert"
            className="mt-4 rounded-xl bg-destructive/10 px-4 py-3 text-sm text-destructive"
          >
            {error}
          </p>
        ) : null}
      </div>
    </div>
  );
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
          <span className="text-xs font-semibold uppercase tracking-[0.12em] text-text-muted">
            {label}
          </span>
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
        <span className="text-xs font-semibold uppercase tracking-[0.12em] text-text-muted">
          {label}
        </span>
        <span className="text-text-secondary" aria-hidden="true">
          {icon}
        </span>
      </div>
      <p
        className={cn(
          "mt-5 truncate font-display text-[clamp(1.65rem,2.2vw,2.15rem)] font-semibold leading-none tracking-[-0.04em] tabular-nums",
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
  const community = dashboard.challenge.community;
  const params = new URLSearchParams();
  if (community) params.set("community", community.slug);
  if (challenge) params.set("challenge", challenge.id);
  const fallbackHref = community
    ? `/app/challenges?${params.toString()}`
    : "/app/community";
  const eyebrow = challenge
    ? challenge.status === "started"
      ? "Pick up where you left off"
      : dashboard.todayChallengeCompletions > 0
        ? "Your next challenge"
        : "Your first challenge"
    : community
      ? "Your challenge space"
      : "Choose your programme";
  const action = challenge
    ? challenge.status === "started"
      ? "Continue challenge"
      : "Start a challenge"
    : community
      ? "Find a challenge"
      : "Browse communities";

  return (
    <section
      className="relative mt-6 overflow-hidden rounded-[28px] border border-black/10 bg-[#cbf738] px-6 py-7 sm:px-8 sm:py-8 lg:px-10 lg:py-9 text-black shadow-sm"
      aria-labelledby="starter-challenge-heading"
    >
      {/* Lighter organic curved hill / glow at the bottom matching reference */}
      <div
        className="pointer-events-none absolute -bottom-16 -left-12 h-64 w-[540px] rounded-[100%] bg-gradient-to-tr from-[#e5ff75]/80 via-[#daf955]/60 to-transparent blur-md"
        aria-hidden="true"
      />
      <svg
        className="pointer-events-none absolute bottom-0 left-0 h-28 w-full opacity-35"
        viewBox="0 0 1200 160"
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        <path
          d="M 0 160 Q 350 30 900 160 Z"
          fill="rgba(255, 255, 255, 0.4)"
        />
      </svg>

      {/* Top right challenge counter matching reference (CHALLENGE 01 / 1 /) */}
      <div className="absolute right-6 top-6 text-right select-none sm:right-8 sm:top-7">
        <p className="text-[11px] font-extrabold uppercase tracking-[0.14em] text-black/75 sm:text-xs">
          Challenge {String(challenge?.position ?? 1).padStart(2, "0")}
        </p>
        <p className="mt-0.5 text-sm font-bold text-black/60 font-mono tracking-tight">
          {challenge?.position ?? 1} /
        </p>
      </div>

      <div className="relative grid gap-8 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
        {/* Left Column: Eyebrow, Heading, Subtitle, CTA Button */}
        <div className="max-w-xl">
          <p className="inline-flex min-h-7 items-center rounded-full bg-black/[0.08] px-3.5 py-1 text-[11px] font-extrabold uppercase tracking-[0.1em] text-black/80">
            {eyebrow}
          </p>
          <h2
            id="starter-challenge-heading"
            className="mt-3.5 font-display text-[clamp(2.2rem,4vw,3.25rem)] font-extrabold leading-[1.02] tracking-[-0.045em] text-black"
          >
            One topic.
            <br />
            One small win.
          </h2>

          <div className="mt-3.5 max-w-md text-sm sm:text-[15px] font-medium leading-relaxed text-black/80">
            {challenge ? (
              <>
                <p className="font-semibold text-black/95 truncate">
                  {challenge.subjectName}: {challenge.topicTitle}
                </p>
                <p className="mt-1">
                  Learn the idea. Practice with a solved question.
                  <br className="hidden sm:inline" />
                  {" "}Then close the book and take the exam yourself.
                </p>
              </>
            ) : (
              <p>
                Learn the idea. Practice with a solved question.
                <br className="hidden sm:inline" />
                {" "}Then close the book and take the exam yourself.
              </p>
            )}
          </div>

          <Link
            href={fallbackHref}
            className={cn(
              "mt-6 inline-flex min-h-12 items-center justify-center gap-2.5 rounded-full bg-[#111215] px-7 text-sm font-semibold text-white shadow-sm transition-all duration-150 hover:bg-black hover:scale-[1.02] active:scale-[0.98]",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black focus-visible:ring-offset-2 focus-visible:ring-offset-[#cbf738]",
            )}
          >
            {action}
            <ArrowRight className="size-4" aria-hidden="true" />
          </Link>
        </div>

        {/* Right Column: Stacked Notebook Graphic & 3-Step Circles */}
        <div className="relative hidden items-center justify-end gap-6 pt-4 select-none lg:flex xl:gap-8" aria-hidden="true">
          {/* Stacked Notebook Illustration */}
          <div className="relative shrink-0">
            {/* Back page for stacked 3D effect */}
            <div className="absolute -bottom-1.5 -left-1.5 h-full w-full rotate-[-7deg] rounded-2xl border-2 border-black bg-black/10" />
            <div className="absolute -bottom-1 -left-1 h-full w-full rotate-[-5deg] rounded-2xl border-2 border-black bg-[#dcfb80]" />

            {/* Front notebook page */}
            <div className="relative rotate-[-3deg] rounded-2xl border-2 border-black bg-[#faffeb] px-5 py-4 shadow-[4px_4px_0_rgba(0,0,0,0.06)] min-w-[125px]">
              {/* Binder marks on left spine */}
              <div className="absolute -left-1 top-4 h-2 w-1 rounded-sm bg-black" />
              <div className="absolute -left-1 top-8 h-2 w-1 rounded-sm bg-black" />
              <div className="absolute -left-1 top-12 h-2 w-1 rounded-sm bg-black" />

              {/* Topic badge */}
              <div className="inline-flex items-center rounded-full border border-black/80 bg-black/[0.04] px-2.5 py-0.5 text-[11px] font-bold text-black">
                Topic {String(challenge?.position ?? 1).padStart(2, "0")}
              </div>

              {/* Content lines */}
              <div className="mt-3.5 h-[2px] w-20 rounded-full bg-black" />
              <div className="mt-2.5 h-[2px] w-14 rounded-full bg-black/60" />
              <div className="mt-2.5 h-[2px] w-18 rounded-full bg-black/40" />
            </div>
          </div>

          {/* 3 Step Flow with Arrows */}
          <div className="flex items-center gap-3 xl:gap-4">
            {/* Step 1: Learn */}
            <div className="flex flex-col items-center">
              <div className="grid size-14 place-items-center rounded-full border-2 border-black bg-white/40 shadow-xs backdrop-blur-xs transition-transform hover:scale-105">
                <BookOpen className="size-6 text-black stroke-[1.8]" />
              </div>
              <span className="mt-2 text-xs font-bold text-black tracking-tight">Learn</span>
            </div>

            {/* Arrow 1 */}
            <ArrowRight className="size-4 shrink-0 text-black stroke-[2.2]" />

            {/* Step 2: Practice */}
            <div className="flex flex-col items-center">
              <div className="grid size-14 place-items-center rounded-full border-2 border-black bg-white/40 shadow-xs backdrop-blur-xs transition-transform hover:scale-105">
                <FileText className="size-6 text-black stroke-[1.8]" />
              </div>
              <span className="mt-2 text-xs font-bold text-black tracking-tight">Practice</span>
            </div>

            {/* Arrow 2 */}
            <ArrowRight className="size-4 shrink-0 text-black stroke-[2.2]" />

            {/* Step 3: Take the exam */}
            <div className="flex flex-col items-center">
              <div className="grid size-14 place-items-center rounded-full border-2 border-black bg-white/40 shadow-xs backdrop-blur-xs transition-transform hover:scale-105">
                <Star className="size-6 text-black stroke-[1.8]" />
              </div>
              <span className="mt-2 text-xs font-bold text-black tracking-tight whitespace-nowrap">Take the exam</span>
            </div>
          </div>
        </div>
      </div>
    </section>
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

  if (!community) {
    return (
      <section className="rounded-2xl border border-dashed border-border p-7 text-center">
        <LibraryBig className="mx-auto size-7 text-text-muted" aria-hidden="true" />
        <h2 className="mt-3 font-display text-xl font-semibold">
          Semester progress starts with a community
        </h2>
        <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-text-secondary">
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
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-text-muted">
            Programme map
          </p>
          <h2
            id="semester-progress-heading"
            className="mt-2 font-display text-xl font-semibold leading-tight"
          >
            Semester progress
          </h2>
          <p className="mt-1 text-sm text-text-secondary">
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
              <p className="font-display text-2xl font-semibold tabular-nums">
                {semester.readiness === null ? "—" : `${Math.round(semester.readiness)}%`}
              </p>
              <p className="text-xs text-text-muted">Average readiness</p>
            </div>
          </div>

          {semester.subjects.length ? (
            <div className="mt-6 divide-y divide-border border-y border-border">
              {semester.subjects.map((subject) => (
                <article
                  key={subject.id}
                  className="grid gap-3 py-4 md:grid-cols-[minmax(0,1fr)_minmax(180px,0.7fr)_auto] md:items-center"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      {subject.code ? (
                        <span className="rounded-md bg-border px-2 py-1 text-[11px] font-semibold text-text-secondary">
                          {subject.code}
                        </span>
                      ) : null}
                      <h3 className="truncate text-sm font-semibold">{subject.name}</h3>
                    </div>
                    <p className="mt-1 text-xs text-text-muted">
                      {subject.topicCount === null
                        ? "Topics syncing"
                        : `${formatNumber(subject.topicCount)} topics`}{" "}
                      ·{" "}
                      {subject.materialCount === null
                        ? "Materials syncing"
                        : `${formatNumber(subject.materialCount)} materials`}
                    </p>
                  </div>
                  <div>
                    <div className="h-2 overflow-hidden rounded-full bg-border" aria-hidden="true">
                      {subject.readiness !== null ? (
                        <div
                          className="h-full rounded-full bg-[var(--community-accent)]"
                          style={{ width: `${Math.max(0, Math.min(100, subject.readiness))}%` }}
                        />
                      ) : null}
                    </div>
                    <p className="mt-1.5 text-xs text-text-muted">
                      {subject.readiness === null
                        ? "No graded practice yet"
                        : `${Math.round(subject.readiness)}% ready`}
                    </p>
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
  unlimitedPlan,
  communitySlug,
  selectedCommunitySlug,
  initialDashboard,
}: {
  userId: string;
  communityOptions?: import("@/lib/community-switch").CommunitySwitchOption[];
  fullName: string;
  creditBalance: number;
  hasUnlimitedAccess: boolean;
  unlimitedPlan: SubscriptionPlan | null;
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
      unlimitedPlan={unlimitedPlan}
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
    <main
      className="mx-auto w-full max-w-[1440px] px-4 pb-20 pt-4 sm:px-6 lg:px-8"
      aria-busy="true"
    >
      {/*
        The real switcher, not a placeholder. Its options come from the page's
        server render, so it is usable before the dashboard data exists — and
        rendering it here is what stops the whole page jumping down by its
        height the moment the query lands. A skeleton that changes the layout it
        was standing in for has not saved the reader anything.
      */}
      {communityOptions.length ? (
        <div className="mb-5 flex justify-end">
          <CommunitySwitcher
            options={communityOptions}
            selectedSlug={selectedCommunitySlug ?? ""}
          />
        </div>
      ) : null}
      <header className="flex flex-col gap-5 border-b border-border pb-7 pt-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-display text-[clamp(2rem,3.4vw,2.9rem)] font-semibold leading-[1.05] tracking-[-0.045em]">
            Welcome back, {fullName.trim().split(/\s+/)[0] || "there"}.
          </h1>
          {/* Keep the heading footprint stable while the dashboard data loads. */}
          <div className={`mt-3 h-4 w-64 ${line}`} aria-hidden="true" />
        </div>
      </header>

      <section
        className="mt-6 min-h-[250px] animate-pulse rounded-[28px] bg-border motion-reduce:animate-none"
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
          <h2 className="font-display text-xl font-semibold">Practice calendar</h2>
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
              <h2 className="mt-2 font-display text-xl font-semibold">Semester progress</h2>
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
  unlimitedPlan,
  dashboard,
}: {
  userId: string;
  communityOptions?: import("@/lib/community-switch").CommunitySwitchOption[];
  fullName: string;
  creditBalance: number;
  hasUnlimitedAccess: boolean;
  unlimitedPlan: SubscriptionPlan | null;
  dashboard: StudentDailyDashboard;
}) {
  const [upgradeOpen, setUpgradeOpen] = useState(false);
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
    <main className="mx-auto w-full max-w-[1440px] px-4 pb-20 pt-4 sm:px-6 lg:px-8">
      {communityOptions.length ? (
        <div className="mb-5 flex justify-end">
          <CommunitySwitcher
            options={communityOptions}
            selectedSlug={challenge.community?.slug ?? ""}
          />
        </div>
      ) : null}
      <header className="flex flex-col gap-5 border-b border-border pb-7 pt-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-display text-[clamp(2rem,4vw,3.35rem)] font-semibold leading-[1.02] tracking-[-0.045em]">
            Welcome back, {firstName(fullName)}.
          </h1>
        </div>
        {!hasUnlimitedAccess ? (
          <button
            type="button"
            onClick={() => setUpgradeOpen(true)}
            disabled={!unlimitedPlan}
            className={cn(
              "inline-flex min-h-11 items-center gap-2 rounded-full border border-border px-4 text-sm font-semibold hover:bg-border disabled:cursor-not-allowed disabled:opacity-50",
              focusRing,
            )}
            title={unlimitedPlan ? undefined : "Unlimited plan is currently unavailable"}
          >
            <Zap className="size-4" aria-hidden="true" /> Unlock Unlimited
          </button>
        ) : null}
      </header>

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

      {unlimitedPlan ? (
        <UpgradeModal
          open={upgradeOpen}
          plan={unlimitedPlan}
          onClose={() => setUpgradeOpen(false)}
        />
      ) : null}
    </main>
  );
}
