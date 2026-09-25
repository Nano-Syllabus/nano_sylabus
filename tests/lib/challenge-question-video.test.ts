import { beforeEach, describe, expect, it, vi } from "vitest";

const requestAnimation = vi.fn();
vi.mock("@/lib/teacher-app/client", () => ({
  requestTeacherExplainerAnimation: (...args: unknown[]) => requestAnimation(...args),
}));

import {
  prepareQuestionVideos,
  questionVideoSpec,
  requestQuestionVideo,
} from "@/lib/data/challenge-question-video";

const question = {
  text: "What is the output of a NAND gate when both inputs are 1?",
  options: [
    { key: "A", text: "0" },
    { key: "B", text: "1" },
  ],
  correct: "A",
  explanation: "NAND is NOT of AND; 1 AND 1 is 1, so NAND gives 0.",
};

beforeEach(() => {
  requestAnimation.mockReset();
  requestAnimation.mockResolvedValue({ spec_hash: "ab".repeat(16), status: "queued", derivatives: {}, error: "" });
});

describe("question videos", () => {
  it("builds one spec per question, the same every time — so it is one cached render", () => {
    expect(questionVideoSpec("digital-logic", question)).toEqual(questionVideoSpec("digital-logic", question));
    const spec = questionVideoSpec("digital-logic", question);
    expect(spec.seconds).toBeLessThanOrEqual(20);
    expect(spec.subject).toBe("digital logic");
    expect(spec).not.toHaveProperty("fresh");
    expect(spec.notes).toContain("Correct answer: A) 0");
  });

  it("asks urgently for a video a student is waiting on", async () => {
    const video = await requestQuestionVideo({ collectionKey: "k", subject: "digital-logic" }, question, "urgent");
    expect(video.specHash).toBe("ab".repeat(16));
    expect(requestAnimation).toHaveBeenCalledWith("k", expect.objectContaining({ priority: "urgent" }));
  });

  it("refuses a question with no answer among its options", async () => {
    await expect(
      requestQuestionVideo({ collectionKey: "k", subject: "s" }, { ...question, correct: "Z" }, "urgent"),
    ).rejects.toBeInstanceOf(RangeError);
  });

  it("prepares a paper's videos in the background, and a failure costs nothing", async () => {
    requestAnimation.mockRejectedValueOnce(new Error("renderer busy"));
    const paper = Array.from({ length: 6 }, (_, index) => ({ ...question, text: `${question.text} (${index})` }));
    prepareQuestionVideos({ collectionKey: "k", subject: "s" }, paper);
    await vi.waitFor(() => expect(requestAnimation).toHaveBeenCalledTimes(6));
    for (const [, spec] of requestAnimation.mock.calls) expect(spec.priority).toBe("background");
  });
});
