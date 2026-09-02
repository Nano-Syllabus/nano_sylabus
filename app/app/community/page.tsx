import Link from "next/link";
import { ArrowRight, Building2 } from "lucide-react";
import { CommunityHubClient } from "@/components/community-hub-client";
import { SetAppShell } from "@/components/set-app-shell";
import { requireOnboardedUser } from "@/lib/auth";
import { getCommunityHubForUser } from "@/lib/data/community-hub";

export const dynamic = "force-dynamic";

export default async function CommunityPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { user } = await requireOnboardedUser();
  const [data, params] = await Promise.all([getCommunityHubForUser(user.id), searchParams]);
  const tab = typeof params.tab === "string" ? params.tab : "overview";
  const initialSection = ["overview", "subjects", "forum", "members"].includes(tab)
    ? (tab as "overview" | "subjects" | "forum" | "members")
    : "overview";
  const memberRanking = params.sort === "today" ? "today" : "xp";
  const initialInviteOpen = params.invite === "referral";

  return (
    <>
      <SetAppShell title="Community Hub" />
      {data ? (
        <CommunityHubClient
          initialData={data}
          initialSection={initialSection}
          memberRanking={memberRanking}
          initialInviteOpen={initialInviteOpen}
        />
      ) : (
        <main className="mx-auto w-full max-w-[1240px] px-4 pb-24 pt-8 sm:px-6 lg:px-10">
          <section className="flex min-h-[60vh] flex-col items-center justify-center rounded-3xl border border-dashed border-border px-6 py-16 text-center">
            <span className="flex size-14 items-center justify-center rounded-2xl bg-bg-secondary text-text-secondary">
              <Building2 className="size-7" aria-hidden="true" />
            </span>
            <h1 className="mt-5 font-display text-3xl font-semibold tracking-tight">
              Join your program community
            </h1>
            <p className="mt-3 max-w-xl text-sm leading-6 text-text-secondary">
              Your real subjects, materials, challenge activity, classmates, and contributions will
              appear here after you join a community.
            </p>
            <Link
              href="/communities"
              className="mt-6 inline-flex min-h-11 items-center gap-2 rounded-full bg-text-primary px-5 text-sm font-semibold text-text-inverse hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-strong focus-visible:ring-offset-2"
            >
              Browse communities <ArrowRight className="size-4" aria-hidden="true" />
            </Link>
          </section>
        </main>
      )}
    </>
  );
}
