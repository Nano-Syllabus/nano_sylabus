import { describe, expect, it } from "vitest";
import type { CommunityHubData, CommunityHubMember } from "@/lib/data/community-hub";
import {
  buildDailyActivityCalendar,
  buildDailySemesters,
  aggregateScopedPracticeActivity,
  rankDailyCommunityMembers,
} from "@/lib/data/student-daily-dashboard";

describe("student Daily Dashboard calculations", () => {
  it("aggregates the activity calendar from only the already-scoped attempts", () => {
    expect(
      aggregateScopedPracticeActivity([
        {
          created_at: "2026-09-02T02:00:00.000Z",
          total_score: 8,
          total_marks: 10,
          passed: true,
        },
        {
          created_at: "2026-09-02T03:00:00.000Z",
          total_score: 2,
          total_marks: 10,
          passed: false,
        },
      ]),
    ).toEqual([
      {
        activity_date: "2026-09-02",
        attempt_count: 2,
        completed_count: 1,
        graded_attempt_count: 2,
        score_percentage_sum: 100,
      },
    ]);
  });

  it("builds the current month calendar in Kathmandu", () => {
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

    expect(days).toHaveLength(30);
    expect(days[0].date).toBe("2026-09-01");
    expect(days[0].label).toBe("Sep 1, 2026");
    expect(days.find((day) => day.date === "2026-09-02")).toMatchObject({
      status: "completed",
      attempts: 2,
      completions: 1,
      averageScore: 75,
      isToday: true,
    });
    expect(days.find((day) => day.date === "2026-09-01")?.status).toBe("started");
    expect(days.at(-1)).toMatchObject({ date: "2026-09-30", status: "future" });
  });

  it("builds any requested month for long-range calendar navigation", () => {
    const days = buildDailyActivityCalendar(
      [
        {
          activity_date: "2038-02-28",
          attempt_count: 1,
          completed_count: 1,
          graded_attempt_count: 1,
          score_percentage_sum: 100,
        },
      ],
      new Date("2038-03-02T05:00:00.000Z"),
      "2038-02",
    );

    expect(days).toHaveLength(28);
    expect(days[0].date).toBe("2038-02-01");
    expect(days.at(-1)).toMatchObject({ date: "2038-02-28", status: "completed" });
  });

  it("ranks daily members from real activity, then streak", () => {
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
