import { describe, expect, it } from "vitest";
import { creditMonthKey, monthlyRefreshAmount, monthlyRefreshReference } from "@/lib/billing";

describe("monthly free credits", () => {
  it("keys the month in Nepal time", () => {
    // 2026-10-31 19:00 UTC is already 1 November 00:45 in Kathmandu.
    expect(creditMonthKey(new Date("2026-10-31T19:00:00Z"))).toBe("2026-11");
    expect(creditMonthKey(new Date("2026-10-31T18:00:00Z"))).toBe("2026-10");
    expect(monthlyRefreshReference("u1", new Date("2026-10-07T00:00:00Z"))).toBe("u1:2026-10");
  });

  it("tops up to 20 and never takes credits away", () => {
    expect(monthlyRefreshAmount(0)).toBe(20);
    expect(monthlyRefreshAmount(7)).toBe(13);
    expect(monthlyRefreshAmount(20)).toBe(0);
    expect(monthlyRefreshAmount(55)).toBe(0);
  });
});
