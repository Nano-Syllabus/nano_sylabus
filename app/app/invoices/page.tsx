import Link from "next/link";
import { InvoicesPageClient } from "@/components/invoices-page-client";
import { SetAppShell } from "@/components/set-app-shell";
import { requireOnboardedUser } from "@/lib/auth";
import { DEV_AUTH_BYPASS, DEV_BYPASS_USER_ID } from "@/lib/dev-auth-bypass";
import { getActiveManualPaymentConfig, listInvoicesForUser } from "@/lib/data/billing";

export default async function InvoicesPage() {
  const { user } = await requireOnboardedUser();

  // The development preview has no corresponding auth.users record. Keep this
  // branch visual-only; real accounts always receive their own database rows.
  const isDevelopmentPreview = DEV_AUTH_BYPASS && user.id === DEV_BYPASS_USER_ID;
  const [invoices, paymentConfig] = isDevelopmentPreview
    ? [[], null]
    : await Promise.all([listInvoicesForUser(user.id), getActiveManualPaymentConfig()]);

  return (
    <>
      <SetAppShell
        title={
          <Link href="/app/billing" className="text-text-secondary hover:text-text-primary">
            ← Pricing
          </Link>
        }
      />
      <InvoicesPageClient invoices={invoices} paymentConfig={paymentConfig} />
    </>
  );
}
