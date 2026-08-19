const DEFAULT_AUTH_ORIGIN = "https://nanosyllabus.com";

function normalizeOrigin(value: string) {
  return value.trim().replace(/\/+$/, "");
}

function isLocalHostname(hostname: string) {
  const normalized = hostname.toLowerCase();
  return normalized === "localhost" || normalized === "127.0.0.1" || normalized === "::1";
}

function isNanoSyllabusHostname(hostname: string) {
  const normalized = hostname.toLowerCase();
  return normalized === "nanosyllabus.com" || normalized.endsWith(".nanosyllabus.com");
}

/**
 * Keep OAuth on the canonical app domain in production, while preserving the
 * current origin for local development and tests.
 */
export function getGoogleAuthRedirectUrl() {
  if (typeof window === "undefined") {
    return undefined;
  }

  const configuredOrigin = process.env.NEXT_PUBLIC_AUTH_ORIGIN?.trim();
  const origin = isLocalHostname(window.location.hostname)
    ? window.location.origin
    : normalizeOrigin(configuredOrigin || DEFAULT_AUTH_ORIGIN);

  return `${origin}/auth/callback`;
}

/**
 * The callback can land on nanosyllabus.com even when sign-in started on
 * app.nanosyllabus.com. Scope the short-lived return-path cookie to the
 * parent domain so the callback can still restore the requested destination.
 */
export function setOAuthNextCookie(nextPath?: string) {
  if (typeof document === "undefined" || typeof window === "undefined") {
    return;
  }

  const encodedNext = encodeURIComponent(nextPath || "");
  const domain = isNanoSyllabusHostname(window.location.hostname)
    ? "; Domain=.nanosyllabus.com"
    : "";
  const secure = window.location.protocol === "https:" ? "; Secure" : "";

  document.cookie = `oauth_next=${encodedNext}; Path=/; Max-Age=600; SameSite=Lax${domain}${secure}`;
}
