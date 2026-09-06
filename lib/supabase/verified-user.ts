import type { SupabaseClient, User } from "@supabase/supabase-js";
import { DEV_AUTH_BYPASS, devBypassUser } from "@/lib/dev-auth-bypass";

/**
 * `supabase.auth.getUser()` without the network round trip.
 *
 * `getUser()` asks the Supabase auth server to validate the access token, which
 * measured at ~143ms median from here — and this app called it twice per page
 * navigation (middleware, then the page's own auth check) plus once inside every
 * API route a screen touches on mount. That was the single largest source of
 * latency in the product, and none of it was our own work.
 *
 * This project signs JWTs with an asymmetric key (ES256), so `getClaims()`
 * verifies the token's signature locally with WebCrypto against a cached JWKS.
 * That is a real cryptographic verification of the same token the auth server
 * would have checked, so the trust story is unchanged — this is emphatically
 * NOT `getSession()`, which returns cookie contents without verifying anything.
 *
 * Two things it deliberately does not do:
 *
 * - It does not invent `created_at` / `last_sign_in_at`. Those are not in the
 *   token. No caller of the session user reads them (the admin user list gets
 *   its rows from `auth.admin.listUsers`, which is untouched).
 * - It does not replace `getUser()` where freshly written `user_metadata` has
 *   to be read back. Metadata changed through `auth.admin.updateUserById` does
 *   not mint a new token, so the claims would lag until the session refreshes.
 *   The teacher preference routes still call `getUser()` for that reason.
 *
 * If claim verification fails for any reason the call falls back to `getUser()`,
 * so the worst case is the old latency rather than a signed-out user.
 */
export async function getVerifiedUser(
  // Only the auth namespace is touched, so helpers that accept a narrowed
  // client (`Pick<SupabaseClient, "auth">`) can pass theirs straight through.
  supabase: Pick<SupabaseClient, "auth">,
): Promise<{ data: { user: User | null }; error: Error | null }> {
  try {
    const { data, error } = await supabase.auth.getClaims();

    if (error) return withDevBypass(await supabase.auth.getUser());
    // No session at all — an anonymous visitor, not a failure.
    if (!data?.claims) return withDevBypass({ data: { user: null }, error: null });

    const claims = data.claims as Record<string, unknown>;
    const id = typeof claims.sub === "string" ? claims.sub : "";
    if (!id) return supabase.auth.getUser();

    const user = {
      id,
      aud: typeof claims.aud === "string" ? claims.aud : "authenticated",
      role: typeof claims.role === "string" ? claims.role : "authenticated",
      email: typeof claims.email === "string" ? claims.email : undefined,
      phone: typeof claims.phone === "string" ? claims.phone : undefined,
      app_metadata: (claims.app_metadata ?? {}) as User["app_metadata"],
      user_metadata: (claims.user_metadata ?? {}) as User["user_metadata"],
      is_anonymous: claims.is_anonymous === true,
      created_at: "",
    } as User;

    return { data: { user }, error: null };
  } catch {
    return withDevBypass(await supabase.auth.getUser());
  }
}

/**
 * Single choke point for the development bypass. Every auth check in the app —
 * middleware, page loads, and all the API routes — resolves the current user
 * through `getVerifiedUser`, so standing in here covers all of them at once
 * rather than scattering an `if (dev)` through 89 call sites.
 *
 * A real session always wins; this only fills in when there is none.
 */
function withDevBypass(result: { data: { user: User | null }; error: Error | null }) {
  if (!DEV_AUTH_BYPASS || result.data.user) return result;
  return { data: { user: devBypassUser() }, error: null };
}
