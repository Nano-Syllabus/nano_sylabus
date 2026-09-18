import { describe, expect, it } from "vitest";
import {
  aggregateCommunityDailyActivity,
  calculateActivityStreak,
  communityDateKey,
  documentBelongsToSubject,
  rankCommunityMembersByStreak,
  summarizeCommunityTerm,
} from "@/lib/data/community-hub";

describe("community hub calculations", () => {
  it("uses the Kathmandu calendar date", () => {
    expect(communityDateKey("2026-09-01T18:20:00.000Z")).toBe("2026-09-02");
  });

  it("counts a completion streak from today or yesterday", () => {
    const now = new Date("2026-09-02T06:00:00.000Z");
    expect(
      calculateActivityStreak(
        [
          { activity_date: "2026-09-02", completed_count: 1 },
          { activity_date: "2026-09-01", completed_count: 2 },
          { activity_date: "2026-08-31", completed_count: 1 },
          { activity_date: "2026-08-29", completed_count: 3 },
        ],
        now,
      ),
    ).toBe(3);
  });

  it("aggregates only the community-scoped challenge attempts supplied by the loader", () => {
    expect(
      aggregateCommunityDailyActivity([
        { user_id: "student-1", created_at: "2026-09-01T18:20:00.000Z", passed: true },
        { user_id: "student-1", created_at: "2026-09-01T19:20:00.000Z", passed: false },
        { user_id: "student-2", created_at: "2026-09-01T20:20:00.000Z", passed: true },
      ]),
    ).toEqual([
      {
        user_id: "student-1",
        activity_date: "2026-09-02",
        attempt_count: 2,
        completed_count: 1,
      },
      {
        user_id: "student-2",
        activity_date: "2026-09-02",
        attempt_count: 1,
        completed_count: 1,
      },
    ]);
  });

  it("ranks community members by current streak instead of XP", () => {
    const ranked = rankCommunityMembersByStreak([
      {
        id: "member-1",
        name: "First",
        initials: "F",
        role: "member",
        joinedAt: "2026-09-01T00:00:00.000Z",
        xp: 999,
        rank: 0,
        completedChallenges: 1,
        todayAttempts: 1,
        streak: 2,
        isViewer: false,
      },
      {
        id: "member-2",
        name: "Second",
        initials: "S",
        role: "member",
        joinedAt: "2026-09-02T00:00:00.000Z",
        xp: 1,
        rank: 0,
        completedChallenges: 5,
        todayAttempts: 1,
        streak: 5,
        isViewer: false,
      },
    ]);

    expect(ranked.map((member) => [member.id, member.rank])).toEqual([
      ["member-2", 1],
      ["member-1", 2],
    ]);
  });

  it("scopes teacher files to the linked subject folder", () => {
    const subject = {
      teacherId: "teacher-1",
      folderPath: "Attention is all you need",
      name: "Attention is all you need",
    };
    expect(
      documentBelongsToSubject(
        {
          teacher_id: "teacher-1",
          collection_path: "Attention is all you need/Question Bank/paper.pdf",
        },
        subject,
      ),
    ).toBe(true);
    expect(
      documentBelongsToSubject(
        { teacher_id: "teacher-2", collection_path: "Attention is all you need/Notes/note.pdf" },
        subject,
      ),
    ).toBe(false);
  });

  it("derives every current-semester metric from one subject snapshot", () => {
    const subjects = [
      {
        id: "subject-1",
        slug: "math",
        name: "Mathematics",
        code: "MTH101",
        termId: "term-1",
        termLabel: "Year 1 · Semester 1",
        topicCount: 40,
        materialCount: 3,
        progress: null,
        contentReady: true,
      },
      {
        id: "subject-2",
        slug: "physics",
        name: "Physics",
        code: "PHY101",
        termId: "term-1",
        termLabel: "Year 1 · Semester 1",
        topicCount: 30,
        materialCount: 2,
        progress: null,
        contentReady: false,
      },
      {
        id: "subject-3",
        slug: "later",
        name: "Later semester",
        code: "LATER",
        termId: "term-2",
        termLabel: "Year 1 · Semester 2",
        topicCount: 99,
        materialCount: 10,
        progress: null,
        contentReady: true,
      },
    ];

    expect(summarizeCommunityTerm(subjects, "term-1")).toEqual({
      subjectCount: 2,
      materialCount: 5,
      topicCount: 70,
      contentReadiness: 50,
    });
  });
});
