import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  exam: vi.fn(),
  plans: vi.fn(),
  enrollment: vi.fn(),
  joined: vi.fn(),
  payment: vi.fn(),
  paid: vi.fn(),
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
vi.mock("@/lib/data/faculty-lock", () => ({ hasJoinedFaculty: mocks.joined }));
vi.mock("@/lib/data/billing", () => ({
  getActiveManualPaymentConfig: mocks.payment,
  hasActiveSubscription: mocks.paid,
}));
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

import Prepare from "@/app/prepare/[slug]/page";
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
  mocks.joined.mockResolvedValue(false);
  mocks.payment.mockResolvedValue(null);
  mocks.paid.mockResolvedValue(false);
  mocks.site.mockResolvedValue({ content: {}, examConfig: { enabled: true } });
});
afterEach(() => vi.unstubAllEnvs());

const open = (host = "nanosyllabus.com") => {
  mocks.host = host;
  return Prepare({ params: Promise.resolve({ slug: "license" }) });
};

describe("Continue learning from an exam site", () => {
  it("onboards a guest: questions, faculties, plans, then sign-in", async () => {
    const page = await open();
    expect(page.type).toBe(ExamPreparationFlow);
    expect(page.props.signedIn).toBe(false);
    expect(page.props.exam.slug).toBe("license");
  });

  it("sends a student who already joined a faculty straight into the app", async () => {
    mocks.auth.mockResolvedValue({ user: { id: "student", role: "student" } });
    mocks.joined.mockResolvedValue(true);
    await expect(open()).rejects.toThrow("REDIRECT:/app/challenges");
  });

  it("onboards a signed-in student who has not joined yet, without a second login", async () => {
    mocks.auth.mockResolvedValue({ user: { id: "student", role: "student" } });
    const page = await open();
    expect(page.type).toBe(ExamPreparationFlow);
    expect(page.props.signedIn).toBe(true);
  });

  it("shows nothing for an unknown site", async () => {
    mocks.exam.mockResolvedValue(null);
    mocks.site.mockResolvedValue(null);
    await expect(open()).rejects.toThrow("NOT_FOUND");
  });

  it("says faculties are coming for a live site without them, never Browse", async () => {
    mocks.exam.mockResolvedValue(null);
    mocks.site.mockResolvedValue({ slug: "license", name: "License Preparation" });
    const html = renderToStaticMarkup(await open());
    expect(html).toContain("Faculties are almost ready");
    expect(html).not.toContain("/communities");
  });

  it("keeps onboarding on the subdomain's own dashboard", async () => {
    const page = await open("license.nanosyllabus.com");
    expect(page.type).toBe(ExamPreparationFlow);
    expect(mocks.redirect).not.toHaveBeenCalled();
  });

  it("keeps local development on the local host", async () => {
    vi.stubEnv("NODE_ENV", "development");
    const page = await open("license.localhost:3001");
    expect(page.type).toBe(ExamPreparationFlow);
  });
});

describe("exam payment", () => {
  it("keeps payment on the subdomain instead of the main site", async () => {
    mocks.host = "license.nanosyllabus.com";
    mocks.cookie = JSON.stringify(intent);
    await PaymentPage(props());
    expect(mocks.redirect).not.toHaveBeenCalled();
  });

  it("keeps a joined, paying student off the pricing page", async () => {
    mocks.auth.mockResolvedValue({ user: { id: "student" } });
    mocks.joined.mockResolvedValue(true);
    mocks.paid.mockResolvedValue(true);
    await expect(PaymentPage(props())).rejects.toThrow("REDIRECT:/app/challenges");
  });

  it("allows an authenticated student to open payment for an upgrade", async () => {
    mocks.auth.mockResolvedValue({ user: { id: "student" } });
    const page = await PaymentPage(props(JSON.stringify(intent)));
    expect(page.type).toBe(ExamCheckout);
    expect(page.props.intent).toEqual(intent);
    expect(page.props.enrollment.facultyId).toBe("f1");
  });

  it("keeps published exam landing buttons on the subdomain's own sign-in", async () => {
    const page = await SiteLandingPage({ params: Promise.resolve({ slug: "license" }) });
    expect(page.props.appOrigin).toBe("");
    expect(page.props.examSlug).toBe("license");
  });
});
