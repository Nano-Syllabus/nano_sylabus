import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  user: vi.fn(),
  select: vi.fn(),
  exam: vi.fn(),
  plans: vi.fn(),
  revalidate: vi.fn(),
}));
vi.mock("@/lib/supabase/server", () => ({ createSupabaseServerClient: async () => ({}) }));
vi.mock("@/lib/supabase/verified-user", () => ({ getVerifiedUser: mocks.user }));
vi.mock("@/lib/data/exam-enrollment", () => ({
  selectExamFaculty: mocks.select,
  getStudentExamEnrollment: vi.fn(),
  getEnrollmentExam: mocks.exam,
  getExamPlans: mocks.plans,
}));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }));
import { POST as selectFaculty } from "@/app/api/student/exam-enrollment/route";
import { POST as saveIntent } from "@/app/api/exam-enrollment/[slug]/intent/route";
const facultyId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const planId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const selection = { examSlug: "engineering-license", facultyId, answers: { goal: "Soon" } };
function request(path: string, body: unknown, origin = "http://localhost") {
  return new Request(`http://localhost${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", origin },
    body: JSON.stringify(body),
  });
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.user.mockResolvedValue({ data: { user: { id: "verified-user" } } });
  mocks.select.mockResolvedValue({ examSlug: "engineering-license", facultyId });
  mocks.exam.mockResolvedValue({
    slug: "engineering-license",
    config: { questions: [{ id: "goal", prompt: "When?", options: ["Soon", "Later"] }] },
  });
  mocks.plans.mockResolvedValue([{ id: planId }]);
});

describe("student faculty selection API", () => {
  it("requires a verified session", async () => {
    mocks.user.mockResolvedValue({ data: { user: null } });
    expect((await selectFaculty(request("/api/student/exam-enrollment", selection))).status).toBe(
      401,
    );
    expect(mocks.select).not.toHaveBeenCalled();
  });
  it("cannot pass an admin override or impersonate another student", async () => {
    expect(
      (
        await selectFaculty(
          request("/api/student/exam-enrollment", {
            ...selection,
            userId: "someone-else",
            allowChange: true,
          }),
        )
      ).status,
    ).toBe(200);
    expect(mocks.select).toHaveBeenCalledExactlyOnceWith(
      "verified-user",
      "engineering-license",
      facultyId,
      { goal: "Soon" },
    );
  });
  it("rejects a cross-origin selection", async () => {
    expect(
      (
        await selectFaculty(
          request("/api/student/exam-enrollment", selection, "https://other.example"),
        )
      ).status,
    ).toBe(403);
    expect(mocks.select).not.toHaveBeenCalled();
  });
});

describe("public preparation intent API", () => {
  const body = {
    examSlug: "engineering-license",
    planId,
    billingMonths: 3,
    answers: { goal: "Soon" },
  };
  const context = { params: Promise.resolve({ slug: "engineering-license" }) };
  it("prepares checkout without answers when onboarding questions are disabled", async () => {
    mocks.exam.mockResolvedValue({
      slug: "engineering-license",
      config: { askQuestions: false, questions: [{ id: "goal", prompt: "When?", options: ["Soon", "Later"] }] },
    });
    const response = await saveIntent(
      request("/api/exam-enrollment/engineering-license/intent", { ...body, answers: {} }),
      context,
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("set-cookie")).toContain("HttpOnly");
  });
  it("keeps exam, plan and preparation through sign-in in an HTTP-only cookie", async () => {
    const response = await saveIntent(
      request("/api/exam-enrollment/engineering-license/intent", body),
      context,
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ next: "/payment/engineering-license" });
    expect(response.headers.get("set-cookie")).toContain("HttpOnly");
    expect(response.headers.get("set-cookie")).toContain("SameSite=lax");
  });
  it("rejects missing questions, unsupported plans and mismatched exam URLs", async () => {
    expect(
      (
        await saveIntent(
          request("/api/exam-enrollment/engineering-license/intent", { ...body, answers: {} }),
          context,
        )
      ).status,
    ).toBe(400);
    expect(
      (
        await saveIntent(
          request("/api/exam-enrollment/engineering-license/intent", {
            ...body,
            examSlug: "another",
          }),
          context,
        )
      ).status,
    ).toBe(400);
    mocks.plans.mockResolvedValue([]);
    const response = await saveIntent(
      request("/api/exam-enrollment/engineering-license/intent", body),
      context,
    );
    expect(response.status).toBe(400);
    expect(response.headers.get("set-cookie")).toBeNull();
  });
  it("rejects a disabled duration before setting a checkout cookie", async () => {
    mocks.exam.mockResolvedValue({
      slug: "engineering-license",
      config: {
        billingMonths: [1],
        questions: [{ id: "goal", prompt: "When?", options: ["Soon", "Later"] }],
      },
    });
    const response = await saveIntent(
      request("/api/exam-enrollment/engineering-license/intent", body),
      context,
    );
    expect(response.status).toBe(400);
    expect(response.headers.get("set-cookie")).toBeNull();
  });
});
