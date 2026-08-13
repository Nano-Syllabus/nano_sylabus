import Link from "next/link";
import { Button } from "@/components/ui/button";
import { SetAppShell } from "@/components/set-app-shell";
import { SettingsForm } from "@/components/settings-form";
import { requireOnboardedUser } from "@/lib/auth";
import { countStudentExamsSat } from "@/lib/data/student-stats";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const { user, profile } = await requireOnboardedUser();
  const examsSat = await countStudentExamsSat(user.id);

  return (
    <>
      <SetAppShell
        title="Settings"
      />
      <SettingsForm user={user} profile={profile!} examsSat={examsSat} />
    </>
  );
}
