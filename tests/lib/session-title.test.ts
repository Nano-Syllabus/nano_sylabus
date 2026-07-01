import { describe, expect, it } from "vitest";
import { deriveSessionTitle } from "@/lib/utils";

describe("deriveSessionTitle", () => {
  it("uses the question topic instead of generic subject overview", () => {
    expect(
      deriveSessionTitle("Explain interference of light in one short paragraph.", "Engineering Physics"),
    ).toBe("Interference Light Overview");
  });

  it("keeps specific technical terms compact", () => {
    expect(
      deriveSessionTitle("Explain Young's double-slit experiment in detail.", "Engineering Physics"),
    ).toBe("Young Double-slit Experiment Overview");
  });
});
