import { cache } from "react";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { DEV_AUTH_BYPASS } from "@/lib/dev-auth-bypass";
import { getSupabaseEnv } from "@/lib/env";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

type CookieToSet = {
  name: string;
  value: string;
  options: Record<string, unknown>;
};

/**
 * Memoized per request. A single page render reaches for this from the layout,
 * the page, and every data helper it calls; without the cache each of those
 * built a fresh auth client and re-read the cookie store.
 */
export const createSupabaseServerClient = cache(async function createSupabaseServerClient() {
  const cookieStore = await cookies();

  /**
   * Faking a user in application code does not fool Postgres: row level
   * security still sees an anonymous request, so under the development bypass
   * every RLS-guarded read comes back empty and every write is refused. Screens
   * then render their empty states, which is the opposite of useful when the
   * point is to look at the real UI.
   *
   * So a bypassed request talks to the database with the service role instead.
   * This only happens when the bypass is on — which needs a non-production
   * build, a non-Vercel host, and an explicit opt-in, see `lib/dev-auth-bypass`
   * — AND there is no real session cookie, so an actual local login keeps its
   * own identity and its own RLS boundaries.
   */
  if (DEV_AUTH_BYPASS && !hasSupabaseSessionCookie(cookieStore)) {
    return createSupabaseAdminClient();
  }

  const { url, key } = getSupabaseEnv();

  return createServerClient(url, key, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet: CookieToSet[]) {
        cookiesToSet.forEach(({ name, value, options }) => {
          try {
            cookieStore.set(name, value, options as never);
          } catch {
            // The `set` method was called from a Server Component.
            // This can be ignored if you have middleware refreshing
            // user sessions, or the layout already handled it.
          }
        });
      },
    },
  });
});

/**
 * Supabase keeps the session in one or more `sb-<project-ref>-auth-token`
 * cookies — a large token is split across `.0`, `.1` suffixes — so match on the
 * shape rather than an exact name.
 */
function hasSupabaseSessionCookie(cookieStore: { getAll(): { name: string }[] }) {
  return cookieStore
    .getAll()
    .some((cookie) => cookie.name.startsWith("sb-") && cookie.name.includes("auth-token"));
}
