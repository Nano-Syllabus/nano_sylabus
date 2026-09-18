import { redirect } from "next/navigation";
import { CommunityJoinRedirect } from "@/components/community-join-redirect";
import { getCurrentAuth } from "@/lib/auth";

type PageProps = { params: Promise<{ slug: string }> };

export const dynamic = "force-dynamic";

export default async function JoinCommunityPage({ params }: PageProps) {
  const { slug } = await params;
  const { user } = await getCurrentAuth();
  if (!user) {
    redirect(`/flow?community=${encodeURIComponent(slug)}`);
  }

  return <CommunityJoinRedirect slug={slug} />;
}
