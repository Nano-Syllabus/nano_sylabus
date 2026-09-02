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

  it("keeps the public course catalog available to guests", () => {
    expect(
      resolveAccess({
        pathname: "/exams",
        hasUser: false,
        onboarded: false,
        role: "student",
      }),
    ).toEqual({ allow: true });
  });

  it("allows authenticated students into the app without a profile gate", () => {
    expect(
      resolveAccess({
        pathname: "/app/notes",
        hasUser: true,
        onboarded: false,
        role: "student",
      }),
    ).toEqual({ allow: true });
  });

  it("keeps the public course catalog available before onboarding", () => {
    expect(
      resolveAccess({
        pathname: "/exams",
        hasUser: true,
        onboarded: false,
        role: "student",
      }),
    ).toEqual({ allow: true });
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
      redirectTo: "/app/today",
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
  it("treats a partial profile as usable because onboarding is optional", () => {
    expect(
      isProfileComplete({
        fullName: "Student",
        college: "Campus",
        board: "",
        grade: "Class 11",
        targetGrade: "A+",
        languagePref: "EN",
      }),
    ).toBe(true);
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
