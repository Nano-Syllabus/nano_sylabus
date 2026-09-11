"use client";
import { CommunitySwitcher } from "@/components/community-switcher";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  ArrowRight,
  Check,
  ChevronLeft,
  ChevronRight,
  CircleGauge,
  Clock3,
  Flame,
  LibraryBig,
  LoaderCircle,
  LockKeyholeOpen,
  Pencil,
  Plus,
  Trash2,
  Trophy,
  Users,
  X,
  Zap,
} from "lucide-react";
import type {
  DailyActivityDay,
  DailyExamDate,
  DailyLeaderboardMember,
  StudentDailyDashboard,
} from "@/lib/data/student-daily-dashboard";
import type { SubscriptionPlan } from "@/lib/types";
import { cn } from "@/lib/utils";
import { ApiError, apiFetch } from "@/lib/query/api";
import { useDashboard } from "@/lib/query/dashboard";

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

function activityLabel(day: DailyActivityDay) {
  if (day.status === "future") return `${day.label}: upcoming`;
  if (day.status === "idle") return `${day.label}: no recorded practice`;
  const score = day.averageScore === null ? "" : `, ${Math.round(day.averageScore)}% average`;
  return `${day.label}: ${day.attempts} attempt${day.attempts === 1 ? "" : "s"}, ${day.completions} passed${score}`;
}

function currentKathmanduDate() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kathmandu",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;
  return `${year}-${month}-${day}`;
}

function ActivityCalendar({
  days,
  examDates,
  userId,
  calendarMonth,
  onExamDatesChange,
}: {
  days: DailyActivityDay[];
  examDates: DailyExamDate[];
  userId: string;
  calendarMonth?: string;
  onExamDatesChange: (examDates: DailyExamDate[]) => void;
}) {
  const initialSelectedDate =
    days.find((day) => day.isToday)?.date ??
    [...days].reverse().find((day) => day.status !== "future")?.date ??
    days[0]?.date ??
    "";
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const [selectedDate, setSelectedDate] = useState(initialSelectedDate);
  const [examFormOpen, setExamFormOpen] = useState(false);
  const [editingExamId, setEditingExamId] = useState<string | null>(null);
  const [examDate, setExamDate] = useState("");
  const [examTitle, setExamTitle] = useState("");
  const [examSaving, setExamSaving] = useState(false);
  const [examError, setExamError] = useState("");
  const [storageNotice, setStorageNotice] = useState("");
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const currentMonth = days[0]?.date.slice(0, 7) ?? calendarMonth ?? "";
  const fallbackStorageKey = `nano-syllabus:exam-dates-fallback:${userId}`;

  const [fallbackExamDates, setFallbackExamDates] = useState<DailyExamDate[]>([]);
  useEffect(() => {
    try {
      const parsed: unknown = JSON.parse(localStorage.getItem(fallbackStorageKey) ?? "[]");
      setFallbackExamDates(
        Array.isArray(parsed)
          ? parsed.filter(
              (entry): entry is DailyExamDate =>
                Boolean(entry) &&
                typeof entry === "object" &&
                typeof (entry as DailyExamDate).id === "string" &&
                typeof (entry as DailyExamDate).date === "string" &&
                typeof (entry as DailyExamDate).title === "string",
            )
          : [],
      );
    } catch {
      setFallbackExamDates([]);
    }
  }, [fallbackStorageKey]);

  const selectedDay = days.find((day) => day.date === selectedDate) ?? null;
  const displayedExamDates = useMemo(() => {
    const byDate = new Map(fallbackExamDates.map((exam) => [exam.date, exam]));
    examDates.forEach((exam) => byDate.set(exam.date, exam));
    return [...byDate.values()].sort((left, right) => left.date.localeCompare(right.date));
  }, [examDates, fallbackExamDates]);
  const examByDate = useMemo(
    () => new Map(displayedExamDates.map((exam) => [exam.date, exam])),
    [displayedExamDates],
  );
  const selectedExam = examByDate.get(selectedDate) ?? null;
  const urlDate = searchParams.get("date");
  const todayDate = currentKathmanduDate();
  const todayMonth = todayDate.slice(0, 7);
  const firstDayOffset = days.length
    ? (new Date(`${days[0].date}T12:00:00.000Z`).getUTCDay() + 6) % 7
    : 0;

  useEffect(() => {
    const nextSelectedDate = days.some((day) => day.date === urlDate)
      ? urlDate!
      : initialSelectedDate;
    setSelectedDate(nextSelectedDate);
  }, [days, initialSelectedDate, urlDate]);

  function updateCalendarUrl(month: string | undefined, date: string | undefined) {
    const params = new URLSearchParams(searchParams.toString());
    if (month && month !== todayMonth) params.set("month", month);
    else params.delete("month");
    if (date) params.set("date", date);
    else params.delete("date");
    const query = params.toString();
    router.replace(`${pathname}${query ? `?${query}` : ""}`, { scroll: false });
  }

  function selectDate(date: string) {
    setSelectedDate(date);
    updateCalendarUrl(currentMonth, date);
  }

  function navigateToMonth(month: string, date = `${month}-01`) {
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) return;
    setSelectedDate(date);
    updateCalendarUrl(month, date);
  }

  function shiftMonth(offset: number) {
    if (!currentMonth) return;
    const date = new Date(`${currentMonth}-01T12:00:00.000Z`);
    date.setUTCMonth(date.getUTCMonth() + offset);
    navigateToMonth(date.toISOString().slice(0, 7));
  }

  function openNewExamForm() {
    setEditingExamId(null);
    setExamDate(selectedDate || `${currentMonth}-01`);
    setExamTitle("");
    setExamError("");
    setDeleteConfirmOpen(false);
    setExamFormOpen(true);
  }

  function openEditExamForm() {
    if (!selectedExam) return;
    setEditingExamId(selectedExam.id);
    setExamDate(selectedExam.date);
    setExamTitle(selectedExam.title);
    setExamError("");
    setDeleteConfirmOpen(false);
    setExamFormOpen(true);
  }

  function patchCachedExamDates(nextExamDates: DailyExamDate[]) {
    onExamDatesChange(nextExamDates);
    queryClient.setQueriesData<{ dashboard: StudentDailyDashboard }>(
      { queryKey: ["student", "dashboard"] },
      (previous) =>
        previous ? { dashboard: { ...previous.dashboard, examDates: nextExamDates } } : previous,
    );
  }

  function persistFallbackExamDates(nextExamDates: DailyExamDate[]) {
    setFallbackExamDates(nextExamDates);
    localStorage.setItem(fallbackStorageKey, JSON.stringify(nextExamDates));
  }

  function localExamId() {
    return `local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  }

  async function submitExamDate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!examDate || examSaving) return;
    setExamSaving(true);
    setExamError("");
    try {
      const payload = { date: examDate, title: examTitle.trim() || "Exam" };
      let result: DailyExamDate;
      if (editingExamId?.startsWith("local-")) {
        result = { id: editingExamId, ...payload };
      } else {
        try {
          const response = editingExamId
            ? await apiFetch<{ examDate: DailyExamDate }>(
                `/api/student/exam-dates/${encodeURIComponent(editingExamId)}`,
                { method: "PATCH", body: payload },
              )
            : await apiFetch<{ examDate: DailyExamDate }>("/api/student/exam-dates", {
                method: "POST",
                body: payload,
              });
          result = response.examDate;
          setStorageNotice("");
          persistFallbackExamDates(
            fallbackExamDates.filter(
              (exam) => exam.id !== editingExamId && exam.date !== response.examDate.date,
            ),
          );
        } catch (error) {
          if (!(error instanceof ApiError) || error.status < 500) throw error;
          result = { id: editingExamId ?? localExamId(), ...payload };
          persistFallbackExamDates([
            ...fallbackExamDates.filter(
              (exam) => exam.id !== editingExamId && exam.date !== result.date,
            ),
            result,
          ]);
          setStorageNotice("Saved on this browser while calendar sync is unavailable.");
        }
      }
      const nextExamDates = [
        ...displayedExamDates.filter((exam) => exam.id !== result.id && exam.date !== result.date),
        result,
      ].sort((left, right) => left.date.localeCompare(right.date));
      patchCachedExamDates(nextExamDates);
      setExamFormOpen(false);
      setEditingExamId(null);
      setExamDate("");
      setExamTitle("");
      setDeleteConfirmOpen(false);
      setSelectedDate(result.date);
      navigateToMonth(result.date.slice(0, 7), result.date);
    } catch (error) {
      setExamError(error instanceof Error ? error.message : "Could not save the exam date.");
    } finally {
      setExamSaving(false);
    }
  }

  async function deleteSelectedExam() {
    if (!selectedExam || examSaving) return;
    setExamSaving(true);
    setExamError("");
    try {
      if (selectedExam.id.startsWith("local-")) {
        persistFallbackExamDates(fallbackExamDates.filter((exam) => exam.id !== selectedExam.id));
      } else {
        await apiFetch<void>(`/api/student/exam-dates/${encodeURIComponent(selectedExam.id)}`, {
          method: "DELETE",
        });
      }
      patchCachedExamDates(displayedExamDates.filter((exam) => exam.id !== selectedExam.id));
      setDeleteConfirmOpen(false);
    } catch (error) {
      setExamError(error instanceof Error ? error.message : "Could not delete the exam date.");
    } finally {
      setExamSaving(false);
    }
  }

  return (
    <section
      className="rounded-2xl border border-border bg-card p-5 sm:p-6"
      aria-labelledby="activity-calendar-heading"
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => shiftMonth(-1)}
              aria-label="Previous month"
              className={cn(
                "inline-flex size-10 items-center justify-center rounded-full border border-border hover:bg-border",
                focusRing,
              )}
            >
              <ChevronLeft className="size-4" aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={() => shiftMonth(1)}
              aria-label="Next month"
              className={cn(
                "inline-flex size-10 items-center justify-center rounded-full border border-border hover:bg-border",
                focusRing,
              )}
            >
              <ChevronRight className="size-4" aria-hidden="true" />
            </button>
            <label className="sr-only" htmlFor="calendar-month-picker">
              Jump to month
            </label>
            <input
              id="calendar-month-picker"
              type="month"
              value={currentMonth}
              onChange={(event) => navigateToMonth(event.target.value)}
              className={cn(
                "min-h-10 rounded-lg border border-border bg-card px-3 text-xs font-semibold uppercase tracking-[0.12em] text-text-secondary",
                focusRing,
              )}
            />
            <button
              type="button"
              onClick={() => navigateToMonth(todayMonth, todayDate)}
              className={cn(
                "inline-flex min-h-10 items-center rounded-full border border-border px-3 text-xs font-semibold hover:bg-border",
                focusRing,
              )}
            >
              Today
            </button>
          </div>
          <h2 id="activity-calendar-heading" className="mt-2 font-display text-xl font-semibold">
            Practice calendar
          </h2>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-3">
          <div
            className="flex flex-wrap items-center gap-3 text-xs text-text-muted"
            aria-label="Calendar legend"
          >
            <span className="inline-flex items-center gap-1.5">
              <span className="size-2.5 rounded-sm bg-success" /> Passed
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="size-2.5 rounded-sm bg-warning" /> Practised
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="size-2.5 rounded-sm bg-border ring-1 ring-inset ring-border" /> No
              activity
            </span>
          </div>
          <button
            type="button"
            onClick={() => (examFormOpen ? setExamFormOpen(false) : openNewExamForm())}
            aria-expanded={examFormOpen}
            className={cn(
              "inline-flex min-h-10 items-center gap-2 rounded-full border border-border px-3.5 text-xs font-semibold hover:bg-border",
              focusRing,
            )}
          >
            <Plus className="size-4" aria-hidden="true" />
            {examFormOpen ? "Close form" : "Add exam date"}
          </button>
        </div>
      </div>

      {examFormOpen ? (
        <form
          onSubmit={submitExamDate}
          className="mt-5 grid gap-4 rounded-xl border border-border bg-border p-4 sm:grid-cols-2"
          aria-busy={examSaving}
        >
          <label
            htmlFor="exam-date-input"
            className="grid gap-1.5 text-xs font-semibold text-text-secondary"
          >
            Exam date
            <input
              id="exam-date-input"
              type="date"
              value={examDate}
              onChange={(event) => setExamDate(event.target.value)}
              autoComplete="off"
              required
              className={cn(
                "min-h-10 rounded-lg border border-border bg-card px-3 text-sm font-normal text-text-primary",
                focusRing,
              )}
            />
          </label>
          <label
            htmlFor="exam-title-input"
            className="grid gap-1.5 text-xs font-semibold text-text-secondary"
          >
            Exam name <span className="font-normal text-text-muted">(optional)</span>
            <input
              id="exam-title-input"
              type="text"
              value={examTitle}
              onChange={(event) => setExamTitle(event.target.value)}
              placeholder="e.g. Mathematics final"
              autoComplete="off"
              className={cn(
                "min-h-10 rounded-lg border border-border bg-card px-3 text-sm font-normal text-text-primary placeholder:text-text-muted",
                focusRing,
              )}
            />
          </label>
          <div className="flex flex-wrap gap-2 sm:col-span-2 sm:justify-end">
            <button
              type="submit"
              className={cn(
                "inline-flex min-h-10 items-center justify-center rounded-full bg-text-primary px-4 text-xs font-semibold text-text-inverse hover:opacity-90",
                focusRing,
              )}
              disabled={examSaving || !examDate}
              aria-busy={examSaving}
            >
              {examSaving ? "Saving…" : editingExamId ? "Update date" : "Save date"}
            </button>
            <button
              type="button"
              onClick={() => setExamFormOpen(false)}
              className={cn(
                "inline-flex min-h-10 items-center justify-center rounded-full border border-border px-4 text-xs font-semibold hover:bg-card",
                focusRing,
              )}
            >
              Cancel
            </button>
          </div>
        </form>
      ) : null}

      {examError ? (
        <p className="mt-3 text-sm text-destructive" role="alert">
          {examError}
        </p>
      ) : null}
      {storageNotice ? (
        <p className="mt-3 text-sm text-text-secondary" role="status">
          {storageNotice}
        </p>
      ) : null}

      <div className="mt-7">
        <div className="mb-2 grid grid-cols-7 gap-1 text-center text-[10px] font-medium text-text-muted sm:gap-2 sm:text-[11px]">
          {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((day) => (
            <span key={day}>{day}</span>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-1 sm:gap-2">
          {Array.from({ length: firstDayOffset }, (_, index) => (
            <span key={`blank-${index}`} aria-hidden="true" />
          ))}
          {days.map((day) => {
            const exam = examByDate.get(day.date);
            const label = exam
              ? `${activityLabel(day)} Exam date: ${exam.title}`
              : activityLabel(day);
            return (
              <button
                type="button"
                key={day.date}
                onClick={() => selectDate(day.date)}
                disabled={day.status === "future" && !exam}
                title={label}
                aria-label={label}
                aria-pressed={day.date === selectedDate}
                className={cn(
                  "flex min-h-10 min-w-0 flex-col items-center justify-center rounded-lg border text-xs font-medium tabular-nums disabled:cursor-default sm:aspect-[1.3] sm:min-h-12",
                  focusRing,
                  day.status === "completed" && "border-success/20 bg-success text-white",
                  day.status === "started" && "border-warning/25 bg-warning text-white",
                  day.status === "idle" && "border-border bg-border text-text-muted",
                  day.status === "future" && "border-transparent bg-transparent text-text-muted/40",
                  exam &&
                    "border-[var(--community-accent)]/60 bg-[var(--community-accent)]/10 text-text-primary",
                  day.isToday &&
                    "ring-2 ring-[var(--community-accent)] ring-offset-2 ring-offset-bg-primary",
                  day.date === selectedDate &&
                    !day.isToday &&
                    "ring-2 ring-border-strong ring-offset-2 ring-offset-bg-primary",
                )}
              >
                {day.dayOfMonth}
                {exam ? (
                  <span
                    className="mt-1 size-1.5 rounded-full bg-[var(--community-accent)]"
                    aria-hidden="true"
                  />
                ) : day.attempts > 0 ? (
                  <span className="mt-0.5 text-[9px] leading-none opacity-80">
                    {day.attempts} attempt{day.attempts === 1 ? "" : "s"}
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
      </div>

      {selectedDay ? (
        <div
          className="mt-5 grid gap-4 rounded-xl border border-border bg-border p-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center"
          aria-live="polite"
        >
          <div>
            <p className="text-sm font-semibold">
              {selectedDay.label}
              {selectedDay.isToday ? " · Today" : ""}
            </p>
            <p className="mt-1 text-xs leading-5 text-text-secondary">
              {selectedDay.attempts
                ? `${selectedDay.attempts} graded practice attempt${selectedDay.attempts === 1 ? "" : "s"} recorded from your account.`
                : "No graded practice was recorded for this date."}
            </p>
            {selectedExam ? (
              <div className="mt-2 flex flex-wrap items-center gap-3">
                <p className="text-xs font-semibold text-[var(--community-accent)]">
                  Exam: {selectedExam.title}
                </p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={openEditExamForm}
                    className={cn(
                      "inline-flex min-h-10 items-center gap-1.5 rounded-full border border-border px-3 text-xs font-semibold hover:bg-card",
                      focusRing,
                    )}
                  >
                    <Pencil className="size-3.5" aria-hidden="true" /> Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => setDeleteConfirmOpen(true)}
                    className={cn(
                      "inline-flex min-h-10 items-center gap-1.5 rounded-full border border-destructive/30 px-3 text-xs font-semibold text-destructive hover:bg-destructive/10",
                      focusRing,
                    )}
                  >
                    <Trash2 className="size-3.5" aria-hidden="true" /> Delete
                  </button>
                </div>
              </div>
            ) : null}
            {selectedExam && deleteConfirmOpen ? (
              <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
                <span className="text-text-secondary">Delete this exam date?</span>
                <button
                  type="button"
                  onClick={deleteSelectedExam}
                  disabled={examSaving}
                  className={cn(
                    "inline-flex min-h-10 items-center rounded-full bg-destructive px-3 font-semibold text-white hover:opacity-90 disabled:opacity-60",
                    focusRing,
                  )}
                >
                  {examSaving ? "Deleting…" : "Yes, delete"}
                </button>
                <button
                  type="button"
                  onClick={() => setDeleteConfirmOpen(false)}
                  className={cn(
                    "inline-flex min-h-10 items-center rounded-full border border-border px-3 font-semibold hover:bg-card",
                    focusRing,
                  )}
                >
                  Keep it
                </button>
              </div>
            ) : null}
          </div>
          {selectedDay.attempts ? (
            <dl className="flex flex-wrap gap-x-6 gap-y-2 text-sm sm:justify-end">
              <div>
                <dt className="text-xs text-text-muted">Passed</dt>
                <dd className="mt-0.5 font-semibold tabular-nums">
                  {selectedDay.completions}/{selectedDay.attempts}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-text-muted">Average</dt>
                <dd className="mt-0.5 font-semibold tabular-nums">
                  {selectedDay.averageScore === null
                    ? "—"
                    : `${Math.round(selectedDay.averageScore)}%`}
                </dd>
              </div>
            </dl>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

function LeaderboardRow({ member }: { member: DailyLeaderboardMember }) {
  return (
    <li
      className={cn(
        "grid grid-cols-[34px_minmax(0,1fr)_64px_62px] items-center gap-2 border-t border-border px-1 py-3 text-sm first:border-t-0 sm:grid-cols-[42px_minmax(0,1fr)_84px_70px]",
      )}
    >
      <span className="text-xs font-semibold text-text-muted tabular-nums">
        #{member.dailyRank}
      </span>
      <span className="flex min-w-0 items-center gap-2.5">
        <span
          className={cn(
            "flex size-8 shrink-0 items-center justify-center rounded-full bg-border text-xs font-semibold",
            member.isViewer &&
              "bg-[var(--community-accent)]/15 text-[var(--community-accent)] ring-1 ring-[var(--community-accent)]/30",
          )}
        >
          {member.initials}
        </span>
        <span className="flex min-w-0 flex-wrap items-center gap-1.5">
          <span className="truncate font-medium">{member.name}</span>
          {member.isViewer ? (
            <span className="shrink-0 rounded-full bg-[var(--community-accent)]/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--community-accent)]">
              You
            </span>
          ) : null}
        </span>
      </span>
      <span className="text-right font-semibold tabular-nums">{member.todayAttempts}</span>
      <span className="text-right text-text-secondary tabular-nums">{member.streak}d</span>
    </li>
  );
}

function DailyLeaderboard({ dashboard }: { dashboard: StudentDailyDashboard }) {
  const community = dashboard.community;
  if (!community) {
    return (
      <section
        className="flex min-h-[330px] flex-col rounded-2xl border border-border bg-card p-5 sm:p-6"
        aria-labelledby="leaderboard-heading"
      >
        <div className="flex items-center gap-2 text-text-secondary">
          <Trophy className="size-4" aria-hidden="true" />
          <p className="text-xs font-semibold uppercase tracking-[0.14em]">Daily standings</p>
        </div>
        <h2 id="leaderboard-heading" className="mt-2 font-display text-xl font-semibold">
          Community leaderboard
        </h2>
        <div className="my-auto py-8 text-center">
          <Users className="mx-auto size-7 text-text-muted" aria-hidden="true" />
          <h3 className="mt-3 font-semibold">No active community</h3>
          <p className="mx-auto mt-1 max-w-sm text-sm leading-6 text-text-secondary">
            Join your programme community to compare today&apos;s real practice activity.
          </p>
          <Link
            href="/communities"
            className={cn(
              "mt-5 inline-flex min-h-10 items-center gap-2 rounded-full bg-text-primary px-4 text-sm font-semibold text-text-inverse",
              focusRing,
            )}
          >
            Browse communities <ArrowRight className="size-4" aria-hidden="true" />
          </Link>
        </div>
      </section>
    );
  }

  const visible = community.leaderboard.slice(0, 5);
  const viewer = community.leaderboard.find((member) => member.isViewer);
  if (viewer && !visible.some((member) => member.id === viewer.id)) visible.push(viewer);
  const hasTodayActivity = community.leaderboard.some((member) => member.todayAttempts > 0);

  return (
    <section
      className="rounded-2xl border border-border bg-card p-5 sm:p-6"
      aria-labelledby="leaderboard-heading"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-text-secondary">
            <Trophy className="size-4" aria-hidden="true" />
            <p className="text-xs font-semibold uppercase tracking-[0.14em]">Today</p>
          </div>
          <h2 id="leaderboard-heading" className="mt-2 font-display text-xl font-semibold">
            Community leaderboard
          </h2>
          <p className="mt-1 text-sm text-text-secondary">{community.name}</p>
        </div>
        <p className="inline-flex min-h-10 items-center text-sm text-text-secondary">
          {formatNumber(community.memberCount)} members
        </p>
      </div>
      <div className="mt-5 grid grid-cols-[34px_minmax(0,1fr)_64px_62px] gap-2 border-b border-border px-1 pb-2 text-[11px] font-semibold uppercase tracking-wide text-text-muted sm:grid-cols-[42px_minmax(0,1fr)_84px_70px]">
        <span>Rank</span>
        <span>Member</span>
        <span className="text-right">Today</span>
        <span className="text-right">Streak</span>
      </div>
      <ol>
        {visible.map((member) => (
          <LeaderboardRow key={member.id} member={member} />
        ))}
      </ol>
      {!hasTodayActivity ? (
        <p className="mt-3 rounded-xl bg-border px-3 py-2 text-xs leading-5 text-text-secondary">
          No community member has recorded practice today. Ordering uses today&apos;s practice and
          streak.
        </p>
      ) : null}
      <div className="mt-3 border-t border-border pt-3 text-center">
        <Link
          href={`/app/community?community=${encodeURIComponent(community.slug)}&tab=members&sort=today`}
          className={cn(
            "inline-flex min-h-10 items-center gap-1.5 px-3 text-sm font-semibold text-[var(--community-accent)] hover:underline",
            focusRing,
          )}
        >
          View full leaderboard <ArrowRight className="size-4" aria-hidden="true" />
        </Link>
      </div>
    </section>
  );
}

function SemesterProgress({ dashboard }: { dashboard: StudentDailyDashboard }) {
  const community = dashboard.community;
  const [semesterId, setSemesterId] = useState(community?.currentSemesterId ?? "");
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
      <div className="flex flex-col gap-4 border-b border-border px-5 py-5 sm:flex-row sm:items-end sm:justify-between sm:px-6">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-text-muted">
            Programme map
          </p>
          <h2 id="semester-progress-heading" className="mt-2 font-display text-xl font-semibold">
            Semester progress
          </h2>
          <p className="mt-1 text-sm text-text-secondary">
            Real topic readiness from your indexed subjects.
          </p>
        </div>
        <label className="grid gap-1.5 text-xs font-medium text-text-secondary">
          Semester
          <select
            value={semester?.id ?? ""}
            onChange={(event) => setSemesterId(event.target.value)}
            className={cn(
              "min-h-11 min-w-[220px] rounded-xl border border-border bg-bg-primary px-3 text-sm text-text-primary",
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
  calendarMonth,
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
  calendarMonth?: string;
}) {
  const { data } = useDashboard(communitySlug, initialDashboard, calendarMonth);
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
      calendarMonth={calendarMonth}
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

      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        <section className="rounded-2xl border border-border bg-card p-5">
          <h2 className="font-display text-lg font-semibold tracking-tight">Practice calendar</h2>
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
          <h2 className="font-display text-lg font-semibold tracking-tight">
            Community leaderboard
          </h2>
          <div className={`mt-2 h-3 w-24 ${line}`} aria-hidden="true" />
          <div className="mt-5 space-y-4" aria-hidden="true">
            {Array.from({ length: 5 }).map((_, index) => (
              <div key={index} className="flex items-center gap-3">
                <div className="size-8 shrink-0 rounded-full bg-border animate-pulse motion-reduce:animate-none" />
                <div className="min-w-0 flex-1">
                  <div className={`h-3 w-32 ${line}`} />
                  <div className={`mt-1.5 h-3 w-16 ${line}`} />
                </div>
                <div className={`h-3 w-8 ${line}`} />
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
  calendarMonth,
}: {
  userId: string;
  communityOptions?: import("@/lib/community-switch").CommunitySwitchOption[];
  fullName: string;
  creditBalance: number;
  hasUnlimitedAccess: boolean;
  unlimitedPlan: SubscriptionPlan | null;
  dashboard: StudentDailyDashboard;
  calendarMonth?: string;
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

      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        <ActivityCalendar
          days={dashboard.activity}
          examDates={dashboard.examDates ?? []}
          userId={userId}
          calendarMonth={calendarMonth}
          onExamDatesChange={handleExamDatesChange}
        />
        <DailyLeaderboard dashboard={dashboard} />
      </div>

      <div className="mt-6">
        <SemesterProgress dashboard={dashboard} />
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
