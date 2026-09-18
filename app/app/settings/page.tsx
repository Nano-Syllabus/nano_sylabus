import { SetAppShell } from "@/components/set-app-shell";
import { SettingsForm } from "@/components/settings-form";
import { requireOnboardedUser } from "@/lib/auth";
import { getActiveCommunity } from "@/lib/data/active-community";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const { user, profile } = await requireOnboardedUser();

  const activeCommunity = await getActiveCommunity(user.id);

  return (
    <>
      <SetAppShell
        title="Settings"
      />
      <SettingsForm
        user={user}
        profile={profile!}
        communityOptions={activeCommunity.options}
        selectedCommunitySlug={activeCommunity.selected?.slug ?? ""}
      />
    </>
  );
}
