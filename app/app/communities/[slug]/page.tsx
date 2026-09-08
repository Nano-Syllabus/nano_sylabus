import { redirect } from "next/navigation";

type PageProps = {
  params: Promise<{ slug: string }>;
};
export const dynamic = "force-dynamic";

export default async function CommunityStudySpacePage({ params }: PageProps) {
  const { slug } = await params;
  redirect(`/app/chat?community=${encodeURIComponent(slug)}`);
}
