"use client";

import { useCallback } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { keys } from "@/lib/query/keys";

/**
 * `router.refresh()` for an app that now has two caches.
 *
 * WHY THIS EXISTS
 * ---------------
 * `router.refresh()` re-fetches the React Server Component payload. That used
 * to be the whole story, because every screen's data was computed inside its
 * server component. It no longer is: the Daily Dashboard reads through TanStack
 * Query so that returning to it does not cost a server round trip, and a query
 * cache does not know or care that the router just refreshed.
 *
 * So a challenge submitted through `router.refresh()` alone would update the
 * page it was submitted on and leave the dashboard showing yesterday's streak
 * until its own 60s window expired. Both caches have to be told.
 *
 * The invalidation is deliberately broad — the whole `["student", …]` subtree
 * rather than one key. A student action that is worth a refresh (finishing a
 * challenge, joining a course, switching community) moves several of these at
 * once, and the failure mode of invalidating one key too many is a background
 * refetch nobody sees, while the failure mode of missing one is a number that
 * is quietly wrong. Invalidation marks entries stale; it does not blank them,
 * so nothing on screen flashes.
 */
export function useAppRefresh() {
  const router = useRouter();
  const client = useQueryClient();

  return useCallback(() => {
    /**
     * EVERY STUDENT KEY EXCEPT THE DASHBOARD.
     *
     * The dashboard is fetched once per page load and held for the life of the
     * tab (`staleTime: Infinity`), because the writes that move its numbers
     * patch it in place instead — see `useDashboardPatch`. Invalidating it here
     * would undo that: the student would finish a challenge, watch the tile
     * tick up instantly, and then watch the whole screen reload two seconds
     * later to show the same value.
     *
     * `predicate` rather than a narrower key because invalidation is
     * prefix-based: there is no way to say "this subtree minus one branch" with
     * a key alone.
     */
    void client.invalidateQueries({
      predicate: (query) =>
        query.queryKey[0] === "student" && query.queryKey[1] !== "dashboard",
    });
    router.refresh();
  }, [client, router]);
}
