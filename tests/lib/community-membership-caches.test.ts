import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { challengeAccessResponse, ChallengeAccessError } from "@/lib/data/challenge-access-error";

/**
 * Joining or leaving a community is the one write with no patch smaller than
 * "forget it": every student screen is scoped to the community. These pin what
 * forgetting means in the browser — and that a lost entitlement is a 403 the
 * hub can act on, not a retryable 502.
 */

class MemoryStorage {
  private values = new Map<string, string>();
  getItem(key: string) {
    return this.values.has(key) ? (this.values.get(key) as string) : null;
  }
  setItem(key: string, value: string) {
    this.values.set(key, String(value));
  }
  removeItem(key: string) {
    this.values.delete(key);
  }
}

const posted: unknown[] = [];
const listeners: Array<(event: { data: unknown }) => void> = [];
class FakeChannel {
  onmessage: ((event: { data: unknown }) => void) | null = null;
  constructor(readonly name: string) {
    queueMicrotask(() => {
      if (this.onmessage) listeners.push(this.onmessage);
    });
  }
  postMessage(message: unknown) {
    posted.push(message);
  }
  close() {}
}

describe("forgetting community-scoped caches", () => {
  let storage: MemoryStorage;
  let events: EventTarget;

  beforeEach(() => {
    vi.resetModules();
    posted.length = 0;
    listeners.length = 0;
    storage = new MemoryStorage();
    events = new EventTarget();
    vi.stubGlobal("window", {
      localStorage: storage,
      addEventListener: events.addEventListener.bind(events),
      dispatchEvent: events.dispatchEvent.bind(events),
    });
    vi.stubGlobal("BroadcastChannel", FakeChannel);
  });
  afterEach(() => vi.unstubAllGlobals());

  it("drops the query cache, its disk copy and the remembered subject picks", async () => {
    const { getQueryClient } = await import("@/lib/query/client");
    const { ACTIVE_USER_KEY, persistedCacheKey } = await import("@/components/query-provider");
    const { forgetCommunityScopedCaches, MEMBERSHIP_CHANGED_EVENT } = await import(
      "@/lib/query/membership"
    );
    const client = getQueryClient();
    client.setQueryData(["student", "dashboard", "v2", ""], { dashboard: { community: "old" } });
    storage.setItem(ACTIVE_USER_KEY, "u1");
    storage.setItem(persistedCacheKey("u1"), "{}");
    storage.setItem("padhai:selected_subject", "Applied Mechanics");
    storage.setItem("ns-revision-subject", "t1:c1:applied-mechanics");
    storage.setItem("ns-answer-font", "caveat");
    const heard = vi.fn();
    events.addEventListener(MEMBERSHIP_CHANGED_EVENT, heard);

    forgetCommunityScopedCaches();

    expect(client.getQueryData(["student", "dashboard", "v2", ""])).toBeUndefined();
    expect(storage.getItem(persistedCacheKey("u1"))).toBeNull();
    expect(storage.getItem("padhai:selected_subject")).toBeNull();
    expect(storage.getItem("ns-revision-subject")).toBeNull();
    // Preferences that are not about a community stay.
    expect(storage.getItem("ns-answer-font")).toBe("caveat");
    expect(heard).toHaveBeenCalledOnce();
    // ...and other open tabs are told, or they would persist their copy back.
    expect(posted).toEqual(["changed"]);
  });

  it("follows a change announced by another tab", async () => {
    const { getQueryClient } = await import("@/lib/query/client");
    const { listenForMembershipChanges, MEMBERSHIP_CHANGED_EVENT } = await import(
      "@/lib/query/membership"
    );
    const client = getQueryClient();
    client.setQueryData(["student", "dashboard", "v2", ""], { stale: true });
    const heard = vi.fn();
    events.addEventListener(MEMBERSHIP_CHANGED_EVENT, heard);

    listenForMembershipChanges();
    listenForMembershipChanges(); // idempotent: one channel, one handler
    await Promise.resolve();
    expect(listeners).toHaveLength(1);
    listeners[0]({ data: "changed" });

    expect(client.getQueryData(["student", "dashboard", "v2", ""])).toBeUndefined();
    expect(heard).toHaveBeenCalledOnce();
    // The receiving tab does not re-broadcast.
    expect(posted).toEqual([]);
  });
});

describe("a challenge whose community was left", () => {
  it("answers 403 with a code the client can act on", async () => {
    const response = challengeAccessResponse(new ChallengeAccessError());
    expect(response?.status).toBe(403);
    expect(await response?.json()).toMatchObject({ code: "access_revoked" });
  });

  it("leaves every other failure to the route's own handling", () => {
    expect(challengeAccessResponse(new Error("upstream down"))).toBeNull();
    expect(challengeAccessResponse({ code: "PGRST" })).toBeNull();
  });
});
