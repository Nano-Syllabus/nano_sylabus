import { describe, expect, it } from "vitest";
import {
  getNepalDateKey,
  getNepalDayUtcRange,
  isNepalDateKey,
  toDailyCashPrizeProgress,
} from "@/lib/data/cash-prize";
import { readFileSync } from "node:fs";

const cashPrizeSource = readFileSync("lib/data/cash-prize.ts", "utf8");

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

  it("validates and derives Nepal calendar keys", () => {
    expect(getNepalDateKey(new Date("2026-09-18T18:14:59.000Z"))).toBe("2026-09-18");
    expect(getNepalDateKey(new Date("2026-09-18T18:15:00.000Z"))).toBe("2026-09-19");
    expect(isNepalDateKey("2026-09-19")).toBe(true);
    expect(isNepalDateKey("2026-02-30")).toBe(false);
    expect(isNepalDateKey("19-09-2026")).toBe(false);
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

  it("requires the challenge to belong to the current Nepal day", () => {
    expect(cashPrizeSource).toContain('.eq("challenge_date", dateKey)');
  });
});
