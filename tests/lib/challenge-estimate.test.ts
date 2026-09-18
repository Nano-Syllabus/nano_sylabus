import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase/admin", () => ({ createSupabaseAdminClient: vi.fn() }));

import { CHALLENGE_MINUTES_CAP, challengeEstimate } from "@/lib/data/student-challenges";
import type { StudentChallengeContent } from "@/lib/data/student-challenges";

/**
 * A challenge row says how long it takes, from what has been prepared for it:
 * the subtopic's worked past questions to read, then at most two practice
 * questions to answer on paper — and never more than twenty minutes in all.
 */

const content = (
  pastMarks: Array<number | null>,
  examMarks: number[] = [],
  solvedMarks: number[] = [],
): StudentChallengeContent =>
  ({
    provider: "collection-challenge-v1",
    pastQuestions: pastMarks.map((marks, index) => ({
      id: `p${index}`, question: `Question ${index}`, topic: "Topic", topicKey: "topic", marks, year: "",
    })),
    examQuestions: examMarks.map((marks, index) => ({
      id: `e${index}`, question: `Practice ${index}`, topic: "Topic", marks, questionType: "Long answer",
    })),
    solvedExamples: solvedMarks.map((marks, index) => ({
      year: null, question: `Example ${index}`, solution: "…", topic: "Topic", marks,
      grounded: false, source: "generated_from_notes",
    })),
  }) as unknown as StudentChallengeContent;

describe("a challenge's estimated time", () => {
  it("is reading plus answering, for a light topic", () => {
    // One 4-mark past question: 2 min. Two 4-mark practice answers: 3 min each.
    // 8 minutes, rounded to 10.
    expect(challengeEstimate(content([4], [4, 4]))).toEqual({
      pastQuestionCount: 1, practiceQuestionCount: 2, estimatedMinutes: 10,
    });
  });

  it("never runs past twenty minutes, however heavily the topic is examined", () => {
    const estimate = challengeEstimate(content([8, 8, 8, 8, 8, 8, 8, 8, 8, 8], [8, 8]));

    expect(estimate.estimatedMinutes).toBe(CHALLENGE_MINUTES_CAP);
    expect(CHALLENGE_MINUTES_CAP).toBe(20);
  });

  it("counts at most two practice questions, whatever the paper holds", () => {
    expect(challengeEstimate(content([2], [4, 4, 4, 4])).practiceQuestionCount).toBe(2);
  });

  it("assumes the two practice questions before the paper is set", () => {
    // Paper not issued yet: two answers at 5 min + one 2-mark read at 2 → 12 → 10.
    expect(challengeEstimate(content([2]))).toEqual({
      pastQuestionCount: 1, practiceQuestionCount: 2, estimatedMinutes: 10,
    });
  });

  it("uses the worked examples when no paper examined the topic", () => {
    expect(challengeEstimate(content([], [], [5, 5])).estimatedMinutes).toBe(15);
  });

  it("says nothing before the content is prepared, rather than the same guess everywhere", () => {
    expect(challengeEstimate(null)).toEqual({
      pastQuestionCount: null, practiceQuestionCount: null, estimatedMinutes: null,
    });
  });

  it("shows the estimate and the practice-question count on each row", () => {
    const hub = readFileSync("components/challenges-dashboard-client.tsx", "utf8");
    expect(hub).toContain("~{challenge.estimatedMinutes} min");
    expect(hub).toContain("{challenge.practiceQuestionCount ?? 2} question");
  });
});
