"use client";

import { getSupabaseEnv } from "@/lib/env";
import { loadSupabaseBrowserClient } from "@/lib/supabase/browser-lazy";

/**
 * Sign out without waiting on the network.
 *
 * `auth.signOut()` asks the auth server to revoke the session first and only
 * then clears the cookies, so on a slow connection the Log out button sat there
 * doing nothing. Clearing the session here is local and immediate; the server
 * revoke still happens, in the background, so the old token stops working
 * rather than merely being forgotten by this browser.
 */
export async function fastSignOut() {
  const supabase = await loadSupabaseBrowserClient();
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  await supabase.auth.signOut({ scope: "local" });
  if (!token) return;
  try {
    const { url, key } = getSupabaseEnv();
    void fetch(`${url}/auth/v1/logout?scope=local`, {
      method: "POST",
      keepalive: true,
      headers: { apikey: key, Authorization: `Bearer ${token}` },
    }).catch(() => undefined);
  } catch {
    /* The browser session is already gone; the token expires on its own. */
  }
}
