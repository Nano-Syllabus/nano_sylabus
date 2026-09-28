import { SetAppShell } from "@/components/set-app-shell";
import { SettingsForm } from "@/components/settings-form";
import { requireOnboardedUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const { user, profile } = await requireOnboardedUser();

  return (
    <>
      <SetAppShell
        title="Settings"
      />
      <SettingsForm
        user={user}
        profile={profile!}
      />
    </>
  );
}
