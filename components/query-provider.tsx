"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { QueryClientProvider } from "@tanstack/react-query";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { createSyncStoragePersister } from "@tanstack/query-sync-storage-persister";
import { getQueryClient, shouldPersistQuery } from "@/lib/query/client";
import { QueryDevtools } from "@/components/query-devtools";
import { QueryBootReconcile } from "@/components/query-boot-reconcile";

/**
 * Bumped by hand when a cached payload's SHAPE changes.
 *
 * The persister replays JSON written by an older build straight into
 * components compiled against the new types, and TypeScript is not there at
 * runtime to notice. A changed buster throws the whole persisted cache away
 * instead, which costs one cold fetch and beats rendering `undefined.map`.
 */
const CACHE_BUSTER = "ns-query-v1";

/** A day. Past this the disk copy is discarded rather than shown. */
const PERSIST_MAX_AGE = 24 * 60 * 60_000;

/**
 * `localStorage`, or nothing at all.
 *
 * Private windows, "block site data", and quota-exhausted origins make the
 * accessor itself throw rather than return null, and a provider that throws
 * while constructing takes the whole app down. Returning `undefined` degrades
 * to an in-memory cache — which is the behaviour without this file — so the
 * worst case of persistence failing is the app as it was.
 */
function safeStorage(): Storage | undefined {
  try {
    const probe = "__ns_q__";
    window.localStorage.setItem(probe, "1");
    window.localStorage.removeItem(probe);
    return window.localStorage;
  } catch {
    return undefined;
  }
}

/**
 * The query cache, and the disk copy of the parts that are safe to keep.
 *
 * WHAT PERSISTENCE BUYS
 * ---------------------
 * A student opening the app on a cold browser cache waits on the tenant API
 * for the published subject catalog before the course browser can render
 * anything. That is the slowest read in the product and its answer is the same
 * for every student. Written to disk once, the next morning paints it
 * immediately and revalidates behind the paint.
 *
 * WHAT IT DELIBERATELY DOES NOT KEEP
 * ----------------------------------
 * Everything else. `shouldDehydrateQuery` in `lib/query/client.ts` only writes
 * a query that asked to be written (`meta: { persist: true }`), so no chat
 * title, invoice, grade or credit balance reaches `localStorage`. That is why
 * one storage key is enough for every account on the machine: nothing written
 * under it is specific to an account. Anything user-specific that is ever
 * marked persistable breaks that invariant — don't.
 *
 * Signing in as a different user still has to clear the IN-MEMORY half, which
 * is keyed by endpoint and does not change when the cookie does. That is
 * `<QueryIdentity>`, rendered by each authenticated layout.
 */
/** Where the id of the account this browser last served is remembered. */
export const ACTIVE_USER_KEY = "ns-active-user";

/** The persisted cache is per account: two students on one browser, two caches. */
export function persistedCacheKey(userId: string | null) {
  return `ns-query-cache:${userId || "anon"}`;
}

/**
 * Erase this browser's cached data. Called on sign-out.
 *
 * The moment that actually matters on a shared machine. Everything a student's
 * screens showed — chat titles, notes, the dashboard, invoices — is written to
 * `localStorage` so the next page load can paint instantly; signing out is the
 * point at which none of it may survive for whoever sits down next.
 *
 * Wrapped because the accessor itself throws in a private window or with site
 * data blocked, and a sign-out must never fail on its way out.
 */
export function clearPersistedCache() {
  try {
    const userId = window.localStorage.getItem(ACTIVE_USER_KEY);
    window.localStorage.removeItem(persistedCacheKey(userId));
    window.localStorage.removeItem(persistedCacheKey(null));
    window.localStorage.removeItem(ACTIVE_USER_KEY);
  } catch {
    /* no storage, nothing to erase */
  }
}

export function QueryProvider({ children }: { children: ReactNode }) {
  const queryClient = getQueryClient();
  const [storage, setStorage] = useState<Storage | undefined>(undefined);
  /**
   * Which account's cache to restore, read from the previous session.
   *
   * The provider sits at the root layout, which does not know who is signed in
   * — but the cache has to be restored on the very first paint, long before any
   * authenticated layout renders. So `<QueryIdentity>` records the id when it
   * mounts and this reads it back on the next load. A first-ever visit falls
   * back to the anonymous key and simply restores nothing.
   */
  const [userId, setUserId] = useState<string | null>(null);

  // Reading `localStorage` during render would differ between the server pass
  // (no storage) and the first client pass (storage), which is a hydration
  // mismatch. The first client render therefore runs without a persister and
  // the real one attaches one commit later.
  useEffect(() => {
    const available = safeStorage();
    setStorage(available);
    if (available) {
      try {
        setUserId(available.getItem(ACTIVE_USER_KEY));
      } catch {
        /* leave it anonymous */
      }
    }
  }, []);

  const persistOptions = useMemo(() => {
    if (!storage) return null;
    return {
      persister: createSyncStoragePersister({
        storage,
        key: persistedCacheKey(userId),
        // Writes are batched. Without a throttle every settled query rewrites
        // the whole serialised cache — a synchronous JSON.stringify on the
        // main thread, during exactly the burst of requests a fresh page load
        // produces.
        throttleTime: 1500,
      }),
      maxAge: PERSIST_MAX_AGE,
      buster: CACHE_BUSTER,
      // The opt-in disk rule lives here, on the PERSISTER, and nowhere else.
      // The client's own `dehydrate` default stays permissive so server-side
      // prefetching can seed the cache — see lib/query/client.ts.
      dehydrateOptions: { shouldDehydrateQuery: shouldPersistQuery },
    };
  }, [storage, userId]);

  if (!persistOptions) {
    return (
      <QueryClientProvider client={queryClient}>
        {children}
        <QueryDevtools />
      </QueryClientProvider>
    );
  }

  return (
    <PersistQueryClientProvider client={queryClient} persistOptions={persistOptions}>
      <QueryBootReconcile />
      {children}
      <QueryDevtools />
    </PersistQueryClientProvider>
  );
}
