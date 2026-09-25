import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ subscriptions: [] as unknown[], completedToday: 0, since: "", column: "", statuses: [] as unknown[] }));

vi.mock("@/lib/dev-auth-bypass", () => ({ DEV_AUTH_BYPASS: false }));
vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: () => ({
    from: (table: string) => {
      if (table === "user_subscriptions") {
        const chain = { select: () => chain, eq: () => chain, then: (resolve: (value: unknown) => void) => resolve({ data: state.subscriptions, error: null }) };
        return chain;
      }
      const chain = {
        select: () => chain,
        eq: (column: string, value: unknown) => {
          if (column === "status") state.statuses.push(value);
          return chain;
        },
        gte: (column: string, value: string) => {
          state.column = column;
          state.since = value;
          return Promise.resolve({ count: state.completedToday, error: null });
        },
      };
      return chain;
    },
  }),
}));

import { ChallengeDailyLimitError, challengeAccessResponse } from "@/lib/data/challenge-access-error";
import { assertChallengeAttemptAllowed, challengeAllowance, startedToday } from "@/lib/data/challenge-daily-limit";

const plan = (fields: Record<string, unknown>, endsAt: string | null = null) => ({ ends_at: endsAt, subscription_plans: fields });

beforeEach(() => {
  state.subscriptions = [];
  state.completedToday = 0;
  state.statuses = [];
});

describe("the free plan's three challenges a day", () => {
  it("allows new starts until three are completed today", async () => {
    state.completedToday = 2;
    await expect(assertChallengeAttemptAllowed("u", false)).resolves.toBeUndefined();
    state.completedToday = 3;
    await expect(assertChallengeAttemptAllowed("u", false)).rejects.toBeInstanceOf(ChallengeDailyLimitError);
  });

  it("never blocks the same attempt again — a restart of one started today", async () => {
    state.completedToday = 3;
    await expect(assertChallengeAttemptAllowed("u", true)).resolves.toBeUndefined();
  });

  it("does not limit Plus, Pro or Group", async () => {
    state.completedToday = 9;
    for (const fields of [{ slug: "plus-monthly" }, { is_unlimited: true }, { product_type: "group" }]) {
      state.subscriptions = [plan(fields)];
      await expect(assertChallengeAttemptAllowed("u", false)).resolves.toBeUndefined();
    }
  });

  it("limits a plan that has ended", async () => {
    state.completedToday = 3;
    state.subscriptions = [plan({ is_unlimited: true }, "2020-01-01T00:00:00Z")];
    await expect(assertChallengeAttemptAllowed("u", false)).rejects.toBeInstanceOf(ChallengeDailyLimitError);
  });

  it("counts completions from midnight in Kathmandu — the Today's quota number", async () => {
    const allowance = await challengeAllowance("u");
    expect(state.column).toBe("completed_at");
    expect(state.statuses).toContain("completed");
    expect(allowance).toMatchObject({ paid: false, limit: 3 });
    const since = new Date(state.since);
    const kathmandu = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Kathmandu", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(since);
    expect(kathmandu).toBe("00:00");
  });

  it("knows a start from today from one from yesterday, in Nepal time", () => {
    const now = new Date("2026-09-25T10:00:00Z"); // 15:45 in Kathmandu
    expect(startedToday("2026-09-24T18:20:00Z", now)).toBe(true); // 00:05 on the 25th there
    expect(startedToday("2026-09-24T18:10:00Z", now)).toBe(false); // 23:55 on the 24th
    expect(startedToday(null, now)).toBe(false);
  });

  it("answers 402 with a code the hub locks on, and the words the student reads", async () => {
    const response = challengeAccessResponse(new ChallengeDailyLimitError(3))!;
    expect(response.status).toBe(402);
    const body = await response.json();
    expect(body.code).toBe("daily_limit");
    expect(body.error).toMatch(/Come back tomorrow, or upgrade to Plus or Pro/);
  });
});
