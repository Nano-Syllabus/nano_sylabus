import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  exam: vi.fn(),
  plans: vi.fn(),
  enrollment: vi.fn(),
  joined: vi.fn(),
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
vi.mock("@/lib/data/faculty-lock", () => ({ hasJoinedFaculty: mocks.joined }));
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

import { GET as prepare } from "@/app/prepare/[slug]/route";
import PaymentPage from "@/app/payment/[slug]/page";
import SiteLandingPage from "@/app/sites/[slug]/page";
import { ExamCheckout } from "@/components/exam-enrollment-flow";
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
  mocks.site.mockResolvedValue({ content: {}, examConfig: { enabled: true } });
});
afterEach(() => vi.unstubAllEnvs());

const open = (host = "nanosyllabus.com") =>
  prepare(new Request(`https://${host}/prepare/license`, { headers: { host } }), {
    params: Promise.resolve({ slug: "license" }),
  });
const location = (response: Response) => response.headers.get("location");

describe("Continue learning from an exam site", () => {
  it("sends a guest to log in and back", async () => {
    expect(location(await open())).toBe(
      "https://nanosyllabus.com/login?next=%2Fprepare%2Flicense",
    );
  });

  it("sends a student who already joined a faculty straight into the app", async () => {
    mocks.auth.mockResolvedValue({ user: { id: "student", role: "student" } });
    mocks.joined.mockResolvedValue(true);
    const response = await open();
    expect(location(response)).toBe("https://nanosyllabus.com/app/challenges");
    expect(response.headers.get("set-cookie")).toBeNull();
  });

  it("lets a new student pick this exam's faculty inside the app", async () => {
    mocks.auth.mockResolvedValue({ user: { id: "student", role: "student" } });
    const response = await open();
    expect(location(response)).toBe("https://nanosyllabus.com/app/challenges");
    expect(response.headers.get("set-cookie")).toContain("nano_exam_site=license");
  });

  it("sends an unavailable exam home", async () => {
    mocks.exam.mockResolvedValue(null);
    expect(location(await open())).toBe("https://nanosyllabus.com/");
  });

  it("moves subdomain links to the main site before checking the session", async () => {
    expect(location(await open("license.nanosyllabus.com"))).toBe(
      "https://nanosyllabus.com/prepare/license",
    );
    expect(mocks.auth).not.toHaveBeenCalled();
  });

  it("keeps local development on the local host", async () => {
    vi.stubEnv("NODE_ENV", "development");
    expect(location(await open("license.localhost:3001"))).toContain(
      "license.localhost:3001/login",
    );
  });
});

describe("exam payment", () => {
  it("moves old subdomain links to the main site before checking the session", async () => {
    mocks.host = "license.nanosyllabus.com";
    await expect(PaymentPage(props())).rejects.toThrow(
      "REDIRECT:https://nanosyllabus.com/payment/license",
    );
    expect(mocks.auth).not.toHaveBeenCalled();
  });

  it("preserves a valid subdomain checkout intent on the main site", async () => {
    mocks.host = "license.nanosyllabus.com";
    mocks.cookie = JSON.stringify(intent);
    await expect(PaymentPage(props())).rejects.toThrow("REDIRECT:");
    const destination = new URL(mocks.redirect.mock.lastCall![0]);
    expect(destination.origin).toBe("https://nanosyllabus.com");
    expect(JSON.parse(destination.searchParams.get("intent")!)).toEqual(intent);
  });

  it("allows an authenticated student to open payment for an upgrade", async () => {
    mocks.auth.mockResolvedValue({ user: { id: "student" } });
    const page = await PaymentPage(props(JSON.stringify(intent)));
    expect(page.type).toBe(ExamCheckout);
    expect(page.props.intent).toEqual(intent);
    expect(page.props.enrollment.facultyId).toBe("f1");
  });

  it("points published exam landing buttons at the app's session host", async () => {
    const page = await SiteLandingPage({ params: Promise.resolve({ slug: "license" }) });
    expect(page.props.appOrigin).toBe("https://nanosyllabus.com");
    expect(page.props.examSlug).toBe("license");
  });
});
