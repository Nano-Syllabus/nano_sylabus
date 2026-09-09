"use client";

import { useQuery } from "@tanstack/react-query";
import type { QueryClient } from "@tanstack/react-query";
import { queryFetcher, queryString } from "@/lib/query/api";
import { keys } from "@/lib/query/keys";
import { STALE } from "@/lib/query/client";
import type { StudentDailyDashboard } from "@/lib/data/student-daily-dashboard";

type DashboardPayload = { dashboard: StudentDailyDashboard };

/**
 * The query definition, shared by the hook and the prefetch.
 *
 * They MUST agree on `staleTime`. A prefetch written with a shorter one seeds
 * an entry the hook immediately considers stale and refetches — which looks
 * exactly like the prefetch never happened, and is the classic way to make
 * warming a cache appear useless.
 */
export function dashboardQuery(community?: string) {
  return {
    queryKey: keys.student.dashboard(community),
    queryFn: queryFetcher<DashboardPayload>(
      `/api/student/dashboard${queryString({ community })}`,
    ),
    /**
     * A minute. The dashboard is the app's home, so it is the screen a student
     * returns to most — between a challenge, after chat, on every back
     * gesture — and each of those returns used to be a fresh 1.5s server read
     * behind a full-page skeleton.
     *
     * Sixty seconds rather than thirty because the correctness of this screen
     * does not rest on the window: everything that changes it (submitting a
     * challenge, switching community) invalidates the key directly. The window
     * only decides how long a passive revisit is free.
     */
    staleTime: 60_000,
  } as const;
}

/**
 * The dashboard, cached across navigations.
 *
 * `initialData` is what makes the first visit free: the server component has
 * already computed this for its own render, so it passes it in and the query
 * starts populated rather than pending. `initialDataUpdatedAt` is the half
 * people forget — without it the seeded entry is treated as having been
 * fetched at time zero, so it is instantly stale and refetches on mount,
 * throwing away the very work that was just handed over.
 */
export function useDashboard(community: string | undefined, initial?: StudentDailyDashboard) {
  return useQuery({
    ...dashboardQuery(community),
    initialData: initial ? { dashboard: initial } : undefined,
    initialDataUpdatedAt: initial ? Date.now() : undefined,
    /**
     * Keep the previous community's dashboard on screen while the newly
     * selected one loads. Switching community is the one case where the key
     * changes under a mounted component, and without this the whole page
     * blanks to a skeleton mid-interaction.
     */
    placeholderData: (previous) => previous,
  });
}

/**
 * Warm the dashboard before it is asked for — called on hover/focus of the
 * sidebar link. `prefetchQuery` is a no-op when the entry is present and
 * fresh, so firing it on every pointer-enter costs nothing after the first.
 */
export function prefetchDashboard(client: QueryClient, community?: string) {
  return client.prefetchQuery(dashboardQuery(community));
}
