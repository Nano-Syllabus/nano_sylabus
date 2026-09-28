import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { communityLearningFixture } from "../helpers/learning-database";

const mocks = vi.hoisted(() => ({ admin: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({ createSupabaseAdminClient: mocks.admin }));

import { ensureDailyChallenges, nepaliChallengeDate } from "@/lib/data/student-challenges";

/**
 * A challenge finished today stays on the Challenge Hub's list — green, and not
 * something to open again from there. It used to vanish the moment it was done,
 * so a student who had finished two of four saw two and wondered where the
 * others went.
 */
describe("today's finished challenges on the hub", () => {
  let db: ReturnType<typeof communityLearningFixture>;
  const today = nepaliChallengeDate();
  const row = (id: string, topicKey: string, status: string, extra: Record<string, unknown> = {}) => ({
    id, user_id: "member", course_id: "course-1", challenge_date: today, position: 0,
    subject_slug: "basic_electrical", subject_name: "Basic Electrical Engineering",
    topic_key: topicKey, topic_title: topicKey, status, created_at: "2026-09-18T01:00:00Z", ...extra,
  });
  const recommendation = (topicKey: string, topicTitle = topicKey) => ({
    courseId: "course-1",
    subjectSlug: "basic_electrical",
    subjectName: "Basic Electrical Engineering",
    namespace: "electrical",
    topicKey,
    topicTitle,
    topicBlurb: "",
    unitNumber: "1",
    reason: "Next subtopic",
  });

  beforeEach(() => {
    db = communityLearningFixture();
    mocks.admin.mockReturnValue(db.admin);
    db.tables.student_challenges = [
      row("open", "kvl", "started"),
      row("done", "ohms-law", "completed", { completed_at: "2026-09-18T02:00:00Z" }),
    ];
  });

  it("lists them after the open ones when the hub asks", async () => {
    const listed = await ensureDailyChallenges("member", [], { includeCompleted: true });

    expect(listed.map((challenge) => [challenge.id, challenge.status])).toEqual([
      ["open", "started"],
      ["done", "completed"],
    ]);
  });

  it("leaves every other caller with only what can still be started", async () => {
    const listed = await ensureDailyChallenges("member", []);

    expect(listed.map((challenge) => challenge.id)).toEqual(["open"]);
  });

  it("never assigns a subtopic completed on an earlier day", async () => {
    db.tables.student_challenges = [
      row("old-done", "ohms-law", "completed", {
        challenge_date: "2026-09-17",
        completed_at: "2026-09-17T02:00:00Z",
        topic_title: "Ohm's law",
      }),
      // A duplicate already assigned by the old daily-only rule is hidden too;
      // fixing selection must not leave yesterday's bug on today's hub.
      row("stale-repeat", "ohms-law", "assigned", { topic_title: "Ohm's law" }),
    ];

    const listed = await ensureDailyChallenges("member", [
      recommendation("ohms-law", "Ohm's law"),
      recommendation("kvl", "Kirchhoff's voltage law"),
    ]);

    expect(listed.map((challenge) => challenge.topicKey)).toEqual(["kvl"]);
  });

  it("deduplicates a repeated subtopic title even when extraction gave it two keys", async () => {
    db.tables.student_challenges = [];

    const listed = await ensureDailyChallenges("member", [
      recommendation("kvl-v1", "Kirchhoff's voltage law"),
      recommendation("kvl-v2", "  KIRCHHOFF'S   VOLTAGE LAW  "),
    ]);

    expect(listed).toHaveLength(1);
    expect(listed[0]?.topicKey).toBe("kvl-v1");
  });

  it("shows a finished subject as today's win, with the way on to its next topic", () => {
    // Superseding "a green Completed mark with nothing to click" (user,
    // 2026-09-24): a finished card must lead to the subject's next topic.
    const hub = readFileSync("components/challenges-dashboard-client.tsx", "utf8");
    const row = hub.slice(hub.indexOf("if (completed) {"), hub.indexOf('"Next topic"'));
    expect(row).toContain("Passed");
    expect(row).toContain("{score}");
    expect(row).toContain("openNextInSubject(challenge)");
    expect(hub).not.toContain('"View Details"');
  });
});
