import { describe, expect, it } from "vitest";
import { applyChallengePassed, applyChallengeState } from "@/lib/challenges/local-updates";
import type { StudentChallengeDashboard } from "@/lib/data/student-challenge-dashboard";
import type { StudentChallengeSummary } from "@/lib/data/student-challenges";

/**
 * These patches replaced `router.refresh()` on every write path in the Challenge
 * Hub, so they are now the only thing keeping its numbers true until the page is
 * reloaded. A wrong one lies on screen with nothing to indicate it — and you
 * only see it by finishing a challenge and then looking, which is exactly the
 * bug manual testing misses.
 */

function challenge(overrides: Partial<StudentChallengeSummary> = {}): StudentChallengeSummary {
  return {
    id: "c1",
    courseId: "course-1",
    date: "2026-09-10",
    position: 1,
    subjectSlug: "physics",
    subjectName: "Physics",
    topicKey: "newton",
    topicTitle: "Newton's laws",
    title: "Newton's laws",
    recommendationReason: "next up",
    status: "started",
    durationMinutes: 20,
    totalMarks: 10,
    passMarks: 6,
    lessonRead: true,
    examplesReviewed: true,
    attemptCount: 1,
    lastScore: null,
    lastTotalMarks: null,
    ...overrides,
  };
}

function hub(overrides: Partial<StudentChallengeDashboard> = {}): StudentChallengeDashboard {
  return {
    community: { id: "com-1", slug: "bct", name: "BCT", courseId: "course-1" },
    scope: null,
    subjects: [],
    subjectOptions: [],
    challenges: [challenge()],
    completedChallenges: [],
    completedChallengePage: 1,
    completedChallengeTotal: 0,
    completedChallengeTotalPages: 1,
    readiness: 40,
    totalTopics: 10,
    practicedTopics: 3,
    practiceScoreChange: null,
    currentStreak: 3,
    todayCompleted: false,
    todayCompletedCount: 0,
    passedThisMonth: 5,
    passedThisWeek: 2,
    ...overrides,
  } as StudentChallengeDashboard;
}

describe("applyChallengePassed", () => {
  it("moves every counter the pass actually changes", () => {
    const next = applyChallengePassed(hub(), "c1");

    expect(next.todayCompleted).toBe(true);
    expect(next.todayCompletedCount).toBe(1);
    expect(next.passedThisWeek).toBe(3);
    expect(next.passedThisMonth).toBe(6);
    expect(next.challenges[0].status).toBe("completed");
  });

  it("extends the streak only on the day's FIRST completion", () => {
    const first = applyChallengePassed(hub({ currentStreak: 3, todayCompleted: false }), "c1");
    expect(first.currentStreak).toBe(4);

    // Second challenge of the same day: the streak is a day counter, not a
    // completion counter. Incrementing per pass is the obvious bug here.
    const second = applyChallengePassed(
      hub({ currentStreak: 4, todayCompleted: true, todayCompletedCount: 1 }),
      "c1",
    );
    expect(second.currentStreak).toBe(4);
    expect(second.todayCompletedCount).toBe(2);
  });

  it("prepends to the completed list and bumps the total, on page 1", () => {
    const next = applyChallengePassed(hub(), "c1");

    expect(next.completedChallenges.map((c) => c.id)).toEqual(["c1"]);
    expect(next.completedChallenges[0].status).toBe("completed");
    expect(next.completedChallengeTotal).toBe(1);
  });

  it("does not prepend onto a completed list the student has paged away from", () => {
    const next = applyChallengePassed(
      hub({ completedChallengePage: 3, completedChallenges: [challenge({ id: "old" })] }),
      "c1",
    );

    // Page 3 holds older rows; a new pass belongs on page 1, and putting it here
    // would show a row that does not belong to the page being displayed.
    expect(next.completedChallenges.map((c) => c.id)).toEqual(["old"]);
    // The count still moves — it describes the whole set, not this page.
    expect(next.completedChallengeTotal).toBe(1);
  });

  it("leaves aggregates it cannot compute alone untouched", () => {
    const before = hub();
    const next = applyChallengePassed(before, "c1");

    expect(next.readiness).toBe(before.readiness);
    expect(next.practicedTopics).toBe(before.practicedTopics);
    expect(next.practiceScoreChange).toBe(before.practiceScoreChange);
  });

  it("does not double-count a challenge already in the completed list", () => {
    const done = challenge({ id: "c1", status: "completed" });
    const next = applyChallengePassed(hub({ completedChallenges: [done], completedChallengeTotal: 1 }), "c1");

    expect(next.completedChallengeTotal).toBe(1);
    expect(next.completedChallenges.filter((c) => c.id === "c1")).toHaveLength(1);
  });
});

describe("applyChallengeState", () => {
  it("syncs one row from the server's copy without moving any counter", () => {
    const before = hub();
    const next = applyChallengeState(before, {
      ...challenge({ id: "c1", status: "assigned", attemptCount: 0, lastScore: null }),
    } as never);

    expect(next.challenges[0].status).toBe("assigned");
    expect(next.challenges[0].attemptCount).toBe(0);
    expect(next.currentStreak).toBe(before.currentStreak);
    expect(next.passedThisWeek).toBe(before.passedThisWeek);
    expect(next.todayCompletedCount).toBe(before.todayCompletedCount);
  });

  it("keeps the original array identity when nothing matched", () => {
    const before = hub();
    const next = applyChallengeState(before, challenge({ id: "not-in-any-list" }) as never);

    // Same reference means React can skip re-rendering the whole list.
    expect(next.challenges).toBe(before.challenges);
    expect(next.completedChallenges).toBe(before.completedChallenges);
  });

  it("is a no-op for a missing challenge", () => {
    const before = hub();
    expect(applyChallengeState(before, null)).toBe(before);
    expect(applyChallengeState(before, undefined)).toBe(before);
  });
});
