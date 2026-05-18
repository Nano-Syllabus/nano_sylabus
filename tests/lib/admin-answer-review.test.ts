import { describe, expect, it } from "vitest";
import { buildAnswerPreview, deriveAdminAnswerState } from "@/lib/admin-answer-review";

describe("buildAnswerPreview", () => {
  it("normalizes whitespace and trims long answers", () => {
    expect(buildAnswerPreview("  This   is\n\n a   long answer.  ", 14)).toBe("This is a l...");
  });
});

describe("deriveAdminAnswerState", () => {
  it("prioritizes reviewed state over feedback", () => {
    expect(deriveAdminAnswerState("down", "2026-05-18T00:00:00.000Z")).toBe("reviewed");
  });

  it("marks thumbs-down answers as flagged when still open", () => {
    expect(deriveAdminAnswerState("down", null)).toBe("flagged");
  });
});
