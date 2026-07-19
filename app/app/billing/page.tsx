import { SetAppShell } from "@/components/set-app-shell";
import { BillingPageClient } from "@/components/billing-page-client";
import { requireOnboardedUser } from "@/lib/auth";
import { getStudentBillingOverview } from "@/lib/data/billing";

export default async function BillingPage() {
  const { user } = await requireOnboardedUser();
  const overview = await getStudentBillingOverview(user.id);

  return (
    <>
      <SetAppShell title="Billing" />
      <BillingPageClient overview={overview} />
    </>
  );
}
