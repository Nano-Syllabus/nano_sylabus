"use client";

import { useCallback } from "react";
import { useRouter } from "next/navigation";

/**
 * Re-renders the server payload. Does **not** touch the query cache.
 *
 * WHY THE QUERY CACHE IS LEFT ALONE
 * ---------------------------------
 * This used to invalidate the whole `["student", …]` subtree on the theory that
 * over-invalidating was the safe direction — a background refetch nobody sees,
 * versus a number that is quietly wrong.
 *
 * That theory is wrong for this app. The rule here is that cached data lives
 * for the life of the page load and writes patch it in place; a student's data
 * only moves when the student acts, and when they act *in this app* the write
 * already updated the cache. So an invalidation after a write does not correct
 * anything — it spends a request to be told what the client just wrote, and the
 * student pays for it in latency on the screen they are looking at.
 *
 * Screens that still read through server components need their RSC payload
 * re-rendered, and that is all this does now. The challenges recovery retry
 * (`needsRecovery` in `challenges-dashboard-client.tsx`) depends on it: when the
 * list comes back empty because topic data was not ready yet, re-rendering the
 * server tree is the only way to try again.
 *
 * If a screen's number goes stale after a write, patch it the way
 * `useDashboardPatch()` does. Do not reintroduce an invalidation here.
 */
export function useAppRefresh() {
  const router = useRouter();
  return useCallback(() => {
    router.refresh();
  }, [router]);
}
