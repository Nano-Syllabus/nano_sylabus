import { describe, expect, it } from "vitest";
import { byProgress } from "@/components/challenges-dashboard-client";

const row = (subjectSlug: string) => ({
  challenge: { courseId: "c1", subjectSlug } as Parameters<typeof byProgress>[0][number]["challenge"],
});

describe("byProgress", () => {
  it("orders hub rows by subject progress, highest first, ties and unmapped keep order", () => {
    const progress = new Map([
      ["c1:dlm", { covered: 0, total: 34 }],
      ["c1:beee", { covered: 7, total: 36 }],
      ["c1:ppdi", { covered: 13, total: 16 }],
      ["c1:c", { covered: 9, total: 58 }],
      ["c1:coe", { covered: 0, total: 44 }],
    ]);
    const rows = ["dlm", "beee", "unmapped", "ppdi", "c", "coe"].map(row);
    expect(byProgress(rows, progress).map((r) => r.challenge.subjectSlug)).toEqual([
      "ppdi", "beee", "c", "dlm", "coe", "unmapped",
    ]);
  });
});
