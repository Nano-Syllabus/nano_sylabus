import { describe, expect, it } from "vitest";
import { calculateSubjectReadiness } from "@/lib/data/community-subject-explorer";

describe("whole-subject readiness", () => {
  it("keeps unpractised indexed topics in the denominator", () => {
    expect(calculateSubjectReadiness(4, [80, 40])).toBe(30);
  });

  it("clamps persisted topic percentages before aggregating them", () => {
    expect(calculateSubjectReadiness(2, [120, -10])).toBe(50);
  });

  it("does not invent progress when topics or mastery data are unavailable", () => {
    expect(calculateSubjectReadiness(null, [80])).toBeNull();
    expect(calculateSubjectReadiness(0, [])).toBeNull();
    expect(calculateSubjectReadiness(2, null)).toBeNull();
  });
});
