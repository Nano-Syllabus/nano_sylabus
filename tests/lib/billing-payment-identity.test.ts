import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("manual payment identity and invoice remarks", () => {
  it("uses short sequential invoice codes for payment remarks", () => {
    const migration = readFileSync(
      "supabase/migrations/20260915113000_simple_invoice_codes.sql",
      "utf8",
    );

    expect(migration).toContain("create sequence if not exists public.invoice_code_seq");
    expect(migration).toContain("then lpad(next_value::text, 3, '0')");
    expect(migration).toContain("alter column invoice_code set default public.next_invoice_code()");
    expect(migration).toContain("where status = 'pending_payment'");
    expect(migration).toContain("order by created_at asc, id asc");
    expect(migration).toContain("select setval('public.invoice_code_seq', 1, false)");

    const invoiceRoute = readFileSync("app/api/billing/invoices/route.ts", "utf8");
    expect(invoiceRoute).toContain("ensureSimpleInvoiceCode");
    expect(invoiceRoute).toContain('padStart(3, "0")');
    expect(invoiceRoute).toContain("nextAvailableSimpleInvoiceCode");
    expect(invoiceRoute).toContain('invoice.status !== "pending_payment"');
  });

  it("removes optional identity fields and derives payment identity on the server", () => {
    const client = readFileSync("components/billing-page-client.tsx", "utf8");
    const paymentRoute = readFileSync("app/api/billing/payments/route.ts", "utf8");

    expect(client).not.toContain("Add transaction code or note (optional)");
    expect(client).not.toContain('formData.set("reference"');
    expect(client).not.toContain('formData.set("payerName"');
    expect(client).not.toContain('formData.set("note"');
    expect(paymentRoute).toContain("String(invoice.invoice_code).trim().toUpperCase()");
    expect(paymentRoute).toContain("user.email?.trim().toLowerCase()");
    expect(paymentRoute).toContain("authenticatedPayerName(user, profile?.full_name)");
    expect(paymentRoute).toContain("submitterEmail");
  });

  it("shows the authenticated email in the admin payment queue and detail", () => {
    const adminData = readFileSync("lib/data/billing.ts", "utf8");
    const adminQueue = readFileSync("app/admin/billing/page.tsx", "utf8");
    const adminDetail = readFileSync("components/admin-payment-detail-client.tsx", "utf8");

    expect(adminData).toContain("admin.auth.admin.getUserById");
    expect(adminData).toContain("studentEmail:");
    expect(adminQueue).toContain("submission.studentEmail");
    expect(adminDetail).toContain('label="Login email"');
    expect(adminDetail).toContain('label="Invoice ID"');
  });
});
