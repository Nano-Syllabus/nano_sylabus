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
  subscription_plans: { is_unlimited: true },
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

  it("schedules cancellation without revoking the paid period", async () => {
    const lookup = query({ data: subscription, error: null });
    const updated = query({
      data: {
        id: subscription.id,
        status: "active",
        ends_at: subscription.ends_at,
        cancel_at_period_end: true,
        cancelled_at: "2026-09-13T08:00:00.000Z",
      },
      error: null,
    });
    const audit = { insert: vi.fn(async () => ({ error: null })) };
    let subscriptionTableCalls = 0;
    const from = vi.fn((table: string) => {
      if (table === "billing_audit_logs") return audit;
      subscriptionTableCalls += 1;
      return subscriptionTableCalls === 1 ? lookup : updated;
    });
    mocks.createSupabaseAdminClient.mockReturnValue({ from });

    const response = await POST(request({ subscriptionId: subscription.id, action: "cancel" }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      subscription: {
        id: subscription.id,
        status: "active",
        endsAt: subscription.ends_at,
        cancelAtPeriodEnd: true,
      },
    });
    expect(updated.update).toHaveBeenCalledWith(
      expect.objectContaining({ cancel_at_period_end: true }),
    );
    expect(audit.insert).toHaveBeenCalledWith(
      expect.objectContaining({ action: "subscription_cancellation_scheduled" }),
    );
  });

  it("will not cancel an already-ended or non-unlimited subscription", async () => {
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
});
