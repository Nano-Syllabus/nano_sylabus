import { describe, expect, it } from "vitest";
import {
  canSpendCredits,
  CHAT_MESSAGE_CREDIT_COST,
  computeNextBalance,
  getCreditWarning,
  getActivePlanTierLabel,
  getSubscriptionEndDate,
} from "@/lib/billing";

describe("billing helpers", () => {
  it("labels Plus separately from Free and Pro throughout the app", () => {
    expect(getActivePlanTierLabel({ activePlanTier: "plus", hasUnlimitedAccess: false })).toBe("Plus");
    expect(getActivePlanTierLabel({ activePlanTier: "pro", hasUnlimitedAccess: true })).toBe("Pro");
    expect(getActivePlanTierLabel({ hasUnlimitedAccess: false })).toBeNull();
  });
  it("computes the next balance from a ledger movement", () => {
    expect(computeNextBalance(10, -CHAT_MESSAGE_CREDIT_COST)).toBe(9);
    expect(computeNextBalance(9, 50)).toBe(59);
  });

  it("blocks spending when the balance is too low", () => {
    expect(canSpendCredits(1)).toBe(true);
    expect(canSpendCredits(0)).toBe(false);
  });

  it("adds a 30 day end date for monthly plans only", () => {
    const startsAt = "2026-04-20T00:00:00.000Z";
    expect(getSubscriptionEndDate("one_time", startsAt)).toBeNull();
    expect(getSubscriptionEndDate("monthly", startsAt)).toBe("2026-05-20T00:00:00.000Z");
  });

  it("returns human-readable credit warnings", () => {
    expect(getCreditWarning(0)).toContain("No credits");
    expect(getCreditWarning(2)).toContain("Only 2 credits");
    expect(getCreditWarning(10)).toBe("");
  });
});
