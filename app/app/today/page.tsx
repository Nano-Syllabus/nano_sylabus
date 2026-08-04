import { SetAppShell } from "@/components/set-app-shell";
import { StudentTodayDashboard } from "@/components/student-today-dashboard";
import { requireOnboardedUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function TodayPage() {
  const { user, profile } = await requireOnboardedUser();
  const subjectCount = profile?.subjects.length || 5;

  return (
    <>
      <SetAppShell title="" />
      <StudentTodayDashboard fullName={user.fullName} subjectCount={subjectCount} />
    </>
  );
}
