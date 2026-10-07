"use client";

import { useMemo, type ReactNode } from "react";
import { PersistQueryClientProvider, type Persister, type PersistedClient } from "@tanstack/react-query-persist-client";
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
let persistenceEpoch = 0;

export function clearPersistedCache() {
  persistenceEpoch += 1;
  try {
    const userId = window.localStorage.getItem(ACTIVE_USER_KEY);
    window.localStorage.removeItem(persistedCacheKey(userId));
    window.localStorage.removeItem(persistedCacheKey(null));
    window.localStorage.removeItem(ACTIVE_USER_KEY);
  } catch {
    /* no storage, nothing to erase */
  }
}

/** Restore without changing provider type, and save away from button clicks.
 * Every deferred write captures its account and is discarded after sign-out or
 * an account change. Storage is first accessed from the provider's effect.
 */
export function createAccountPersister(getStorage: () => Storage | undefined = safeStorage): Persister {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let idle: number | undefined;
  const cancel = () => {
    if (timer !== undefined) clearTimeout(timer);
    if (idle !== undefined && typeof window.cancelIdleCallback === "function") window.cancelIdleCallback(idle);
    timer = undefined;
    idle = undefined;
  };
  return {
    persistClient: (client: PersistedClient) => {
      cancel();
      let storage: Storage | undefined;
      let userId: string | null;
      try {
        storage = getStorage();
        if (!storage) return;
        userId = storage.getItem(ACTIVE_USER_KEY);
      } catch { return; }
      const epoch = persistenceEpoch;
      const save = () => {
        idle = undefined;
        try {
          if (epoch !== persistenceEpoch || storage.getItem(ACTIVE_USER_KEY) !== userId) return;
          storage.setItem(persistedCacheKey(userId), JSON.stringify(client));
        } catch {
          // A full or disabled storage falls back to the in-memory cache.
        }
      };
      timer = setTimeout(() => {
        timer = undefined;
        if (typeof window.requestIdleCallback === "function") idle = window.requestIdleCallback(save, { timeout: 2000 });
        else save();
      }, 1500);
    },
    restoreClient: () => {
      try {
        const storage = getStorage();
        const raw = storage?.getItem(persistedCacheKey(storage.getItem(ACTIVE_USER_KEY)));
        return raw ? JSON.parse(raw) as PersistedClient : undefined;
      } catch {
        return undefined;
      }
    },
    removeClient: () => {
      cancel();
      try {
        const storage = getStorage();
        if (storage) storage.removeItem(persistedCacheKey(storage.getItem(ACTIVE_USER_KEY)));
      } catch {
        // Storage may become unavailable after restoration.
      }
    },
  };
}

export function QueryProvider({ children }: { children: ReactNode }) {
  const queryClient = getQueryClient();
  const persistOptions = useMemo(() => ({
    persister: createAccountPersister(),
    maxAge: PERSIST_MAX_AGE,
    buster: CACHE_BUSTER,
    dehydrateOptions: { shouldDehydrateQuery: shouldPersistQuery },
  }), []);

  return (
    <PersistQueryClientProvider client={queryClient} persistOptions={persistOptions}>
      <QueryBootReconcile />
      {children}
      <QueryDevtools />
    </PersistQueryClientProvider>
  );
}
