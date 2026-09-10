import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The browser now caches a student's OWN data — chat titles, notes, the
 * dashboard, invoices — so a reload can paint instantly instead of waiting on
 * the network. That is only defensible because of the boundary tested here.
 *
 * On a shared campus machine, the thing that matters is not whether the data
 * was written, it is whether it survives the next person sitting down. These
 * tests pin that: caches are per account, and signing out erases them.
 */

function installStorage() {
  const map = new Map<string, string>();
  const storage = {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
    get length() {
      return map.size;
    },
    key: (i: number) => [...map.keys()][i] ?? null,
    clear: () => map.clear(),
  };
  vi.stubGlobal("window", { localStorage: storage });
  return map;
}

describe("persisted cache boundary", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllGlobals();
  });

  it("gives each account its own cache key", async () => {
    installStorage();
    const { persistedCacheKey } = await import("@/components/query-provider");

    expect(persistedCacheKey("user-a")).not.toBe(persistedCacheKey("user-b"));
    // A signed-out visitor must not read, or write into, a real account's entry.
    expect(persistedCacheKey(null)).not.toBe(persistedCacheKey("user-a"));
  });

  it("erases the signed-in account's cache on sign-out", async () => {
    const map = installStorage();
    const { ACTIVE_USER_KEY, persistedCacheKey, clearPersistedCache } = await import(
      "@/components/query-provider"
    );

    map.set(ACTIVE_USER_KEY, "user-a");
    map.set(persistedCacheKey("user-a"), '{"clientState":{"queries":[{"secret":"grades"}]}}');
    map.set(persistedCacheKey(null), '{"clientState":{"queries":[]}}');

    clearPersistedCache();

    expect(map.get(persistedCacheKey("user-a"))).toBeUndefined();
    expect(map.get(persistedCacheKey(null))).toBeUndefined();
    // The pointer goes too, so the next load does not try to restore a
    // cache that is no longer there.
    expect(map.get(ACTIVE_USER_KEY)).toBeUndefined();
  });

  it("never throws when storage is unavailable", async () => {
    // Private windows and "block site data" make the accessor itself throw.
    // A sign-out must not fail on its way out.
    vi.stubGlobal("window", {
      get localStorage(): Storage {
        throw new Error("blocked");
      },
    });
    const { clearPersistedCache } = await import("@/components/query-provider");
    expect(() => clearPersistedCache()).not.toThrow();
  });

  it("persists a student's own data but honours an explicit opt-out", async () => {
    const { shouldPersistQuery } = await import("@/lib/query/client");
    const query = (meta: Record<string, unknown> | undefined) =>
      ({ state: { status: "success", data: {}, fetchStatus: "idle" }, meta }) as never;

    // The default is now to cache — that is the whole point of the model.
    expect(shouldPersistQuery(query(undefined))).toBe(true);
    // …with an escape for anything that must never touch disk.
    expect(shouldPersistQuery(query({ persist: false }))).toBe(false);
  });
});
