import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ access: vi.fn(), create: vi.fn(), update: vi.fn(), list: vi.fn() }));
vi.mock("@/lib/admin-access", () => ({ assertAdminRequest: mocks.access }));
vi.mock("@/lib/data/admin-subscriptions", () => ({
  createAdminSubscriptionPlan: mocks.create,
  updateAdminSubscriptionPlan: mocks.update,
  listAdminSubscriptionPlans: mocks.list,
}));

import { POST } from "@/app/api/admin/subscriptions/plans/route";
import { PATCH } from "@/app/api/admin/subscriptions/plans/[planId]/route";

const plan = {
  name: "Plus",
  slug: "plus-monthly",
  credits: 0,
  price: 450,
  currency: "NPR",
  billingType: "monthly",
  isActive: true,
};
const context = { params: Promise.resolve({ planId: "plan-id" }) };
const endpoints = [
  { name: "create", method: "POST", status: 201, call: (request: Request) => POST(request), write: mocks.create },
  { name: "update", method: "PATCH", status: 200, call: (request: Request) => PATCH(request, context), write: mocks.update },
];

beforeEach(() => {
  vi.resetAllMocks();
  mocks.access.mockResolvedValue({ userId: "admin", role: "admin" });
  mocks.create.mockImplementation(async (input) => ({ id: "plan-id", ...input }));
  mocks.update.mockImplementation(async (_id, input) => ({ id: "plan-id", ...input }));
});

describe.each(endpoints)("admin subscription plan $name", ({ method, status, call, write }) => {
  function request(body: unknown) {
    return new Request("http://localhost/api/admin/subscriptions/plans", {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  }

  it.each([0, 200])("saves a plan with %s credits, preserving its price", async (credits) => {
    const response = await call(request({ ...plan, credits, price: 650 }));
    expect(response.status).toBe(status);
    expect(await response.json()).toMatchObject({ plan: { credits, price: 650 } });
    expect(write).toHaveBeenCalledTimes(1);
  });

  it.each([-1, 0.5, "0", null, undefined])("rejects invalid credits %s before writing", async (credits) => {
    const response = await call(request({ ...plan, credits }));
    expect(response.status).toBe(400);
    const payload = await response.json();
    expect(typeof payload.error).toBe("string");
    expect(payload.error).not.toContain('"code"');
    expect(write).not.toHaveBeenCalled();
  });

  it("returns a readable message for negative credits", async () => {
    const response = await call(request({ ...plan, credits: -1 }));
    expect(await response.json()).toEqual({ error: "Credits must be a whole number, 0 or higher." });
  });

  it("still rejects a negative price", async () => {
    expect((await call(request({ ...plan, price: -1 }))).status).toBe(400);
    expect(write).not.toHaveBeenCalled();
  });

  it("returns 400 for malformed JSON without writing", async () => {
    const response = await call(new Request("http://localhost/api/admin/subscriptions/plans", {
      method,
      headers: { "Content-Type": "application/json" },
      body: "{invalid",
    }));
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "Send valid plan details as JSON." });
    expect(write).not.toHaveBeenCalled();
  });

  it.each([401, 403])("denies a caller with access status %s", async (status) => {
    mocks.access.mockResolvedValue({ error: "Denied", status });
    expect((await call(request(plan))).status).toBe(status);
    expect(write).not.toHaveBeenCalled();
  });

  it("keeps database failures as server errors", async () => {
    write.mockRejectedValueOnce(new Error("Database unavailable"));
    expect((await call(request(plan))).status).toBe(500);
  });
});

it("preserves the price editor's zero credits while updating plan features", async () => {
  const input = { ...plan, price: 700, features: ["Unlimited challenges"] };
  const response = await PATCH(new Request("http://localhost/api/admin/subscriptions/plans/plan-id", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  }), context);
  expect(response.status).toBe(200);
  expect(mocks.update).toHaveBeenCalledExactlyOnceWith("plan-id", input);
});
