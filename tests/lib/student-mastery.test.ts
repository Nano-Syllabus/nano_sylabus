import { describe, expect, it } from "vitest";
import { chapterPercentageFromMarks } from "@/lib/data/student-mastery";

describe("student mastery percentages", () => {
  it("uses earned marks as the canonical 0..100 percentage", () => {
    expect(chapterPercentageFromMarks({ score: 20, marks: 20, percentage: 1 })).toBe(100);
    expect(chapterPercentageFromMarks({ score: 8, marks: 20, percentage: 0.4 })).toBe(40);
  });

  it("bounds malformed grader values", () => {
    expect(chapterPercentageFromMarks({ score: 25, marks: 20, percentage: 125 })).toBe(100);
    expect(chapterPercentageFromMarks({ score: -2, marks: 20, percentage: -10 })).toBe(0);
  });
});
