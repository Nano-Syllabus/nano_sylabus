import { SetAppShell } from "@/components/set-app-shell";
import { StudentExamsClient } from "@/components/student-exams-client";
import { requireOnboardedUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function ExamsPage() {
  const { user, profile } = await requireOnboardedUser();

  return (
    <>
      <SetAppShell title="Exams" />
      <StudentExamsClient subjects={profile?.subjects ?? []} fullName={user.fullName} />
    </>
  );
}
