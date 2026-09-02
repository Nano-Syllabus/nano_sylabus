import { notFound, redirect } from "next/navigation";
import { CommunitySemesterSubjects } from "@/components/community-subject-explorer";
import { SetAppShell } from "@/components/set-app-shell";
import { academicOrdinalLabel } from "@/lib/academic";
import { requireOnboardedUser } from "@/lib/auth";
import { getCommunity } from "@/lib/data/communities";

type PageProps = {
  params: Promise<{ slug: string; termId: string }>;
};

export const dynamic = "force-dynamic";

export default async function CommunitySemesterPage({ params }: PageProps) {
  const { user } = await requireOnboardedUser();
  const { slug, termId } = await params;
  const community = await getCommunity(slug, user.id);

  if (!community) notFound();
  if (community.membership?.status !== "active") redirect(`/communities/${community.slug}`);

  const term = community.terms.find((item) => item.id === termId);
  if (!term) notFound();

  return (
    <>
      <SetAppShell title={academicOrdinalLabel(term.semesterNumber, "Semester")} />
      <CommunitySemesterSubjects community={community} term={term} />
    </>
  );
}
