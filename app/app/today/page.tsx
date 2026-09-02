import { SetAppShell } from "@/components/set-app-shell";
import { StudentDailyDashboardView } from "@/components/student-daily-dashboard";
import { requireOnboardedUser } from "@/lib/auth";
import { getStudentDailyDashboard } from "@/lib/data/student-daily-dashboard";

export const dynamic = "force-dynamic";

export default async function TodayPage() {
  const { user } = await requireOnboardedUser();
  const dashboard = await getStudentDailyDashboard(user.id);

  return (
    <>
      <SetAppShell title="Daily Dashboard" />
      <StudentDailyDashboardView
        fullName={user.fullName}
        creditBalance={user.creditBalance}
        hasUnlimitedAccess={user.hasUnlimitedAccess}
        dashboard={dashboard}
      />
    </>
  );
}
