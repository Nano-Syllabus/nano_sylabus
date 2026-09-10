/**
 * Keep OAuth on the same origin where sign-in started. Supabase stores the
 * PKCE verifier for that origin, so moving the callback to another hostname
 * makes the verifier unavailable and breaks the code exchange.
 */
export function getGoogleAuthRedirectUrl() {
  if (typeof window === "undefined") {
    return undefined;
  }

  return `${window.location.origin}/auth/callback`;
}

/**
 * Keep the return-path cookie host-only. The OAuth callback now returns to the
 * same host, so it remains available after the provider redirects back.
 */
export function setOAuthNextCookie(nextPath?: string) {
  if (typeof document === "undefined" || typeof window === "undefined") {
    return;
  }

  const encodedNext = encodeURIComponent(nextPath || "");
  const secure = window.location.protocol === "https:" ? "; Secure" : "";

  document.cookie = `oauth_next=${encodedNext}; Path=/; Max-Age=600; SameSite=Lax${secure}`;
}
