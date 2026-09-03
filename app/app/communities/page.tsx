import Link from "next/link";
import { ArrowRight, Building2 } from "lucide-react";
import { CommunitySubjectExplorer } from "@/components/community-subject-explorer";
import { SetAppShell } from "@/components/set-app-shell";
import { requireOnboardedUser } from "@/lib/auth";
import { getCommunity, listJoinedCommunities } from "@/lib/data/communities";
import { getCommunitySubjectExplorerInsights } from "@/lib/data/community-subject-explorer";

export const dynamic = "force-dynamic";

export default async function SubjectExplorerPage() {
  const { user } = await requireOnboardedUser();
  const communities = await listJoinedCommunities(user.id);
  const joinedCommunity =
    communities.find((community) => community.membership?.role === "member") ||
    communities.find((community) => community.membership?.status === "active");
  const community = joinedCommunity ? await getCommunity(joinedCommunity.slug, user.id) : null;
  const insights = community ? await getCommunitySubjectExplorerInsights(user.id, community) : {};

  return (
    <>
      <SetAppShell title="Subject Explorer" />
      {community ? (
        <CommunitySubjectExplorer
          key={`${user.id}:${community.id}`}
          community={community}
          insights={insights}
        />
      ) : (
        <main className="w-full max-w-[1240px] px-4 pb-24 pt-5 lg:p-7">
          <header className="border-b border-border pb-7">
            <p className="text-sm font-medium text-text-secondary">Subject Explorer</p>
            <h1 className="mt-2 font-display text-3xl font-semibold tracking-tight">
              Explore your subjects
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-text-secondary">
              Join your university community to unlock its years, semesters, and subjects.
            </p>
          </header>
          <section className="flex min-h-96 flex-col items-center justify-center border-b border-border py-16 text-center">
            <Building2 className="size-10 text-text-muted" aria-hidden="true" />
            <h2 className="mt-4 font-display text-xl font-semibold">No subjects to explore yet</h2>
            <p className="mt-2 max-w-lg text-sm leading-6 text-text-secondary">
              Join one community first. Its complete academic structure will appear here.
            </p>
            <Link
              href="/communities"
              className="mt-5 inline-flex min-h-10 items-center gap-2 rounded-full bg-text-primary px-4 text-sm font-medium text-text-inverse focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-strong"
            >
              Browse communities <ArrowRight className="size-4" aria-hidden="true" />
            </Link>
          </section>
        </main>
      )}
    </>
  );
}
