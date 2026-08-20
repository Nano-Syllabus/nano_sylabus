import { SetAppShell } from "@/components/set-app-shell";
import { ChallengesDashboardClient } from "@/components/challenges-dashboard-client";
import { requireOnboardedUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function TodayPage() {
  const { user } = await requireOnboardedUser();

  return (
    <>
      <SetAppShell title="" />
      <ChallengesDashboardClient fullName={user.fullName} />
    </>
  );
}
