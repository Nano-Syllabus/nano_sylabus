import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import type { BillingInvoiceSummary, PaymentMethodConfig, SubscriptionPlan } from "@/lib/types";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

import { InvoicesPageClient } from "@/components/invoices-page-client";

const plan: SubscriptionPlan = {
  id: "plus-plan",
  slug: "plus-monthly",
  name: "Plus",
  credits: 0,
  price: 450,
  currency: "NPR",
  billingType: "monthly",
  productType: "individual",
  seatLimit: 1,
  isUnlimited: false,
  features: [],
  isActive: true,
  createdAt: "2026-09-16T00:00:00.000Z",
  updatedAt: "2026-09-16T00:00:00.000Z",
};

const invoice: BillingInvoiceSummary = {
  id: "invoice-id",
  userId: "student-id",
  planId: plan.id,
  status: "pending_payment",
  amount: 450,
  subtotal: 450,
  currency: "NPR",
  paymentMethod: "bank_transfer",
  invoiceCode: "008",
  expiresAt: "2026-09-20T00:00:00.000Z",
  billingPeriodStart: null,
  billingPeriodEnd: null,
  createdAt: "2026-09-16T00:00:00.000Z",
  updatedAt: "2026-09-16T00:00:00.000Z",
  plan,
  paymentSubmission: null,
};

const paymentConfig: PaymentMethodConfig = {
  id: "payment-config",
  paymentMethod: "bank_transfer",
  displayName: "Bank transfer",
  bankName: null,
  accountName: "NanoSyllabus",
  accountNumber: null,
  qrImageUrl: "/qr-nano.jpg",
  instructions: null,
};

describe("invoices page UI", () => {
  it("renders payment activity and your invoices on the pricing page", () => {
    const billing = readFileSync("components/billing-page-client.tsx", "utf8");
    const route = readFileSync("app/app/invoices/page.tsx", "utf8");

    expect(billing).not.toContain("View payment activity");
    expect(billing).toContain("Your invoices");
    expect(route).toContain("listInvoicesForUser(user.id)");
    expect(route).toContain("getActiveManualPaymentConfig()");
  });

  it("shows a real invoice and keeps the payment QR flow on the invoices page", () => {
    const html = renderToStaticMarkup(
      createElement(InvoicesPageClient, { invoices: [invoice], paymentConfig }),
    );

    expect(html).toContain("Payment activity");
    expect(html).toContain("Your invoices");
    expect(html).toContain("Plus");
    expect(html).toContain("NPR 450");
    expect(html).toContain("pending payment");
    expect(html).toContain("Open payment QR");
    expect(html).toContain("/app/billing");
  });

  it("gives students a clear next action when no invoice exists", () => {
    const html = renderToStaticMarkup(
      createElement(InvoicesPageClient, { invoices: [], paymentConfig: null }),
    );

    expect(html).toContain("No invoices yet");
    expect(html).toContain("Your invoices will appear here after you choose a paid plan.");
    expect(html).toContain("View plans");
  });
});
