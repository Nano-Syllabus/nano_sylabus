import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  enrollment: vi.fn(),
  exams: vi.fn(),
  exam: vi.fn(),
  paid: vi.fn(),
  member: vi.fn(),
  pathname: "/app/today",
  // The enrolled student's own subdomain: a dashboard opens only there.
  host: "license.localhost:3001",
  cookie: undefined as string | undefined,
}));
vi.mock("@/lib/dev-auth-bypass", () => ({ DEV_AUTH_BYPASS: false, DEV_BYPASS_USER_ID: "dev" }));
vi.mock("@/lib/auth", () => ({
  requireOnboardedUser: mocks.auth,
  getSessionUser: async () => ({ user: (await mocks.auth()).user }),
}));
vi.mock("@/lib/data/exam-enrollment", () => ({
  getStudentExamEnrollment: mocks.enrollment,
  listEnrollmentExams: mocks.exams,
  getEnrollmentExam: mocks.exam,
}));
vi.mock("@/lib/data/faculty-lock", () => ({
  hasFacultyMembership: mocks.member,
  getFacultySwitchAccess: async () => "all",
  currentMemberFacultySlug: async () => "bei",
}));
vi.mock("@/lib/data/billing", () => ({ hasActiveSubscription: mocks.paid }));
vi.mock("next/headers", () => ({
  headers: async () => new Headers({ host: mocks.host }),
  cookies: async () => ({ get: () => (mocks.cookie ? { value: mocks.cookie } : undefined) }),
}));
vi.mock("next/navigation", () => ({
  usePathname: () => mocks.pathname,
  useRouter: () => ({ refresh: () => {} }),
  redirect: vi.fn((to: string) => {
    throw new Error(`Unexpected redirect to ${to}`);
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
  mocks.member.mockResolvedValue(false);
  mocks.pathname = "/app/today";
  mocks.host = "license.localhost:3001";
  mocks.cookie = undefined;
});

async function layout(children: ReactNode = "Dashboard progress") {
  return AppLayout({ children });
}

describe("a dashboard opens on the student's own subdomain", () => {
  it("sends an enrolled student on the main domain to their exam's subdomain", async () => {
    mocks.host = "localhost:3001";
    await expect(layout()).rejects.toThrow(
      "Unexpected redirect to http://license.localhost:3001/app/today",
    );
  });

  it("sends a student on another exam's subdomain to their own", async () => {
    mocks.host = "ioe.localhost:3001";
    await expect(layout()).rejects.toThrow("license.localhost:3001/app/today");
  });

  it("gives a super admin on a subdomain that site's faculties to open", async () => {
    mocks.auth.mockResolvedValue({ user: { id: "boss", role: "super_admin" } });
    mocks.exam.mockResolvedValue({
      slug: "license",
      name: "License Preparation",
      faculties: [
        { slug: "bei", name: "BEI" },
        { slug: "bct", name: "BCT" },
      ],
    });
    const html = renderToStaticMarkup(await layout());
    expect(html).toContain("Super admin");
    expect(html).toContain("License Preparation");
    expect(html).toContain("BCT");
    expect(html).not.toContain("Faculty locked");
  });

  it("lets a student switch faculty within their exam instead of locking", async () => {
    mocks.enrollment.mockResolvedValue({ ...enrollment, facultySlug: "bei" });
    mocks.exam.mockResolvedValue({
      slug: "license",
      name: "License Preparation",
      faculties: [
        { slug: "bei", name: "BEI" },
        { slug: "bct", name: "BCT" },
      ],
    });
    const html = renderToStaticMarkup(await layout());
    expect(html).toContain("<select");
    expect(html).toContain("BCT");
    expect(html).not.toContain("Faculty locked");
    expect(html).toContain("Upgrade");
  });

  it("leaves admins wherever they are", async () => {
    mocks.host = "localhost:3001";
    mocks.auth.mockResolvedValue({ user: { id: "boss", role: "admin" } });
    expect((await layout()).type).toBe(AppShell);
  });
});

describe("dashboard access after skipping exam payment", () => {
  it("renders the unpaid student's dashboard with Upgrade leading to the pricing page", async () => {
    const element = await layout();
    expect(element.type).toBe(AppShell);
    expect(element.props.upgradeHref).toBe("/app/billing");
    const html = renderToStaticMarkup(element);
    expect(html).toContain("Dashboard progress");
    expect(html).toContain('href="/app/billing"');
    expect(html).toContain("Upgrade");
    expect(html).not.toContain("AI study assistant");
  });

  it.each(["/app/notes/saved", "/app/notes/revision/cards", "/app/exams"])(
    "offers an upgrade when an unpaid student directly opens %s",
    async (pathname) => {
      mocks.pathname = pathname;
      const html = renderToStaticMarkup(await layout("Paid learning activity"));
      expect(html).not.toContain("Paid learning activity");
      expect(html).toContain("Upgrade to start studying");
      expect(html).toContain('href="/app/today"');
    },
  );

  it.each([
    "/app/challenges",
    "/app/chat",
    "/app/notes",
    "/app/settings",
    "/app/community",
    "/app/billing",
  ])("keeps %s accessible for unpaid students", async (pathname) => {
    mocks.pathname = pathname;
    expect(renderToStaticMarkup(await layout("Accessible page"))).toContain("Accessible page");
  });

  it("restores normal study actions for an active subscriber", async () => {
    // The subscription is read once, with the rest of the user, by getCurrentAuth.
    mocks.auth.mockResolvedValue({ user: { id: "student", role: "student", hasPaidPlan: true } });
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
    mocks.host = "localhost:3001";
    const element = await layout();
    expect(element.props.upgradeHref).toBeNull();
  });

  it.each(["admin", "super_admin"])("does not lock %s accounts", async (role) => {
    mocks.auth.mockResolvedValue({ user: { id: "admin", role } });
    expect((await layout()).props.upgradeHref).toBeNull();
  });

  it("falls back to billing when the enrolled exam is no longer available", async () => {
    mocks.exam.mockResolvedValue(null);
    expect((await layout()).props.upgradeHref).toBe("/app/billing");
  });

  it("never asks a student who already joined a faculty to pick one again", async () => {
    mocks.enrollment.mockResolvedValue(null);
    mocks.member.mockResolvedValue(true);
    mocks.exams.mockResolvedValue([{ slug: "license" }]);
    mocks.host = "license.localhost:3001";
    const element = await layout();
    const children = [element.props.children].flat(3) as Array<{ props?: { exams?: unknown[] } }>;
    const gate = children.find((child) => child?.props && "exams" in child.props);
    expect(gate?.props?.exams).toEqual([]);
    expect(mocks.exams).not.toHaveBeenCalled();
    expect(element.props.upgradeHref).toBeNull();
  });
});
