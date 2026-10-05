import { SetAppShell } from "@/components/set-app-shell";
import { BillingPageClient, type BillingExamPricing } from "@/components/billing-page-client";
import {
  getEnrollmentExam,
  getExamPlans,
  getStudentExamEnrollment,
} from "@/lib/data/exam-enrollment";
import { examBillingMonths, examPlanMonthlyPrice } from "@/lib/exam-enrollment";
import { requireOnboardedUser } from "@/lib/auth";
import { DEV_AUTH_BYPASS, DEV_BYPASS_USER_ID } from "@/lib/dev-auth-bypass";
import type { StudentBillingOverview, SubscriptionPlan } from "@/lib/types";
import {
  getActiveManualPaymentConfig,
  getBillingSocialProof,
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
      socialProof: await getBillingSocialProof(),
    };
    return (
      <>
        <SetAppShell title="Pricing" />
        <BillingPageClient overview={overview} paymentConfig={null} user={user} />
      </>
    );
  }
  const [overview, paymentConfig, exam] = await Promise.all([
    getStudentBillingOverview(user.id),
    getActiveManualPaymentConfig(),
    getExamPricing(user.id),
  ]);

  return (
    <>
      <SetAppShell title="Pricing" />
      <BillingPageClient
        overview={overview}
        paymentConfig={paymentConfig}
        user={user}
        exam={exam}
      />
    </>
  );
}

/** An exam student's prices: their exam's durations and their faculty's plan prices. */
async function getExamPricing(userId: string): Promise<BillingExamPricing | null> {
  const enrollment = await getStudentExamEnrollment(userId).catch(() => null);
  if (!enrollment) return null;
  const exam = await getEnrollmentExam(enrollment.examSlug);
  if (!exam) return null;
  const plans = await getExamPlans(exam);
  return {
    slug: exam.slug,
    months: examBillingMonths(exam.config),
    prices: Object.fromEntries(
      plans.map((plan) => [plan.id, examPlanMonthlyPrice(exam.config, enrollment.facultySlug, plan)]),
    ),
  };
}
