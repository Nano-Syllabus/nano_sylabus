import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  scope: vi.fn(),
  mcq: vi.fn(),
  animation: vi.fn(),
}));
vi.mock("@/lib/data/student-challenges", () => ({ challengeUpstreamScope: mocks.scope }));
vi.mock("@/lib/teacher-app/client", () => ({
  getTeacherChallengeMcq: mocks.mcq,
  requestTeacherExplainerAnimation: mocks.animation,
}));

import {
  FundamentalsChangedError,
  checkChallengeFundamental,
  explainChallengeFundamental,
  getChallengeFundamentals,
} from "@/lib/data/challenge-fundamentals";

/**
 * The fundamentals check in step one: five MCQs on the micro-topic. The key is
 * held on the server and revealed only once an answer is in; a wrong answer is
 * told WHICH option was right; the why is a video made for that one answer.
 */

const QUESTION = {
  id: "mq_mesh1",
  text: "In mesh analysis, which law is applied around each mesh?",
  options: [
    { key: "A", text: "Kirchhoff's current law" },
    { key: "B", text: "Kirchhoff's voltage law" },
    { key: "C", text: "Ohm's law alone" },
    { key: "D", text: "Norton's theorem" },
  ],
  correct: "B",
  explanation: "Mesh analysis sums the voltages around each closed loop, which is KVL.",
};

let scopeCount = 0;

describe("the fundamentals check", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // A distinct scope per test, so the held set of one test is not the next one's.
    scopeCount += 1;
    mocks.scope.mockResolvedValue({
      collectionKey: `key-${scopeCount}`,
      subject: "Electric Circuit Theory",
      topics: ["mesh_analysis"],
      topicTitle: "Mesh Analysis",
    });
    mocks.mcq.mockResolvedValue({ questions: [QUESTION], served_from: "cache" });
    mocks.animation.mockResolvedValue({
      spec_hash: "ab".repeat(16), concept: "", status: "queued", derivatives: {}, error: "", updated_at: "",
    });
  });

  it("hands the student the questions without the answer key", async () => {
    const questions = await getChallengeFundamentals("student", "challenge-1");
    expect(questions).toEqual([{ id: QUESTION.id, text: QUESTION.text, options: QUESTION.options }]);
    expect(JSON.stringify(questions)).not.toContain(QUESTION.explanation);
    expect(questions?.[0]).not.toHaveProperty("correct");
    expect(mocks.mcq).toHaveBeenCalledWith(`key-${scopeCount}`, {
      subject: "Electric Circuit Theory",
      topics: ["mesh_analysis"],
    });
  });

  it("tells a wrong answer which option is correct", async () => {
    const wrong = await checkChallengeFundamental("student", "challenge-1", QUESTION.id, "A");
    expect(wrong).toMatchObject({
      isCorrect: false,
      selected: "A",
      correct: "B",
      correctText: "Kirchhoff's voltage law",
    });
    const right = await checkChallengeFundamental("student", "challenge-1", QUESTION.id, "B");
    expect(right?.isCorrect).toBe(true);
    // Both checks read the set held from the first: a click is a lookup, not a round trip.
    expect(mocks.mcq).toHaveBeenCalledTimes(1);
  });

  it("says so when the set was re-written upstream, rather than marking an answer", async () => {
    // A server that holds nothing (restarted, another instance) asks upstream,
    // where the notes were re-indexed after the student loaded the page: the
    // question they answered no longer exists. Asked twice, never guessed at.
    mocks.mcq.mockResolvedValue({ questions: [{ ...QUESTION, id: "mq_new" }], served_from: "lane_notes_llm" });
    await expect(checkChallengeFundamental("student", "challenge-1", QUESTION.id, "B")).rejects.toBeInstanceOf(
      FundamentalsChangedError,
    );
    expect(mocks.mcq).toHaveBeenCalledTimes(2);
  });

  it("answers from the set the student was shown while it is held", async () => {
    await getChallengeFundamentals("student", "challenge-1");
    mocks.mcq.mockResolvedValue({ questions: [{ ...QUESTION, id: "mq_new" }], served_from: "lane_notes_llm" });
    expect((await checkChallengeFundamental("student", "challenge-1", QUESTION.id, "B"))?.isCorrect).toBe(true);
  });

  it("is not this student's challenge: nothing, and no upstream call", async () => {
    mocks.scope.mockResolvedValue(null);
    expect(await getChallengeFundamentals("student", "someone-elses")).toBeNull();
    expect(mocks.mcq).not.toHaveBeenCalled();
  });

  it("asks, urgently, for the question's shared video — the same whichever wrong option was picked", async () => {
    const explainer = await explainChallengeFundamental("student", "challenge-1", QUESTION.id, "A");
    expect(explainer?.specHash).toBe("ab".repeat(16));
    const [, request] = mocks.animation.mock.calls[0];
    expect(request.fresh).toBeUndefined();
    expect(request.priority).toBe("urgent");
    expect(request.seconds).toBeLessThanOrEqual(20);
    expect(request.concept.length).toBeLessThanOrEqual(200);
    expect(request.notes.length).toBeLessThanOrEqual(2000);
    expect(request.notes).toContain("Correct answer: B) Kirchhoff's voltage law");
    expect(request.notes).not.toContain("They chose");
    expect(request.subject).toBe("Electric Circuit Theory");
  });

  it("makes no video for a correct answer — a render costs money", async () => {
    await expect(explainChallengeFundamental("student", "challenge-1", QUESTION.id, "B")).rejects.toBeInstanceOf(
      RangeError,
    );
    expect(mocks.animation).not.toHaveBeenCalled();
  });
});
