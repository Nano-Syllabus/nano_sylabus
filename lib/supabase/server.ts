import { cache } from "react";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { getSupabaseEnv } from "@/lib/env";

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
