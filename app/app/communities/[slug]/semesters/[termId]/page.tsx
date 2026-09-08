import { redirect } from "next/navigation";

type PageProps = {
  params: Promise<{ slug: string; termId: string }>;
};

export const dynamic = "force-dynamic";

export default async function CommunitySemesterPage({ params }: PageProps) {
  const { slug, termId } = await params;
  redirect(
    `/app/chat?community=${encodeURIComponent(slug)}&semester=${encodeURIComponent(termId)}`,
  );
}
