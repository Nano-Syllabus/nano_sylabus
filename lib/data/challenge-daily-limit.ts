import type { SupabaseClient } from "@supabase/supabase-js";
import { ChallengeDailyLimitError } from "@/lib/data/challenge-access-error";
import { DEV_AUTH_BYPASS } from "@/lib/dev-auth-bypass";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

/**
 * THE FREE PLAN'S DAILY CHALLENGES: three a day.
 *
 * What counts is a challenge COMPLETED today (Nepal time) — the same number as
 * the hub's "Today's quota" card, so the lock appears exactly when that card
 * reads 3 / 5. Challenges on Continue do not count. Reopening one already
 * started is never refused: Continue always works, and so does the result of a
 * finished one. A Start after the third completion is refused with
 * `ChallengeDailyLimitError`; tomorrow brings three more.
 *
 * Plus, Pro and Group have no limit — the same plans `getCurrentAuth` names as
 * `activePlanTier` (or an unlimited plan), active and not past `ends_at`.
 */
export const FREE_DAILY_CHALLENGES = 3;

export type ChallengeAllowance = {
  paid: boolean;
  limit: number;
  /** Challenges completed today (Nepal time) — the "Today's quota" count. */
  used: number;
};

const NEPAL_OFFSET = "+05:45";

function nepalDay(value = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kathmandu",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(value);
  const part = (name: string) => parts.find((item) => item.type === name)?.value || "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

/** Midnight in Kathmandu, as an instant. Nepal has no daylight saving. */
function nepalMidnight(value = new Date()) {
  return new Date(`${nepalDay(value)}T00:00:00${NEPAL_OFFSET}`).toISOString();
}

export function startedToday(startedAt: string | null | undefined, now = new Date()) {
  return Boolean(startedAt) && nepalDay(new Date(String(startedAt))) === nepalDay(now);
}

export async function hasPaidChallengePlan(userId: string, admin: SupabaseClient = createSupabaseAdminClient()) {
  if (DEV_AUTH_BYPASS) return true;
  const { data, error } = await admin
    .from("user_subscriptions")
    .select("ends_at, subscription_plans(slug,product_type,is_unlimited)")
    .eq("user_id", userId)
    .eq("status", "active");
  if (error) throw error;
  const now = Date.now();
  return (data ?? []).some((subscription) => {
    const raw = (subscription as { subscription_plans: unknown }).subscription_plans;
    const plan = (Array.isArray(raw) ? raw[0] : raw) as
      | { slug?: string | null; product_type?: string | null; is_unlimited?: boolean | null }
      | null;
    const endsAt = (subscription as { ends_at: string | null }).ends_at;
    const live = !endsAt || new Date(endsAt).getTime() > now;
    return live && Boolean(plan && (plan.is_unlimited || plan.product_type === "group" || plan.slug === "plus-monthly"));
  });
}

async function completedTodayCount(userId: string, admin: SupabaseClient) {
  const { count, error } = await admin
    .from("student_challenges")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("status", "completed")
    .gte("completed_at", nepalMidnight());
  if (error) throw error;
  return count ?? 0;
}

export async function challengeAllowance(
  userId: string,
  admin: SupabaseClient = createSupabaseAdminClient(),
): Promise<ChallengeAllowance> {
  const [paid, used] = await Promise.all([
    hasPaidChallengePlan(userId, admin),
    completedTodayCount(userId, admin),
  ]);
  return { paid, limit: FREE_DAILY_CHALLENGES, used };
}

/**
 * Refuse a NEW attempt past the free allowance. `alreadyToday`: this challenge
 * was started today, so starting it again (a restart, a re-issued paper) is
 * the same attempt, not another.
 */
export async function assertChallengeAttemptAllowed(userId: string, alreadyToday: boolean) {
  if (alreadyToday) return;
  const admin = createSupabaseAdminClient();
  const allowance = await challengeAllowance(userId, admin);
  if (!allowance.paid && allowance.used >= allowance.limit) {
    throw new ChallengeDailyLimitError(allowance.limit);
  }
}
