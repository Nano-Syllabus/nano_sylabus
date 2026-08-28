import { describe, expect, it } from "vitest";
import {
  activityDate,
  activityTotal,
  analyticsWindow,
  chartCeiling,
  dailyActivityCsv,
  receiptTotal,
  type AnalyticsDay,
} from "@/lib/admin-analytics-presentation";

// Isolated unit-test records only. Never loaded by the app or written to Supabase.
const days: AnalyticsDay[] = Array.from({ length: 30 }, (_, index) => ({
  date: `2026-08-${String(30 - index).padStart(2, "0")}`,
  newUsers: index === 0 ? 2 : index === 6 ? 1 : index === 7 ? 5 : 0,
  challengesPassed: index === 0 ? 1 : 0,
  examsCompleted: index === 2 ? 3 : 0,
  revenue:
    index === 0
      ? [
          { currency: "NPR", amount: 1500 },
          { currency: "USD", amount: 25 },
        ]
      : [],
}));

describe("admin dashboard presentation uses exact records", () => {
  it("selects the latest seven calendar rows, oldest first, without mutating input", () => {
    const before = structuredClone(days);
    const rows = analyticsWindow(days, 7);
    expect(rows).toHaveLength(7);
    expect(rows[0].date).toBe("2026-08-24");
    expect(rows[6].date).toBe("2026-08-30");
    expect(activityTotal(rows, "newUsers")).toBe(3);
    expect(days).toEqual(before);
  });
  it("retains the full 30-day total and sorts unsorted responses", () => {
    const rows = analyticsWindow([...days].reverse(), 30);
    expect(rows).toHaveLength(30);
    expect(activityTotal(rows, "newUsers")).toBe(8);
    expect(activityTotal(rows, "challengesPassed")).toBe(1);
    expect(activityTotal(rows, "examsCompleted")).toBe(3);
  });
  it("does not manufacture missing daily records", () => {
    expect(analyticsWindow([days[0]], 30)).toEqual([days[0]]);
    expect(analyticsWindow([], 7)).toEqual([]);
  });
  it("does not shift a Nepal calendar date into the browser's day", () => {
    expect(activityDate("2026-08-01")).toBe("1 Aug");
  });
  it("keeps currencies separate and keeps amounts in stored major units", () => {
    expect(receiptTotal(days, "NPR")).toBe(1500);
    expect(receiptTotal(days, "USD")).toBe(25);
    expect(receiptTotal(days, "EUR")).toBe(0);
  });
  it("uses zero-based whole-count chart axes without altering values", () => {
    expect(chartCeiling([0, 0])).toBe(4);
    expect(chartCeiling([1, 5, 8])).toBe(8);
    expect(chartCeiling([9])).toBe(12);
  });
  it("exports the selected window's exact values, currency columns, timezone and snapshot", () => {
    const csv = dailyActivityCsv(
      analyticsWindow(days, 7),
      "Asia/Kathmandu",
      "2026-08-30T12:00:00Z",
    );
    const rows = csv.split("\r\n");
    expect(rows).toHaveLength(8);
    expect(rows[0]).toContain('"Confirmed receipts (NPR)","Confirmed receipts (USD)"');
    expect(rows[7]).toBe(
      '"2026-08-30","Asia/Kathmandu","2","1","0","1500","25","2026-08-30T12:00:00Z"',
    );
    expect(rows[1]).toContain('"1","0","0","0","0"');
  });
  it("exports no invented revenue currency when there are no receipts", () => {
    const csv = dailyActivityCsv([{ ...days[0], revenue: [] }], "Asia/Kathmandu", "snapshot");
    expect(csv).not.toContain("Confirmed receipts");
  });
  it("quotes spreadsheet delimiters and neutralizes formula-valued text", () => {
    const csv = dailyActivityCsv([], "=UNSAFE()", 'a,"b');
    expect(csv).not.toContain("UNSAFE");
    const values = dailyActivityCsv([days[0]], "=UNSAFE()", 'a,"b');
    expect(values).toContain('"\'=UNSAFE()"');
    expect(values).toContain('"a,""b"');
  });
});
