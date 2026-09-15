import { SetAppShell } from "@/components/set-app-shell";
import { BillingPageClient } from "@/components/billing-page-client";
import { requireOnboardedUser } from "@/lib/auth";
import { DEV_AUTH_BYPASS, DEV_BYPASS_USER_ID } from "@/lib/dev-auth-bypass";
import type { StudentBillingOverview, SubscriptionPlan } from "@/lib/types";
import {
  getActiveManualPaymentConfig,
  getStudentBillingOverview,
} from "@/lib/data/billing";

export default async function BillingPage() {
  const { user } = await requireOnboardedUser();
  if (DEV_AUTH_BYPASS && user.id === DEV_BYPASS_USER_ID) {
    // The anonymous local preview has no auth.users row, so a starter-credit
    // insert would violate RLS/FK constraints. Keep it strictly visual; real
    // checkout still requires a real account and the pricing migration.
    const previewPlan = (slug: string, name: string, price: number, isUnlimited: boolean): SubscriptionPlan => ({
      id: slug === "plus-monthly" ? "11111111-1111-4111-8111-111111111111" : "22222222-2222-4222-8222-222222222222",
      slug,
      name,
      price,
      credits: 0,
      currency: "NPR",
      billingType: "monthly",
      productType: "individual",
      seatLimit: 1,
      isUnlimited,
      features: [],
      isActive: true,
      createdAt: "",
      updatedAt: "",
    });
    const overview: StudentBillingOverview = {
      balance: 999,
      plans: [previewPlan("plus-monthly", "Plus", 450, false), previewPlan("individual-unlimited", "Pro", 1500, true)],
      invoices: [],
      subscriptions: [],
    };
    return (
      <>
        <SetAppShell title="Pricing" />
        <BillingPageClient overview={overview} paymentConfig={null} user={user} />
      </>
    );
  }
  const [overview, paymentConfig] = await Promise.all([
    getStudentBillingOverview(user.id),
    getActiveManualPaymentConfig(),
  ]);

  return (
    <>
      <SetAppShell title="Pricing" />
      <BillingPageClient
        overview={overview}
        paymentConfig={paymentConfig}
        user={user}
      />
    </>
  );
}
