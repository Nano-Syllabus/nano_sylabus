import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  enrollment: vi.fn(),
  exams: vi.fn(),
  exam: vi.fn(),
  paid: vi.fn(),
  pathname: "/app/today",
  host: "localhost:3001",
  cookie: undefined as string | undefined,
}));
vi.mock("@/lib/dev-auth-bypass", () => ({ DEV_AUTH_BYPASS: false, DEV_BYPASS_USER_ID: "dev" }));
vi.mock("@/lib/auth", () => ({ requireOnboardedUser: mocks.auth }));
vi.mock("@/lib/data/exam-enrollment", () => ({
  getStudentExamEnrollment: mocks.enrollment,
  listEnrollmentExams: mocks.exams,
  getEnrollmentExam: mocks.exam,
}));
vi.mock("@/lib/data/billing", () => ({ hasActiveSubscription: mocks.paid }));
vi.mock("next/headers", () => ({
  headers: async () => new Headers({ host: mocks.host }),
  cookies: async () => ({ get: () => (mocks.cookie ? { value: mocks.cookie } : undefined) }),
}));
vi.mock("next/navigation", () => ({
  usePathname: () => mocks.pathname,
  redirect: vi.fn(() => {
    throw new Error("Unexpected redirect to payment");
  }),
}));
vi.mock("@/components/app-sidebar", () => ({ AppSidebar: () => null }));
vi.mock("@/components/nanoai-floating-chat", () => ({
  NanoAiFloatingChat: () => createElement("div", null, "AI study assistant"),
}));
vi.mock("@/components/query-identity", () => ({ QueryIdentity: () => null }));
vi.mock("@/components/tab-warmer", () => ({ TabWarmer: () => null }));
vi.mock("@/components/faculty-selection-dialog", () => ({ FacultySelectionGate: () => null }));

import AppLayout from "@/app/app/layout";
import { AppShell } from "@/components/app-shell";

const enrollment = {
  examSlug: "license",
  examName: "License Preparation",
  facultyId: "f1",
  facultyName: "BEI",
};

beforeEach(() => {
  mocks.auth.mockResolvedValue({ user: { id: "student", role: "student" } });
  mocks.enrollment.mockResolvedValue(enrollment);
  mocks.exams.mockResolvedValue([]);
  mocks.exam.mockResolvedValue({ slug: "license" });
  mocks.paid.mockResolvedValue(false);
  mocks.pathname = "/app/today";
  mocks.host = "localhost:3001";
  mocks.cookie = undefined;
});

async function layout(children: ReactNode = "Dashboard progress") {
  return AppLayout({ children });
}

describe("dashboard access after skipping exam payment", () => {
  it("renders the unpaid student's dashboard instead of redirecting to payment", async () => {
    const element = await layout();
    expect(element.type).toBe(AppShell);
    expect(element.props.upgradeHref).toBe("/payment/license");
    const html = renderToStaticMarkup(element);
    expect(html).toContain("Dashboard progress");
    expect(html).toContain('href="/payment/license"');
    expect(html).toContain("Upgrade");
    expect(html).not.toContain("AI study assistant");
  });

  it.each(["/app/challenges", "/app/chat", "/app/notes/saved", "/app/exams"])(
    "offers an upgrade when an unpaid student directly opens %s",
    async (pathname) => {
      mocks.pathname = pathname;
      const html = renderToStaticMarkup(await layout("Paid learning activity"));
      expect(html).not.toContain("Paid learning activity");
      expect(html).toContain("Upgrade to start studying");
      expect(html).toContain('href="/app/today"');
    },
  );

  it.each(["/app/settings", "/app/community", "/app/billing"])(
    "keeps %s accessible for unpaid students",
    async (pathname) => {
      mocks.pathname = pathname;
      expect(renderToStaticMarkup(await layout("Accessible page"))).toContain("Accessible page");
    },
  );

  it("restores normal study actions for an active subscriber", async () => {
    mocks.paid.mockResolvedValue(true);
    mocks.pathname = "/app/challenges";
    const element = await layout("Paid learning activity");
    expect(element.props.upgradeHref).toBeNull();
    const html = renderToStaticMarkup(element);
    expect(html).toContain("Paid learning activity");
    expect(html).toContain("AI study assistant");
    expect(html).not.toContain("Upgrade");
  });

  it("preserves the existing free experience for students outside an exam", async () => {
    mocks.enrollment.mockResolvedValue(null);
    const element = await layout();
    expect(element.props.upgradeHref).toBeNull();
    expect(mocks.paid).not.toHaveBeenCalled();
  });

  it.each(["admin", "super_admin"])("does not lock %s accounts", async (role) => {
    mocks.auth.mockResolvedValue({ user: { id: "admin", role } });
    expect((await layout()).props.upgradeHref).toBeNull();
    expect(mocks.paid).not.toHaveBeenCalled();
  });

  it("falls back to billing when the enrolled exam is no longer available", async () => {
    mocks.exam.mockResolvedValue(null);
    expect((await layout()).props.upgradeHref).toBe("/app/billing");
  });
});
