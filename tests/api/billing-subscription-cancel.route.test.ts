import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createSupabaseServerClient: vi.fn(),
  createSupabaseAdminClient: vi.fn(),
  getVerifiedUser: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: mocks.createSupabaseServerClient,
}));
vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: mocks.createSupabaseAdminClient,
}));
vi.mock("@/lib/supabase/verified-user", () => ({ getVerifiedUser: mocks.getVerifiedUser }));

import { POST } from "@/app/api/billing/subscriptions/cancel/route";

const user = { id: "11111111-1111-4111-8111-111111111111" };
const subscription = {
  id: "22222222-2222-4222-8222-222222222222",
  user_id: user.id,
  invoice_id: "33333333-3333-4333-8333-333333333333",
  status: "active",
  ends_at: "2030-10-09T00:00:00.000Z",
  cancel_at_period_end: false,
  subscription_plans: { product_type: "individual" },
};

function request(body: unknown) {
  return new Request("http://localhost/api/billing/subscriptions/cancel", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function query(result: unknown) {
  const chain = {
    select: vi.fn(),
    eq: vi.fn(),
    update: vi.fn(),
    maybeSingle: vi.fn(async () => result),
  };
  chain.select.mockReturnValue(chain);
  chain.eq.mockReturnValue(chain);
  chain.update.mockReturnValue(chain);
  return chain;
}

function listQuery(result: unknown) {
  const chain = {
    select: vi.fn(),
    eq: vi.fn(),
    update: vi.fn(),
    in: vi.fn(),
    then: (onFulfilled: (value: unknown) => unknown, onRejected?: (reason: unknown) => unknown) =>
      Promise.resolve(result).then(onFulfilled, onRejected),
  };
  chain.select.mockReturnValue(chain);
  chain.eq.mockReturnValue(chain);
  chain.update.mockReturnValue(chain);
  chain.in.mockReturnValue(chain);
  return chain;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.createSupabaseServerClient.mockResolvedValue({});
  mocks.getVerifiedUser.mockResolvedValue({ data: { user } });
});

describe("POST /api/billing/subscriptions/cancel", () => {
  it("requires a signed-in user", async () => {
    mocks.getVerifiedUser.mockResolvedValue({ data: { user: null } });

    const response = await POST(request({ subscriptionId: subscription.id, action: "cancel" }));

    expect(response.status).toBe(401);
    expect(mocks.createSupabaseAdminClient).not.toHaveBeenCalled();
  });

  it("cancels immediately and ends paid access at the same timestamp", async () => {
    const lookup = query({ data: subscription, error: null });
    const active = listQuery({ data: [subscription], error: null });
    const updated = listQuery({
      data: [{
        id: subscription.id,
        status: "cancelled",
        ends_at: "2026-09-13T08:00:00.000Z",
        cancel_at_period_end: false,
        cancelled_at: "2026-09-13T08:00:00.000Z",
      }],
      error: null,
    });
    const audit = { insert: vi.fn(async () => ({ error: null })) };
    let subscriptionTableCalls = 0;
    const from = vi.fn((table: string) => {
      if (table === "billing_audit_logs") return audit;
      subscriptionTableCalls += 1;
      if (subscriptionTableCalls === 1) return lookup;
      return subscriptionTableCalls === 2 ? active : updated;
    });
    mocks.createSupabaseAdminClient.mockReturnValue({ from });

    const response = await POST(request({ subscriptionId: subscription.id, action: "cancel" }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      subscription: {
        id: subscription.id,
        status: "cancelled",
        endsAt: "2026-09-13T08:00:00.000Z",
        cancelAtPeriodEnd: false,
      },
    });
    expect(updated.update).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "cancelled",
        cancel_at_period_end: false,
        cancelled_at: expect.any(String),
        ends_at: expect.any(String),
      }),
    );
    expect(updated.in).toHaveBeenCalledWith("id", [subscription.id]);
    expect(audit.insert).toHaveBeenCalledWith(
      expect.objectContaining({ action: "subscription_cancelled_immediately" }),
    );
  });

  it("treats an already-cancelled subscription as an idempotent success", async () => {
    const lookup = query({
      data: {
        ...subscription,
        status: "cancelled",
        ends_at: "2026-09-13T08:00:00.000Z",
        cancelled_at: "2026-09-13T08:00:00.000Z",
      },
      error: null,
    });
    const active = listQuery({ data: [], error: null });
    let calls = 0;
    mocks.createSupabaseAdminClient.mockReturnValue({
      from: vi.fn(() => {
        calls += 1;
        return calls === 1 ? lookup : active;
      }),
    });

    const response = await POST(request({ subscriptionId: subscription.id, action: "cancel" }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      subscription: { id: subscription.id, status: "cancelled" },
      cancelledSubscriptionIds: [],
    });
    expect(lookup.update).not.toHaveBeenCalled();
  });

  it("will not cancel an already-ended subscription", async () => {
    const lookup = query({
      data: { ...subscription, ends_at: "2020-10-09T00:00:00.000Z" },
      error: null,
    });
    mocks.createSupabaseAdminClient.mockReturnValue({ from: vi.fn(() => lookup) });

    const response = await POST(request({ subscriptionId: subscription.id, action: "cancel" }));

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      error: "This subscription has already ended.",
    });
    expect(lookup.update).not.toHaveBeenCalled();
  });

  it("allows an active Plus subscription to be cancelled immediately", async () => {
    const plusSubscription = {
      ...subscription,
      subscription_plans: { product_type: "individual", is_unlimited: false },
    };
    const lookup = query({ data: plusSubscription, error: null });
    const active = listQuery({ data: [plusSubscription], error: null });
    const updated = listQuery({
      data: [{
        ...plusSubscription,
        status: "cancelled",
        ends_at: "2026-09-13T08:00:00.000Z",
        cancel_at_period_end: false,
      }],
      error: null,
    });
    const audit = { insert: vi.fn(async () => ({ error: null })) };
    let calls = 0;
    mocks.createSupabaseAdminClient.mockReturnValue({
      from: vi.fn((table: string) => {
        if (table === "billing_audit_logs") return audit;
        calls += 1;
        if (calls === 1) return lookup;
        return calls === 2 ? active : updated;
      }),
    });

    const response = await POST(request({ subscriptionId: subscription.id, action: "cancel" }));

    expect(response.status).toBe(200);
    expect(updated.update).toHaveBeenCalledWith(
      expect.objectContaining({ status: "cancelled", cancel_at_period_end: false }),
    );
  });

  it("cancels every overlapping active paid subscription for the user", async () => {
    const overlapping = {
      ...subscription,
      id: "44444444-4444-4444-8444-444444444444",
      invoice_id: "55555555-5555-4555-8555-555555555555",
    };
    const lookup = query({ data: subscription, error: null });
    const active = listQuery({ data: [subscription, overlapping], error: null });
    const updatedRows = [subscription, overlapping].map((item) => ({
      ...item,
      status: "cancelled",
      ends_at: "2026-09-15T09:00:00.000Z",
      cancel_at_period_end: false,
      cancelled_at: "2026-09-15T09:00:00.000Z",
    }));
    const updated = listQuery({ data: updatedRows, error: null });
    const audit = { insert: vi.fn(async () => ({ error: null })) };
    let calls = 0;
    mocks.createSupabaseAdminClient.mockReturnValue({
      from: vi.fn((table: string) => {
        if (table === "billing_audit_logs") return audit;
        calls += 1;
        if (calls === 1) return lookup;
        return calls === 2 ? active : updated;
      }),
    });

    const response = await POST(request({ subscriptionId: subscription.id, action: "cancel" }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      subscription: { id: subscription.id, status: "cancelled" },
      cancelledSubscriptionIds: [subscription.id, overlapping.id],
    });
    expect(updated.in).toHaveBeenCalledWith("id", [subscription.id, overlapping.id]);
    expect(audit.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({ cancelledSubscriptionCount: 2 }),
      }),
    );
  });
});
