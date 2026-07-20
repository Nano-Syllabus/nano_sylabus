import type { AppRole, StudentProfile } from "@/lib/types";

export function isProfileComplete(profile: Pick<
  StudentProfile,
  "fullName" | "college" | "board" | "grade" | "targetGrade" | "languagePref"
> | null) {
  if (!profile) return false;
  return Boolean(
    profile.board &&
    profile.grade,
  );
}

export function resolveAccess(input: {
  pathname: string;
  hasUser: boolean;
  onboarded: boolean;
  role: AppRole;
}) {
  const { pathname, hasUser, onboarded, role } = input;
  const isAdminRoute = pathname.startsWith("/admin");
  const isStudentRoute = pathname.startsWith("/app");
  const isOnboarding = pathname === "/onboarding";
  const isGuestPage = pathname === "/login" || pathname === "/signup";

  if (isAdminRoute) {
    if (!hasUser) return { allow: false as const, redirectTo: "/login", includeNext: true };
    if (role !== "admin") {
      return {
        allow: false as const,
        redirectTo: onboarded ? "/app/chat" : "/onboarding",
        includeNext: false,
      };
    }
    return { allow: true as const };
  }

  if (!hasUser && (isStudentRoute || isOnboarding)) {
    return { allow: false as const, redirectTo: "/login", includeNext: true };
  }

  if (hasUser && isGuestPage) {
    return {
      allow: false as const,
      redirectTo: onboarded ? "/app/chat" : "/onboarding",
      includeNext: false,
    };
  }

  if (hasUser && role !== "admin" && isStudentRoute && !onboarded) {
    return { allow: false as const, redirectTo: "/onboarding", includeNext: false };
  }

  if (hasUser && isOnboarding && onboarded) {
    return {
      allow: false as const,
      redirectTo: "/app/chat",
      includeNext: false,
    };
  }

  return { allow: true as const };
}
