"use client";

import { useEffect } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { prefetchDashboard } from "@/lib/query/dashboard";
import {
  WARM_GAP_MS,
  connectionAllowsWarming,
  routesToWarm,
} from "@/lib/prefetch/warm-tabs";

/**
 * Render the other tabs on the server while the student reads this one.
 *
 * WHAT THIS BUYS
 * --------------
 * `staleTimes.dynamic` keeps a tab's RSC payload for the whole page load, so
 * returning to a tab is free. But the FIRST visit to each tab still cost a
 * server render — measured 418-682ms with a `loading.tsx` shimmer over it. That
 * is the only remaining stall in ordinary navigation, and it is avoidable: the
 * student sits on the dashboard for seconds before clicking anything, and the
 * server is idle for all of them.
 *
 * So each tab is rendered ahead of time and its payload dropped into the Router
 * Cache. By the time the student clicks, the page is already in memory and
 * paints on the first frame — no request, no shimmer.
 *
 * WHY `router.prefetch` AND NOT `<Link prefetch>`
 * ----------------------------------------------
 * They are not the same prefetch. A `<Link>` on a dynamic route defaults to
 * fetching only as far as the nearest `loading.tsx` — it warms the SKELETON and
 * stops. Every route here has a `loading.tsx`, so the sidebar's Community and
 * Challenge links were prefetching a shimmer and nothing else. `router.prefetch`
 * in the App Router is a full prefetch: it renders past the boundary and brings
 * back the real page.
 *
 * `<Link prefetch={true}>` would also work, but it fires the moment the link
 * enters the viewport — which for a sidebar is immediately, all of them at
 * once, competing with the render of the page the student is actually looking
 * at. Doing it here buys the idle wait and the ordering below.
 *
 * MEASURING THIS
 * --------------
 * **Next disables prefetching in `next dev`.** `router.prefetch()` is a no-op
 * there, so this component does nothing you can observe with the dev server —
 * verified by watching the network during a 7s dwell and seeing zero requests.
 * Its effect only appears against `next build && next start`. The dashboard
 * data prefetch below is ordinary `fetch` and does work in dev.
 */
export function TabWarmer() {
  const router = useRouter();
  const pathname = usePathname();
  const queryClient = useQueryClient();
  const searchParams = useSearchParams();
  /**
   * The dashboard query is keyed by the REQUESTED community, not the resolved
   * one — the same rule `today/page.tsx` follows. Warming under a different key
   * fills an entry the page will never read, which is a bug that already
   * happened once and showed up as the dashboard being fetched twice.
   */
  const community = searchParams.get("community") || undefined;

  useEffect(() => {
    /**
     * Once per page load, not once per mount.
     *
     * The Router Cache holds these for the life of the page load, so a second
     * pass would re-render every tab on the server to overwrite entries that
     * are already correct. The shell remounts on navigation; this key does not.
     */
    const w = window as Window & { __nsTabsWarmed?: boolean };
    if (w.__nsTabsWarmed) return;

    const connection = (
      navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string } }
    ).connection;
    if (!connectionAllowsWarming(connection)) return;
    w.__nsTabsWarmed = true;

    const timers: number[] = [];
    let cancelled = false;

    /** `requestIdleCallback` where it exists, a timeout where it does not (Safari). */
    const ric = (
      window as Window & {
        requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
      }
    ).requestIdleCallback;

    const start = () => {
      if (cancelled) return;
      routesToWarm(pathname).forEach((route, index) => {
        timers.push(
          window.setTimeout(() => {
            if (cancelled) return;
            router.prefetch(route);
            /**
             * The route payload and the data behind it are two different
             * caches. Since `today/page.tsx` became a shell its RSC payload is
             * cheap and the dashboard read is the part that takes time, so
             * prefetching the route alone would still leave a click waiting on
             * the query. This half works in dev too.
             */
            if (route === "/app/today") void prefetchDashboard(queryClient, community);
          }, index * WARM_GAP_MS),
        );
      });
    };

    let cancelIdle: () => void;
    if (ric) {
      const handle = ric(start, { timeout: 2_000 });
      cancelIdle = () =>
        (window as Window & { cancelIdleCallback?: (h: number) => void }).cancelIdleCallback?.(
          handle,
        );
    } else {
      const handle = window.setTimeout(start, 1_500);
      cancelIdle = () => window.clearTimeout(handle);
    }

    return () => {
      cancelled = true;
      cancelIdle();
      for (const timer of timers) window.clearTimeout(timer);
    };
    // Runs once per page load by design — the window key guards re-entry, and
    // listing the navigation values here would re-run it on every tab change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}
