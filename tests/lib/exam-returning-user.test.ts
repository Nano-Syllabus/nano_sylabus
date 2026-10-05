import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  exam: vi.fn(),
  plans: vi.fn(),
  enrollment: vi.fn(),
  payment: vi.fn(),
  site: vi.fn(),
  redirect: vi.fn((href: string) => {
    throw new Error(`REDIRECT:${href}`);
  }),
  host: "nanosyllabus.com",
  cookie: undefined as string | undefined,
}));
vi.mock("next/navigation", () => ({
  redirect: mocks.redirect,
  notFound: () => {
    throw new Error("NOT_FOUND");
  },
}));
vi.mock("next/headers", () => ({
  headers: async () => new Headers({ host: mocks.host }),
  cookies: async () => ({ get: () => (mocks.cookie ? { value: mocks.cookie } : undefined) }),
}));
vi.mock("@/lib/auth", () => ({ getCurrentAuth: mocks.auth }));
vi.mock("@/lib/data/exam-enrollment", () => ({
  getEnrollmentExam: mocks.exam,
  getExamPlans: mocks.plans,
  getStudentExamEnrollment: mocks.enrollment,
}));
vi.mock("@/lib/data/billing", () => ({ getActiveManualPaymentConfig: mocks.payment }));
vi.mock("@/lib/student-courses", () => ({
  getPublishedCourse: vi.fn(),
  enrollStudentInCourse: vi.fn(),
}));
vi.mock("@/lib/data/landing-sites", () => ({ getPublishedLandingSite: mocks.site }));
vi.mock("@/components/landing-view", () => ({ LandingView: () => null }));
vi.mock("@/components/exam-enrollment-flow", () => ({
  ExamPreparationFlow: () => null,
  ExamCheckout: () => null,
}));

import PreparationPage from "@/app/prepare/[slug]/page";
import PaymentPage from "@/app/payment/[slug]/page";
import SiteLandingPage from "@/app/sites/[slug]/page";
import { ExamCheckout, ExamPreparationFlow } from "@/components/exam-enrollment-flow";
import { DEFAULT_EXAM_CONFIG } from "@/lib/exam-enrollment";

const intent = {
  examSlug: "license",
  planId: "11111111-1111-4111-8111-111111111111",
  billingMonths: 3,
  facultySlug: "bei",
  answers: { exam_date: "Within a month" },
};
const props = (value?: string) => ({
  params: Promise.resolve({ slug: "license" }),
  searchParams: Promise.resolve({ intent: value }),
});

beforeEach(() => {
  vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv("NEXT_PUBLIC_ROOT_DOMAIN", "nanosyllabus.com");
  mocks.host = "nanosyllabus.com";
  mocks.cookie = undefined;
  mocks.auth.mockResolvedValue({ user: null });
  mocks.exam.mockResolvedValue({
    slug: "license",
    config: { ...DEFAULT_EXAM_CONFIG, enabled: true },
    faculties: [],
  });
  mocks.plans.mockResolvedValue([]);
  mocks.enrollment.mockResolvedValue({ examSlug: "license", facultyId: "f1" });
  mocks.payment.mockResolvedValue(null);
  mocks.site.mockResolvedValue({ content: {}, examConfig: { enabled: true } });
});
afterEach(() => vi.unstubAllEnvs());

describe("returning students opening exam preparation", () => {
  it.each(["free", "plus", "pro"])(
    "sends a signed-in %s student straight to the dashboard",
    async (tier) => {
      mocks.auth.mockResolvedValue({
        user: { id: "student", role: "student", activePlanTier: tier },
      });
      await expect(PreparationPage(props())).rejects.toThrow("REDIRECT:/app/today");
      expect(mocks.plans).not.toHaveBeenCalled();
    },
  );

  it.each(["admin", "super_admin"])(
    "does not repeat preparation for a signed-in %s",
    async (role) => {
      mocks.auth.mockResolvedValue({ user: { id: "admin", role } });
      await expect(PreparationPage(props())).rejects.toThrow("REDIRECT:/app/today");
    },
  );

  it("keeps the preparation flow available to guests", async () => {
    const page = await PreparationPage(props());
    expect(page.type).toBe(ExamPreparationFlow);
    expect(page.props.exam.slug).toBe("license");
    expect(mocks.plans).toHaveBeenCalledOnce();
  });

  it("still rejects an unavailable exam for guests", async () => {
    mocks.exam.mockResolvedValue(null);
    await expect(PreparationPage(props())).rejects.toThrow("NOT_FOUND");
  });

  it.each([PreparationPage, PaymentPage])(
    "moves old subdomain links to the main site before checking the session",
    async (Page) => {
      mocks.host = "license.nanosyllabus.com";
      const route = Page === PreparationPage ? "prepare" : "payment";
      await expect(Page(props())).rejects.toThrow(
        `REDIRECT:https://nanosyllabus.com/${route}/license`,
      );
      expect(mocks.auth).not.toHaveBeenCalled();
      expect(mocks.exam).not.toHaveBeenCalled();
    },
  );

  it.each([PreparationPage, PaymentPage])(
    "preserves a valid subdomain checkout intent on the main site",
    async (Page) => {
      mocks.host = "license.nanosyllabus.com";
      mocks.cookie = JSON.stringify(intent);
      await expect(Page(props())).rejects.toThrow("REDIRECT:");
      const destination = new URL(mocks.redirect.mock.lastCall![0]);
      expect(destination.origin).toBe("https://nanosyllabus.com");
      expect(JSON.parse(destination.searchParams.get("intent")!)).toEqual(intent);
    },
  );

  it("prefers valid intent from the link over a stale cookie", async () => {
    mocks.cookie = JSON.stringify({ ...intent, facultySlug: "bct" });
    const page = await PreparationPage(props(JSON.stringify(intent)));
    expect(page.props.initialIntent).toEqual(intent);
  });

  it.each(["not-json", JSON.stringify({ ...intent, examSlug: "other-exam" })])(
    "does not forward invalid or unrelated intent: %s",
    async (value) => {
      mocks.host = "license.nanosyllabus.com";
      await expect(PreparationPage(props(value))).rejects.toThrow(
        "REDIRECT:https://nanosyllabus.com/prepare/license",
      );
      expect(mocks.redirect.mock.lastCall![0]).not.toContain("?");
    },
  );

  it("checks the main-domain session after the subdomain redirect", async () => {
    mocks.host = "license.nanosyllabus.com";
    await expect(PreparationPage(props())).rejects.toThrow(
      "REDIRECT:https://nanosyllabus.com/prepare/license",
    );
    mocks.host = "nanosyllabus.com";
    mocks.auth.mockResolvedValue({ user: { id: "student", role: "student" } });
    await expect(PreparationPage(props())).rejects.toThrow("REDIRECT:/app/today");
  });

  it("allows an authenticated student to open payment for an upgrade", async () => {
    mocks.auth.mockResolvedValue({ user: { id: "student" } });
    const page = await PaymentPage(props(JSON.stringify(intent)));
    expect(page.type).toBe(ExamCheckout);
    expect(page.props.intent).toEqual(intent);
    expect(page.props.enrollment.facultyId).toBe("f1");
  });

  it.each(["development", "test"])(
    "keeps local preparation on the local host in %s",
    async (mode) => {
      vi.stubEnv("NODE_ENV", mode);
      mocks.host = "license.localhost:3001";
      const page = await PreparationPage(props());
      expect(page.type).toBe(ExamPreparationFlow);
      expect(mocks.redirect).not.toHaveBeenCalled();
    },
  );

  it("does not redirect an unrelated preview host to production", async () => {
    mocks.host = "nano-preview.vercel.app";
    expect((await PreparationPage(props())).type).toBe(ExamPreparationFlow);
  });

  it("points published exam landing buttons at the app's session host", async () => {
    const page = await SiteLandingPage({ params: Promise.resolve({ slug: "license" }) });
    expect(page.props.appOrigin).toBe("https://nanosyllabus.com");
    expect(page.props.examSlug).toBe("license");
  });
});
