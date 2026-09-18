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

  it("shows a finished row as a green Completed mark with nothing to click", () => {
    const hub = readFileSync("components/challenges-dashboard-client.tsx", "utf8");
    const row = hub.slice(hub.indexOf("{completed ? ("), hub.indexOf("Completed\n                        </span>"));

    expect(row).toContain("bg-success/15");
    expect(row).not.toContain("<button");
    expect(hub).not.toContain('"View Details"');
  });
});
