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
 * What gets written to the browser's own cache. OPT-OUT, not opt-in.
 *
 * THE MODEL THIS SERVES. Every screen in this app shows one student their own
 * data, and that data only changes when they act. So the browser copy is,
 * overwhelmingly, already correct — and painting from it on load is not a
 * gamble, it is the fast path being taken for the common case. The reconcile
 * that follows fixes the rare drift, silently, under content already on screen.
 * Nothing here is time-sensitive enough for that gap to matter.
 *
 * This used to be opt-in and catalog-only, on the grounds that `localStorage`
 * survives sign-out and is readable on a shared machine. That risk is real and
 * is now handled where it belongs — at the boundary, not by refusing to cache:
 *
 *   - the persisted cache is keyed by user id, so two accounts on one browser
 *     never read each other's entry (components/query-provider.tsx);
 *   - signing out erases it (`clearPersistedCache`), which is the moment that
 *     actually matters on a shared machine;
 *   - it expires on its own after PERSIST_MAX_AGE.
 *
 * `meta: { persist: false }` opts a query out — for anything that should never
 * touch disk regardless (a one-time token, a signed URL).
 */
export function shouldPersistQuery(query: Query) {
  return defaultShouldDehydrateQuery(query) && query.meta?.persist !== false;
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
        /**
         * SSR HYDRATION DEHYDRATES EVERYTHING THAT SUCCEEDED.
         *
         * This used to point at the persister's `meta.persist` rule, which was
         * a real bug with no symptom: `dehydrate()` on the server silently
         * produced an empty state for any query that had not opted into
         * localStorage, so seeding the client cache from a server component
         * appeared to work and delivered nothing. The only reason the settings
         * page's catalog prefetch survived is that it happens to be marked
         * persistable for unrelated reasons.
         *
         * The two rules are answering different questions. Dehydration for SSR
         * asks "did the server already compute this for the render it is about
         * to send?" — and the answer should be yes for everything, because that
         * payload is generated per-request, travels inline in the HTML, and is
         * discarded when the tab closes. Persistence asks "is this safe to
         * leave on a shared machine's disk?", which is a far narrower set.
         */
        shouldDehydrateQuery: defaultShouldDehydrateQuery,
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
