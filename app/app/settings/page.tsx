import Link from "next/link";
import { Button } from "@/components/ui/button";
import { SetAppShell } from "@/components/set-app-shell";
import { SettingsForm } from "@/components/settings-form";
import { requireOnboardedUser } from "@/lib/auth";

export default async function SettingsPage() {
  const { user, profile } = await requireOnboardedUser();

  return (
    <>
      <SetAppShell
        title="Settings"
        actions={
          <Link href="/app/billing">
            <Button variant="outline" size="sm">
              Billing →
            </Button>
          </Link>
        }
      />
      <SettingsForm user={user} profile={profile!} />
    </>
  );
}
