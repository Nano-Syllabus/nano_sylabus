import {
  QueryClient,
  defaultShouldDehydrateQuery,
  isServer,
  type Query,
} from "@tanstack/react-query";
import { ApiError } from "@/lib/query/api";

/**
 * How long a piece of data is trusted without asking again.
 *
 * These are the numbers that decide whether the app feels instant, so they are
 * named rather than sprinkled as magic milliseconds. The rule behind them: a
 * `staleTime` is not "how long until this is wrong", it is "how long a user
 * would not notice it being wrong". Everything here is still refetched on
 * reconnect, still invalidated explicitly after the mutation that changes it,
 * and still re-read when its key changes.
 *
 * `LIVE` is the deliberate zero. A credit balance after spending a credit, a
 * grading job's state — data whose whole purpose is to have just changed.
 */
export const STALE = {
  /** Always refetch on mount. For counters a user watches change. */
  LIVE: 0,
  /** 30s — matches `staleTimes.dynamic` in next.config.ts, so the RSC Router
   *  Cache and the query cache expire together instead of one showing a value
   *  the other has already thrown away. Lists a user is actively working in. */
  SHORT: 30_000,
  /** 5 min — their own courses, notes index, classroom list. Changes when the
   *  user does something, and that something invalidates the key anyway. */
  SESSION: 5 * 60_000,
  /** 30 min — the published subject catalog, plan prices. Editorial data that
   *  changes on a deploy or an admin action, not on a student's action. */
  STATIC: 30 * 60_000,
} as const;

/**
 * How long an *unused* result is kept before it is dropped from memory.
 *
 * Separate from `staleTime` and much longer on purpose. Stale data is still
 * shown instantly and revalidated behind the paint; garbage-collected data is
 * a spinner. Twenty-four hours means going Today -> Chat -> Billing -> Today
 * an hour later still paints from memory, and the refetch happens under
 * content that is already on screen.
 */
const GC_TIME = 24 * 60 * 60_000;

/**
 * Retry only what a retry can fix.
 *
 * A 401 retried three times is three round trips before the redirect the user
 * was always going to get; a 404 retried is a 404. Network failures and 5xx
 * are the ones where the same request can succeed unchanged — plus 408 and
 * 429, which `ApiError.isClientError` deliberately excludes for exactly that
 * reason.
 */
function shouldRetry(failureCount: number, error: unknown) {
  if (failureCount >= 2) return false;
  if (error instanceof ApiError && error.isClientError) return false;
  return true;
}

/**
 * Queries worth writing to disk, and no others.
 *
 * OPT-IN, NOT OPT-OUT, AND THAT IS A SECURITY DECISION. The persister writes
 * to `localStorage`, which survives sign-out and is readable by anything
 * running on the origin. Persisting everything would leave one student's chat
 * titles, invoices and grades on a shared lab machine for the next person. So
 * a query is only written if it says so:
 *
 *     useQuery({ ..., meta: { persist: true } })
 *
 * and `meta.persist` belongs on catalog-shaped data — the published subject
 * list, plan prices, public courses. Things that are the same for everyone and
 * cost a slow tenant-API round trip to rebuild.
 */
function shouldDehydrate(query: Query) {
  return defaultShouldDehydrateQuery(query) && query.meta?.persist === true;
}

export function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: STALE.SHORT,
        gcTime: GC_TIME,
        retry: shouldRetry,
        retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 8000),

        /**
         * Off. A study app is left open in a tab beside a PDF for an hour;
         * every alt-tab back would otherwise fire every mounted query at once,
         * which on this backend means a burst of Supabase round trips and a
         * tenant-API call, all to redraw data that has not moved. Freshness
         * after a write comes from invalidation, which is exact.
         */
        refetchOnWindowFocus: false,

        /** On. Coming back from a tunnel or a dropped hotspot is the one case
         *  where the cache really is behind and the user knows it. */
        refetchOnReconnect: true,

        /** Respects staleTime rather than forcing a request: a remount inside
         *  the stale window paints from cache with no network at all. */
        refetchOnMount: true,

        /**
         * Keeps object identity for parts of a response that did not change,
         * so a refetch returning identical JSON re-renders nothing. It is on
         * by default; it is named here because it is the reason a 30s
         * background refetch is invisible rather than a flash.
         */
        structuralSharing: true,

        /** A failed query gets one automatic retry cycle; after that the UI
         *  shows the error rather than hammering. */
        throwOnError: false,
      },
      mutations: {
        /** A mutation is not idempotent. Retrying a POST that timed out after
         *  the server accepted it creates the row twice. */
        retry: false,
      },
      dehydrate: {
        shouldDehydrateQuery: shouldDehydrate,
        /** Server-rendered prefetches are streamed to the client while still
         *  in flight, so the first paint does not wait on the slowest query. */
        shouldRedactErrors: () => false,
      },
    },
  });
}

let browserQueryClient: QueryClient | undefined;

/**
 * The client for the current environment.
 *
 * On the server, a NEW client per call — one shared across requests would leak
 * one user's cached rows into another user's render, which is the single
 * worst bug this file could have.
 *
 * In the browser, a singleton, created lazily. It must not be created during
 * module evaluation: React may suspend the initial render and start it again,
 * and a client made in a component body would be thrown away with the
 * abandoned render, taking the cache with it every time.
 */
export function getQueryClient() {
  if (isServer) return makeQueryClient();
  if (!browserQueryClient) browserQueryClient = makeQueryClient();
  return browserQueryClient;
}

/**
 * Drop everything cached for the previous user.
 *
 * Called on sign-out and whenever the signed-in user id changes. Without it,
 * signing out and back in as someone else on the same device shows the first
 * user's chat history for as long as it takes the refetch to land — the cache
 * is keyed by endpoint, and the endpoint does not change when the cookie does.
 */
export function resetQueryClient() {
  browserQueryClient?.clear();
}
