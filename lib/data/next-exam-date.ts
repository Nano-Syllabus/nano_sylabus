import { getNepalDateKey } from "@/lib/data/cash-prize";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export type NextExamDate = {
  /** YYYY-MM-DD, as the student set it on Today's calendar. */
  date: string;
  title: string;
  /** Whole days from today (Nepal) to the exam; 0 on the exam day itself. */
  daysLeft: number;
};

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * The student's nearest exam from today on, for the hub's countdown and the
 * daily target it divides the remaining topics by. Null when none is set (or
 * the table is missing on an old database).
 */
export async function getNextExamDate(userId: string): Promise<NextExamDate | null> {
  const today = getNepalDateKey();
  const { data, error } = await createSupabaseAdminClient()
    .from("student_exam_dates")
    .select("exam_date,title")
    .eq("user_id", userId)
    .gte("exam_date", today)
    .order("exam_date", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error) {
    if (["42P01", "PGRST205"].includes(error.code ?? "")) return null;
    throw error;
  }
  if (!data) return null;
  const row = data as { exam_date: string; title: string };
  const daysLeft = Math.round(
    (Date.parse(`${row.exam_date}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / DAY_MS,
  );
  return { date: row.exam_date, title: row.title, daysLeft: Math.max(0, daysLeft) };
}
