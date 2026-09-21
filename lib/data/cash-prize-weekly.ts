import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getNepalDateKey } from "@/lib/data/cash-prize";

/**
 * The weekly streak campaign: the rules, and the server's reading of them.
 *
 * Every figure the Cash Prize page shows, and every entry it registers, is
 * computed here from durable records — passed challenges, community membership,
 * referral claims — and never taken from the browser. The page's own markup
 * says the same thing: the frontend displays eligibility, it does not decide it.
 */

export const CAMPAIGN = {
  /** Consecutive days with a passed challenge that qualify a student. */
  streakDaysRequired: 7,
  /** Verified referrals per extra name on the wheel. */
  referralsPerEntry: 5,
  firstPrize: "Rs. 5,000 + 3 months unlimited challenges",
  secondPrize: "3 months unlimited challenges",
  thirdPrize: "1 month unlimited challenges",
} as const;

/**
 * Who counts as a BCT student this week, read off their community's faculty.
 *
 * Students carry no programme of their own; the community they study in does.
 * Matched loosely — "BCT", "Computer Engineering", "Bachelor in Computer
 * Engineering" all qualify — and overridable with CASH_PRIZE_FACULTY_PATTERN, so
 * a community named some other way can be let in without a code change.
 */
const DEFAULT_FACULTY_PATTERN = "\\bBCT\\b|computer\\s+engineering";

export function facultyPattern() {
  const configured = process.env.CASH_PRIZE_FACULTY_PATTERN?.trim();
  try {
    return new RegExp(configured || DEFAULT_FACULTY_PATTERN, "i");
  } catch {
    return new RegExp(DEFAULT_FACULTY_PATTERN, "i");
  }
}

export function isEligibleFaculty(faculty: string, pattern = facultyPattern()) {
  return pattern.test(String(faculty || ""));
}

function shiftDate(dateKey: string, days: number) {
  const cursor = new Date(`${dateKey}T12:00:00.000Z`);
  cursor.setUTCDate(cursor.getUTCDate() + days);
  return cursor.toISOString().slice(0, 10);
}

/**
 * The Nepal-calendar Friday whose draw a confirmation today belongs to: today,
 * when today is Friday, otherwise the coming Friday.
 */
export function drawDateFor(now = new Date()) {
  return drawDateOnOrAfter(getNepalDateKey(now));
}

/** The Friday on or after a Nepal date key: the draw that date's week ends in. */
export function drawDateOnOrAfter(dateKey: string) {
  const weekday = new Date(`${dateKey}T12:00:00.000Z`).getUTCDay(); // 5 = Friday
  return shiftDate(dateKey, (5 - weekday + 7) % 7);
}

/**
 * Consecutive active days ending today — or yesterday, when nothing has been
 * passed yet today, so a streak does not read as broken at breakfast. The same
 * reading the Challenge Hub and the dashboard give (`student-challenge-dashboard`).
 */
export function streakFromDays(activeDays: Set<string>, today: string) {
  let cursor = activeDays.has(today) ? today : shiftDate(today, -1);
  let streak = 0;
  while (activeDays.has(cursor)) {
    streak += 1;
    cursor = shiftDate(cursor, -1);
  }
  return streak;
}

export type WheelEntries = {
  /** Whether the streak requirement is met and the student may take part. */
  qualified: boolean;
  /** 1 for the streak, when qualified. */
  base: number;
  /** One per `referralsPerEntry` verified referrals. */
  bonus: number;
  /** What the student has on the wheel now: base + bonus when qualified, else 0. */
  active: number;
  /** What unlocks the moment the streak does. */
  potential: number;
};

/** Referrals never stand in for the streak: without it there are no entries. */
export function wheelEntries(streakDays: number, verifiedReferrals: number, eligibleFaculty: boolean): WheelEntries {
  const bonus = Math.floor(Math.max(0, verifiedReferrals) / CAMPAIGN.referralsPerEntry);
  const qualified = eligibleFaculty && streakDays >= CAMPAIGN.streakDaysRequired;
  return {
    qualified,
    base: qualified ? 1 : 0,
    bonus,
    active: qualified ? 1 + bonus : 0,
    potential: 1 + bonus,
  };
}

export type WeeklyCampaignState = {
  drawDate: string;
  streakDays: number;
  verifiedReferrals: number;
  /** A community whose faculty qualifies, if the student belongs to one. */
  eligibleCommunity: { id: string; name: string } | null;
  entries: WheelEntries;
  /** The student's referral code, if they have created a link. */
  referralCode: string | null;
  /** This week's registered entry, if they have confirmed. */
  participation: { entries: number; confirmedAt: string } | null;
};

/** Enough history for any streak worth reporting; qualification needs seven. */
const STREAK_WINDOW_DAYS = 120;

async function activeDaysFor(userId: string, now: Date) {
  const admin = createSupabaseAdminClient();
  const since = new Date(now.getTime() - STREAK_WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await admin
    .from("student_challenges")
    .select("completed_at")
    .eq("user_id", userId)
    .eq("status", "completed")
    .gte("completed_at", since);
  if (error) throw error;
  return new Set(
    (data ?? [])
      .map((row) => (row.completed_at ? getNepalDateKey(new Date(String(row.completed_at))) : ""))
      .filter(Boolean),
  );
}

async function eligibleCommunityFor(userId: string) {
  const admin = createSupabaseAdminClient();
  const memberships = await admin
    .from("community_memberships")
    .select("community_id")
    .eq("user_id", userId)
    .eq("status", "active");
  if (memberships.error) throw memberships.error;
  const ids = (memberships.data ?? []).map((row) => String(row.community_id || "")).filter(Boolean);
  if (!ids.length) return null;
  const communities = await admin
    .from("communities")
    .select("id,name,faculty")
    .in("id", ids)
    .eq("status", "active");
  if (communities.error) throw communities.error;
  const pattern = facultyPattern();
  const match = (communities.data ?? []).find((community) =>
    isEligibleFaculty(String(community.faculty || ""), pattern),
  );
  return match ? { id: String(match.id), name: String(match.name || "") } : null;
}

/**
 * The student's link, and how many of the students it brought in are real.
 *
 * VERIFIED means the referred student has passed at least one challenge. A claim
 * alone is one sign-up, and a sign-up costs nothing to fake; with cash on the
 * wheel, an account that has never studied is not a referral.
 */
async function referralsFor(userId: string) {
  const admin = createSupabaseAdminClient();
  const link = await admin
    .from("billing_referral_links")
    .select("id,code")
    .eq("referrer_id", userId)
    .maybeSingle();
  if (link.error) throw link.error;
  if (!link.data) return { code: null, verified: 0 };

  const claims = await admin
    .from("billing_referral_claims")
    .select("referred_user_id")
    .eq("link_id", link.data.id);
  if (claims.error) throw claims.error;
  const referred = [
    ...new Set((claims.data ?? []).map((row) => String(row.referred_user_id || "")).filter(Boolean)),
  ];
  if (!referred.length) return { code: String(link.data.code), verified: 0 };

  const studied = await admin
    .from("student_challenges")
    .select("user_id")
    .in("user_id", referred)
    .eq("status", "completed");
  if (studied.error) throw studied.error;
  const verified = new Set((studied.data ?? []).map((row) => String(row.user_id || ""))).size;
  return { code: String(link.data.code), verified };
}

async function participationFor(userId: string, drawDate: string) {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("cash_prize_weekly_entries")
    .select("entries,confirmed_at")
    .eq("user_id", userId)
    .eq("draw_date", drawDate)
    .maybeSingle();
  if (error) throw error;
  return data ? { entries: Number(data.entries) || 0, confirmedAt: String(data.confirmed_at) } : null;
}

export async function getWeeklyCampaignState(userId: string, now = new Date()): Promise<WeeklyCampaignState> {
  const drawDate = drawDateFor(now);
  const [activeDays, eligibleCommunity, referrals, participation] = await Promise.all([
    activeDaysFor(userId, now),
    eligibleCommunityFor(userId),
    referralsFor(userId),
    participationFor(userId, drawDate),
  ]);
  const streakDays = streakFromDays(activeDays, getNepalDateKey(now));
  return {
    drawDate,
    streakDays,
    verifiedReferrals: referrals.verified,
    eligibleCommunity,
    entries: wheelEntries(streakDays, referrals.verified, Boolean(eligibleCommunity)),
    referralCode: referrals.code,
    participation,
  };
}

export type ParticipationResult =
  | { ok: true; drawDate: string; entries: number; confirmedAt: string }
  | { ok: false; reason: "not_eligible_faculty" | "streak_incomplete"; message: string };

/**
 * Register this week's entry, after checking every rule again on the server.
 *
 * Idempotent per student and draw: confirming twice updates the entry count (a
 * referral that verified since raises it) but keeps the first confirmation time.
 */
export async function registerWeeklyParticipation(
  userId: string,
  identity: { name: string; email: string },
  now = new Date(),
): Promise<ParticipationResult> {
  const state = await getWeeklyCampaignState(userId, now);
  if (!state.eligibleCommunity) {
    return {
      ok: false,
      reason: "not_eligible_faculty",
      message: "This week's draw is open to BCT students only.",
    };
  }
  if (!state.entries.qualified) {
    const remaining = CAMPAIGN.streakDaysRequired - state.streakDays;
    return {
      ok: false,
      reason: "streak_incomplete",
      message: `Complete ${remaining} more ${remaining === 1 ? "day" : "days"} of your streak to take part.`,
    };
  }

  const admin = createSupabaseAdminClient();
  const snapshot = {
    streak_days: state.streakDays,
    referral_count: state.verifiedReferrals,
    entries: state.entries.active,
    community_id: state.eligibleCommunity.id,
    updated_at: now.toISOString(),
  };
  const existing = await admin
    .from("cash_prize_weekly_entries")
    .select("id,confirmed_at")
    .eq("user_id", userId)
    .eq("draw_date", state.drawDate)
    .maybeSingle();
  if (existing.error) throw existing.error;

  if (existing.data) {
    const { error } = await admin
      .from("cash_prize_weekly_entries")
      .update(snapshot)
      .eq("id", existing.data.id);
    if (error) throw error;
    return {
      ok: true,
      drawDate: state.drawDate,
      entries: snapshot.entries,
      confirmedAt: String(existing.data.confirmed_at),
    };
  }

  const inserted = await admin
    .from("cash_prize_weekly_entries")
    .insert({
      ...snapshot,
      draw_date: state.drawDate,
      user_id: userId,
      student_name: identity.name.trim() || "Student",
      student_email: identity.email.trim(),
      confirmed_at: now.toISOString(),
    })
    .select("confirmed_at")
    .single();
  if (inserted.error) {
    // Two confirmations racing: the other one registered the entry. Same result.
    if (inserted.error.code === "23505") return registerWeeklyParticipation(userId, identity, now);
    throw inserted.error;
  }
  return {
    ok: true,
    drawDate: state.drawDate,
    entries: snapshot.entries,
    confirmedAt: String(inserted.data.confirmed_at),
  };
}

export type AdminWeeklyEntry = {
  id: string;
  userId: string;
  studentName: string;
  studentEmail: string;
  streakDays: number;
  referralCount: number;
  entries: number;
  confirmedAt: string;
};

export async function listAdminWeeklyEntries(drawDate: string): Promise<AdminWeeklyEntry[]> {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("cash_prize_weekly_entries")
    .select("id,user_id,student_name,student_email,streak_days,referral_count,entries,confirmed_at")
    .eq("draw_date", drawDate)
    .order("confirmed_at", { ascending: true });
  if (error) throw error;
  return (data ?? []).map((row) => ({
    id: String(row.id),
    userId: String(row.user_id),
    studentName: String(row.student_name || "Student"),
    studentEmail: String(row.student_email || ""),
    streakDays: Number(row.streak_days) || 0,
    referralCount: Number(row.referral_count) || 0,
    entries: Number(row.entries) || 0,
    confirmedAt: String(row.confirmed_at),
  }));
}
