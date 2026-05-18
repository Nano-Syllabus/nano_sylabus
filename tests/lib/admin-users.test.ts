import { describe, expect, it } from "vitest";
import { computeAdjustedBalance } from "@/lib/data/admin-users";

describe("computeAdjustedBalance", () => {
  it("adds positive adjustments to the current balance", () => {
    expect(computeAdjustedBalance(20, 15)).toBe(35);
  });

  it("throws when an adjustment would make the balance negative", () => {
    expect(() => computeAdjustedBalance(5, -10)).toThrow(
      "This adjustment would make the credit balance negative.",
    );
  });
});
