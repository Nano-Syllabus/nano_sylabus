import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const NEPAL_TIME_ZONE = "Asia/Kathmandu";
const NEPAL_UTC_OFFSET = "+05:45";

export type DailyCashPrizeProgress = {
  completedToday: number;
  completedForEntry: number;
  requiredForEntry: 1;
  progressPercent: number;
  isEligible: boolean;
};

export type AdminCashPrizeEntry = {
  id: string;
  entryDate: string;
  userId: string;
  studentName: string;
  studentEmail: string;
  qualifiedAt: string;
  challengeId: string | null;
};

export function getNepalDateKey(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: NEPAL_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value;
  const year = value("year");
  const month = value("month");
  const day = value("day");

  if (!year || !month || !day) {
    throw new Error("Could not resolve the current Nepal calendar day.");
  }

  return `${year}-${month}-${day}`;
}

export function getNepalDayUtcRange(now = new Date()) {
  const dateKey = getNepalDateKey(now);
  const start = new Date(`${dateKey}T00:00:00${NEPAL_UTC_OFFSET}`);
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);

  return {
    start: start.toISOString(),
    end: end.toISOString(),
  };
}

export function isNepalDateKey(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

export async function listAdminCashPrizeEntries(
  entryDate: string,
): Promise<AdminCashPrizeEntry[]> {
  if (!isNepalDateKey(entryDate)) throw new Error("Invalid cash-prize entry date.");
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("cash_prize_daily_entries")
    .select("id,entry_date,user_id,student_name,student_email,qualified_at,challenge_id")
    .eq("entry_date", entryDate)
    .order("qualified_at", { ascending: true });
  if (error) throw error;

  return (data ?? []).map((row) => ({
    id: String(row.id),
    entryDate: String(row.entry_date),
    userId: String(row.user_id),
    studentName: String(row.student_name || "Student"),
    studentEmail: String(row.student_email || ""),
    qualifiedAt: String(row.qualified_at),
    challengeId: row.challenge_id ? String(row.challenge_id) : null,
  }));
}

export function toDailyCashPrizeProgress(completedToday: number): DailyCashPrizeProgress {
  const safeCompletedToday = Math.max(0, Math.trunc(completedToday));
  const completedForEntry = Math.min(safeCompletedToday, 1);

  return {
    completedToday: safeCompletedToday,
    completedForEntry,
    requiredForEntry: 1,
    progressPercent: completedForEntry * 100,
    isEligible: completedForEntry === 1,
  };
}

/**
 * A challenge becomes completed only after the challenge grader records a
 * passing result. Cash-prize eligibility therefore reads the durable
 * `student_challenges` completion record instead of reconstructing it from
 * attempts or client state.
 */
export async function getDailyCashPrizeProgress(
  userId: string,
  now = new Date(),
): Promise<DailyCashPrizeProgress> {
  const admin = createSupabaseAdminClient();
  const { start, end } = getNepalDayUtcRange(now);
  const { count, error } = await admin
    .from("student_challenges")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("status", "completed")
    .gte("completed_at", start)
    .lt("completed_at", end);

  if (error) throw error;
  if (count === null) {
    throw new Error("Cash-prize challenge completion count was unavailable.");
  }

  return toDailyCashPrizeProgress(count);
}
