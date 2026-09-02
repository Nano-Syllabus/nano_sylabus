import { describe, expect, it } from "vitest";
import type { CommunityHubData, CommunityHubMember } from "@/lib/data/community-hub";
import {
  buildDailyActivityCalendar,
  buildDailySemesters,
  rankDailyCommunityMembers,
} from "@/lib/data/student-daily-dashboard";

describe("student Daily Dashboard calculations", () => {
  it("builds a Monday-aligned five-week calendar in Kathmandu", () => {
    const days = buildDailyActivityCalendar(
      [
        {
          activity_date: "2026-09-02",
          attempt_count: 2,
          completed_count: 1,
          graded_attempt_count: 2,
          score_percentage_sum: 150,
        },
        {
          activity_date: "2026-09-01",
          attempt_count: 1,
          completed_count: 0,
          graded_attempt_count: 1,
          score_percentage_sum: 35,
        },
      ],
      new Date("2026-09-02T05:00:00.000Z"),
    );

    expect(days).toHaveLength(35);
    expect(days[0].date).toBe("2026-08-03");
    expect(days[0].label).toBe("Aug 3, 2026");
    expect(days.find((day) => day.date === "2026-09-02")).toMatchObject({
      status: "completed",
      attempts: 2,
      completions: 1,
      averageScore: 75,
      isToday: true,
    });
    expect(days.find((day) => day.date === "2026-09-01")?.status).toBe("started");
    expect(days.at(-1)?.status).toBe("future");
  });

  it("ranks daily members from real activity, then streak and XP", () => {
    const members = [
      {
        id: "viewer",
        name: "Viewer",
        initials: "V",
        role: "member",
        joinedAt: "2026-01-01",
        xp: 200,
        rank: 1,
        completedChallenges: 4,
        todayAttempts: 1,
        streak: 2,
        isViewer: true,
      },
      {
        id: "peer",
        name: "Peer",
        initials: "P",
        role: "member",
        joinedAt: "2026-01-02",
        xp: 50,
        rank: 2,
        completedChallenges: 2,
        todayAttempts: 3,
        streak: 1,
        isViewer: false,
      },
    ] satisfies CommunityHubMember[];

    expect(rankDailyCommunityMembers(members).map((member) => member.id)).toEqual([
      "peer",
      "viewer",
    ]);
  });

  it("keeps semester readiness unavailable until real subject scores exist", () => {
    const data = {
      community: {
        terms: [
          {
            id: "term-1",
            yearNumber: 1,
            semesterNumber: 1,
            semesterInYear: 1,
            position: 0,
            subjects: [
              {
                id: "subject-1",
                termId: "term-1",
                slug: "math",
                name: "Mathematics",
                code: "MTH101",
              },
            ],
          },
        ],
      },
      subjects: [
        {
          id: "subject-1",
          slug: "math",
          name: "Mathematics",
          code: "MTH101",
          termId: "term-1",
          termLabel: "Year 1 · Semester 1",
          topicCount: 12,
          materialCount: 3,
          progress: null,
        },
      ],
    } as CommunityHubData;

    expect(buildDailySemesters(data)[0]).toMatchObject({
      readiness: null,
      measuredSubjects: 0,
      subjects: [{ readiness: null, topicCount: 12, materialCount: 3 }],
    });
  });
});
