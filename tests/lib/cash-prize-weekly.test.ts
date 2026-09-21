import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type Row = Record<string, unknown>;
type Tables = Record<string, Row[]>;

/**
 * Just enough of the Supabase query builder for `cash-prize-weekly.ts`: filters,
 * maybeSingle/single, insert and update, over in-memory tables.
 */
function fakeAdmin(tables: Tables, onInsert?: (table: string, row: Row) => { code: string } | null) {
  class Query {
    private filters: Array<(row: Row) => boolean> = [];
    private mode: "select" | "insert" | "update" = "select";
    private payload: Row = {};
    constructor(private table: string) {}
    select() {
      return this;
    }
    eq(column: string, value: unknown) {
      this.filters.push((row) => row[column] === value);
      return this;
    }
    in(column: string, values: unknown[]) {
      this.filters.push((row) => values.includes(row[column]));
      return this;
    }
    gte(column: string, value: string) {
      this.filters.push((row) => String(row[column]) >= value);
      return this;
    }
    order() {
      return this;
    }
    insert(row: Row) {
      this.mode = "insert";
      this.payload = row;
      return this;
    }
    update(patch: Row) {
      this.mode = "update";
      this.payload = patch;
      return this;
    }
    private run(): { data: Row[] | null; error: { code: string } | null } {
      const rows = (tables[this.table] ??= []);
      if (this.mode === "insert") {
        const error = onInsert?.(this.table, this.payload) ?? null;
        if (error) return { data: null, error };
        const row = { id: `row-${rows.length + 1}`, ...this.payload };
        rows.push(row);
        return { data: [row], error: null };
      }
      const matched = rows.filter((row) => this.filters.every((keep) => keep(row)));
      if (this.mode === "update") matched.forEach((row) => Object.assign(row, this.payload));
      return { data: matched, error: null };
    }
    maybeSingle() {
      const { data, error } = this.run();
      return Promise.resolve({ data: data?.[0] ?? null, error });
    }
    single() {
      return this.maybeSingle();
    }
    then<T>(resolve: (value: { data: Row[] | null; error: { code: string } | null }) => T) {
      return Promise.resolve(this.run()).then(resolve);
    }
  }
  return { from: (table: string) => new Query(table) };
}

const state = vi.hoisted(() => ({ admin: null as unknown }));
vi.mock("@/lib/supabase/admin", () => ({ createSupabaseAdminClient: () => state.admin }));

import {
  CAMPAIGN,
  drawDateFor,
  drawDateOnOrAfter,
  getWeeklyCampaignState,
  isEligibleFaculty,
  facultyPattern,
  registerWeeklyParticipation,
  streakFromDays,
  wheelEntries,
} from "@/lib/data/cash-prize-weekly";

// Monday 21 September 2026, 11:45 in Nepal.
const NOW = new Date("2026-09-21T06:00:00.000Z");
const DAY = 24 * 60 * 60 * 1000;
const STUDENT = "student";

function passedOn(userId: string, daysAgo: number, status = "completed"): Row {
  return { user_id: userId, status, completed_at: new Date(NOW.getTime() - daysAgo * DAY).toISOString() };
}

/** A BCT student with a `streak`-day streak and `verified` referred students who studied. */
function world({
  streak = 7,
  faculty = "BCT",
  membership = "active",
  verified = 5,
  unverified = 1,
}: { streak?: number; faculty?: string; membership?: string; verified?: number; unverified?: number } = {}) {
  const referred = Array.from({ length: verified + unverified }, (_, index) => `friend-${index}`);
  return {
    student_challenges: [
      ...Array.from({ length: streak }, (_, daysAgo) => passedOn(STUDENT, daysAgo)),
      ...referred.slice(0, verified).map((friend) => passedOn(friend, 2)),
      // Started, never passed: not a verified referral.
      ...referred.slice(verified).map((friend) => passedOn(friend, 1, "in_progress")),
    ],
    community_memberships: [{ user_id: STUDENT, community_id: "community-1", status: membership }],
    communities: [{ id: "community-1", name: "Pulchowk BCT 2081", faculty, status: "active" }],
    billing_referral_links: [{ id: "link-1", code: "REFABC123", referrer_id: STUDENT }],
    billing_referral_claims: referred.map((friend) => ({ link_id: "link-1", referred_user_id: friend })),
    cash_prize_weekly_entries: [],
  } satisfies Tables;
}

describe("weekly campaign rules", () => {
  it("files a confirmation under the Nepal-calendar Friday that ends its week", () => {
    expect(drawDateFor(NOW)).toBe("2026-09-25");
    expect(drawDateFor(new Date("2026-09-25T10:00:00.000Z"))).toBe("2026-09-25"); // Friday
    // Thursday 18:20 UTC is already Friday 00:05 in Nepal.
    expect(drawDateFor(new Date("2026-09-24T18:20:00.000Z"))).toBe("2026-09-25");
    // Friday 18:20 UTC is Saturday in Nepal: next week's draw.
    expect(drawDateFor(new Date("2026-09-25T18:20:00.000Z"))).toBe("2026-10-02");
    expect(drawDateOnOrAfter("2026-09-26")).toBe("2026-10-02");
  });

  it("counts consecutive days ending today, or yesterday before today's challenge", () => {
    const days = new Set(["2026-09-19", "2026-09-20", "2026-09-21"]);
    expect(streakFromDays(days, "2026-09-21")).toBe(3);
    expect(streakFromDays(days, "2026-09-22")).toBe(3); // nothing yet today
    expect(streakFromDays(days, "2026-09-23")).toBe(0); // a missed day breaks it
    expect(streakFromDays(new Set(["2026-09-21", "2026-09-19"]), "2026-09-21")).toBe(1);
  });

  it("gives one entry for the streak and one per five verified referrals, never without the streak", () => {
    expect(wheelEntries(7, 0, true)).toEqual({ qualified: true, base: 1, bonus: 0, active: 1, potential: 1 });
    expect(wheelEntries(12, 9, true)).toMatchObject({ bonus: 1, active: 2 });
    expect(wheelEntries(7, 10, true)).toMatchObject({ bonus: 2, active: 3 });
    // Referrals do not replace the streak.
    expect(wheelEntries(6, 25, true)).toEqual({ qualified: false, base: 0, bonus: 5, active: 0, potential: 6 });
    // Nor does a streak outside BCT.
    expect(wheelEntries(30, 5, false)).toMatchObject({ qualified: false, active: 0 });
  });

  it("recognises BCT communities however they are named, and nothing else", () => {
    for (const faculty of ["BCT", "bct", "B.E. Computer (BCT)", "Computer Engineering", "Bachelor in Computer  Engineering"]) {
      expect(isEligibleFaculty(faculty)).toBe(true);
    }
    for (const faculty of ["BCE", "Civil Engineering", "BEX", "Electronics", "ABCTS", ""]) {
      expect(isEligibleFaculty(faculty)).toBe(false);
    }
  });

  describe("faculty override", () => {
    afterEach(() => vi.unstubAllEnvs());

    it("can be widened from the environment, and ignores a broken pattern", () => {
      vi.stubEnv("CASH_PRIZE_FACULTY_PATTERN", "\\bBCT\\b|\\bBEI\\b");
      expect(isEligibleFaculty("BEI", facultyPattern())).toBe(true);
      vi.stubEnv("CASH_PRIZE_FACULTY_PATTERN", "(unclosed");
      expect(isEligibleFaculty("BCT", facultyPattern())).toBe(true);
      expect(isEligibleFaculty("BEI", facultyPattern())).toBe(false);
    });
  });

  it("keeps the page's copy of the rules equal to the server's", () => {
    const page = readFileSync("components/cash-prize-campaign.tsx", "utf8");
    expect(page).toContain(`const STREAK_DAYS_REQUIRED = ${CAMPAIGN.streakDaysRequired};`);
    expect(page).toContain(`const REFERRALS_PER_ENTRY = ${CAMPAIGN.referralsPerEntry};`);
  });
});

describe("getWeeklyCampaignState", () => {
  it("reads streak, community and verified referrals from durable records", async () => {
    state.admin = fakeAdmin(world());
    const campaign = await getWeeklyCampaignState(STUDENT, NOW);
    expect(campaign).toEqual({
      drawDate: "2026-09-25",
      streakDays: 7,
      // Six claimed the link; five of them have passed a challenge.
      verifiedReferrals: 5,
      eligibleCommunity: { id: "community-1", name: "Pulchowk BCT 2081" },
      entries: { qualified: true, base: 1, bonus: 1, active: 2, potential: 2 },
      referralCode: "REFABC123",
      participation: null,
    });
  });

  it("does not count a community the student has left, or one outside BCT", async () => {
    state.admin = fakeAdmin(world({ membership: "left" }));
    expect((await getWeeklyCampaignState(STUDENT, NOW)).eligibleCommunity).toBeNull();
    state.admin = fakeAdmin(world({ faculty: "Civil Engineering" }));
    const campaign = await getWeeklyCampaignState(STUDENT, NOW);
    expect(campaign.eligibleCommunity).toBeNull();
    expect(campaign.entries.qualified).toBe(false);
  });

  it("reports no link and no referrals for a student who has not made one", async () => {
    const tables = world();
    tables.billing_referral_links = [];
    state.admin = fakeAdmin(tables);
    const campaign = await getWeeklyCampaignState(STUDENT, NOW);
    expect(campaign.referralCode).toBeNull();
    expect(campaign.verifiedReferrals).toBe(0);
  });
});

describe("registerWeeklyParticipation", () => {
  const identity = { name: " Asha ", email: "asha@example.com" };
  let tables: Tables;

  beforeEach(() => {
    tables = world();
    state.admin = fakeAdmin(tables);
  });

  it("refuses a student outside BCT, and writes nothing", async () => {
    tables.communities[0]!.faculty = "BEX";
    const result = await registerWeeklyParticipation(STUDENT, identity, NOW);
    expect(result).toMatchObject({ ok: false, reason: "not_eligible_faculty" });
    expect(tables.cash_prize_weekly_entries).toHaveLength(0);
  });

  it("refuses an unfinished streak, saying how many days are left", async () => {
    state.admin = fakeAdmin((tables = world({ streak: 6 })));
    const result = await registerWeeklyParticipation(STUDENT, identity, NOW);
    expect(result).toEqual({
      ok: false,
      reason: "streak_incomplete",
      message: "Complete 1 more day of your streak to take part.",
    });
    expect(tables.cash_prize_weekly_entries).toHaveLength(0);
  });

  it("registers the entry with the server's own count and an audit snapshot", async () => {
    const result = await registerWeeklyParticipation(STUDENT, identity, NOW);
    expect(result).toEqual({ ok: true, drawDate: "2026-09-25", entries: 2, confirmedAt: NOW.toISOString() });
    expect(tables.cash_prize_weekly_entries).toEqual([
      expect.objectContaining({
        draw_date: "2026-09-25",
        user_id: STUDENT,
        student_name: "Asha",
        student_email: "asha@example.com",
        streak_days: 7,
        referral_count: 5,
        entries: 2,
        community_id: "community-1",
        confirmed_at: NOW.toISOString(),
      }),
    ]);
  });

  it("confirming again raises the count for new referrals but keeps the first confirmation time", async () => {
    await registerWeeklyParticipation(STUDENT, identity, NOW);
    // Five more friends pass a challenge before Friday.
    for (let index = 10; index < 15; index += 1) {
      tables.billing_referral_claims.push({ link_id: "link-1", referred_user_id: `friend-${index}` });
      tables.student_challenges.push(passedOn(`friend-${index}`, 0));
    }
    const later = new Date(NOW.getTime() + 2 * 60 * 60 * 1000);
    const result = await registerWeeklyParticipation(STUDENT, identity, later);
    expect(result).toMatchObject({ ok: true, entries: 3, confirmedAt: NOW.toISOString() });
    expect(tables.cash_prize_weekly_entries).toHaveLength(1);
    expect(tables.cash_prize_weekly_entries[0]).toMatchObject({
      entries: 3,
      referral_count: 10,
      confirmed_at: NOW.toISOString(),
      updated_at: later.toISOString(),
    });
  });

  it("treats a confirmation that loses a race as the same entry", async () => {
    const raced = "2026-09-21T05:59:59.000Z";
    let first = true;
    state.admin = fakeAdmin(tables, (table, row) => {
      if (table !== "cash_prize_weekly_entries" || !first) return null;
      first = false;
      // The other request lands between our read and our insert.
      tables.cash_prize_weekly_entries.push({ ...row, id: "winner", confirmed_at: raced });
      return { code: "23505" };
    });
    const result = await registerWeeklyParticipation(STUDENT, identity, NOW);
    expect(result).toMatchObject({ ok: true, entries: 2, confirmedAt: raced });
    expect(tables.cash_prize_weekly_entries).toHaveLength(1);
  });
});
