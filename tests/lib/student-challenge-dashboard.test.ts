import { describe, expect, it } from "vitest";
import {
  calculateAttemptMetrics,
  challengeBelongsToScope,
} from "@/lib/data/student-challenge-dashboard";
import {
  challengeAttemptReviewFromEvaluation,
  challengeAttemptReviewFromNormalizedRows,
  challengeExamExpired,
  dailyChallengeAssignmentCount,
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

  it("keeps three scoped subject assignments when other subjects filled the daily queue", () => {
    expect(
      dailyChallengeAssignmentCount({
        activeCount: 3,
        activeRecommendationCount: 0,
        availableCount: 10,
        minimumRecommendationCount: 3,
      }),
    ).toBe(3);

    expect(
      dailyChallengeAssignmentCount({
        activeCount: 4,
        activeRecommendationCount: 1,
        availableCount: 10,
        minimumRecommendationCount: 3,
      }),
    ).toBe(2);
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

  it("restores the answers and feedback saved with a completed challenge attempt", () => {
    expect(
      challengeAttemptReviewFromEvaluation(
        "attempt-1",
        {
          chapters: [],
          attempt_history: {
            handedInAt: "2026-08-25T05:00:00.000Z",
            results: [
              {
                question_id: "q1",
                student_answer: "Prefix increments before evaluation.",
                score: 8,
                feedback: "Correct; add a trace.",
              },
            ],
          },
        },
        "2026-08-25T04:00:00.000Z",
      ),
    ).toEqual({
      attemptId: "attempt-1",
      handedInAt: "2026-08-25T05:00:00.000Z",
      answers: [
        {
          questionId: "q1",
          answerText: "Prefix increments before evaluation.",
          score: 8,
          feedback: "Correct; add a trace.",
        },
      ],
    });
  });

  it("restores a completed challenge from normalized answer rows when JSON history is unavailable", () => {
    expect(
      challengeAttemptReviewFromNormalizedRows(
        "attempt-2",
        [{ id: "stored-q1", external_question_id: "q1" }],
        [
          {
            question_id: "stored-q1",
            answer_text: "Postfix returns the original value first.",
            score: 7,
            feedback: "Correct.",
          },
        ],
        "2026-08-25T06:00:00.000Z",
      ),
    ).toEqual({
      attemptId: "attempt-2",
      handedInAt: "2026-08-25T06:00:00.000Z",
      answers: [
        {
          questionId: "q1",
          answerText: "Postfix returns the original value first.",
          score: 7,
          feedback: "Correct.",
        },
      ],
    });
  });
});
