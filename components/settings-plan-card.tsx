import Link from "next/link";
import { ArrowUpRight, Sparkles } from "lucide-react";
import { getActivePlanTierLabel } from "@/lib/billing";
import type { AppUser } from "@/lib/types";
import { formatDate } from "@/lib/utils";

/** The student's current plan, with the way up (or to manage it) one click away. */
export function SettingsPlanCard({
  user,
  endsAt,
  lapsed = null,
}: {
  user: AppUser;
  endsAt: string | null;
  /** The last paid plan, when it has run out and nothing replaced it. */
  lapsed?: { name: string; endedAt: string } | null;
}) {
  const label = getActivePlanTierLabel(user);
  // Pro, Group and role-based unlimited access have nothing above them to upgrade to.
  const canUpgrade = !label || label === "Plus";

  return (
    <div className="mb-6 rounded-lg border border-border bg-bg-primary">
      <div className="border-b border-border px-5 py-3">
        <h2 className="type-student-section-title">Your plan</h2>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-4 p-5">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-blue-600/10 text-blue-600">
            <Sparkles size={18} />
          </span>
          <div className="min-w-0">
            <p className="text-lg font-semibold text-text-primary">{label ?? "Free"} plan</p>
            <p className="text-sm text-text-secondary">
              {!label
                ? lapsed
                  ? `Your ${lapsed.name} plan ended on ${formatDate(lapsed.endedAt)}. Renew to get it back.`
                  : "Upgrade for unlimited challenges and more NanoAI help."
                : endsAt
                  ? `Active until ${formatDate(endsAt)}`
                  : "Active"}
            </p>
          </div>
        </div>
        {canUpgrade ? (
          <Link
            href="/app/billing"
            className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-blue-600 px-4 text-sm font-medium text-white hover:bg-blue-700"
          >
            {label ? "Upgrade to Pro" : lapsed ? `Renew ${lapsed.name}` : "Upgrade"}
            <ArrowUpRight size={16} />
          </Link>
        ) : (
          <Link
            href="/app/billing"
            className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-border px-4 text-sm font-medium text-text-primary hover:bg-bg-secondary"
          >
            Manage plan
          </Link>
        )}
      </div>
    </div>
  );
}
