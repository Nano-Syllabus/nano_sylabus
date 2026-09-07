import { SetAppShell } from "@/components/set-app-shell";
import { StudentDailyDashboardView } from "@/components/student-daily-dashboard";
import { requireOnboardedUser } from "@/lib/auth";
import { listSubscriptionPlans } from "@/lib/data/billing";
import { getStudentDailyDashboard } from "@/lib/data/student-daily-dashboard";
import { getActiveCommunity } from "@/lib/data/active-community";

export const dynamic = "force-dynamic";

export default async function TodayPage({
  searchParams,
}: {
  searchParams: Promise<{ community?: string }>;
}) {
  const { user } = await requireOnboardedUser();
  const params = await searchParams;
  const active = await getActiveCommunity(
    user.id,
    typeof params.community === "string" ? params.community : undefined,
  );
  const [dashboard, plans] = await Promise.all([
    getStudentDailyDashboard(user.id, undefined, active.selected?.slug),
    listSubscriptionPlans(),
  ]);
  const unlimitedPlan =
    plans.find((plan) => plan.slug === "individual-unlimited" && plan.isUnlimited) ?? null;

  return (
    <>
      <SetAppShell title="Daily Dashboard" />
      <StudentDailyDashboardView
        key={active.selected?.id ?? "none"}
        communityOptions={active.options}
        fullName={user.fullName}
        creditBalance={user.creditBalance}
        hasUnlimitedAccess={user.hasUnlimitedAccess}
        unlimitedPlan={unlimitedPlan}
        dashboard={dashboard}
      />
    </>
  );
}
