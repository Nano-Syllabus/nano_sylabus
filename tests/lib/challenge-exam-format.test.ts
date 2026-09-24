import { beforeAll, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ mcq: vi.fn() }));
vi.mock("@/lib/teacher-app/client", () => ({ getTeacherChallengeMcq: mocks.mcq }));

import {
  ChallengeMcqUnavailableError,
  choiceQuestionsOf,
  combinedChallengeGrade,
  evaluateByTopic,
  gradeChallengeChoices,
  issueChallengeChoiceQuestions,
  parseChoiceSelections,
  sealedChoiceQuestion,
  unsealAnswer,
} from "@/lib/data/challenge-exam-format";

/**
 * MCQ challenge exams — a community's creator chose MCQ or hybrid questions.
 * The paper sits on a row the browser receives whole, so the key must not be
 * readable from it, and marking must still work from that row alone.
 */

beforeAll(() => {
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-for-tests";
});

const upstream = (id: string, correct: string) => ({
  id,
  text: `What is ${id}?`,
  options: ["A", "B", "C", "D"].map((key) => ({ key, text: `option ${key} of ${id}` })),
  correct,
  explanation: "because",
});

describe("sealed MCQ answers", () => {
  it("keeps the correct option off the stored question and recovers it on the server", () => {
    const question = sealedChoiceQuestion("challenge-1", upstream("q1", "C"), "Mesh analysis", 2);
    expect(JSON.stringify(question)).not.toMatch(/"correct"|explanation/);
    expect(unsealAnswer("challenge-1", question)).toBe("C");
    // A seal copied onto another challenge's paper opens nothing.
    expect(unsealAnswer("challenge-2", question)).toBe("");
  });

  it("marks right, wrong and blank picks, and says which option was correct", () => {
    const questions = [
      sealedChoiceQuestion("c", upstream("q1", "A"), "Topic", 2),
      sealedChoiceQuestion("c", upstream("q2", "B"), "Topic", 2),
      sealedChoiceQuestion("c", upstream("q3", "D"), "Topic", 2),
    ];
    const graded = gradeChallengeChoices("c", questions, { q1: "A", q2: "C" });
    expect(graded.map((item) => item.score)).toEqual([2, 0, 0]);
    expect(graded[1].feedback).toContain("The correct answer is B.");
    expect(graded[2].answered).toBe(false);
    expect(graded[2].feedback).toContain("Not answered.");
  });

  it("drops picks for unknown questions and options that do not exist", () => {
    const questions = [sealedChoiceQuestion("c", upstream("q1", "A"), "Topic", 2)];
    expect(parseChoiceSelections({ q1: "b", q9: "A" }, questions)).toEqual({ q1: "B" });
    expect(parseChoiceSelections({ q1: "Z" }, questions)).toEqual({});
    expect(parseChoiceSelections("nonsense", questions)).toEqual({});
  });

  it("finds the choice questions of a hybrid paper and leaves the written one", () => {
    const choice = sealedChoiceQuestion("c", upstream("q1", "A"), "Topic", 2);
    const written = { id: "w1", question: "Derive it.", topic: "Topic", marks: 10, questionType: "Long answer" };
    expect(choiceQuestionsOf([choice, written]).map((q) => q.id)).toEqual(["q1"]);
  });
});

describe("one grade for the sitting", () => {
  it("passes an all-MCQ paper at 40% of its marks", () => {
    const questions = Array.from({ length: 10 }, (_, i) => sealedChoiceQuestion("c", upstream(`q${i}`, "A"), "Topic", 2));
    const four = Object.fromEntries(questions.slice(0, 4).map((q) => [q.id, "A"]));
    const grade = combinedChallengeGrade({
      attemptId: "mcq-1",
      subject: "Circuits",
      passMarks: 8,
      choices: gradeChallengeChoices("c", questions, four),
    });
    expect(grade.total_score).toBe(8);
    expect(grade.total_marks).toBe(20);
    expect(grade.passed).toBe(true);
    expect(grade.evaluation?.chapters[0].status).toBe("weak");
  });

  it("joins a hybrid paper's written marks to its MCQ marks", () => {
    const questions = [sealedChoiceQuestion("c", upstream("q1", "A"), "Topic", 2)];
    const grade = combinedChallengeGrade({
      attemptId: "attempt-1",
      subject: "Circuits",
      passMarks: 5,
      choices: gradeChallengeChoices("c", questions, { q1: "A" }),
      written: {
        attempt_id: "attempt-1",
        subject: "Circuits",
        results: [{ question_id: "w1", topic: "Topic", question: "Derive it.", marks: 10, score: 4, feedback: "ok" }],
        total_score: 4,
        total_marks: 10,
        percentage: 40,
        pass_marks: 4,
        passed: true,
        graded: true,
      },
    });
    expect(grade.total_score).toBe(6);
    expect(grade.total_marks).toBe(12);
    expect(grade.passed).toBe(true);
    expect(grade.results.map((result) => result.question_id)).toEqual(["q1", "w1"]);
  });

  it("classifies topics as the course API does", () => {
    const evaluation = evaluateByTopic([
      { topic: "A", marks: 4, score: 3, answered: true },
      { topic: "B", marks: 4, score: 2, answered: true },
      { topic: "C", marks: 4, score: 0, answered: false },
    ]);
    expect(evaluation.chapters.map((chapter) => chapter.status)).toEqual(["strong", "weak", "not_attempted"]);
    expect(evaluation.total_score).toBe(5);
  });
});

describe("setting the MCQ part", () => {
  it("refuses a course service that answered with the fundamentals set", async () => {
    mocks.mcq.mockResolvedValueOnce({ questions: [upstream("q1", "A")], served_from: "cache" });
    await expect(
      issueChallengeChoiceQuestions({
        collectionKey: "k", challengeId: "c", subject: "S", topicKeys: ["t"], topicTitle: "T", count: 10, attemptNumber: 1,
      }),
    ).rejects.toBeInstanceOf(ChallengeMcqUnavailableError);
  });

  it("asks for a different variant on a retake and seals every question", async () => {
    mocks.mcq.mockResolvedValue({
      purpose: "exam",
      marks: 2,
      served_from: "cache",
      questions: [upstream("q1", "A"), upstream("q2", "B")],
    });
    const first = await issueChallengeChoiceQuestions({
      collectionKey: "k", challengeId: "c", subject: "S", topicKeys: ["t"], topicTitle: "T", count: 10, attemptNumber: 1,
    });
    await issueChallengeChoiceQuestions({
      collectionKey: "k", challengeId: "c", subject: "S", topicKeys: ["t"], topicTitle: "T", count: 10, attemptNumber: 2,
    });
    expect(mocks.mcq.mock.calls.map((call) => call[1].variant)).toEqual([0, 1]);
    expect(mocks.mcq.mock.calls[0][1]).toMatchObject({ purpose: "exam", count: 10 });
    expect(first).toHaveLength(2);
    expect(first.every((question) => question.marks === 2 && unsealAnswer("c", question))).toBe(true);
  });
});
