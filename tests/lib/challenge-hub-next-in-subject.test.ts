import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase/admin", () => ({ createSupabaseAdminClient: vi.fn() }));

import { hubRows } from "@/components/challenges-dashboard-client";
import { applyChallengeAdded, applyChallengePassed } from "@/lib/challenges/local-updates";
import type { StudentChallengeDashboard } from "@/lib/data/student-challenge-dashboard";
import type { StudentChallengeSummary } from "@/lib/data/student-challenges";

/**
 * Passing a subject's card must lead somewhere in that subject: the server
 * assigns its next topic on the pass, the hub shows it at once, and the finished
 * one rides on it as today's win instead of standing as a dead-end row.
 */

const card = (id: string, subject: string, status: StudentChallengeSummary["status"], extra = {}) =>
  ({
    id,
    courseId: "course-1",
    subjectSlug: subject,
    subjectName: subject,
    topicTitle: `${subject} topic ${id}`,
    status,
    position: Number(id.replace(/\D/g, "")) || 0,
    lastScore: status === "completed" ? 18 : null,
    lastTotalMarks: status === "completed" ? 20 : null,
    ...extra,
  }) as unknown as StudentChallengeSummary;

describe("the hub's rows", () => {
  it("puts a subject's finished card on the open card that followed it", () => {
    const rows = hubRows([card("c1", "digital", "started"), card("c2", "digital", "completed"), card("c3", "networks", "assigned")]);
    expect(rows.map((row) => row.challenge.id)).toEqual(["c1", "c3"]);
    expect(rows[0].doneToday.map((done) => done.id)).toEqual(["c2"]);
    expect(rows[1].doneToday).toEqual([]);
  });

  it("keeps a finished card as its own row only while its subject has nothing open", () => {
    const rows = hubRows([card("c1", "networks", "started"), card("c2", "digital", "completed")]);
    expect(rows.map((row) => [row.challenge.id, row.challenge.status])).toEqual([
      ["c1", "started"],
      ["c2", "completed"],
    ]);
  });
});

describe("the pass patch", () => {
  const dashboard = (challenges: StudentChallengeSummary[]) =>
    ({
      challenges,
      completedChallenges: [],
      completedChallengePage: 1,
      completedChallengeTotal: 0,
      todayCompleted: false,
      todayCompletedCount: 0,
      passedThisWeek: 0,
      passedThisMonth: 0,
      currentStreak: 0,
    }) as unknown as StudentChallengeDashboard;

  it("adds the subject's next card, ahead of the finished ones, and only once", () => {
    const next = card("c9", "digital", "assigned");
    const after = applyChallengePassed(
      dashboard([card("c1", "digital", "started"), card("c2", "networks", "completed")]),
      "c1",
      next,
    );
    expect(after.challenges.map((c) => [c.id, c.status])).toEqual([
      ["c9", "assigned"],
      ["c1", "completed"],
      ["c2", "completed"],
    ]);
    expect(applyChallengeAdded(after, next).challenges).toHaveLength(3);
  });

  it("still marks the pass when no next card came back", () => {
    const after = applyChallengePassed(dashboard([card("c1", "digital", "started")]), "c1", null);
    expect(after.challenges.map((c) => c.status)).toEqual(["completed"]);
  });
});

describe("the server assigns the next topic on a pass", () => {
  it("is handed back by both hand-in routes", () => {
    for (const route of ["submit-choices", "submit-file"]) {
      const source = readFileSync(`app/api/student/challenges/[challengeId]/${route}/route.ts`, "utf8");
      expect(source, route).toContain("graded.passed ? await nextChallengeInSubject(user.id, challenge) : null");
      expect(source, route).toContain("nextInSubject,");
    }
  });
});
