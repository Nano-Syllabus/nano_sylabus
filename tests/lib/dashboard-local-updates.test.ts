import { describe, expect, it } from "vitest";
import { QueryClient } from "@tanstack/react-query";
import { applyChallengeCompletion, applyPracticeAttempt } from "@/lib/query/dashboard";
import { keys } from "@/lib/query/keys";
import type { StudentDailyDashboard } from "@/lib/data/student-daily-dashboard";

/**
 * The dashboard is fetched once per page load and then held for the life of the
 * tab, so these patches are the ONLY thing keeping its numbers true while a
 * student works. If one of them is wrong the screen lies until a reload, with
 * nothing to indicate it — which is exactly the kind of bug that never shows up
 * in manual testing, because you have to finish a challenge and then look.
 */

const COMMUNITY = undefined; // the default scope — key ["student","dashboard",""]

function dashboard(overrides: Partial<StudentDailyDashboard> = {}): StudentDailyDashboard {
  return {
    todayChallengeCompletions: 0,
    examDates: [],
    activity: [
      {
        date: "2026-09-08",
        dayOfMonth: 8,
        label: "Sep 8",
        attempts: 2,
        completions: 1,
        averageScore: 80,
        status: "completed",
        isToday: false,
      },
      {
        date: "2026-09-09",
        dayOfMonth: 9,
        label: "Sep 9",
        attempts: 0,
        completions: 0,
        averageScore: null,
        status: "idle",
        isToday: true,
      },
    ],
    challenge: {
      currentStreak: 3,
      challenges: [
        { id: "c1", status: "available" },
        { id: "c2", status: "available" },
      ],
    } as StudentDailyDashboard["challenge"],
    community: {
      name: "BCT",
      slug: "bct",
      memberCount: 5,
      contentReadiness: 100,
      materialCount: 21,
      topicCount: 65,
      leaderboard: [],
      currentSemesterId: "t1",
      semesters: [],
    },
    ...overrides,
  };
}

function seed(initial = dashboard()) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  client.setQueryData(keys.student.dashboard(COMMUNITY), { dashboard: initial });
  return client;
}

const read = (client: QueryClient) =>
  (client.getQueryData(keys.student.dashboard(COMMUNITY)) as { dashboard: StudentDailyDashboard })
    .dashboard;

describe("dashboard local updates", () => {
  it("moves every figure a completion moves, without a refetch", () => {
    const client = seed();
    applyChallengeCompletion(client, COMMUNITY, { challengeId: "c1" });
    const d = read(client);

    expect(d.todayChallengeCompletions).toBe(1);
    const today = d.activity.find((day) => day.isToday)!;
    expect(today.attempts).toBe(1);
    expect(today.completions).toBe(1);
    expect(today.status).toBe("completed");
    expect(d.challenge.currentStreak).toBe(4);
    expect(d.challenge.challenges.find((c) => c.id === "c1")?.status).toBe("completed");
    expect(d.challenge.challenges.find((c) => c.id === "c2")?.status).toBe("available");
  });

  it("extends the streak only on the day's FIRST completion", () => {
    // The obvious bug in a per-completion increment: a student doing three
    // challenges in one afternoon would appear to be on a three-day streak.
    const client = seed();
    applyChallengeCompletion(client, COMMUNITY, { challengeId: "c1" });
    expect(read(client).challenge.currentStreak).toBe(4);

    applyChallengeCompletion(client, COMMUNITY, { challengeId: "c2" });
    expect(read(client).challenge.currentStreak).toBe(4);
    expect(read(client).todayChallengeCompletions).toBe(2);
  });

  it("records a failed attempt without crediting a completion", () => {
    const client = seed();
    applyPracticeAttempt(client, COMMUNITY);
    const d = read(client);
    const today = d.activity.find((day) => day.isToday)!;

    expect(today.attempts).toBe(1);
    expect(today.completions).toBe(0);
    expect(today.status).toBe("started");
    expect(d.todayChallengeCompletions).toBe(0);
    expect(d.challenge.currentStreak).toBe(3);
  });

  it("does not downgrade a day that already has a completion", () => {
    const client = seed();
    applyChallengeCompletion(client, COMMUNITY, { challengeId: "c1" });
    applyPracticeAttempt(client, COMMUNITY);
    expect(read(client).activity.find((day) => day.isToday)!.status).toBe("completed");
  });

  it("is a no-op when nothing is cached, rather than seeding a partial entry", () => {
    // A patch arriving before the first fetch must not invent a dashboard —
    // that would render zeros as though they were real values.
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    applyChallengeCompletion(client, COMMUNITY, { challengeId: "c1" });
    expect(client.getQueryData(keys.student.dashboard(COMMUNITY))).toBeUndefined();
  });
});
