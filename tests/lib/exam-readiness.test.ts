import { describe, expect, it } from "vitest";
import { DEFAULT_EXAM_QUESTIONS, examReadiness } from "@/lib/exam-enrollment";

const answer = (picks: number[]) =>
  Object.fromEntries(DEFAULT_EXAM_QUESTIONS.map((q, i) => [q.id, q.options[picks[i]]]));

describe("examReadiness", () => {
  it("scores each answer by its position, least to most prepared", () => {
    expect(examReadiness(DEFAULT_EXAM_QUESTIONS, answer([0, 0, 0]))?.percent).toBe(10);
    expect(examReadiness(DEFAULT_EXAM_QUESTIONS, answer([2, 2, 2]))?.percent).toBe(95);
    expect(examReadiness(DEFAULT_EXAM_QUESTIONS, answer([1, 1, 1]))?.percent).toBe(53);
  });

  it("names the weakest answer as the focus, none when all are top", () => {
    const result = examReadiness(DEFAULT_EXAM_QUESTIONS, answer([2, 0, 1]));
    expect(result?.focus?.prompt).toBe(DEFAULT_EXAM_QUESTIONS[1].prompt);
    expect(examReadiness(DEFAULT_EXAM_QUESTIONS, answer([2, 2, 2]))?.focus).toBeNull();
  });

  it("returns null with no usable answers", () => {
    expect(examReadiness(DEFAULT_EXAM_QUESTIONS, {})).toBeNull();
  });
});
