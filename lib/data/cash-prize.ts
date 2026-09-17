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

function nepalDateKey(now: Date) {
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
  const dateKey = nepalDateKey(now);
  const start = new Date(`${dateKey}T00:00:00${NEPAL_UTC_OFFSET}`);
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);

  return {
    start: start.toISOString(),
    end: end.toISOString(),
  };
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
