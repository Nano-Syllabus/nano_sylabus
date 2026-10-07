"use client";

import { useEffect } from "react";
import { resetQueryClient } from "@/lib/query/client";
import { ACTIVE_USER_KEY, clearPersistedCache } from "@/components/query-provider";
import { listenForMembershipChanges } from "@/lib/query/membership";

/** Which account the in-memory cache currently holds data for. */
let cachedUserId: string | null = null;

/**
 * Throws the query cache away when the signed-in account changes.
 *
 * The cache is keyed by endpoint — `["billing","invoices"]` is the same key
 * for every user, because the URL is the same for every user and the cookie is
 * what distinguishes them. So signing out and back in as someone else on the
 * same browser (a shared machine, a teacher checking a student's view) would
 * paint the previous account's chat titles and invoices until each refetch
 * landed. Not a leak across origins, but very much one across people, and the
 * kind that shows up in a screenshot.
 *
 * Rendered once by every authenticated layout, which is where a user id is
 * actually known. It renders nothing.
 *
 * The module-level variable rather than component state is deliberate: a
 * layout remounts on navigation and would compare against its own fresh
 * initial value every time, clearing a perfectly good cache on each route
 * change. Module scope survives navigation for as long as the tab does, which
 * is exactly the lifetime of the cache it is guarding.
 */
export function QueryIdentity({ userId }: { userId: string }) {
  // A community joined or left in another tab drops this tab's cache too.
  useEffect(listenForMembershipChanges, []);

  useEffect(() => {
    if (cachedUserId === userId) return;
    let persistedUserId: string | null = null;
    try {
      persistedUserId = window.localStorage.getItem(ACTIVE_USER_KEY);
    } catch { /* storage unavailable */ }
    if ((cachedUserId !== null && cachedUserId !== userId) ||
        (persistedUserId !== null && persistedUserId !== userId)) {
      resetQueryClient();
      clearPersistedCache();
    }
    try {
      window.localStorage.setItem(ACTIVE_USER_KEY, userId);
    } catch { /* persistence is optional */ }
    cachedUserId = userId;
  }, [userId]);

  return null;
}
