import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ scope: vi.fn(), video: vi.fn(), row: null as Record<string, unknown> | null }));

vi.mock("@/lib/data/student-challenges", () => ({ challengeUpstreamScope: mocks.scope }));
vi.mock("@/lib/data/challenge-question-video", () => ({ requestQuestionVideo: mocks.video }));
vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: () => ({
    from: () => {
      let values: Record<string, unknown> | null = null;
      const query = {
        select: () => query,
        eq: () => query,
        update: (next: Record<string, unknown>) => {
          values = next;
          return query;
        },
        maybeSingle: async () => ({ data: mocks.row, error: null }),
        then: undefined,
      };
      // `update(...).eq(...).select()` resolves the write.
      (query as Record<string, unknown>).select = () =>
        values
          ? Promise.resolve((mocks.row = { ...mocks.row!, ...values }, { data: [{ id: "c" }], error: null }))
          : query;
      return query;
    },
  }),
}));

import { openExplanation, sealExplanation, sealedChoiceQuestion } from "@/lib/data/challenge-exam-format";
import { checkExamChoice, explainExamChoice } from "@/lib/data/challenge-exam-picks";

/**
 * An MCQ community's paper is answered one question at a time, and the answer
 * is shown at once — so the first pick must be final, and the paper must be
 * marked from the picks the server recorded, not from what the browser sends.
 */

beforeAll(() => {
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-for-tests";
});

const question = () =>
  sealedChoiceQuestion(
    "c",
    {
      id: "q1",
      text: "What does the physical layer define?",
      options: ["A", "B", "C", "D"].map((key) => ({ key, text: `option ${key}` })),
      correct: "B",
      explanation: "It defines the electrical characteristics of the medium.",
    },
    "Networking Model",
    2,
  );

beforeEach(() => {
  vi.clearAllMocks();
  mocks.scope.mockResolvedValue({ collectionKey: "k", subject: "s", topics: ["t"], topicTitle: "Networking Model" });
  mocks.video.mockResolvedValue({ specHash: "hash", status: "queued", derivatives: {}, error: "" });
  mocks.row = {
    id: "c",
    status: "started",
    updated_at: "2026-09-24T08:00:00.000Z",
    content: { examQuestions: [question()], examNegativePercent: 25 },
  };
});

describe("the explanation is sealed with the paper", () => {
  it("never sits on the row in the clear, and opens on the server", () => {
    const sealed = question();
    expect(JSON.stringify(sealed)).not.toContain("electrical characteristics");
    expect(openExplanation(sealed.explanationSealed)).toBe("It defines the electrical characteristics of the medium.");
    expect(openExplanation(`${sealExplanation("x").slice(0, -2)}zz`)).toBe("");
  });
});

describe("answering one question", () => {
  it("marks it at once, shows the correct option and why, and records the pick", async () => {
    const result = await checkExamChoice("u", "c", "q1", "c");
    expect(result).toMatchObject({
      selected: "C",
      correct: "B",
      correctText: "option B",
      isCorrect: false,
      explanation: "It defines the electrical characteristics of the medium.",
      score: -0.5,
    });
    expect((mocks.row!.content as { examPicks: Record<string, string> }).examPicks).toEqual({ q1: "C" });
  });

  it("keeps the first pick: choosing again after seeing the answer changes nothing", async () => {
    await checkExamChoice("u", "c", "q1", "C");
    const again = await checkExamChoice("u", "c", "q1", "B");
    expect(again).toMatchObject({ selected: "C", isCorrect: false });
    expect((mocks.row!.content as { examPicks: Record<string, string> }).examPicks).toEqual({ q1: "C" });
  });

  it("refuses a question that is not on the current paper", async () => {
    await expect(checkExamChoice("u", "c", "q9", "A")).rejects.toThrow("not on your current paper");
  });
});

describe("the question's video", () => {
  it("is the question's own, with the key opened on the server — the pick is not in it", async () => {
    await checkExamChoice("u", "c", "q1", "A");
    await explainExamChoice("u", "c", "q1");
    expect(mocks.video).toHaveBeenCalledWith(
      expect.objectContaining({ collectionKey: "k", subject: "s" }),
      expect.objectContaining({ correct: "B", explanation: expect.stringContaining("electrical") }),
      "urgent",
    );
  });

  it("opens every question once the paper is handed in (Revision)", async () => {
    mocks.row = { ...mocks.row!, status: "completed" };
    await explainExamChoice("u", "c", "q1");
    expect(mocks.video).toHaveBeenCalledTimes(1);
  });

  it("needs an answer first", async () => {
    await expect(explainExamChoice("u", "c", "q1")).rejects.toThrow("Answer the question first.");
  });
});
