"use client";

import { useQueryClient } from "@tanstack/react-query";
import {
  AlertCircle,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  GraduationCap,
  LoaderCircle,
  MoreHorizontal,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type {
  DailyActivityDay,
  DailyExamDate,
  DailySemester,
  DailySemesterSubject,
  StudentDailyDashboard,
} from "@/lib/data/student-daily-dashboard";
import { ApiError, apiFetch } from "@/lib/query/api";
import { calendarMonthQuery, useCalendarMonth } from "@/lib/query/dashboard";
import { cn } from "@/lib/utils";

const focusRing =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50 focus-visible:ring-offset-2";

export interface NepaliDate {
  year: number; // e.g. 2083
  month: number; // 1 to 12 (1: Baishakh, 12: Chaitra)
  day: number; // 1 to 32
}

export const NEPALI_MONTH_NAMES = [
  "बैशाख",
  "जेठ",
  "असार",
  "साउन",
  "भदौ",
  "असोज",
  "कात्तिक",
  "मंसीर",
  "पुस",
  "माघ",
  "फागुन",
  "चैत",
] as const;

export const NEPALI_MONTH_NAMES_EN = [
  "Baishakh",
  "Jestha",
  "Ashadh",
  "Shrawan",
  "Bhadra",
  "Ashwin",
  "Kartik",
  "Mangsir",
  "Poush",
  "Magh",
  "Falgun",
  "Chaitra",
] as const;

export const NEPALI_MONTH_APPROX_ENG = [
  "Apr-May",
  "May-Jun",
  "Jun-Jul",
  "Jul-Aug",
  "Aug-Sep",
  "Sep-Oct",
  "Oct-Nov",
  "Nov-Dec",
  "Dec-Jan",
  "Jan-Feb",
  "Feb-Mar",
  "Mar-Apr",
] as const;

const BS_MONTH_DAYS: Record<number, number[]> = {
  2078: [31, 31, 31, 32, 31, 31, 30, 29, 30, 29, 30, 30],
  2079: [31, 31, 32, 31, 31, 31, 30, 29, 30, 29, 30, 30],
  2080: [31, 31, 31, 32, 31, 31, 30, 29, 30, 29, 30, 30],
  2081: [31, 31, 32, 32, 31, 30, 30, 30, 29, 30, 29, 31],
  2082: [31, 31, 32, 31, 31, 31, 30, 29, 30, 29, 30, 30],
  2083: [31, 31, 32, 31, 31, 30, 30, 30, 29, 30, 29, 31],
  2084: [31, 32, 31, 32, 31, 30, 30, 30, 29, 30, 29, 30],
  2085: [31, 32, 31, 32, 31, 30, 30, 30, 29, 30, 29, 31],
  2086: [31, 31, 32, 31, 31, 31, 30, 29, 30, 29, 30, 30],
  2087: [31, 32, 31, 32, 31, 30, 30, 30, 29, 30, 29, 31],
  2088: [31, 31, 32, 31, 31, 31, 30, 29, 30, 29, 30, 30],
};

const REFERENCE_BS_YEAR = 2080;
const REFERENCE_BS_MONTH = 1;
const REFERENCE_BS_DAY = 1;
const REFERENCE_AD_DATE = new Date(Date.UTC(2023, 3, 14)); // 2023-04-14

export function toDevanagariDigits(num: number | string): string {
  const digits = ["०", "१", "२", "३", "४", "५", "६", "७", "८", "९"];
  return String(num).replace(/[0-9]/g, (d) => digits[parseInt(d, 10)]);
}

export function adToBs(dateInput: string | Date): NepaliDate {
  const targetDate =
    typeof dateInput === "string"
      ? new Date(`${dateInput.slice(0, 10)}T12:00:00.000Z`)
      : new Date(
          Date.UTC(dateInput.getUTCFullYear(), dateInput.getUTCMonth(), dateInput.getUTCDate(), 12),
        );

  let diffDays = Math.round(
    (targetDate.getTime() - REFERENCE_AD_DATE.getTime()) / (1000 * 60 * 60 * 24),
  );

  let curYear = REFERENCE_BS_YEAR;
  let curMonth = REFERENCE_BS_MONTH;
  let curDay = REFERENCE_BS_DAY;

  if (diffDays >= 0) {
    while (diffDays > 0) {
      const daysInCurrentMonth = BS_MONTH_DAYS[curYear]?.[curMonth - 1] ?? 30;
      const remainingDaysInMonth = daysInCurrentMonth - curDay + 1;

      if (diffDays >= remainingDaysInMonth) {
        diffDays -= remainingDaysInMonth;
        curDay = 1;
        curMonth++;
        if (curMonth > 12) {
          curMonth = 1;
          curYear++;
        }
      } else {
        curDay += diffDays;
        diffDays = 0;
      }
    }
  } else {
    diffDays = Math.abs(diffDays);
    while (diffDays > 0) {
      if (curDay > 1) {
        if (diffDays < curDay) {
          curDay -= diffDays;
          diffDays = 0;
        } else {
          diffDays -= curDay - 1;
          curDay = 1;
        }
      } else {
        curMonth--;
        if (curMonth < 1) {
          curMonth = 12;
          curYear--;
        }
        const daysInPrevMonth = BS_MONTH_DAYS[curYear]?.[curMonth - 1] ?? 30;
        if (diffDays >= daysInPrevMonth) {
          diffDays -= daysInPrevMonth;
          curDay = 1;
        } else {
          curDay = daysInPrevMonth - diffDays + 1;
          diffDays = 0;
        }
      }
    }
  }

  return { year: curYear, month: curMonth, day: curDay };
}

export function bsToAd(bs: NepaliDate): Date {
  let daysCount = 0;
  if (bs.year >= REFERENCE_BS_YEAR) {
    for (let y = REFERENCE_BS_YEAR; y < bs.year; y++) {
      const yearMonths = BS_MONTH_DAYS[y] ?? Array(12).fill(30);
      daysCount += yearMonths.reduce((a, b) => a + b, 0);
    }
    const currentYearMonths = BS_MONTH_DAYS[bs.year] ?? Array(12).fill(30);
    for (let m = 1; m < bs.month; m++) {
      daysCount += currentYearMonths[m - 1];
    }
    daysCount += bs.day - 1;
  } else {
    for (let y = REFERENCE_BS_YEAR - 1; y > bs.year; y--) {
      const yearMonths = BS_MONTH_DAYS[y] ?? Array(12).fill(30);
      daysCount -= yearMonths.reduce((a, b) => a + b, 0);
    }
    const targetYearMonths = BS_MONTH_DAYS[bs.year] ?? Array(12).fill(30);
    for (let m = bs.month; m <= 12; m++) {
      daysCount -= targetYearMonths[m - 1];
    }
    daysCount += bs.day;
  }

  return new Date(REFERENCE_AD_DATE.getTime() + daysCount * 24 * 60 * 60 * 1000);
}

export function formatNepaliDate(bs: NepaliDate): string {
  const monthName = NEPALI_MONTH_NAMES[bs.month - 1] || "";
  return `${monthName} ${toDevanagariDigits(bs.day)}, ${toDevanagariDigits(bs.year)}`;
}

export function formatNepaliMonth(year: number, month: number): string {
  const monthName = NEPALI_MONTH_NAMES[month - 1] || "";
  return `${monthName} ${toDevanagariDigits(year)}`;
}

export function getDaysInBsMonth(year: number, month: number): number {
  return BS_MONTH_DAYS[year]?.[month - 1] ?? 30;
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

function compactDate(date: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${date}T12:00:00.000Z`));
}

function shiftMonth(month: string, offset: number) {
  const date = new Date(`${month}-01T12:00:00.000Z`);
  date.setUTCMonth(date.getUTCMonth() + offset);
  return date.toISOString().slice(0, 7);
}

function normalizeExamName(value: string) {
  return value
    .toLowerCase()
    .replace(/\b(final|midterm|mid-term|exam|test|assessment)\b/g, " ")
    .replace(/[^a-z0-9]+/g, "")
    .trim();
}

export function matchExamSubject(
  title: string,
  subjects: DailySemesterSubject[],
): DailySemesterSubject | null {
  const examName = normalizeExamName(title);
  if (!examName) return null;

  return (
    [...subjects]
      .map((subject) => ({ subject, name: normalizeExamName(subject.name) }))
      .filter(
        ({ name }) =>
          name && (examName === name || examName.includes(name) || name.includes(examName)),
      )
      .sort((left, right) => right.name.length - left.name.length)[0]?.subject ?? null
  );
}

export function daysUntilExam(date: string, today: string) {
  const exam = new Date(`${date}T12:00:00.000Z`).getTime();
  const now = new Date(`${today}T12:00:00.000Z`).getTime();
  return Math.round((exam - now) / 86_400_000);
}

export function PracticeCalendar({
  initialDays,
  examDates,
  userId,
  communitySlug,
  semesters,
  currentSemesterId,
  onExamDatesChange,
}: {
  initialDays: DailyActivityDay[];
  examDates: DailyExamDate[];
  userId: string;
  communitySlug?: string;
  semesters: DailySemester[];
  currentSemesterId?: string;
  onExamDatesChange: (examDates: DailyExamDate[]) => void;
}) {
  const todayDate = currentKathmanduDate();
  const todayBs = useMemo(() => adToBs(todayDate), [todayDate]);

  const [visibleBsYear, setVisibleBsYear] = useState(todayBs.year);
  const [visibleBsMonth, setVisibleBsMonth] = useState(todayBs.month);
  const [selectedDate, setSelectedDate] = useState(todayDate);
  const [monthDropdownOpen, setMonthDropdownOpen] = useState(false);

  // Approximate Gregorian month for background queries
  const approximateAdMonth = useMemo(() => {
    const firstAd = bsToAd({ year: visibleBsYear, month: visibleBsMonth, day: 15 });
    return firstAd.toISOString().slice(0, 7);
  }, [visibleBsYear, visibleBsMonth]);

  const [visibleMonth, setVisibleMonth] = useState(approximateAdMonth);
  useEffect(() => {
    setVisibleMonth(approximateAdMonth);
  }, [approximateAdMonth]);

  function navigateToMonth(month: string) {
    setVisibleMonth(month);
  }

  const monthQuery = useCalendarMonth(communitySlug, visibleMonth, false);
  const queryClient = useQueryClient();
  const formRef = useRef<HTMLFormElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const [examFormOpen, setExamFormOpen] = useState(false);
  const [editingExamId, setEditingExamId] = useState<string | null>(null);
  const [examDate, setExamDate] = useState("");
  const [examTitle, setExamTitle] = useState("");
  const [examSaving, setExamSaving] = useState(false);
  const [examError, setExamError] = useState("");
  const [storageNotice, setStorageNotice] = useState("");
  const [activeMenuId, setActiveMenuId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<DailyExamDate | null>(null);
  const fallbackStorageKey = `nano-syllabus:exam-dates-fallback:${userId}`;
  const [fallbackExamDates, setFallbackExamDates] = useState<DailyExamDate[]>([]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setMonthDropdownOpen(false);
      }
    }
    if (monthDropdownOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [monthDropdownOpen]);

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

  const displayedExamDates = useMemo(() => {
    const byDate = new Map(fallbackExamDates.map((exam) => [exam.date, exam]));
    examDates.forEach((exam) => byDate.set(exam.date, exam));
    return [...byDate.values()].sort((left, right) => left.date.localeCompare(right.date));
  }, [examDates, fallbackExamDates]);

  const examByDate = useMemo(
    () => new Map(displayedExamDates.map((exam) => [exam.date, exam])),
    [displayedExamDates],
  );

  const allSubjects = useMemo(() => {
    const current = semesters.find((semester) => semester.id === currentSemesterId);
    const ordered = [
      ...(current?.subjects ?? []),
      ...semesters.flatMap((semester) => semester.subjects),
    ];
    return [...new Map(ordered.map((subject) => [subject.id, subject])).values()];
  }, [currentSemesterId, semesters]);

  const upcomingExams = displayedExamDates.filter((exam) => exam.date >= todayDate);

  // Month navigation functions
  function handlePrevMonth() {
    if (visibleBsMonth === 1) {
      setVisibleBsYear((y) => y - 1);
      setVisibleBsMonth(12);
    } else {
      setVisibleBsMonth((m) => m - 1);
    }
    setExamError("");
  }

  function handleNextMonth() {
    if (visibleBsMonth === 12) {
      setVisibleBsYear((y) => y + 1);
      setVisibleBsMonth(1);
    } else {
      setVisibleBsMonth((m) => m + 1);
    }
    setExamError("");
  }

  function handleGoToday() {
    setVisibleBsYear(todayBs.year);
    setVisibleBsMonth(todayBs.month);
    setSelectedDate(todayDate);
    setExamError("");
  }

  function openNewExamForm(prefillDate?: string) {
    setEditingExamId(null);
    setExamDate(prefillDate || (selectedDate >= todayDate ? selectedDate : todayDate));
    setExamTitle("");
    setExamError("");
    setDeleteTarget(null);
    setActiveMenuId(null);
    setExamFormOpen(true);
    window.setTimeout(
      () => formRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" }),
      0,
    );
  }

  function openEditExamForm(exam: DailyExamDate) {
    setEditingExamId(exam.id);
    setExamDate(exam.date);
    setExamTitle(exam.title);
    setExamError("");
    setDeleteTarget(null);
    setActiveMenuId(null);
    setExamFormOpen(true);

    const examBs = adToBs(exam.date);
    setVisibleBsYear(examBs.year);
    setVisibleBsMonth(examBs.month);
    setSelectedDate(exam.date);

    window.setTimeout(
      () => formRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" }),
      0,
    );
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

  async function submitExamDate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const title = examTitle.trim();
    if (!examDate || !title || examSaving) return;
    setExamSaving(true);
    setExamError("");
    try {
      const payload = { date: examDate, title };
      let result: DailyExamDate;
      if (editingExamId?.startsWith("local-")) {
        result = { id: editingExamId, ...payload };
        persistFallbackExamDates([
          ...fallbackExamDates.filter(
            (exam) => exam.id !== editingExamId && exam.date !== result.date,
          ),
          result,
        ]);
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
          result = {
            id: editingExamId ?? `local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            ...payload,
          };
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

      const resultBs = adToBs(result.date);
      setVisibleBsYear(resultBs.year);
      setVisibleBsMonth(resultBs.month);
      setSelectedDate(result.date);
    } catch (error) {
      setExamError(error instanceof Error ? error.message : "Could not save the exam date.");
    } finally {
      setExamSaving(false);
    }
  }

  async function deleteExam(exam: DailyExamDate) {
    if (examSaving) return;
    setExamSaving(true);
    setExamError("");
    try {
      if (exam.id.startsWith("local-")) {
        persistFallbackExamDates(fallbackExamDates.filter((item) => item.id !== exam.id));
      } else {
        await apiFetch<void>(`/api/student/exam-dates/${encodeURIComponent(exam.id)}`, {
          method: "DELETE",
        });
      }
      patchCachedExamDates(displayedExamDates.filter((item) => item.id !== exam.id));
      setDeleteTarget(null);
    } catch (error) {
      setExamError(error instanceof Error ? error.message : "Could not delete the exam date.");
    } finally {
      setExamSaving(false);
    }
  }

  // Calendar Grid Slots for the Nepali Month
  const daysInMonth = getDaysInBsMonth(visibleBsYear, visibleBsMonth);
  const firstAdDate = bsToAd({ year: visibleBsYear, month: visibleBsMonth, day: 1 });
  const startWeekday = firstAdDate.getUTCDay(); // 0: Sun ... 6: Sat

  const lastAdDate = bsToAd({ year: visibleBsYear, month: visibleBsMonth, day: daysInMonth });
  const firstAdYear = firstAdDate.getUTCFullYear();
  const lastAdYear = lastAdDate.getUTCFullYear();
  const engMonthRange =
    firstAdYear === lastAdYear
      ? `${NEPALI_MONTH_APPROX_ENG[visibleBsMonth - 1]} ${firstAdYear}`
      : `${NEPALI_MONTH_APPROX_ENG[visibleBsMonth - 1]} ${firstAdYear}-${lastAdYear}`;

  const hatchedStyle = {
    backgroundImage:
      "repeating-linear-gradient(-45deg, transparent, transparent 5px, rgba(148, 163, 184, 0.3) 5px, rgba(148, 163, 184, 0.3) 6.5px)",
  };

  return (
    <section
      className="rounded-[24px] border border-[#e2e8f0] bg-white p-5 sm:p-7 shadow-xs"
      aria-labelledby="activity-calendar-heading"
    >
      {/* ── Top Header ── */}
      <div className="flex flex-wrap items-center justify-between gap-4 pb-3">
        <h2
          id="activity-calendar-heading"
          className="text-[26px] sm:text-[28px] font-[900] tracking-[-0.03em] text-[#0f172a]"
        >
          Practice calendar
        </h2>

        {/* Navigation Toolbar */}
        <div className="flex flex-wrap items-center gap-2 sm:gap-2.5">
          {/* Previous Month */}
          <button
            type="button"
            onClick={handlePrevMonth}
            aria-label="Previous month"
            className={cn(
              "flex h-[38px] w-[38px] items-center justify-center rounded-[10px] border border-[#e2e8f0] bg-white text-[#1e293b] hover:bg-slate-50 transition cursor-pointer",
              focusRing,
            )}
          >
            <ChevronLeft className="h-4 w-4" aria-hidden="true" />
          </button>

          {/* Month Selector Dropdown */}
          <div className="relative" ref={dropdownRef}>
            <button
              type="button"
              onClick={() => setMonthDropdownOpen((prev) => !prev)}
              className={cn(
                "flex h-[42px] flex-col items-center justify-center rounded-[12px] border border-[#e2e8f0] bg-white px-4 text-center hover:bg-slate-50 transition cursor-pointer min-w-[135px]",
                focusRing,
              )}
            >
              <span className="flex items-center gap-1 text-[14px] font-[750] text-[#0f172a] leading-tight">
                {NEPALI_MONTH_NAMES[visibleBsMonth - 1]} {toDevanagariDigits(visibleBsYear)}
                <ChevronDown className="h-3.5 w-3.5 text-[#64748b]" />
              </span>
              <span className="text-[10px] font-[600] text-[#0066ff] leading-none mt-0.5">
                {engMonthRange}
              </span>
            </button>

            {/* Dropdown Menu */}
            {monthDropdownOpen && (
              <div className="absolute top-[calc(100%+6px)] left-0 z-50 w-64 rounded-2xl border border-slate-200 bg-white p-2.5 shadow-xl animate-in fade-in zoom-in-95 duration-100">
                <div className="flex items-center justify-between pb-2 mb-2 border-b border-slate-100 px-1">
                  <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                    Year {toDevanagariDigits(visibleBsYear)}
                  </span>
                  <div className="flex gap-1">
                    <button
                      type="button"
                      onClick={() => setVisibleBsYear((y) => y - 1)}
                      className="h-6 w-6 rounded flex items-center justify-center text-slate-500 hover:bg-slate-100 text-xs font-bold cursor-pointer"
                    >
                      −
                    </button>
                    <button
                      type="button"
                      onClick={() => setVisibleBsYear((y) => y + 1)}
                      className="h-6 w-6 rounded flex items-center justify-center text-slate-500 hover:bg-slate-100 text-xs font-bold cursor-pointer"
                    >
                      +
                    </button>
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-1.5">
                  {NEPALI_MONTH_NAMES.map((name, index) => {
                    const monthNum = index + 1;
                    return (
                      <button
                        key={name}
                        type="button"
                        onClick={() => {
                          setVisibleBsMonth(monthNum);
                          setMonthDropdownOpen(false);
                        }}
                        className={cn(
                          "rounded-lg px-2 py-1.5 text-center text-xs font-medium transition cursor-pointer",
                          visibleBsMonth === monthNum
                            ? "bg-[#0066ff] text-white font-bold"
                            : "text-slate-700 hover:bg-slate-100",
                        )}
                      >
                        {name}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Next Month */}
          <button
            type="button"
            onClick={handleNextMonth}
            aria-label="Next month"
            className={cn(
              "flex h-[38px] w-[38px] items-center justify-center rounded-[10px] border border-[#e2e8f0] bg-white text-[#1e293b] hover:bg-slate-50 transition cursor-pointer",
              focusRing,
            )}
          >
            <ChevronRight className="h-4 w-4" aria-hidden="true" />
          </button>

          {/* Today Button */}
          <button
            type="button"
            onClick={handleGoToday}
            className={cn(
              "flex h-[38px] items-center justify-center rounded-[10px] border border-[#e2e8f0] bg-white px-4 text-[13px] font-[700] text-[#0f172a] hover:bg-slate-50 transition cursor-pointer",
              focusRing,
            )}
          >
            Today
          </button>

          {/* Add Exam Button */}
          <button
            type="button"
            onClick={() => (examFormOpen ? setExamFormOpen(false) : openNewExamForm())}
            aria-expanded={examFormOpen}
            className={cn(
              "flex h-[38px] items-center justify-center gap-1.5 rounded-[10px] bg-[#0066ff] hover:bg-[#0055d4] px-4 sm:px-5 text-[13px] font-[700] text-white shadow-xs transition cursor-pointer",
              focusRing,
            )}
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
            {examFormOpen ? "Close" : "Add exam"}
          </button>
        </div>
      </div>

      {/* ── Add / Edit Exam Form ── */}
      {examFormOpen ? (
        <form
          ref={formRef}
          onSubmit={submitExamDate}
          className="mt-4 grid gap-4 rounded-2xl border border-slate-200 bg-slate-50/70 p-4 sm:p-5 sm:grid-cols-2"
          aria-busy={examSaving}
        >
          <label
            htmlFor="exam-date-input"
            className="grid gap-1.5 text-xs font-semibold text-slate-700"
          >
            Exam date (AD / Calendar)
            <input
              id="exam-date-input"
              type="date"
              value={examDate}
              onChange={(event) => setExamDate(event.target.value)}
              autoComplete="off"
              required
              className={cn(
                "min-h-11 rounded-xl border border-slate-200 bg-white px-3.5 text-sm font-normal text-slate-800 shadow-xs",
                focusRing,
              )}
            />
            {examDate ? (
              <span className="text-[11px] font-semibold text-[#0066ff]">
                Nepali: {formatNepaliDate(adToBs(examDate))}
              </span>
            ) : null}
          </label>

          <label
            htmlFor="exam-title-input"
            className="grid gap-1.5 text-xs font-semibold text-slate-700"
          >
            Subject or exam name
            <input
              id="exam-title-input"
              type="text"
              value={examTitle}
              onChange={(event) => setExamTitle(event.target.value)}
              placeholder="e.g. Engineering Mathematics"
              list="exam-subject-options"
              autoComplete="off"
              required
              maxLength={120}
              className={cn(
                "min-h-11 rounded-xl border border-slate-200 bg-white px-3.5 text-sm font-normal text-slate-800 placeholder:text-slate-400 shadow-xs",
                focusRing,
              )}
            />
            <datalist id="exam-subject-options">
              {allSubjects.map((subject) => (
                <option key={subject.id} value={subject.name} />
              ))}
            </datalist>
            <span className="font-normal text-slate-500 text-[11px]">
              Choose a listed subject to show automatic readiness.
            </span>
          </label>

          <div className="flex flex-wrap gap-2 sm:col-span-2 sm:justify-end mt-1">
            <button
              type="button"
              onClick={() => setExamFormOpen(false)}
              className={cn(
                "inline-flex min-h-10 items-center rounded-xl border border-slate-200 px-4 text-xs font-semibold text-slate-700 hover:bg-white transition cursor-pointer",
                focusRing,
              )}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={examSaving || !examDate || !examTitle.trim()}
              aria-busy={examSaving}
              className={cn(
                "inline-flex min-h-10 items-center gap-2 rounded-xl bg-[#0f172a] px-5 text-xs font-semibold text-white transition disabled:cursor-not-allowed disabled:opacity-60 cursor-pointer hover:bg-slate-800",
                focusRing,
              )}
            >
              {examSaving ? (
                <LoaderCircle
                  className="h-4 w-4 animate-spin motion-reduce:animate-none"
                  aria-hidden="true"
                />
              ) : null}
              {examSaving ? "Saving…" : editingExamId ? "Update exam" : "Save exam"}
            </button>
          </div>
        </form>
      ) : null}

      {examError ? (
        <p className="mt-3 flex items-center gap-2 text-sm text-rose-600 font-medium" role="alert">
          <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" /> {examError}
        </p>
      ) : null}
      {storageNotice ? (
        <p className="mt-3 text-sm text-slate-500" role="status">
          {storageNotice}
        </p>
      ) : null}

      {/* ── Weekday Labels Header ── */}
      <div className="mt-6">
        <div className="mb-2.5 grid grid-cols-7 gap-2 sm:gap-2.5 text-center text-[13px] font-[700] text-[#6366f1]">
          {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => (
            <span key={day}>{day}</span>
          ))}
        </div>

        {/* ── Calendar Grid (7 Columns) ── */}
        <div className="grid grid-cols-7 gap-2 sm:gap-2.5">
          {/* 1. Leading outside slots (Hatched diagonal gray pattern) */}
          {Array.from({ length: startWeekday }).map((_, index) => (
            <div
              key={`leading-${index}`}
              className="h-[58px] sm:h-[66px] w-full rounded-[10px] border border-[#cbd5e1] bg-white overflow-hidden flex items-center justify-center"
              aria-hidden="true"
            >
              <svg className="w-full h-full" xmlns="http://www.w3.org/2000/svg">
                <defs>
                  <pattern
                    id={`leading-stripe-${index}`}
                    width="8"
                    height="8"
                    patternTransform="rotate(45 0 0)"
                    patternUnits="userSpaceOnUse"
                  >
                    <line
                      x1="0"
                      y1="0"
                      x2="0"
                      y2="8"
                      stroke="#94a3b8"
                      strokeWidth="1"
                      opacity="0.8"
                    />
                  </pattern>
                </defs>
                <rect width="100%" height="100%" fill={`url(#leading-stripe-${index})`} />
              </svg>
            </div>
          ))}

          {/* 2. Month Days (1 to daysInMonth) */}
          {Array.from({ length: daysInMonth }).map((_, index) => {
            const dayNum = index + 1;
            const currentBsDate: NepaliDate = {
              year: visibleBsYear,
              month: visibleBsMonth,
              day: dayNum,
            };
            const currentAdDate = bsToAd(currentBsDate);
            const currentAdDateStr = currentAdDate.toISOString().slice(0, 10);

            const isToday = currentAdDateStr === todayDate;
            const isPast = currentAdDateStr < todayDate;
            const isSelected = currentAdDateStr === selectedDate;
            const exam = examByDate.get(currentAdDateStr);
            const dayDevanagari = toDevanagariDigits(dayNum);

            // If past day without exam: render crisp hatched diagonal stripes like Image 1!
            if (isPast && !exam) {
              return (
                <button
                  type="button"
                  key={`day-${dayNum}`}
                  onClick={() => setSelectedDate(currentAdDateStr)}
                  title={`${formatNepaliDate(currentBsDate)} (${compactDate(currentAdDateStr)})`}
                  className={cn(
                    "h-[58px] sm:h-[66px] w-full rounded-[10px] border border-[#cbd5e1] bg-white overflow-hidden flex items-center justify-center cursor-pointer transition hover:border-slate-400",
                    focusRing,
                    isSelected && "ring-2 ring-[#0066ff] ring-offset-2",
                  )}
                >
                  <svg
                    className="w-full h-full pointer-events-none"
                    xmlns="http://www.w3.org/2000/svg"
                  >
                    <defs>
                      <pattern
                        id={`past-stripe-${dayNum}`}
                        width="8"
                        height="8"
                        patternTransform="rotate(45 0 0)"
                        patternUnits="userSpaceOnUse"
                      >
                        <line
                          x1="0"
                          y1="0"
                          x2="0"
                          y2="8"
                          stroke="#94a3b8"
                          strokeWidth="1"
                          opacity="0.8"
                        />
                      </pattern>
                    </defs>
                    <rect width="100%" height="100%" fill={`url(#past-stripe-${dayNum})`} />
                  </svg>
                </button>
              );
            }

            // Today Cell (Blue border + dot + number + "आज" pill)
            if (isToday) {
              return (
                <button
                  type="button"
                  key={`day-${dayNum}`}
                  onClick={() => setSelectedDate(currentAdDateStr)}
                  title={`Today: ${formatNepaliDate(currentBsDate)} (${compactDate(currentAdDateStr)})`}
                  className={cn(
                    "h-[58px] sm:h-[66px] w-full rounded-[10px] border-[1.5px] border-[#0066ff] bg-white flex flex-col items-center justify-center shadow-xs transition cursor-pointer relative",
                    focusRing,
                  )}
                >
                  <span className="h-1.5 w-1.5 rounded-full bg-[#0066ff] mb-0.5" />
                  <span className="text-[17px] sm:text-[19px] font-[800] text-[#0066ff] leading-tight">
                    {dayDevanagari}
                  </span>
                  <span className="mt-0.5 rounded-full bg-[#0066ff] px-2.5 py-0.5 text-[10px] font-bold text-white leading-none">
                    आज
                  </span>
                </button>
              );
            }

            // Exam Day Cell (Rose background + border + red number + "🎓 Exam" pill)
            if (exam) {
              return (
                <button
                  type="button"
                  key={`day-${dayNum}`}
                  onClick={() => setSelectedDate(currentAdDateStr)}
                  title={`Exam: ${exam.title} on ${formatNepaliDate(currentBsDate)}`}
                  className={cn(
                    "h-[58px] sm:h-[66px] w-full rounded-[10px] border border-[#fecdd3] bg-[#fff1f2] flex flex-col items-center justify-center transition cursor-pointer hover:bg-rose-100/60 relative",
                    focusRing,
                    isSelected && "ring-2 ring-rose-500 ring-offset-2",
                  )}
                >
                  <span className="text-[17px] sm:text-[19px] font-[800] text-[#e11d48] leading-tight">
                    {dayDevanagari}
                  </span>
                  <span className="mt-0.5 inline-flex items-center gap-1 text-[11px] font-bold text-[#e11d48] leading-none">
                    <GraduationCap className="h-3 w-3" /> Exam
                  </span>
                </button>
              );
            }

            // Normal Future Day Cell (Clean white card + bold Devanagari number)
            return (
              <button
                type="button"
                key={`day-${dayNum}`}
                onClick={() => setSelectedDate(currentAdDateStr)}
                title={`${formatNepaliDate(currentBsDate)} (${compactDate(currentAdDateStr)})`}
                className={cn(
                  "h-[58px] sm:h-[66px] w-full rounded-[10px] border border-[#e2e8f0] bg-white flex flex-col items-center justify-center transition cursor-pointer hover:border-slate-300 hover:shadow-xs relative",
                  focusRing,
                  isSelected && "ring-2 ring-[#0066ff] ring-offset-2",
                )}
              >
                <span className="text-[17px] sm:text-[19px] font-[800] text-[#0f172a] leading-tight">
                  {dayDevanagari}
                </span>
              </button>
            );
          })}

          {/* 3. Trailing outside slots (Next month days) */}
          {(() => {
            const totalFilled = startWeekday + daysInMonth;
            const trailing = (7 - (totalFilled % 7)) % 7;
            return Array.from({ length: trailing }).map((_, index) => (
              <div
                key={`trailing-${index}`}
                className="h-[58px] sm:h-[66px] w-full rounded-[10px] border border-[#f1f5f9] bg-white flex flex-col items-center justify-center"
              >
                <span className="text-[16px] sm:text-[17px] font-[700] text-[#6366f1]/80">
                  {toDevanagariDigits(index + 1)}
                </span>
              </div>
            ));
          })()}
        </div>
      </div>

      {/* ── Upcoming Exams Section ── */}
      <section
        className="mt-6 overflow-hidden rounded-[20px] border border-[#e2e8f0] bg-white p-5 sm:p-6 shadow-xs"
        aria-labelledby="upcoming-exams-heading"
      >
        <div className="mb-4 flex items-center justify-between">
          <h3 id="upcoming-exams-heading" className="font-display text-lg font-semibold tracking-tight text-[#0f172a]">
            Upcoming exams
          </h3>
        </div>

        {upcomingExams.length ? (
          <div className="divide-y divide-[#edf2f7]">
            {upcomingExams.map((exam) => {
              const examBs = adToBs(exam.date);
              const subject = matchExamSubject(exam.title, allSubjects);
              const readiness = subject?.readiness ?? null;
              const remaining = daysUntilExam(exam.date, todayDate);

              return (
                <div key={exam.id} className="py-4 first:pt-0 last:pb-0">
                    <div className="flex flex-col gap-3 sm:grid sm:grid-cols-[130px_minmax(0,1fr)_auto_auto] sm:items-center sm:gap-6">
                    {/* 1. Nepali Date */}
                    <div className="whitespace-nowrap sm:w-[130px] self-start sm:pt-0.5">
                      <span className="font-display text-[14px] sm:text-[15px] font-semibold text-[#0f172a]">
                        {formatNepaliDate(examBs)}
                      </span>
                    </div>

                    {/* 2. Subject & Readiness Progress Bar */}
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-display text-[14px] sm:text-[15px] font-semibold text-[#0f172a] capitalize">
                        {exam.title}
                      </div>
                      <div className="mt-2 flex min-w-0 items-center gap-3">
                        <div className="h-2 min-w-8 flex-1 overflow-hidden rounded-full bg-slate-100">
                          {readiness !== null && (
                            <div
                              className="h-full rounded-full bg-[#0066ff] transition-[width] duration-300 motion-reduce:transition-none"
                              style={{ width: `${readiness > 0 ? Math.max(5, Math.min(100, readiness)) : 0}%` }}
                            />
                          )}
                        </div>
                        <span className="w-28 shrink-0 text-right whitespace-nowrap text-[12px] font-medium text-slate-500">
                          {readiness !== null
                            ? `${Math.round(readiness)}% ready`
                            : "No practice data"}
                        </span>
                      </div>
                    </div>

                    {/* 3. Days Left Pill */}
                    <div className="flex items-center sm:w-[105px] sm:justify-end">
                      <span className="inline-flex items-center justify-center rounded-[8px] sm:rounded-[10px] bg-[#eef2ff] px-3.5 py-1.5 text-[12px] sm:text-[13px] font-semibold text-[#1e40af] whitespace-nowrap">
                        {remaining === 0
                          ? "Today"
                          : `${remaining} day${remaining === 1 ? "" : "s"} left`}
                      </span>
                    </div>

                    {/* 4. Action Menu */}
                    <div className="relative flex items-center shrink-0">
                      <button
                        type="button"
                        onClick={() => setActiveMenuId(activeMenuId === exam.id ? null : exam.id)}
                        aria-label={`Actions for ${exam.title}`}
                        className={cn(
                          "flex h-[34px] w-[34px] items-center justify-center rounded-[8px] border border-[#e2e8f0] bg-white text-[#475569] shadow-2xs transition-colors hover:bg-slate-50 hover:text-slate-800 cursor-pointer",
                          focusRing,
                        )}
                      >
                        <MoreHorizontal className="h-4 w-4" />
                      </button>

                      {activeMenuId === exam.id && (
                        <div className="absolute right-0 top-[calc(100%+4px)] z-50 w-32 rounded-xl border border-slate-200 bg-white p-1 shadow-lg">
                          <button
                            type="button"
                            onClick={() => openEditExamForm(exam)}
                            className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-xs font-semibold text-slate-700 hover:bg-slate-50 transition cursor-pointer"
                          >
                            <Pencil className="h-3.5 w-3.5" /> Edit
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setDeleteTarget(exam);
                              setActiveMenuId(null);
                            }}
                            className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-xs font-semibold text-rose-600 hover:bg-rose-50 transition cursor-pointer"
                          >
                            <Trash2 className="h-3.5 w-3.5" /> Delete
                          </button>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Delete Confirmation Inline */}
                  {deleteTarget?.id === exam.id && (
                    <div className="w-full mt-2.5 rounded-xl bg-rose-50 p-3 flex items-center justify-between text-xs">
                      <span className="font-semibold text-rose-800">
                        Delete &ldquo;{exam.title}&rdquo;?
                      </span>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => setDeleteTarget(null)}
                          className="rounded-lg border border-slate-200 bg-white px-3 py-1 font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer"
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          onClick={() => void deleteExam(exam)}
                          disabled={examSaving}
                          className="rounded-lg bg-rose-600 px-3 py-1 font-semibold text-white hover:bg-rose-700 disabled:opacity-60 cursor-pointer"
                        >
                          {examSaving ? "Deleting…" : "Delete"}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <div className="rounded-xl border border-dashed border-slate-200 py-8 text-center">
            <GraduationCap className="mx-auto h-7 w-7 text-slate-300" aria-hidden="true" />
            <p className="mt-2 text-sm font-bold text-slate-700">No upcoming exams</p>
            <p className="mt-1 text-xs text-slate-400">
              Add an exam date to track its countdown and your subject readiness.
            </p>
            <button
              type="button"
              onClick={() => openNewExamForm()}
              className={cn(
                "mt-4 inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 shadow-xs transition cursor-pointer",
                focusRing,
              )}
            >
              <Plus className="h-4 w-4" aria-hidden="true" /> Add exam
            </button>
          </div>
        )}
      </section>
    </section>
  );
}
