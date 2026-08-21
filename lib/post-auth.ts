import type { AppRole } from "@/lib/types";

export function sanitizeNextPath(nextPath?: null | string) {
  if (!nextPath) return null;
  if (!nextPath.startsWith("/")) return null;
  if (nextPath.startsWith("//")) return null;
  return nextPath;
}

export function resolvePostAuthDestination(input: {
  nextPath?: null | string;
  onboarded?: boolean;
  role?: AppRole;
}) {
  const safeNext = sanitizeNextPath(input.nextPath);

  if (!safeNext) {
    return "/app/today";
  }

  if (safeNext === "/login" || safeNext === "/signup" || safeNext === "/onboarding") {
    return "/app/today";
  }

  return safeNext;
}
