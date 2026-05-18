import { describe, expect, it } from "vitest";
import { computeExtendedEndDate } from "@/lib/data/admin-subscriptions";

describe("computeExtendedEndDate", () => {
  it("extends from a future end date when one exists", () => {
    const result = computeExtendedEndDate("2030-01-10T00:00:00.000Z", 30, "2026-01-01T00:00:00.000Z");
    expect(result).toBe("2030-02-09T00:00:00.000Z");
  });

  it("extends from now when no current end date exists", () => {
    const result = computeExtendedEndDate(null, 10, "2026-01-01T00:00:00.000Z");
    expect(result).toBe("2026-01-11T00:00:00.000Z");
  });
});
