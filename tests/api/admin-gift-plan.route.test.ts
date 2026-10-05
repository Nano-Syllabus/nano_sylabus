import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  access: vi.fn(),
  plans: vi.fn(),
  grant: vi.fn(),
  exam: vi.fn(),
  exams: vi.fn(),
  enrollment: vi.fn(),
  select: vi.fn(),
  profile: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/admin-access", () => ({ assertSuperAdminRequest: mocks.access }));
vi.mock("@/lib/data/admin-subscriptions", () => ({
  listAdminSubscriptionPlans: mocks.plans,
  grantAdminSubscription: mocks.grant,
}));
vi.mock("@/lib/data/exam-enrollment", () => ({
  getEnrollmentExam: mocks.exam,
  listEnrollmentExams: mocks.exams,
  getStudentExamEnrollment: mocks.enrollment,
  selectExamFaculty: mocks.select,
}));
vi.mock("@/lib/data/landing-sites", () => ({
  LandingSiteError: class extends Error {
    status = 400;
  },
}));
vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: () => ({
    from: () => {
      const query: Record<string, unknown> = {};
      query.select = () => query;
      query.eq = () => query;
      query.maybeSingle = () => mocks.profile();
      return query;
    },
  }),
}));

import { POST } from "@/app/api/admin/users/[userId]/gift-plan/route";

const userId = "22222222-2222-4222-8222-222222222222";
const planId = "11111111-1111-4111-8111-111111111111";
const bct = "33333333-3333-4333-8333-333333333333";
const bei = "44444444-4444-4444-8444-444444444444";
const call = (body: Record<string, unknown>) =>
  POST(
    new Request("http://localhost/api/admin/users/x/gift-plan", {
      method: "POST",
      body: JSON.stringify({ planId, months: 3, examSlug: "license", facultyId: bct, ...body }),
    }),
    { params: Promise.resolve({ userId }) },
  );

beforeEach(() => {
  vi.clearAllMocks();
  mocks.access.mockResolvedValue({ userId: "admin", role: "super_admin" });
  mocks.profile.mockResolvedValue({ data: { role: "student" } });
  mocks.plans.mockResolvedValue([
    { id: planId, name: "Pro", isActive: true, productType: "individual", billingType: "monthly" },
  ]);
  mocks.exam.mockResolvedValue({ slug: "license", faculties: [{ id: bct }, { id: bei }] });
  mocks.enrollment.mockResolvedValue(null);
  mocks.grant.mockResolvedValue("sub-1");
});

describe("gifting a plan to one faculty", () => {
  it("is for super admins only", async () => {
    mocks.access.mockResolvedValue({ error: "Super admin access is required.", status: 403 });
    expect((await call({})).status).toBe(403);
    expect(mocks.grant).not.toHaveBeenCalled();
  });

  it("locks the faculty, then grants exactly the months asked for", async () => {
    const before = Date.now();
    expect((await call({ months: 3 })).status).toBe(201);
    expect(mocks.select).toHaveBeenCalledWith(userId, "license", bct, {}, true);
    const grant = mocks.grant.mock.calls[0][0] as { startsAt: string; endsAt: string };
    expect(Date.parse(grant.endsAt) - Date.parse(grant.startsAt)).toBe(90 * 24 * 60 * 60 * 1000);
    expect(Date.parse(grant.startsAt)).toBeGreaterThanOrEqual(before);
    expect(mocks.select.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.grant.mock.invocationCallOrder[0],
    );
  });

  it("asks before moving a student who is locked to another faculty", async () => {
    mocks.enrollment.mockResolvedValue({ examSlug: "license", facultyId: bei, facultyName: "BEI" });
    const refused = await call({});
    expect(refused.status).toBe(409);
    expect(mocks.select).not.toHaveBeenCalled();
    expect(mocks.grant).not.toHaveBeenCalled();
    expect((await call({ changeFaculty: true })).status).toBe(201);
  });

  it("hands out no plan when the faculty is not one the exam supports", async () => {
    mocks.exam.mockResolvedValue({ slug: "license", faculties: [{ id: bei }] });
    expect((await call({})).status).toBe(400);
    expect(mocks.grant).not.toHaveBeenCalled();
  });

  it("does not gift to admins, and keeps months between 1 and 24", async () => {
    mocks.profile.mockResolvedValue({ data: { role: "admin" } });
    expect((await call({})).status).toBe(400);
    expect((await call({ months: 25 })).status).toBe(400);
    expect((await call({ months: 0 })).status).toBe(400);
  });
});
