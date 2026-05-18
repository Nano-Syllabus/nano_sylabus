import { describe, expect, it } from "vitest";
import { resolvePostAuthDestination, sanitizeNextPath } from "@/lib/post-auth";

describe("sanitizeNextPath", () => {
  it("accepts safe internal paths", () => {
    expect(sanitizeNextPath("/admin")).toBe("/admin");
    expect(sanitizeNextPath("/app/chat")).toBe("/app/chat");
  });

  it("rejects unsafe paths", () => {
    expect(sanitizeNextPath("https://example.com")).toBeNull();
    expect(sanitizeNextPath("//example.com")).toBeNull();
    expect(sanitizeNextPath("admin")).toBeNull();
  });
});

describe("resolvePostAuthDestination", () => {
  it("sends admin to admin when next is missing", () => {
    expect(resolvePostAuthDestination({ role: "admin", onboarded: true })).toBe("/admin");
  });

  it("sends onboarded student to chat when next is missing", () => {
    expect(resolvePostAuthDestination({ role: "student", onboarded: true })).toBe("/app/chat");
  });

  it("sends non-onboarded student to onboarding when next is missing", () => {
    expect(resolvePostAuthDestination({ role: "student", onboarded: false })).toBe("/onboarding");
  });

  it("keeps allowed admin route for admin", () => {
    expect(resolvePostAuthDestination({ role: "admin", onboarded: true, nextPath: "/admin/knowledge" })).toBe(
      "/admin/knowledge",
    );
  });

  it("blocks student from admin route", () => {
    expect(resolvePostAuthDestination({ role: "student", onboarded: true, nextPath: "/admin" })).toBe("/app/chat");
  });

  it("redirects admin away from onboarding", () => {
    expect(resolvePostAuthDestination({ role: "admin", onboarded: true, nextPath: "/onboarding" })).toBe("/admin");
  });
});
