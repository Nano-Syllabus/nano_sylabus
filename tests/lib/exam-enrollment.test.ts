import { describe, expect, it } from "vitest";
import {
  DEFAULT_EXAM_CONFIG,
  examConfigSchema,
  readExamIntent,
  readExamConfig,
  examPlanMonthlyPrice,
  examText,
  validateExamAnswers,
} from "@/lib/exam-enrollment";

describe("exam onboarding validation", () => {
  const config = {
    ...DEFAULT_EXAM_CONFIG,
    enabled: true,
    facultySlugs: ["bct-license", "bei-license"],
  };
  it("requires a supported faculty and unique question IDs", () => {
    expect(examConfigSchema.safeParse({ ...config, facultySlugs: [] }).success).toBe(false);
    expect(
      examConfigSchema.safeParse({
        ...config,
        questions: [config.questions[0], config.questions[0]],
      }).success,
    ).toBe(false);
  });
  it("requires a real answer for every question and removes unknown answers", () => {
    const answers = Object.fromEntries(config.questions.map((q) => [q.id, q.options[0]]));
    expect(validateExamAnswers(config, { ...answers, unused: "arbitrary" })).toEqual(answers);
    expect(() => validateExamAnswers(config, { ...answers, exam_date: "forged" })).toThrow(
      "Choose an answer",
    );
    expect(() => validateExamAnswers(config, {})).toThrow("Choose an answer");
  });
  it("ignores malformed checkout cookies", () => {
    expect(readExamIntent("broken")).toBeNull();
    expect(
      readExamIntent(JSON.stringify({ examSlug: "../bad", planId: "bad", billingMonths: 999 })),
    ).toBeNull();
  });
  it("keeps existing exam settings and supplies new text and duration defaults", () => {
    const legacy = {
      enabled: true,
      facultySlugs: ["bct-license"],
      planIds: [],
      questions: config.questions,
    };
    expect(readExamConfig(legacy)).toEqual({
      ...legacy,
      copy: DEFAULT_EXAM_CONFIG.copy,
      billingMonths: [1, 3],
      askQuestions: true,
      facultyPrices: {},
    });
    expect(examText("Prepare for {exam}", "Engineering License")).toBe(
      "Prepare for Engineering License",
    );
  });
  it("lets an exam skip onboarding questions, but not ask for none", () => {
    expect(
      examConfigSchema.safeParse({ ...config, askQuestions: false, questions: [] }).success,
    ).toBe(true);
    expect(examConfigSchema.safeParse({ ...config, questions: [] }).success).toBe(false);
    expect(validateExamAnswers({ ...config, askQuestions: false }, {})).toEqual({});
    expect(() => validateExamAnswers({ ...config, askQuestions: true }, {})).toThrow();
  });
  it("prices a plan per faculty, falling back to the plan's own price", () => {
    const plan = { id: "11111111-1111-4111-8111-111111111111", price: 450 };
    const prices = { facultyPrices: { bct: { [plan.id]: 300 } } };
    expect(examPlanMonthlyPrice(prices, "bct", plan)).toBe(300);
    expect(examPlanMonthlyPrice(prices, "bei", plan)).toBe(450);
    expect(examPlanMonthlyPrice(prices, undefined, plan)).toBe(450);
  });
  it("requires valid durations and distinct answer choices", () => {
    expect(examConfigSchema.safeParse({ ...config, billingMonths: [] }).success).toBe(false);
    expect(examConfigSchema.safeParse({ ...config, billingMonths: [6] }).success).toBe(false);
    expect(
      examConfigSchema.safeParse({
        ...config,
        questions: [{ id: "goal", prompt: "When?", options: ["Soon", "Soon"] }],
      }).success,
    ).toBe(false);
  });
});
