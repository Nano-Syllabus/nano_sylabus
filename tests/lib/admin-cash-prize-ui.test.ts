import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { wheelNames } from "@/components/admin-cash-prize-entries";
import type { AdminWeeklyEntry } from "@/lib/data/cash-prize-weekly";

const page = readFileSync("app/admin/cash-prize/page.tsx", "utf8");
const entries = readFileSync("components/admin-cash-prize-entries.tsx", "utf8");
const frame = readFileSync("components/admin-billing-frame.tsx", "utf8");

function entry(studentName: string, count: number): AdminWeeklyEntry {
  return {
    id: studentName,
    userId: studentName,
    studentName,
    studentEmail: `${studentName.toLowerCase()}@example.com`,
    streakDays: 7,
    referralCount: (count - 1) * 5,
    entries: count,
    confirmedAt: "2026-09-21T06:00:00.000Z",
  };
}

describe("admin cash prize entries", () => {
  it("adds a restricted prize-entry section beside billing operations", () => {
    expect(frame).toContain('href="/admin/cash-prize"');
    expect(frame).toContain("Prize entries");
    expect(page).toContain("assertAdminRequest()");
    expect(page).toContain('active="cash-prize"');
  });

  it("lists the Friday draw that the chosen date's week ends in", () => {
    expect(page).toContain('type="date"');
    expect(page).toContain("drawDateOnOrAfter(isNepalDateKey(requestedDate) ? requestedDate : getNepalDateKey())");
    expect(page).toContain("listAdminWeeklyEntries(drawDate)");
    expect(page).not.toContain("listAdminCashPrizeEntries");
  });

  it("shows each participant's streak, verified referrals and entries", () => {
    expect(entries).toContain("entry.studentName");
    expect(entries).toContain("entry.studentEmail");
    expect(entries).toContain("entry.streakDays");
    expect(entries).toContain("entry.referralCount");
    expect(entries).toContain("entry.entries");
    expect(entries).toContain("entry.confirmedAt");
    expect(entries).toContain("Copy wheel names");
  });

  it("copies each name once per entry, so the wheel carries the weighting", () => {
    expect(wheelNames([entry("Asha", 1), entry("Bikash", 3)])).toEqual(["Asha", "Bikash", "Bikash", "Bikash"]);
    expect(entries).toContain('navigator.clipboard.writeText(names.join("\\n"))');
  });
});
