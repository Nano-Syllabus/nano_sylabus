import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  verified: vi.fn(),
  enrollment: vi.fn(),
  paid: vi.fn(),
  content: vi.fn(),
}));
vi.mock("@/lib/supabase/server", () => ({ createSupabaseServerClient: async () => ({}) }));
vi.mock("@/lib/supabase/verified-user", () => ({ getVerifiedUser: mocks.verified }));
vi.mock("@/lib/data/faculty-lock", () => ({ getStudentExamEnrollment: mocks.enrollment }));
vi.mock("@/lib/data/billing", () => ({ hasActiveSubscription: mocks.paid }));
vi.mock("@/lib/data/student-challenges", () => ({
  getStudentChallengeContent: mocks.content,
  studentFacingBuildError: (value: string) => value,
}));
vi.mock("@/lib/usage-community", () => ({ withUsageCommunity: (handler: unknown) => handler }));

import { withExamStudyAccess } from "@/lib/exam-study-access";
import { GET } from "@/app/api/student/challenges/[challengeId]/content/route";

beforeEach(() => {
  mocks.verified.mockResolvedValue({ data: { user: { id: "student-1" } } });
  mocks.enrollment.mockResolvedValue({ examSlug: "license" });
  mocks.paid.mockResolvedValue(false);
  mocks.content.mockResolvedValue({ id: "c1", content: { lesson: "Paid reading" } });
});

describe("exam learning content entitlement", () => {
  it("requires authentication before checking a plan or reading content", async () => {
    mocks.verified.mockResolvedValue({ data: { user: null } });
    const response = await GET(
      new Request("https://nanosyllabus.com/api/student/challenges/c1/content"),
      { params: Promise.resolve({ challengeId: "c1" }) },
    );
    expect(response.status).toBe(401);
    expect(mocks.enrollment).not.toHaveBeenCalled();
    expect(mocks.content).not.toHaveBeenCalled();
  });

  it("blocks direct content requests by unpaid exam students without loading or building the lesson", async () => {
    const response = await GET(
      new Request("https://nanosyllabus.com/api/student/challenges/c1/content"),
      { params: Promise.resolve({ challengeId: "c1" }) },
    );
    expect(response.status).toBe(402);
    expect(await response.json()).toMatchObject({
      code: "exam_upgrade_required",
      upgradeHref: "/payment/license",
    });
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(mocks.content).not.toHaveBeenCalled();
    expect(mocks.paid).toHaveBeenCalledWith("student-1");
  });

  it("allows active subscribers through to the existing resource authorization", async () => {
    mocks.paid.mockResolvedValue(true);
    const response = await GET(
      new Request("https://nanosyllabus.com/api/student/challenges/c1/content"),
      { params: Promise.resolve({ challengeId: "c1" }) },
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      challenge: { content: { lesson: "Paid reading" } },
    });
    expect(mocks.content).toHaveBeenCalledWith("student-1", "c1", { retry: false });
  });

  it("preserves the free learning policy outside exam enrollment", async () => {
    mocks.enrollment.mockResolvedValue(null);
    const handler = vi.fn(async () => new Response("Free lesson"));
    const response = await withExamStudyAccess(handler)(
      new Request("https://nanosyllabus.com/resource"),
    );
    expect(await response.text()).toBe("Free lesson");
    expect(mocks.paid).not.toHaveBeenCalled();
  });

  it("fails closed when the subscription check fails", async () => {
    mocks.paid.mockRejectedValue(new Error("Database unavailable"));
    const handler = vi.fn(async () => new Response("Paid lesson"));
    const response = await withExamStudyAccess(handler)(
      new Request("https://nanosyllabus.com/resource"),
    );
    expect(response.status).toBe(503);
    expect(handler).not.toHaveBeenCalled();
  });

  it("passes the request and route parameters to paid handlers unchanged", async () => {
    mocks.paid.mockResolvedValue(true);
    const request = new Request("https://nanosyllabus.com/resource", { method: "POST" });
    const context = { params: Promise.resolve({ id: "resource-1" }) };
    const handler = vi.fn(
      async (_request: Request, _context: typeof context) => new Response("Paid lesson"),
    );
    await withExamStudyAccess(handler)(request, context);
    expect(handler).toHaveBeenCalledWith(request, context);
  });
});
