import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, CalendarRange, Users } from "lucide-react";
import { CommunityStudySpaceClient } from "@/components/community-study-space-client";
import { SetAppShell } from "@/components/set-app-shell";
import { requireOnboardedUser } from "@/lib/auth";
import { getCommunity } from "@/lib/data/communities";
import { titleCase } from "@/lib/utils";

type PageProps = { params: Promise<{ slug: string }> };
export const dynamic = "force-dynamic";

export default async function CommunityStudySpacePage({ params }: PageProps) {
  const { user } = await requireOnboardedUser();
  const { slug } = await params;
  const community = await getCommunity(slug, user.id);
  if (!community) notFound();
  if (community.membership?.status !== "active") redirect(`/communities/${community.slug}`);

  return (
    <>
      <SetAppShell title="Communities" />
      <main className="w-full max-w-[1240px] px-4 pb-24 pt-5 lg:p-7">
        <Link
          href="/app/communities"
          className="inline-flex min-h-10 items-center gap-2 text-sm text-text-secondary hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-strong"
        >
          <ArrowLeft className="size-4" aria-hidden="true" /> My communities
        </Link>
        <header className="border-b border-border pb-8 pt-4">
          <p className="text-sm text-text-secondary">
            {community.university} · {community.faculty}
          </p>
          <h1 className="mt-2 max-w-3xl font-display text-3xl font-semibold tracking-tight">
            {titleCase(community.name)}
          </h1>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-text-secondary">
            {community.description ||
              "Choose a year, open a semester, and continue into its subjects."}
          </p>
          <div className="mt-5 flex flex-wrap gap-4 text-sm text-text-muted">
            <span className="inline-flex items-center gap-2">
              <CalendarRange className="size-4" aria-hidden="true" /> {community.totalYears} years ·{" "}
              {community.totalSemesters} semesters
            </span>
            <span className="inline-flex items-center gap-2">
              <Users className="size-4" aria-hidden="true" /> {community.memberCount} members
            </span>
            {community.canManage ? (
              <span className="rounded-full border border-border px-2.5 py-1 text-xs">
                Creator controls
              </span>
            ) : null}
          </div>
        </header>
        <section className="py-8" aria-labelledby="semester-heading">
          <div className="mb-5">
            <h2 id="semester-heading" className="font-display text-2xl font-semibold">
              Years and semesters
            </h2>
            <p className="mt-2 text-sm text-text-secondary">
              Select your year to see its semester subjects.
            </p>
          </div>
          <CommunityStudySpaceClient initialCommunity={community} />
        </section>
      </main>
    </>
  );
}
