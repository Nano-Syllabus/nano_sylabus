import { describe, expect, it } from "vitest";
import { getNepalDayUtcRange, toDailyCashPrizeProgress } from "@/lib/data/cash-prize";

describe("cash-prize daily challenge progress", () => {
  it("uses Nepal midnight boundaries for the completion query", () => {
    expect(getNepalDayUtcRange(new Date("2026-09-18T18:14:59.000Z"))).toEqual({
      start: "2026-09-17T18:15:00.000Z",
      end: "2026-09-18T18:15:00.000Z",
    });

    expect(getNepalDayUtcRange(new Date("2026-09-18T18:15:00.000Z"))).toEqual({
      start: "2026-09-18T18:15:00.000Z",
      end: "2026-09-19T18:15:00.000Z",
    });
  });

  it("grants one daily entry after the first completed challenge", () => {
    expect(toDailyCashPrizeProgress(0)).toMatchObject({
      completedToday: 0,
      completedForEntry: 0,
      progressPercent: 0,
      isEligible: false,
    });
    expect(toDailyCashPrizeProgress(1)).toMatchObject({
      completedToday: 1,
      completedForEntry: 1,
      progressPercent: 100,
      isEligible: true,
    });
    expect(toDailyCashPrizeProgress(4)).toMatchObject({
      completedToday: 4,
      completedForEntry: 1,
      progressPercent: 100,
      isEligible: true,
    });
  });
});
