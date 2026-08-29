import type { AppRole, StudentProfile } from "@/lib/types";
import { isAdminRole } from "@/lib/admin-role";

export function isProfileComplete(
  profile: Partial<
    Pick<
      StudentProfile,
      "fullName" | "college" | "board" | "grade" | "targetGrade" | "languagePref" | "subjects"
    >
  > | null,
) {
  return true;
}

export function resolveAccess(input: {
  pathname: string;
  hasUser: boolean;
  onboarded: boolean;
  role: AppRole;
}) {
  const { pathname, hasUser, role } = input;
  const isAdminRoute = pathname.startsWith("/admin");
  const isStudentRoute = pathname.startsWith("/app");
  const isOnboarding = pathname === "/onboarding";
  const isGuestPage = pathname === "/login" || pathname === "/signup";

  if (isAdminRoute) {
    if (!hasUser) return { allow: false as const, redirectTo: "/login", includeNext: true };
    if (!isAdminRole(role)) {
      return {
        allow: false as const,
        redirectTo: "/app/today",
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
      redirectTo: "/app/today",
      includeNext: false,
    };
  }

  if (hasUser && isOnboarding) {
    return {
      allow: false as const,
      redirectTo: "/app/today",
      includeNext: false,
    };
  }

  return { allow: true as const };
}
