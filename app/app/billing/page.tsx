import { SetAppShell } from "@/components/set-app-shell";
import { BillingPageClient } from "@/components/billing-page-client";
import { requireOnboardedUser } from "@/lib/auth";
import {
  getActiveManualPaymentConfig,
  getBillingSocialProof,
  getStudentBillingOverview,
} from "@/lib/data/billing";

export default async function BillingPage() {
  const { user } = await requireOnboardedUser();
  const [overview, paymentConfig, socialProof] = await Promise.all([
    getStudentBillingOverview(user.id),
    getActiveManualPaymentConfig(),
    getBillingSocialProof(),
  ]);

  return (
    <>
      <SetAppShell title="Pricing" />
      <BillingPageClient
        overview={overview}
        paymentConfig={paymentConfig}
        socialProof={socialProof}
        user={user}
      />
    </>
  );
}
