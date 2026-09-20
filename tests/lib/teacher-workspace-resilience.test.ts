import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The creator workspace stopped opening in production on 2026-09-16, and none of
 * it was the workspace's fault.
 *
 * What the nginx log showed: 105 `/api/v1/practice/topics` requests inside two
 * seconds (35 subjects x three concurrent renders), then three seconds later the
 * four `/v1/collection/*` reads the creator page is built from, every one of
 * them abandoned at the client timeout. In-process on the same box those four
 * reads cost 0.15s each. They were not slow; they were behind a burst.
 *
 * Two rules came out of that, and this file is both of them:
 *
 *  1. A fan-out over subjects goes through a gate, so a page cannot hand a
 *     one-worker backend more work than it can start.
 *  2. A workspace read that fails transiently falls back to the last one that
 *     succeeded, so a busy backend costs freshness rather than the whole screen.
 */

const mocks = vi.hoisted(() => ({
  request: vi.fn(),
  getTenantApiEnv: vi.fn(() => ({
    baseUrl: "https://tenant.example",
    token: "tenant-token",
    rejectUnauthorized: false,
    timeoutMs: 30000,
  })),
}));

vi.mock("@/lib/env", () => ({ getTenantApiEnv: mocks.getTenantApiEnv }));
vi.mock("@/lib/api-request-tracking", () => ({
  trackApiRequest: (_kind: string, run: () => Promise<unknown>) => run(),
}));
vi.mock("@/lib/http-agents", () => ({ agentFor: () => undefined, transportFor: () => ({ request: mocks.request }) }));

import { createLimiter } from "@/lib/http/limit";

describe("createLimiter", () => {
  it("never runs more than the ceiling at once, and still runs everything", async () => {
    const gate = createLimiter(4);
    let running = 0;
    let peak = 0;
    const release: Array<() => void> = [];

    const tasks = Array.from({ length: 35 }, (_, index) =>
      gate(async () => {
        running += 1;
        peak = Math.max(peak, running);
        await new Promise<void>((resolve) => release.push(resolve));
        running -= 1;
        return index;
      }),
    );

    // Drain in waves, exactly as the backend would.
    for (let wave = 0; wave < 40 && release.length; wave += 1) {
      release.splice(0).forEach((resolve) => resolve());
      await new Promise((resolve) => setTimeout(resolve, 0));
    }

    await expect(Promise.all(tasks)).resolves.toHaveLength(35);
    expect(peak).toBe(4);
  });

  it("releases the slot when a task rejects, so one failure cannot close the gate", async () => {
    const gate = createLimiter(1);
    await expect(gate(async () => { throw new Error("upstream down"); })).rejects.toThrow("upstream down");
    await expect(gate(async () => "second")).resolves.toBe("second");
  });

  it("treats a ceiling below one as one rather than wedging shut", async () => {
    const gate = createLimiter(0);
    await expect(gate(async () => "ran")).resolves.toBe("ran");
  });
});

describe("readTeacherWorkspace", () => {
  let client: typeof import("@/lib/teacher-app/client");

  beforeEach(async () => {
    vi.resetModules();
    client = await import("@/lib/teacher-app/client");
    client.clearTeacherWorkspaceSnapshots();
  });

  afterEach(() => {
    mocks.request.mockReset();
  });

  /** One fake HTTPS round trip: `body` on success, `status` for an error. */
  function reply(bodyFor: (path: string) => { status: number; body: unknown }) {
    mocks.request.mockImplementation((url: URL, _options: unknown, onResponse: (response: unknown) => void) => {
      const { status, body } = bodyFor(url.pathname);
      queueMicrotask(() => {
        const handlers: Record<string, (chunk?: unknown) => void> = {};
        onResponse({
          statusCode: status,
          setEncoding() {},
          on(event: string, handler: (chunk?: unknown) => void) {
            handlers[event] = handler;
          },
        });
        handlers.data?.(JSON.stringify(body));
        handlers.end?.();
      });
      return { setTimeout() {}, on() {}, write() {}, end() {}, destroy() {} };
    });
  }

  const ok = (path: string) => ({ status: 200, body: { path, ok: true } });

  it("reads all four and reports nothing stale when the service answers", async () => {
    reply(ok);
    const workspace = await client.readTeacherWorkspace("collection-secret");
    expect(workspace.stale).toBe(false);
    expect(workspace.collection).toMatchObject({ path: "/v1/collection/me" });
    expect(workspace.sourceTree).toMatchObject({ path: "/v1/collection/source-tree" });
  });

  it("serves the last good read when one call fails transiently, and says it is stale", async () => {
    reply(ok);
    await client.readTeacherWorkspace("collection-secret");

    // The source tree is now the one behind the burst.
    reply((path) => (path.endsWith("source-tree") ? { status: 504, body: { detail: "timeout" } } : ok(path)));
    const workspace = await client.readTeacherWorkspace("collection-secret");

    expect(workspace.stale).toBe(true);
    expect(workspace.sourceTree).toMatchObject({ path: "/v1/collection/source-tree" });
    // The three that answered are the fresh ones, not the snapshot.
    expect(workspace.subjects).toMatchObject({ path: "/v1/collection/subjects" });
  });

  it("lets a rejected key through instead of hiding it behind a snapshot", async () => {
    reply(ok);
    await client.readTeacherWorkspace("collection-secret");

    reply((path) => (path.endsWith("/me") ? { status: 401, body: { detail: "Unauthorized" } } : ok(path)));

    // 401 is the one error the teacher can act on — the route turns it into
    // "ask an administrator to rotate it". A snapshot would swallow it for a
    // quarter of an hour and let them edit a workspace they cannot write to.
    await expect(client.readTeacherWorkspace("collection-secret")).rejects.toMatchObject({ status: 401 });
  });

  it("fails honestly when it has no snapshot to fall back to", async () => {
    reply(() => ({ status: 503, body: { detail: "busy" } }));
    await expect(client.readTeacherWorkspace("collection-secret")).rejects.toMatchObject({ status: 503 });
  });

  it("keeps one teacher's snapshot away from another's", async () => {
    reply((path) => ({ status: 200, body: { path, owner: "first" } }));
    await client.readTeacherWorkspace("first-secret");

    reply(() => ({ status: 503, body: { detail: "busy" } }));
    await expect(client.readTeacherWorkspace("second-secret")).rejects.toMatchObject({ status: 503 });
  });
});

/**
 * A busy pool's "retry shortly" only works if the caller waits that long.
 *
 * The tenant API refuses a saturated burst immediately — the alternative it was
 * built to avoid is holding the caller for four minutes and then being dropped
 * by nginx — and says in `Retry-After` how long the queue in front of them is.
 * The client's own backoff starts at 250ms, which for a pool whose calls run for
 * tens of seconds is not a recovery, it is a second rejection.
 */
describe("a refusal that says how long to wait", () => {
  let client: typeof import("@/lib/teacher-app/client");

  beforeEach(async () => {
    vi.resetModules();
    client = await import("@/lib/teacher-app/client");
    mocks.request.mockReset();
  });

  it("waits as long as the API asked before retrying, not its own 250ms", async () => {
    vi.useFakeTimers();
    try {
      // Only this route's attempts: other suites in this file leave workspace
      // reads retrying in the background, and they share this transport mock.
      const attempts: number[] = [];
      mocks.request.mockImplementation(
        (url: URL, _options: unknown, onResponse: (response: unknown) => void) => {
          const mine = url.pathname.endsWith("/challenge/past-questions");
          if (mine) attempts.push(Date.now());
          const first = mine && attempts.length === 1;
          queueMicrotask(() => {
            const handlers: Record<string, (chunk?: unknown) => void> = {};
            onResponse({
              statusCode: first ? 429 : 200,
              headers: first ? { "retry-after": "5" } : {},
              setEncoding() {},
              on(event: string, handler: (chunk?: unknown) => void) {
                handlers[event] = handler;
              },
            });
            handlers.data?.(JSON.stringify(first ? { detail: "busy" } : { can_start: true }));
            handlers.end?.();
          });
          return { setTimeout() {}, on() {}, write() {}, end() {}, destroy() {} };
        },
      );

      const pending = client.getTeacherChallengePastQuestions("collection-secret", {
        subject: "Nims",
        topics: [],
      });
      await vi.advanceTimersByTimeAsync(5_000);
      await expect(pending).resolves.toMatchObject({ can_start: true });

      expect(attempts).toHaveLength(2);
      // Five seconds, because that is what the header said — not 250ms.
      expect(attempts[1] - attempts[0]).toBeGreaterThanOrEqual(5_000);
    } finally {
      vi.useRealTimers();
    }
  });
});
