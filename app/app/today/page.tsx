import { SetAppShell } from "@/components/set-app-shell";
import { StudentTodayDashboard } from "@/components/student-today-dashboard";
import { requireOnboardedUser } from "@/lib/auth";
import { getStudentToday } from "@/lib/data/student-today";

export const dynamic = "force-dynamic";

export default async function TodayPage() {
  const { user, profile } = await requireOnboardedUser();
  const today = await getStudentToday(user.id, profile);

  return (
    <>
      <SetAppShell title="" />
      <StudentTodayDashboard fullName={user.fullName} today={today} />
    </>
  );
}
