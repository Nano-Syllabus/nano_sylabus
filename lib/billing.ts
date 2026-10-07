import type { AppUser, BillingType } from "@/lib/types";

export const STARTER_CREDITS = 20;
/** What a regular student's credits refill to at the start of each month. */
export const MONTHLY_FREE_CREDITS = 20;

/** The month a refill belongs to, in Nepal time: "2026-10". */
export function creditMonthKey(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kathmandu",
    year: "numeric",
    month: "2-digit",
  }).formatToParts(date);
  const part = (type: string) => parts.find((item) => item.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}`;
}

/** The ledger reference that marks a user's refill for a month. */
export function monthlyRefreshReference(userId: string, date = new Date()) {
  return `${userId}:${creditMonthKey(date)}`;
}

/**
 * A refill tops the balance up to the monthly amount; it never takes away
 * credits someone bought on top.
 */
export function monthlyRefreshAmount(balance: number) {
  return Math.max(0, MONTHLY_FREE_CREDITS - balance);
}
export const CHAT_MESSAGE_CREDIT_COST = 1;

export function getActivePlanTierLabel(
  user: Pick<AppUser, "activePlanTier" | "hasUnlimitedAccess">,
): string | null {
  if (user.activePlanTier === "plus") return "Plus";
  if (user.activePlanTier === "pro") return "Pro";
  if (user.activePlanTier === "group") return "Group";
  return user.hasUnlimitedAccess ? "Unlimited" : null;
}

export function computeNextBalance(currentBalance: number, amount: number) {
  return currentBalance + amount;
}

export function canSpendCredits(balance: number, cost = CHAT_MESSAGE_CREDIT_COST) {
  return balance >= cost;
}

export function getSubscriptionEndDate(
  billingType: BillingType,
  startsAt: string | Date,
) {
  if (billingType !== "monthly") return null;
  const date = new Date(startsAt);
  date.setDate(date.getDate() + 30);
  return date.toISOString();
}

export function normalizeCreditBalance(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

export function getCreditWarning(balance: number) {
  if (balance <= 0) return "No credits left. Buy a plan to continue chatting.";
  if (balance < 10) return `Only ${balance} credit${balance === 1 ? "" : "s"} left.`;
  return "";
}
