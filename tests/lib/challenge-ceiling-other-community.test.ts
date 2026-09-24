import { beforeEach, describe, expect, it, vi } from "vitest";
import { communityLearningFixture } from "../helpers/learning-database";

const mocks = vi.hoisted(() => ({ admin: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({ createSupabaseAdminClient: mocks.admin }));

import { ensureDailyChallenges, nepaliChallengeDate } from "@/lib/data/student-challenges";

/**
 * Open challenges left behind in another community are hidden from the hub, so
 * they must not spend this semester's cards. Seven open rows from the old course
 * left a ten-subject semester showing three.
 */
describe("the open-challenge ceiling after switching community", () => {
  let db: ReturnType<typeof communityLearningFixture>;
  const today = nepaliChallengeDate();
  const subjects = Array.from({ length: 10 }, (_, index) => `subject_${index}`);

  beforeEach(() => {
    db = communityLearningFixture();
    mocks.admin.mockReturnValue(db.admin);
    db.tables.student_challenges = Array.from({ length: 7 }, (_, index) => ({
      id: `old-${index}`, user_id: "member", course_id: "old-course", challenge_date: today,
      position: index, subject_slug: `old_${index}`, subject_name: `Old ${index}`,
      topic_key: "intro", topic_title: "Intro", status: "assigned",
      created_at: "2026-09-24T01:00:00Z",
    }));
  });

  const recommendations = subjects.map((slug) => ({
    courseId: "new-course", subjectSlug: slug, subjectName: slug, namespace: slug,
    topicKey: "intro", topicTitle: "Intro", topicBlurb: "", unitNumber: "1", reason: "",
  }));

  it("gives every subject of the running semester its card", async () => {
    const listed = await ensureDailyChallenges("member", recommendations, {
      minimumRecommendationCount: 3,
      concurrentChallengeLimit: subjects.length,
      ceilingScopeKeys: new Set(subjects.map((slug) => `new-course:${slug}`)),
    });

    expect(listed.filter((challenge) => challenge.courseId === "new-course")).toHaveLength(10);
  });

  it("still counts every open row when no scope is given", async () => {
    const listed = await ensureDailyChallenges("member", recommendations, {
      minimumRecommendationCount: 3,
      concurrentChallengeLimit: subjects.length,
    });

    expect(listed.filter((challenge) => challenge.courseId === "new-course")).toHaveLength(3);
  });
});
