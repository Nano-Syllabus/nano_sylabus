"use client";

import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Fetches the Supabase browser client on demand.
 *
 * `@supabase/supabase-js` is roughly 180kB of JavaScript, 50kB over the wire.
 * The app shell, the sidebar and the admin shell each imported it statically,
 * and the sidebar renders on every `/app` screen — so every student downloaded
 * the whole auth SDK before first paint to support a Log out button most of
 * them would not press on that visit.
 *
 * This module deliberately holds no static import of the client, so importing
 * it costs nothing. The dynamic `import()` inside becomes its own chunk that is
 * only fetched when something actually needs Supabase in the browser. The
 * client itself is still a singleton — `createSupabaseBrowserClient` memoises
 * it — so repeated calls reuse one instance and one session.
 */
export async function loadSupabaseBrowserClient(): Promise<SupabaseClient> {
  const { createSupabaseBrowserClient } = await import("@/lib/supabase/browser");
  return createSupabaseBrowserClient();
}

/**
 * Starts the fetch without waiting for it.
 *
 * On the auth forms the SDK is not needed until submit, but making someone
 * wait for a 50kB download after they press Sign in would trade page weight
 * for a stall at the worst possible moment. Calling this when the form first
 * gains focus means the chunk is almost always in memory by the time it is
 * needed, and submitting still awaits the same promise if it is not.
 */
export function warmSupabaseBrowserClient() {
  void loadSupabaseBrowserClient().catch(() => {
    // The submit path will retry and surface any real failure.
  });
}
