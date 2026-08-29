const DEFAULT_AUTH_ORIGIN = "https://nano-sylabus-ten.vercel.app";

function normalizeOrigin(value: string) {
  return value.trim().replace(/\/+$/, "");
}

function isLocalHostname(hostname: string) {
  const normalized = hostname.toLowerCase();
  return normalized === "localhost" || normalized === "127.0.0.1" || normalized === "::1";
}

/**
 * Keep OAuth on the live Vercel app in production while the custom domain is
 * unavailable. Local development and tests continue to use their own origin.
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
 * Keep the return-path cookie host-only. The OAuth callback now returns to the
 * same Vercel host, so sharing this cookie with an expired parent domain is
 * both unnecessary and incorrect.
 */
export function setOAuthNextCookie(nextPath?: string) {
  if (typeof document === "undefined" || typeof window === "undefined") {
    return;
  }

  const encodedNext = encodeURIComponent(nextPath || "");
  const secure = window.location.protocol === "https:" ? "; Secure" : "";

  document.cookie = `oauth_next=${encodedNext}; Path=/; Max-Age=600; SameSite=Lax${secure}`;
}
