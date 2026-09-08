/**
 * A server-side memo with single-flight and stale-while-revalidate.
 *
 * WHY NOT `unstable_cache` OR `React.cache`
 * -----------------------------------------
 * `React.cache` is per-render: two components in one page share a result, and
 * the next request starts from nothing. That is deduplication, not caching, and
 * it does nothing for the case that hurts here — twenty students hitting
 * `/api/tenant/catalog` within a minute, each paying the same two upstream
 * calls to a VPS in another country.
 *
 * `unstable_cache` does cache across requests, but it serialises through the
 * Next data cache, which on a self-hosted deployment is a filesystem write and
 * read per entry, and it has no stale-while-revalidate semantics of its own —
 * a request that arrives after the TTL expires waits for the full upstream
 * round trip. That wait is the thing being removed.
 *
 * WHAT THIS DOES INSTEAD
 * ----------------------
 * Three properties, and each one exists because of a specific failure:
 *
 *   FRESH (age < ttl)     -> return the value. No upstream call.
 *   STALE (age < ttl+swr) -> return the value NOW and refresh behind it. The
 *                            student never waits for a revalidation; only the
 *                            first request after `ttl + swr` pays full price.
 *   COLD                  -> await the loader. Concurrent callers join the
 *                            SAME promise rather than each starting their own,
 *                            which is what stops a cold start under load from
 *                            becoming twenty simultaneous requests to a backend
 *                            that is already the slow part.
 *
 * A REJECTED LOAD IS NOT CACHED. `tenantSubjectsInFlight` in lib/tenant/client.ts
 * gets this right and it is worth restating: storing a rejection would turn one
 * upstream blip into `ttl` seconds of guaranteed failure for everyone. A
 * background refresh that fails keeps the stale value and logs — serving
 * five-minute-old subject names beats serving an error page.
 *
 * SCOPE: one Node process, in memory. Deliberately. Multiple instances each
 * keep their own copy, which for read-mostly editorial data means at worst N
 * upstream calls per TTL instead of one — still orders of magnitude better than
 * per-request, and it needs no Redis to operate. Anything that must be coherent
 * across instances does not belong here.
 */

type Entry<T> = {
  value: T;
  /** When the loader that produced this value returned. */
  storedAt: number;
  /** When the value stops being fresh. */
  freshUntil: number;
  /** When it stops being servable at all. */
  staleUntil: number;
  /** A refresh already running for this key, so only one is ever in flight. */
  refreshing?: Promise<T>;
};

const store = new Map<string, Entry<unknown>>();
const inFlight = new Map<string, Promise<unknown>>();

export type MemoOptions = {
  /** Seconds the value is served without any upstream call. */
  ttlSeconds: number;
  /** Seconds past `ttl` the value is still served, while refreshing behind it. */
  staleSeconds?: number;
};

function now() {
  return Date.now();
}

async function refresh<T>(key: string, loader: () => Promise<T>, options: MemoOptions) {
  const value = await loader();
  const at = now();
  store.set(key, {
    value,
    storedAt: at,
    freshUntil: at + options.ttlSeconds * 1000,
    staleUntil: at + (options.ttlSeconds + (options.staleSeconds ?? 0)) * 1000,
  });
  return value;
}

/**
 * The value for `key`, computed by `loader` at most once per TTL per process.
 *
 * `loader` must be a pure read. Anything that writes, or that depends on the
 * signed-in user, does not belong behind a process-wide key — the key is the
 * whole identity of the entry, and two users sharing a key share an answer.
 */
export async function memo<T>(
  key: string,
  loader: () => Promise<T>,
  options: MemoOptions,
): Promise<T> {
  const entry = store.get(key) as Entry<T> | undefined;
  const at = now();

  if (entry && at < entry.freshUntil) return entry.value;

  if (entry && at < entry.staleUntil) {
    // Serve the stale value immediately and start one refresh behind it. The
    // `.catch` is not optional: an unhandled rejection on a promise nobody
    // awaits is a process-level crash in Node, and this promise is by
    // construction never awaited by the request that started it.
    if (!entry.refreshing) {
      entry.refreshing = refresh(key, loader, options)
        .catch((error) => {
          console.error(`[memo] background refresh failed for ${key}`, error);
          return entry.value;
        })
        .finally(() => {
          delete entry.refreshing;
        });
    }
    return entry.value;
  }

  // Cold, or past the stale window. Everyone who arrives now waits on ONE load.
  const existing = inFlight.get(key) as Promise<T> | undefined;
  if (existing) return existing;

  const load = refresh(key, loader, options).finally(() => {
    inFlight.delete(key);
  });
  inFlight.set(key, load);
  return load;
}

/**
 * Drop one key, or every key under a prefix.
 *
 * Called from the mutation that makes an entry wrong — publishing a subject,
 * changing a plan price. Prefix form because a catalog is usually cached under
 * several derived keys and forgetting one of them is a stale page nobody can
 * explain.
 */
export function invalidateMemo(prefix: string) {
  for (const key of store.keys()) {
    if (key === prefix || key.startsWith(`${prefix}:`)) store.delete(key);
  }
  for (const key of inFlight.keys()) {
    if (key === prefix || key.startsWith(`${prefix}:`)) inFlight.delete(key);
  }
}

/** Everything, for tests. */
export function clearMemo() {
  store.clear();
  inFlight.clear();
}

/** What is cached right now, for the dev HUD and for tests. */
export function memoStats() {
  const at = now();
  return [...store.entries()].map(([key, entry]) => ({
    key,
    fresh: at < entry.freshUntil,
    ageMs: at - entry.storedAt,
    refreshing: Boolean(entry.refreshing),
  }));
}
