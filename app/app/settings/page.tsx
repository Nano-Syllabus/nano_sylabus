import { SetAppShell } from "@/components/set-app-shell";
import { SettingsForm } from "@/components/settings-form";
import { SettingsPlanCard } from "@/components/settings-plan-card";
import { requireOnboardedUser } from "@/lib/auth";
import { listSubscriptionPlans, listUserSubscriptions } from "@/lib/data/billing";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const { user, profile } = await requireOnboardedUser();
  // The plan itself is already on `user` (same rule as the sidebar); this read only adds dates.
  // A failed read hides the dates, never the card.
  const plan = await Promise.all([listUserSubscriptions(user.id), listSubscriptionPlans()])
    .then(([subscriptions, plans]) => {
      const now = Date.now();
      const current = subscriptions.find(
        (row) => row.status === "active" && (!row.endsAt || new Date(row.endsAt).getTime() > now),
      );
      // Rows stay "active" past their end date, so "lapsed" is judged by ends_at, not status.
      const lapsed = subscriptions.find(
        (row) =>
          (row.status === "active" || row.status === "expired") &&
          row.endsAt &&
          new Date(row.endsAt).getTime() <= now,
      );
      return {
        endsAt: current?.endsAt ?? null,
        lapsed: lapsed
          ? { name: plans.find((item) => item.id === lapsed.planId)?.name ?? "paid", endedAt: lapsed.endsAt! }
          : null,
      };
    })
    .catch(() => ({ endsAt: null, lapsed: null }));

  return (
    <>
      <SetAppShell
        title="Settings"
      />
      <SettingsForm
        user={user}
        profile={profile!}
        planCard={<SettingsPlanCard user={user} endsAt={plan.endsAt} lapsed={plan.lapsed} />}
      />
    </>
  );
}
