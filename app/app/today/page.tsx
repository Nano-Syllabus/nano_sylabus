import { SetAppShell } from "@/components/set-app-shell";
import { ChallengesDashboardClient } from "@/components/challenges-dashboard-client";
import { requireOnboardedUser } from "@/lib/auth";
import { getStudentChallengeDashboard } from "@/lib/data/student-challenge-dashboard";

export const dynamic = "force-dynamic";

export default async function TodayPage() {
  const { user } = await requireOnboardedUser();
  const dashboard = await getStudentChallengeDashboard(user.id);

  return (
    <>
      <SetAppShell title="" />
      <ChallengesDashboardClient dashboard={dashboard} />
    </>
  );
}
