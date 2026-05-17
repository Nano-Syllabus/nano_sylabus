import { describe, expect, it } from "vitest";
import { isProfileComplete, resolveAccess } from "@/lib/access";

describe("resolveAccess", () => {
  it("redirects guests away from protected student routes", () => {
    expect(
      resolveAccess({
        pathname: "/app/chat",
        hasUser: false,
        onboarded: false,
        role: "student",
      }),
    ).toEqual({
      allow: false,
      redirectTo: "/login",
      includeNext: true,
    });
  });

  it("redirects non-onboarded students to onboarding", () => {
    expect(
      resolveAccess({
        pathname: "/app/notes",
        hasUser: true,
        onboarded: false,
        role: "student",
      }),
    ).toEqual({
      allow: false,
      redirectTo: "/onboarding",
      includeNext: false,
    });
  });

  it("blocks non-admin users from admin routes", () => {
    expect(
      resolveAccess({
        pathname: "/admin/payments",
        hasUser: true,
        onboarded: true,
        role: "student",
      }),
    ).toEqual({
      allow: false,
      redirectTo: "/app/chat",
      includeNext: false,
    });
  });

  it("allows admins into admin routes", () => {
    expect(
      resolveAccess({
        pathname: "/admin/payments",
        hasUser: true,
        onboarded: false,
        role: "admin",
      }),
    ).toEqual({ allow: true });
  });
});

describe("isProfileComplete", () => {
  it("requires board to be present", () => {
    expect(
      isProfileComplete({
        fullName: "Student",
        college: "Campus",
        board: "",
        grade: "Class 11",
        targetGrade: "A+",
        languagePref: "EN",
      }),
    ).toBe(false);
  });

  it("returns true for complete profiles including board", () => {
    expect(
      isProfileComplete({
        fullName: "Student",
        college: "Campus",
        board: "NEB",
        grade: "Class 11",
        targetGrade: "A+",
        languagePref: "RN",
      }),
    ).toBe(true);
  });
});
