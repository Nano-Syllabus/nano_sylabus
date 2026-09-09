import { SetAppShell } from "@/components/set-app-shell";
import { BillingPageClient } from "@/components/billing-page-client";
import { requireOnboardedUser } from "@/lib/auth";
import { getActiveManualPaymentConfig, getStudentBillingOverview } from "@/lib/data/billing";

export default async function BillingPage() {
  const { user } = await requireOnboardedUser();
  const [overview, paymentConfig] = await Promise.all([
    getStudentBillingOverview(user.id),
    getActiveManualPaymentConfig(),
  ]);

  return (
    <>
      <SetAppShell title="Pricing" />
      <BillingPageClient overview={overview} paymentConfig={paymentConfig} user={user} />
    </>
  );
}
