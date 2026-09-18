import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const page = readFileSync("app/admin/cash-prize/page.tsx", "utf8");
const entries = readFileSync("components/admin-cash-prize-entries.tsx", "utf8");
const frame = readFileSync("components/admin-billing-frame.tsx", "utf8");

describe("admin cash prize entries", () => {
  it("adds a restricted prize-entry section beside billing operations", () => {
    expect(frame).toContain('href="/admin/cash-prize"');
    expect(frame).toContain("Prize entries");
    expect(page).toContain("assertAdminRequest()");
    expect(page).toContain('active="cash-prize"');
  });

  it("supports selecting each Nepal day and loads its real entries", () => {
    expect(page).toContain('type="date"');
    expect(page).toContain("listAdminCashPrizeEntries(entryDate)");
    expect(page).toContain("getNepalDateKey()");
  });

  it("lists names, emails and timestamps and copies every name in one click", () => {
    expect(entries).toContain("entry.studentName");
    expect(entries).toContain("entry.studentEmail");
    expect(entries).toContain("entry.qualifiedAt");
    expect(entries).toContain('navigator.clipboard.writeText(entries.map((entry) => entry.studentName).join("\\n"))');
    expect(entries).toContain("Copy all names");
  });
});
