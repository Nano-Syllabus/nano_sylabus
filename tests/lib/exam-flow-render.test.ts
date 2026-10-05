import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));
vi.mock("next/image", () => ({
  default: ({ alt }: { alt: string }) => createElement("img", { alt }),
}));
vi.mock("@/components/faculty-selection-dialog", () => ({
  FacultySelectionDialog: () => createElement("div", { "data-faculty-dialog": "" }),
}));
vi.mock("@/components/billing-page-client", () => ({
  PaymentSubmissionModal: () => createElement("div", { "data-qr-modal": "" }),
}));

import { ExamCheckout, ExamPreparationFlow } from "@/components/exam-enrollment-flow";
import { DEFAULT_EXAM_CONFIG, type ExamConfig } from "@/lib/exam-enrollment";
import type { EnrollmentExam } from "@/lib/data/exam-enrollment";

const planId = "11111111-1111-4111-8111-111111111111";
const plan = {
  id: planId,
  name: "Plus",
  slug: "plus",
  credits: 100,
  price: 450,
  currency: "NPR",
  billingType: "monthly" as const,
  productType: "individual" as const,
  seatLimit: 1,
  isUnlimited: false,
  features: ["Daily challenges"],
  isActive: true,
  createdAt: "",
  updatedAt: "",
};
const faculties = [
  { id: "f1", slug: "bct-license", name: "BCT License", faculty: "Computer", university: null, subjects: [{ id: "s1", name: "Networks" }] },
  { id: "f2", slug: "bei", name: "BEI", faculty: null, university: null, subjects: [] },
];
const exam = (config: Partial<ExamConfig> = {}): EnrollmentExam => ({
  slug: "license",
  name: "License Preparation",
  config: { ...DEFAULT_EXAM_CONFIG, enabled: true, facultySlugs: ["bct-license", "bei"], ...config },
  faculties,
});
const render = (props: Record<string, unknown>) =>
  renderToStaticMarkup(createElement(ExamPreparationFlow, { plans: [plan], ...props } as never));

describe("the exam's student journey", () => {
  it("starts with one onboarding question at a time, like the main app", () => {
    const html = render({ exam: exam() });
    expect(html).toContain("When are you planning to take your exam?");
    expect(html).toContain("1 / 3");
    expect(html).not.toContain("How much time can you study each day?");
  });

  it("starts at the faculty list when the admin turns questions off", () => {
    const html = render({ exam: exam({ askQuestions: false, questions: [] }) });
    expect(html).toContain("BCT License");
    expect(html).not.toContain("1 / 3");
  });

  it("lists only the exam's faculties as joinable cards, with Continue held until one is chosen", () => {
    const html = render({ exam: exam({ askQuestions: false, questions: [] }) });
    expect(html).toContain('aria-label="Join BCT License"');
    expect(html).toContain('aria-label="Join BEI"');
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Choose your faculty/);
  });

  it("shows plans with the chosen faculty's own price", () => {
    const config = { facultyPrices: { "bct-license": { [planId]: 300 } } };
    const html = render({
      exam: exam({ askQuestions: false, questions: [], ...config }),
      initialStep: "plans",
      initialIntent: { examSlug: "license", planId, billingMonths: 1, answers: {}, facultySlug: "bct-license" },
    });
    expect(html).toContain("300");
    expect(html).not.toContain(">450<");
    expect(html).toContain("Price for BCT License.");
  });

  it("locks the faculty chosen before sign-in and opens the payment QR, without asking again", () => {
    const html = renderToStaticMarkup(
      createElement(ExamCheckout, {
        exam: exam({ askQuestions: false, questions: [] }),
        plans: [plan],
        intent: { examSlug: "license", planId, billingMonths: 1, answers: {}, facultySlug: "bei" },
        enrollment: null,
        paymentConfig: { id: "p", paymentMethod: "bank_transfer", displayName: "Bank", bankName: null, accountName: "Nano", accountNumber: null, qrImageUrl: "https://x/qr.png", instructions: null },
      } as never),
    );
    expect(html).toContain("Joining BEI…");
    expect(html).not.toContain("data-faculty-dialog");
  });
});
