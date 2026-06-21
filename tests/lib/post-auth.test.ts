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

  it("sends onboarded student to chat when next is missing", () => {
    expect(resolvePostAuthDestination({ role: "student", onboarded: true })).toBe("/app/chat");
  });

  it("sends non-onboarded student to onboarding when next is missing", () => {
    expect(resolvePostAuthDestination({ role: "student", onboarded: false })).toBe("/onboarding");
  });

});
