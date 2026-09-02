import { SetAppShell } from "@/components/set-app-shell";
import { StudentDailyDashboardView } from "@/components/student-daily-dashboard";
import { requireOnboardedUser } from "@/lib/auth";
import { listSubscriptionPlans } from "@/lib/data/billing";
import { getStudentDailyDashboard } from "@/lib/data/student-daily-dashboard";

export const dynamic = "force-dynamic";

export default async function TodayPage() {
  const { user } = await requireOnboardedUser();
  const [dashboard, plans] = await Promise.all([
    getStudentDailyDashboard(user.id),
    listSubscriptionPlans(),
  ]);
  const unlimitedPlan =
    plans.find((plan) => plan.slug === "individual-unlimited" && plan.isUnlimited) ?? null;

  return (
    <>
      <SetAppShell title="Daily Dashboard" />
      <StudentDailyDashboardView
        fullName={user.fullName}
        creditBalance={user.creditBalance}
        hasUnlimitedAccess={user.hasUnlimitedAccess}
        unlimitedPlan={unlimitedPlan}
        dashboard={dashboard}
      />
    </>
  );
}
