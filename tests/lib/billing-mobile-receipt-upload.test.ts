import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  createReceiptUploadToken,
  hashReceiptUploadToken,
  MOBILE_RECEIPT_UPLOAD_TTL_MINUTES,
} from "@/lib/billing-receipt-upload";

describe("mobile receipt upload handoff", () => {
  it("uses high-entropy tokens and stores only a stable hash", () => {
    const first = createReceiptUploadToken();
    const second = createReceiptUploadToken();

    expect(first).toMatch(/^[A-Za-z0-9_-]{40,}$/);
    expect(second).not.toBe(first);
    expect(hashReceiptUploadToken(first)).toMatch(/^[a-f0-9]{64}$/);
    expect(hashReceiptUploadToken(first)).toBe(hashReceiptUploadToken(first));
    expect(MOBILE_RECEIPT_UPLOAD_TTL_MINUTES).toBe(15);
  });

  it("keeps upload sessions private, invoice-bound, expiring, and one-time", () => {
    const migration = readFileSync(
      "supabase/migrations/20260910173000_mobile_receipt_upload_sessions.sql",
      "utf8",
    );
    const mobileRoute = readFileSync("app/api/billing/receipt-upload/[token]/route.ts", "utf8");
    const paymentRoute = readFileSync("app/api/billing/payments/route.ts", "utf8");

    expect(migration).toContain("token_hash text not null unique");
    expect(migration).toContain("invoice_id uuid not null");
    expect(migration).toContain("expires_at timestamptz not null");
    expect(migration).toContain("revoke all on public.billing_receipt_upload_sessions");
    expect(mobileRoute).toContain("hashReceiptUploadToken");
    expect(mobileRoute).toContain('session.status === "consumed"');
    expect(paymentRoute).toContain('status: "consumed"');
    expect(paymentRoute).toContain('.eq("invoice_id", invoice.id)');
    expect(paymentRoute).toContain('.eq("user_id", user.id)');
  });

  it("shows phone QR handoff and automatic desktop receipt status", () => {
    const desktop = readFileSync("components/receipt-upload-from-phone.tsx", "utf8");
    const mobile = readFileSync("components/mobile-receipt-upload.tsx", "utf8");
    const billing = readFileSync("components/billing-page-client.tsx", "utf8");

    expect(desktop).toContain("QRCodeSVG");
    expect(desktop).toContain("Upload using phone");
    expect(desktop).toContain("Received from phone");
    expect(desktop).toContain("previewUrl");
    expect(desktop).toContain("object-contain");
    expect(desktop).toContain("window.setInterval");
    expect(desktop).toContain("Remove & upload again");
    expect(desktop).toContain('method: "DELETE"');
    expect(
      readFileSync("app/api/billing/receipt-upload-sessions/[sessionId]/route.ts", "utf8"),
    ).toContain("createSignedUrl");
    expect(
      readFileSync("app/api/billing/receipt-upload-sessions/[sessionId]/route.ts", "utf8"),
    ).toContain("export async function DELETE");
    expect(mobile).toContain("Send receipt to desktop");
    expect(mobile).toContain("Your desktop will show the receipt automatically");
    expect(mobile).toContain("Upload another photo");
    expect(billing).toContain("mobileUploadSessionId");
    expect(billing).toContain("Choose on this computer");
  });

  it("auto-activates submitted payments and keeps an admin revoke path", () => {
    const migration = readFileSync(
      "supabase/migrations/20260911193000_auto_activate_submitted_payments.sql",
      "utf8",
    );
    const paymentRoute = readFileSync("app/api/billing/payments/route.ts", "utf8");
    const billing = readFileSync("components/billing-page-client.tsx", "utf8");
    const adminDetail = readFileSync("components/admin-payment-detail-client.tsx", "utf8");

    expect(migration).toContain("auto_approve_payment_submission");
    expect(migration).toContain("to service_role");
    expect(migration).toContain("payment_auto_approved");
    expect(paymentRoute).toContain('"auto_approve_payment_submission"');
    expect(paymentRoute).toContain('status: "paid"');
    expect(billing).toContain("Activating your access");
    expect(billing).toContain("Access will be ready in about five seconds.");
    expect(billing).toContain("Your paid access is active");
    expect(adminDetail).toContain("Revoke access");
    expect(adminDetail).toContain('action: "cancel"');
  });
});
