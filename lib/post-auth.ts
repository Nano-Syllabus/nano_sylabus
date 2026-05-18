import type { AppRole } from "@/lib/types";

export function sanitizeNextPath(nextPath?: null | string) {
  if (!nextPath) return null;
  if (!nextPath.startsWith("/")) return null;
  if (nextPath.startsWith("//")) return null;
  return nextPath;
}

export function resolvePostAuthDestination(input: {
  nextPath?: null | string;
  onboarded: boolean;
  role: AppRole;
}) {
  const safeNext = sanitizeNextPath(input.nextPath);

  if (!safeNext) {
    return input.role === "admin" ? "/admin" : input.onboarded ? "/app/chat" : "/onboarding";
  }

  if (safeNext.startsWith("/admin")) {
    return input.role === "admin" ? safeNext : input.onboarded ? "/app/chat" : "/onboarding";
  }

  if (safeNext === "/login" || safeNext === "/signup") {
    return input.role === "admin" ? "/admin" : input.onboarded ? "/app/chat" : "/onboarding";
  }

  if (safeNext === "/onboarding" && (input.onboarded || input.role === "admin")) {
    return input.role === "admin" ? "/admin" : "/app/chat";
  }

  return safeNext;
}
