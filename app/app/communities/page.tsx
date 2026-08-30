import Link from "next/link";
import { ArrowRight, Building2, CalendarRange, Plus, Users } from "lucide-react";
import { SetAppShell } from "@/components/set-app-shell";
import { requireOnboardedUser } from "@/lib/auth";
import { listJoinedCommunities } from "@/lib/data/communities";
import { titleCase } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function MyCommunitiesPage() {
  const { user } = await requireOnboardedUser();
  const communities = await listJoinedCommunities(user.id);

  return (
    <>
      <SetAppShell title="My communities" />
      <main className="w-full max-w-[1240px] px-4 pb-24 pt-5 lg:p-7">
        <header className="flex flex-wrap items-end gap-4 border-b border-border pb-6">
          <div className="min-w-0 flex-1">
            <p className="text-sm text-text-secondary">Your academic spaces</p>
            <h1 className="mt-2 font-display text-3xl font-semibold tracking-tight">
              My communities
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-text-secondary">
              Open a community to move through its years, semesters, and subjects.
            </p>
          </div>
          <Link
            href="/communities"
            className="inline-flex min-h-11 items-center gap-2 rounded-full bg-text-primary px-5 text-sm font-medium text-text-inverse transition hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-strong focus-visible:ring-offset-2"
          >
            <Plus className="size-4" aria-hidden="true" /> Browse or create
          </Link>
        </header>

        {!communities.length ? (
          <section className="flex min-h-96 flex-col items-center justify-center border-b border-border py-16 text-center">
            <Building2 className="size-10 text-text-muted" aria-hidden="true" />
            <h2 className="mt-4 font-display text-xl font-semibold">Join your first community</h2>
            <p className="mt-2 max-w-lg text-sm leading-6 text-text-secondary">
              Find your university and faculty, or create a community if it is not listed yet.
            </p>
            <Link
              href="/communities"
              className="mt-5 inline-flex min-h-10 items-center gap-2 rounded-full bg-text-primary px-4 text-sm font-medium text-text-inverse focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-strong"
            >
              Browse communities <ArrowRight className="size-4" aria-hidden="true" />
            </Link>
          </section>
        ) : (
          <section
            className="grid gap-4 py-7 md:grid-cols-2 xl:grid-cols-3"
            aria-label="Joined communities"
          >
            {communities.map((community) => (
              <article
                key={community.id}
                className="flex min-h-64 flex-col rounded-xl border border-border bg-bg-primary p-5"
              >
                <div className="flex items-start gap-3">
                  <span className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-bg-secondary">
                    <Building2 className="size-5" aria-hidden="true" />
                  </span>
                  <div className="min-w-0">
                    <h2 className="font-display text-xl font-semibold">
                      {titleCase(community.name)}
                    </h2>
                    <p className="mt-1 text-sm text-text-secondary">{community.university}</p>
                  </div>
                </div>
                <p className="mt-4 line-clamp-2 text-sm leading-6 text-text-secondary">
                  {community.description || community.faculty}
                </p>
                <div className="mt-5 flex flex-wrap gap-3 text-xs text-text-muted">
                  <span className="inline-flex items-center gap-1.5">
                    <CalendarRange className="size-4" aria-hidden="true" />{" "}
                    {community.totalSemesters} semesters
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <Users className="size-4" aria-hidden="true" /> {community.memberCount} members
                  </span>
                </div>
                <Link
                  href={`/app/communities/${community.slug}`}
                  className="mt-auto inline-flex min-h-10 items-center justify-center gap-2 rounded-full bg-text-primary px-4 pt-0 text-sm font-medium text-text-inverse transition hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-strong"
                >
                  Open community <ArrowRight className="size-4" aria-hidden="true" />
                </Link>
              </article>
            ))}
          </section>
        )}
      </main>
    </>
  );
}
