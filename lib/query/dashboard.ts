"use client";

import { useMemo } from "react";
import { useSearchParams } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
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
export function dashboardQuery(community?: string, month?: string) {
  return {
    queryKey: keys.student.dashboard(community, month),
    queryFn: queryFetcher<DashboardPayload>(
      `/api/student/dashboard${queryString({ community, month })}`,
    ),
    /**
     * FETCHED ONCE PER PAGE LOAD, THEN NEVER AGAIN.
     *
     * `Infinity` means no timer, no refetch on mount, no refetch on
     * navigation — the dashboard a student sees is the one this tab fetched,
     * for the life of the tab. A full reload is what refreshes it.
     *
     * That is only defensible because the writes that move these numbers patch
     * the cache directly (see the LOCAL UPDATES section below): finishing a
     * challenge increments the counter, fills today's calendar cell and bumps
     * the streak in place, in the same tick, with no request. The alternative —
     * a short window plus invalidation — meant the student watched a 2s reload
     * of the whole screen every time they did the one thing the screen is for.
     *
     * The honest limit: something changed in ANOTHER tab, or by an admin, is
     * not picked up until reload. For a personal study dashboard that is the
     * right trade; `invalidateDashboard` exists for the cases where it is not.
     */
    staleTime: Infinity,
    /** Nothing here is worth a background refetch either. */
    refetchOnReconnect: false,
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
export function useDashboard(
  community: string | undefined,
  initial?: StudentDailyDashboard,
  month?: string,
) {
  return useQuery({
    ...dashboardQuery(community, month),
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
export function prefetchDashboard(client: QueryClient, community?: string, month?: string) {
  return client.prefetchQuery(dashboardQuery(community, month));
}

/* ─────────────────────────────────────────────────────────────────────────────
   LOCAL UPDATES

   The dashboard is fetched once per page load and then never again (see
   `staleTime` above). That is only tenable if the things a student does while
   looking at it are reflected WITHOUT a round trip — otherwise the numbers
   quietly drift and the screen lies until the next reload.

   So every write that moves a dashboard figure patches the cached object
   directly. The rules these follow:

   - PATCH, NEVER INVALIDATE. Invalidating would refetch, which is the 2s wait
     this whole design exists to remove.
   - Mirror what the server would have computed, not something close enough.
     Where that is impossible (a leaderboard rank depends on everyone else's
     activity, which this client cannot know), leave the value alone rather
     than inventing one — a stale rank is honest, a guessed one is not.
   - Be a pure function of the previous cache entry. `setQueryData` with an
     updater is applied atomically, so two completions in quick succession
     compose instead of racing.
   ────────────────────────────────────────────────────────────────────────── */

/** Today's entry in the activity calendar, or -1. */
function todayIndex(activity: StudentDailyDashboard["activity"]) {
  return activity.findIndex((day) => day.isToday);
}

/**
 * Reflect a challenge the student just passed, without refetching.
 *
 * Moves everything the server would have moved for a completion:
 *   - `todayChallengeCompletions`, which drives the "Today" tile
 *   - today's calendar cell (an attempt and a completion, and its status)
 *   - the challenge's own row, so it stops appearing as available
 *   - `currentStreak`, but ONLY on the day's first completion — a second
 *     challenge today does not extend a streak, and incrementing per
 *     completion is the obvious bug this guard exists to prevent
 */
export function applyChallengeCompletion(
  client: QueryClient,
  community: string | undefined,
  input: { challengeId?: string } = {},
  month?: string,
) {
  client.setQueryData<DashboardPayload>(keys.student.dashboard(community, month), (previous) => {
    if (!previous) return previous;
    const d = previous.dashboard;

    const index = todayIndex(d.activity);
    const today = index >= 0 ? d.activity[index] : null;
    const firstToday = (today?.completions ?? d.todayChallengeCompletions) === 0;

    const activity =
      index < 0
        ? d.activity
        : d.activity.map((day, i) =>
            i === index
              ? {
                  ...day,
                  attempts: day.attempts + 1,
                  completions: day.completions + 1,
                  // The calendar's own vocabulary — see DailyActivityStatus.
                  status: "completed" as const,
                }
              : day,
          );

    return {
      dashboard: {
        ...d,
        todayChallengeCompletions: d.todayChallengeCompletions + 1,
        activity,
        challenge: {
          ...d.challenge,
          currentStreak: firstToday ? d.challenge.currentStreak + 1 : d.challenge.currentStreak,
          challenges: input.challengeId
            ? d.challenge.challenges.map((c) =>
                c.id === input.challengeId ? { ...c, status: "completed" as const } : c,
              )
            : d.challenge.challenges,
        },
      },
    };
  });
}

/**
 * Reflect a practice attempt that did not pass.
 *
 * Same shape as above minus the completion: the calendar records that the day
 * was worked on, the streak does not move, and nothing else changes.
 */
export function applyPracticeAttempt(
  client: QueryClient,
  community: string | undefined,
  month?: string,
) {
  client.setQueryData<DashboardPayload>(keys.student.dashboard(community, month), (previous) => {
    if (!previous) return previous;
    const d = previous.dashboard;
    const index = todayIndex(d.activity);
    if (index < 0) return previous;

    return {
      dashboard: {
        ...d,
        activity: d.activity.map((day, i) =>
          i === index
            ? {
                ...day,
                attempts: day.attempts + 1,
                status: day.completions > 0 ? day.status : ("started" as const),
              }
            : day,
        ),
      },
    };
  });
}

/**
 * The one deliberate escape hatch: throw the cached dashboard away.
 *
 * For the rare case where local reasoning cannot be trusted — a student
 * rejoining a different community, or an admin action landing mid-session.
 * Everything routine should use the patches above instead.
 */
export function invalidateDashboard(client: QueryClient) {
  return client.invalidateQueries({ queryKey: ["student", "dashboard"] });
}

/**
 * The patch helpers, bound to the community the dashboard is actually keyed by.
 *
 * WHY THIS HOOK EXISTS RATHER THAN CALLERS PASSING A SLUG. The dashboard's
 * cache key is the community the URL ASKED for — `undefined` when there is no
 * `?community=` — not the one it resolved to. A caller that reasonably passed
 * the resolved slug would patch a different entry from the one on screen, and
 * the write would silently do nothing. That exact mismatch already cost a
 * round trip once, when the sidebar prefetched `["student","dashboard",""]`
 * while the page read `["student","dashboard","bct"]`.
 *
 * Deriving it here, from the same `searchParams` the page uses, means there is
 * one definition of the key and no call site can get it wrong.
 */
export function useDashboardPatch() {
  const client = useQueryClient();
  const searchParams = useSearchParams();
  const community = searchParams.get("community") || undefined;
  const month = searchParams.get("month") || undefined;

  return useMemo(
    () => ({
      /** A challenge just passed. */
      completed: (input?: { challengeId?: string }) =>
        applyChallengeCompletion(client, community, input, month),
      /** An attempt that did not pass. */
      attempted: () => applyPracticeAttempt(client, community),
    }),
    [client, community, month],
  );
}
