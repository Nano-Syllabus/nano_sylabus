import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createSupabaseServerClient: vi.fn(),
  createSupabaseAdminClient: vi.fn(),
  getVerifiedUser: vi.fn(),
  getActiveManualPaymentConfig: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: mocks.createSupabaseServerClient,
}));
vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: mocks.createSupabaseAdminClient,
}));
vi.mock("@/lib/supabase/verified-user", () => ({
  getVerifiedUser: mocks.getVerifiedUser,
}));
vi.mock("@/lib/data/billing", () => ({
  getActiveManualPaymentConfig: mocks.getActiveManualPaymentConfig,
}));

import { POST } from "@/app/api/billing/invoices/route";

const userId = "11111111-1111-4111-8111-111111111111";
const plusId = "22222222-2222-4222-8222-222222222222";

function chain(result: unknown) {
  const query = {
    select: vi.fn(),
    eq: vi.fn(),
    in: vi.fn(),
    gt: vi.fn(),
    order: vi.fn(),
    limit: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
    maybeSingle: vi.fn(async () => result),
    single: vi.fn(async () => result),
  };
  for (const key of ["select", "eq", "in", "gt", "order", "limit", "insert", "update"] as const) {
    query[key].mockReturnValue(query);
  }
  return query;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.createSupabaseServerClient.mockResolvedValue({});
  mocks.getVerifiedUser.mockResolvedValue({ data: { user: { id: userId } } });
  mocks.getActiveManualPaymentConfig.mockResolvedValue(null);
});

describe("POST /api/billing/invoices pricing", () => {
  it("charges Rs. 1,350 for three months of Plus and stores a 90-day period", async () => {
    const plan = chain({
      data: {
        id: plusId,
        slug: "plus-monthly",
        product_type: "individual",
        price: 450,
        currency: "NPR",
        billing_type: "monthly",
      },
      error: null,
    });
    const existing = chain({ data: null, error: null });
    const created = chain({
      data: {
        id: "33333333-3333-4333-8333-333333333333",
        plan_id: plusId,
        status: "pending_payment",
        amount: 1350,
        subtotal: 1350,
        currency: "NPR",
        payment_method: "bank_transfer",
        invoice_code: "NS-123456",
      },
      error: null,
    });
    let invoiceCalls = 0;
    mocks.createSupabaseAdminClient.mockReturnValue({
      from: vi.fn((table: string) => {
        if (table === "subscription_plans") return plan;
        invoiceCalls += 1;
        return invoiceCalls === 1 ? existing : created;
      }),
    });

    const response = await POST(new Request("http://localhost/api/billing/invoices", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ planId: plusId, paymentMethod: "bank_transfer", billingMonths: 3 }),
    }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      invoice: { amount: 1350, subtotal: 1350 },
    });
    expect(existing.eq).toHaveBeenCalledWith("amount", 1350);
    const inserted = created.insert.mock.calls[0]?.[0] as {
      amount: number;
      purchase_meta: { billingMonths: number };
      billing_period_start: string;
      billing_period_end: string;
    };
    expect(inserted.amount).toBe(1350);
    expect(inserted.purchase_meta.billingMonths).toBe(3);
    const duration = Date.parse(inserted.billing_period_end) - Date.parse(inserted.billing_period_start);
    expect(duration).toBe(90 * 24 * 60 * 60 * 1000);
  });
});
