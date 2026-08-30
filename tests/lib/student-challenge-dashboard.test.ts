import { describe, expect, it } from "vitest";
import {
  calculateAttemptMetrics,
  challengeBelongsToScope,
} from "@/lib/data/student-challenge-dashboard";
import {
  challengeExamExpired,
  isMissingChallengeTable,
  studentFacingTopicTitle,
  type StudentChallengeDetail,
} from "@/lib/data/student-challenges";

const now = new Date("2026-08-25T06:00:00.000Z");

describe("student challenge metrics", () => {
  it("keeps a community subject challenge view isolated from legacy courses", () => {
    const scope = { courseId: "community-course", subjectSlug: "computer-programming" };

    expect(
      challengeBelongsToScope(
        { courseId: "legacy-course", subjectSlug: "attention-is-all-you-need" },
        scope,
      ),
    ).toBe(false);
    expect(
      challengeBelongsToScope(
        { courseId: "community-course", subjectSlug: "Computer-Programming" },
        scope,
      ),
    ).toBe(true);
  });

  it("treats both Postgres and PostgREST missing-table errors as a staged deploy", () => {
    expect(isMissingChallengeTable({ code: "42P01" })).toBe(true);
    expect(isMissingChallengeTable({ code: "PGRST205" })).toBe(true);
    expect(isMissingChallengeTable({ code: "42501" })).toBe(false);
  });

  it("uses the subject name when a topic is only a source identifier", () => {
    expect(studentFacingTopicTitle("1706.03762v7", "Attention is all you need")).toBe(
      "Attention is all you need",
    );
    expect(studentFacingTopicTitle("Laplace Transform", "Control Systems")).toBe(
      "Laplace Transform",
    );
  });

  it("uses the grading API verdict instead of reconstructing a pass threshold", () => {
    const result = calculateAttemptMetrics(
      [
        { totalScore: 4, totalMarks: 10, passed: true, createdAt: "2026-08-25T04:00:00.000Z" },
        { totalScore: 7, totalMarks: 10, passed: true, createdAt: "2026-08-24T04:00:00.000Z" },
        { totalScore: 9, totalMarks: 10, passed: false, createdAt: "2026-08-23T04:00:00.000Z" },
        { totalScore: 8, totalMarks: 10, passed: true, createdAt: "2026-08-18T04:00:00.000Z" },
      ],
      now,
    );

    expect(result.todayCompleted).toBe(true);
    expect(result.currentStreak).toBe(2);
    expect(result.passedThisWeek).toBe(2);
    expect(result.passedThisMonth).toBe(3);
    expect(result.practicePerDay).toBeCloseTo(2 / 7);
    expect(result.passRateLast30Days).toBe(75);
    expect(result.practiceScoreChange).toBeCloseTo(-13.33, 1);
  });

  it("keeps a streak alive through yesterday until today's deadline", () => {
    const result = calculateAttemptMetrics(
      [
        { totalScore: 5, totalMarks: 10, passed: true, createdAt: "2026-08-24T04:00:00.000Z" },
        { totalScore: 5, totalMarks: 10, passed: true, createdAt: "2026-08-23T04:00:00.000Z" },
      ],
      now,
    );

    expect(result.todayCompleted).toBe(false);
    expect(result.currentStreak).toBe(2);
  });

  it("shows honest empty values instead of inventing a zero-percent pass rate", () => {
    const result = calculateAttemptMetrics([], now);

    expect(result.hasPracticeHistory).toBe(false);
    expect(result.todayCompleted).toBe(false);
    expect(result.currentStreak).toBe(0);
    expect(result.passRateLast30Days).toBeNull();
    expect(result.practiceScoreChange).toBeNull();
  });

  it("recognizes an expired in-memory challenge sitting", () => {
    const challenge = {
      content: { examExpiresAt: "2026-08-25T05:59:59.000Z" },
    } as StudentChallengeDetail;

    expect(challengeExamExpired(challenge)).toBe(true);
  });
});
