import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { CommunitySubjectWorkspaceClient } from "@/components/community-subject-workspace-client";
import { SetAppShell } from "@/components/set-app-shell";
import { requireOnboardedUser } from "@/lib/auth";
import { getCommunity } from "@/lib/data/communities";
import { getCommunitySubjectWorkspace } from "@/lib/data/community-subjects";
import { titleCase } from "@/lib/utils";

type PageProps = {
  params: Promise<{ slug: string; subjectSlug: string }>;
  searchParams: Promise<{ term?: string }>;
};

export default async function CommunitySubjectPage({ params, searchParams }: PageProps) {
  const { user } = await requireOnboardedUser();
  const { slug, subjectSlug } = await params;
  const { term: termId } = await searchParams;
  const community = await getCommunity(slug, user.id);
  if (!community) notFound();
  if (community.membership?.status !== "active") redirect(`/communities/${community.slug}`);
  const term =
    community.terms.find((item) => item.id === termId) ||
    community.terms.find((item) => item.subjects.some((subject) => subject.slug === subjectSlug));
  const subject = term?.subjects.find((item) => item.slug === subjectSlug);
  if (!term || !subject) notFound();
  const workspace = await getCommunitySubjectWorkspace(user.id, slug, subjectSlug);
  if (!workspace) notFound();

  return (
    <>
      <SetAppShell title={subject.name} />
      <main className="w-full max-w-[1100px] px-4 pb-24 pt-5 lg:p-7">
        <Link
          href={`/app/communities/${encodeURIComponent(community.slug)}/semesters/${encodeURIComponent(term.id)}`}
          className="inline-flex min-h-10 items-center gap-2 text-sm text-text-secondary hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-strong"
        >
          <ArrowLeft className="size-4" aria-hidden="true" /> Semester {term.semesterNumber}
        </Link>
        <header className="border-b border-border pb-8 pt-4">
          <p className="text-sm text-text-secondary">
            Year {term.yearNumber} · Semester {term.semesterNumber}
            {subject.code ? ` · ${subject.code}` : ""}
          </p>
          <h1 className="mt-2 font-display text-3xl font-semibold tracking-tight">
            {titleCase(subject.name)}
          </h1>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-text-secondary">
            {subject.description ||
              "This subject workspace will collect syllabus topics, study material, challenges, and community discussions."}
          </p>
        </header>
        <CommunitySubjectWorkspaceClient
          communitySlug={slug}
          communitySubjectSlug={subjectSlug}
          workspace={workspace}
        />
      </main>
    </>
  );
}
