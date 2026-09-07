import { describe, expect, it } from "vitest";
import {
  initialChallengeStep,
  nextAvailableChallenge,
} from "@/components/challenges-dashboard-client";
import type {
  StudentChallengeDetail,
  StudentChallengeSummary,
} from "@/lib/data/student-challenges";

function challenge(
  id: string,
  status: StudentChallengeSummary["status"],
  position: number,
): StudentChallengeSummary {
  return {
    id,
    courseId: "course-1",
    date: "2026-09-06",
    position,
    subjectSlug: "math",
    subjectName: "Math",
    topicKey: id,
    topicTitle: id,
    title: id,
    recommendationReason: "",
    status,
    durationMinutes: 20,
    totalMarks: 20,
    passMarks: 8,
    lessonRead: false,
    examplesReviewed: false,
    attemptCount: 0,
    lastScore: null,
    lastTotalMarks: null,
  };
}

describe("next challenge navigation", () => {
  it("opens the next in-progress card after the completed first challenge", () => {
    const first = challenge("number-properties", "completed", 0);
    const next = nextAvailableChallenge(
      [first, challenge("fractions", "started", 1), challenge("ratio", "started", 2)],
      first,
    );

    expect(next?.id).toBe("fractions");
  });

  it("uses queue position when the completed card has disappeared after refresh", () => {
    const second = challenge("fractions", "completed", 1);
    const next = nextAvailableChallenge([challenge("ratio", "started", 2)], second);

    expect(next?.id).toBe("ratio");
  });

  it("has no next challenge only after every other queue item is completed", () => {
    const third = challenge("ratio", "completed", 2);
    const next = nextAvailableChallenge(
      [challenge("number-properties", "completed", 0), challenge("fractions", "completed", 1)],
      third,
    );

    expect(next).toBeNull();
  });

  it("starts an untouched challenge from prerequisites", () => {
    expect(
      initialChallengeStep({
        ...challenge("ratio", "assigned", 2),
        content: {
          lesson: { title: "Ratio", content: [], focus: "Ratio" },
          solvedExamples: [],
          examQuestions: [],
        },
        latestAttempt: null,
      } as StudentChallengeDetail),
    ).toBe(1);
  });

  it("resumes after the separately completed learn and example steps", () => {
    const base = {
      ...challenge("ratio", "started", 2),
      content: {
        lesson: { title: "Ratio", content: [], focus: "Ratio" },
        solvedExamples: [],
        examQuestions: [],
      },
      latestAttempt: null,
    } as StudentChallengeDetail;

    expect(initialChallengeStep({ ...base, lessonRead: true })).toBe(3);
    expect(initialChallengeStep({ ...base, lessonRead: true, examplesReviewed: true })).toBe(4);
    expect(initialChallengeStep({ ...base, status: "completed" })).toBe(6);
  });
});
