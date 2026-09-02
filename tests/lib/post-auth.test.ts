import { describe, expect, it } from "vitest";
import { resolvePostAuthDestination, sanitizeNextPath } from "@/lib/post-auth";

describe("sanitizeNextPath", () => {
  it("accepts safe internal paths", () => {
    expect(sanitizeNextPath("/app/chat")).toBe("/app/chat");
  });

  it("rejects unsafe paths", () => {
    expect(sanitizeNextPath("https://example.com")).toBeNull();
    expect(sanitizeNextPath("//example.com")).toBeNull();
    expect(sanitizeNextPath("admin")).toBeNull();
  });
});

describe("resolvePostAuthDestination", () => {
  it("sends onboarded student to Today when next is missing", () => {
    expect(resolvePostAuthDestination({ role: "student", onboarded: true })).toBe("/app/today");
  });

  it("sends a student without a completed profile to Today when next is missing", () => {
    expect(resolvePostAuthDestination({ role: "student", onboarded: false })).toBe("/app/today");
  });

  it("preserves a safe destination without forcing onboarding", () => {
    expect(
      resolvePostAuthDestination({
        role: "student",
        onboarded: false,
        nextPath: "/app/payment/ioe-entrance",
      }),
    ).toBe("/app/payment/ioe-entrance");
  });
});
