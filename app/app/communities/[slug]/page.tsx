import { notFound, redirect } from "next/navigation";
import { CommunitySubjectExplorer } from "@/components/community-subject-explorer";
import { SetAppShell } from "@/components/set-app-shell";
import { requireOnboardedUser } from "@/lib/auth";
import { getCommunity } from "@/lib/data/communities";
import { getCommunitySubjectExplorerInsights } from "@/lib/data/community-subject-explorer";

type PageProps = {
  params: Promise<{ slug: string }>;
};
export const dynamic = "force-dynamic";

export default async function CommunityStudySpacePage({ params }: PageProps) {
  const { user } = await requireOnboardedUser();
  const { slug } = await params;
  const community = await getCommunity(slug, user.id);
  if (!community) notFound();
  if (community.membership?.status !== "active") redirect(`/communities/${community.slug}`);
  const insights = await getCommunitySubjectExplorerInsights(user.id, community);

  return (
    <>
      <SetAppShell title="Subject Explorer" />
      <CommunitySubjectExplorer community={community} insights={insights} />
    </>
  );
}
