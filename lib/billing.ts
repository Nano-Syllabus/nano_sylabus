import type { BillingType } from "@/lib/types";

export const STARTER_CREDITS = 20;
export const CHAT_MESSAGE_CREDIT_COST = 1;

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
