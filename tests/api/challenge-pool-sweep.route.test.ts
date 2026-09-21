import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ sweep: vi.fn() }));
vi.mock("@/lib/data/challenge-pool", () => ({ sweepChallengePool: mocks.sweep }));

import { POST } from "@/app/api/internal/challenge-pool/sweep/route";
import { sweepSecret } from "@/lib/data/challenge-pool-secret";

const SECRET = "s3cret-sweep-token";
const call = (authorization?: string) =>
  POST(
    new Request("http://localhost/api/internal/challenge-pool/sweep", {
      method: "POST",
      headers: authorization ? { Authorization: authorization } : {},
    }),
  );

/**
 * The pool sweep is driven by a timer on the VPS and by nothing else: a shared
 * secret is the whole of its authentication, so the route must refuse anything
 * short of it — and be off, not open, when no secret is configured.
 */
describe("POST /api/internal/challenge-pool/sweep", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.CHALLENGE_POOL_SWEEP_SECRET = SECRET;
    mocks.sweep.mockResolvedValue({ available: true, claimed: 2, outcomes: { ready: 2 } });
  });

  afterEach(() => {
    delete process.env.CHALLENGE_POOL_SWEEP_SECRET;
  });

  it("sweeps up to six topics for the timer and reports what happened", async () => {
    const response = await call(`Bearer ${SECRET}`);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ available: true, claimed: 2, outcomes: { ready: 2 } });
    expect(mocks.sweep).toHaveBeenCalledWith({ limit: 6 });
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it.each([
    ["no header", undefined],
    ["an empty bearer", "Bearer "],
    ["the wrong secret", "Bearer not-the-secret"],
    ["a prefix of the secret", `Bearer ${SECRET.slice(0, -1)}`],
    ["the secret without the scheme", SECRET],
  ])("refuses %s", async (_label, header) => {
    const response = await call(header);
    expect(response.status).toBe(401);
    expect(mocks.sweep).not.toHaveBeenCalled();
  });

  it("is off, not open, when no secret is configured", async () => {
    delete process.env.CHALLENGE_POOL_SWEEP_SECRET;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    try {
      const response = await call("Bearer anything");
      expect(response.status).toBe(503);
      expect(mocks.sweep).not.toHaveBeenCalled();
    } finally {
      if (serviceKey !== undefined) process.env.SUPABASE_SERVICE_ROLE_KEY = serviceKey;
    }
  });

  it("derives its secret from the service key when none is set, and never accepts the key itself", async () => {
    delete process.env.CHALLENGE_POOL_SWEEP_SECRET;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-key-for-test";
    try {
      const derived = sweepSecret();
      expect(derived).toMatch(/^[0-9a-f]{64}$/);
      expect(derived).not.toContain("service-role-key-for-test");
      expect((await call(`Bearer ${derived}`)).status).toBe(200);
      expect((await call("Bearer service-role-key-for-test")).status).toBe(401);
      // An explicit secret wins.
      process.env.CHALLENGE_POOL_SWEEP_SECRET = SECRET;
      expect((await call(`Bearer ${derived}`)).status).toBe(401);
    } finally {
      if (serviceKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
      else process.env.SUPABASE_SERVICE_ROLE_KEY = serviceKey;
    }
  });

  it("gives the route the serverless budget a sweep needs", async () => {
    const route = await import("@/app/api/internal/challenge-pool/sweep/route");
    expect(route.maxDuration).toBe(300);
  });
});
