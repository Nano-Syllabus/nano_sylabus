import { describe, expect, it } from "vitest";
import { calculateExamReadiness } from "@/lib/exam-readiness";

describe("exam readiness", () => {
  it("weights subjects equally even when their syllabus sizes differ", () => {
    expect(calculateExamReadiness([{ completedTopics: 1, totalTopics: 2 }, { completedTopics: 90, totalTopics: 100 }])).toBe(70);
  });
  it("includes untouched and unmapped subjects in the denominator", () => {
    expect(calculateExamReadiness([{ completedTopics: 10, totalTopics: 10 }, { completedTopics: 0, totalTopics: 20 }, { completedTopics: 0, totalTopics: 0 }])).toBeCloseTo(100 / 3);
    expect(calculateExamReadiness([])).toBe(0);
  });
  it("bounds inconsistent completion counts", () => {
    expect(calculateExamReadiness([{ completedTopics: 11, totalTopics: 10 }, { completedTopics: -1, totalTopics: 10 }])).toBe(50);
  });
});
