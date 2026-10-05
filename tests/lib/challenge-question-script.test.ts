import { beforeEach, describe, expect, it, vi } from "vitest";

const ask = vi.fn();
vi.mock("@/lib/teacher-app/client", () => ({
  askTeacherSubject: (...args: unknown[]) => ask(...args),
}));

import {
  narrationScript,
  questionHintBrief,
  requestQuestionExplanation,
  requestQuestionHint,
  subjectWords,
} from "@/lib/data/challenge-question-script";

const question = {
  text: "What is the output of a NAND gate when both inputs are 1?",
  options: [
    { key: "A", text: "zero" },
    { key: "B", text: "one" },
  ],
  correct: "A",
  explanation: "The inverted AND output is zero.",
};
let scopeNumber = 0;
const scope = () => ({ collectionKey: `scope-${scopeNumber}`, subject: "digital-logic" });

beforeEach(() => {
  scopeNumber += 1;
  ask.mockReset();
  ask.mockResolvedValue({
    answer: "Think of inversion as flipping a logic level. Remember: a bubble means NOT.",
  });
});

describe("question narration hints", () => {
  it("uses the subject name without its creator prefix", () => {
    expect(subjectWords("creator_teacher_digital_logic")).toBe("digital logic");
  });

  it("does not put options, key or explanation in a pre-answer request", async () => {
    const brief = questionHintBrief("digital-logic", question);
    expect(brief.query).toContain(question.text);
    expect(brief.query).not.toContain(question.explanation);
    expect(brief.query).not.toContain('"correct"');
    expect(brief.query).not.toContain('"options"');
    await requestQuestionHint(scope(), question);
    expect(ask).toHaveBeenCalledWith(
      scope().collectionKey,
      "digital-logic",
      brief.query,
      5,
      brief.prompt,
    );
    expect(brief.prompt).toContain("Do not solve the question");
    expect(brief.prompt).toContain("spoken script");
  });

  it("returns narration with no video identifiers or derivatives", async () => {
    const result = await requestQuestionHint(scope(), question);
    expect(Object.keys(result)).toEqual(["script"]);
    expect(result.script).toContain("bubble means NOT");
  });

  it("reuses one request for simultaneous and repeated hints", async () => {
    const [one, two] = await Promise.all([
      requestQuestionHint(scope(), question),
      requestQuestionHint(scope(), question),
    ]);
    expect(one).toEqual(two);
    expect(await requestQuestionHint(scope(), question)).toEqual(one);
    expect(ask).toHaveBeenCalledTimes(1);
  });

  it("keeps post-answer scripts separate from hints and other faculties", async () => {
    ask
      .mockResolvedValueOnce({ answer: "Post-answer concept." })
      .mockResolvedValueOnce({ answer: "Pre-answer concept." });
    await requestQuestionExplanation(scope(), question);
    expect((await requestQuestionHint(scope(), question)).script).toBe("Pre-answer concept.");
    await requestQuestionHint({ ...scope(), collectionKey: "another-faculty" }, question);
    await requestQuestionHint({ ...scope(), subject: "another-subject" }, question);
    expect(ask).toHaveBeenCalledTimes(4);
  });

  it("rejects an invalid answer without requesting a script", () => {
    expect(() => requestQuestionExplanation(scope(), { ...question, correct: "Z" })).toThrow(
      RangeError,
    );
    expect(ask).not.toHaveBeenCalled();
  });

  it("retries failed or empty requests rather than caching them", async () => {
    ask.mockRejectedValueOnce(new Error("offline")).mockResolvedValueOnce({ answer: " " });
    await expect(requestQuestionHint(scope(), question)).rejects.toThrow("offline");
    await expect(requestQuestionHint(scope(), question)).rejects.toThrow("No hint script");
    expect((await requestQuestionHint(scope(), question)).script).toContain("NOT");
    expect(ask).toHaveBeenCalledTimes(3);
  });

  it("does not present an empty subject response as a hint", async () => {
    ask.mockResolvedValueOnce({ served_from: "lane_empty", answer: "Material not found." });
    await expect(requestQuestionHint(scope(), question)).rejects.toThrow("No hint script");
  });

  it("does not show raw evidence when the writing service is unavailable", async () => {
    ask.mockResolvedValueOnce({ answer: "GEMINI_API_KEY is not configured, so NSDI returned a grounded extractive answer." });
    await expect(requestQuestionHint(scope(), question)).rejects.toThrow("No hint script");
  });

  it("removes media suggestions while keeping the narration and mathematical notation", () => {
    expect(
      narrationScript(
        "Recall $V=IR$.\n```animate\nconcept: current\n```\n![Video](/api/media/abc/poster.png)\nMemory: voltage drives current.",
      ),
    ).toBe("Recall $V=IR$.\n\n\nMemory: voltage drives current.");
  });

  it("expires a cached hint", async () => {
    const clock = vi.spyOn(Date, "now");
    try {
      clock.mockReturnValue(1_000);
      await requestQuestionHint(scope(), question);
      clock.mockReturnValue(1_000 + 10 * 60_000);
      await requestQuestionHint(scope(), question);
      expect(ask).toHaveBeenCalledTimes(2);
    } finally {
      clock.mockRestore();
    }
  });
});
