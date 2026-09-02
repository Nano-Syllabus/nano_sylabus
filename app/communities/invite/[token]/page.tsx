import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Building2, Clock3, Users } from "lucide-react";
import { CommunityInviteAccept } from "@/components/community-invite-accept";
import { getCurrentAuth } from "@/lib/auth";
import { getCommunityInvite } from "@/lib/data/community-hub";
import { titleCase } from "@/lib/utils";

type PageProps = { params: Promise<{ token: string }> };

export const dynamic = "force-dynamic";

function inviteExpiry(value: string | null) {
  if (!value) return "No expiry";
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Kathmandu",
  }).format(new Date(value));
}

export default async function CommunityInvitePage({ params }: PageProps) {
  const { token } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(token)) notFound();

  const [invite, auth] = await Promise.all([getCommunityInvite(token), getCurrentAuth()]);
  if (!invite) notFound();

  const nextPath = `/communities/invite/${token}`;

  return (
    <main className="min-h-screen bg-bg-secondary px-4 py-8 text-text-primary sm:px-6">
      <div className="mx-auto w-full max-w-3xl">
        <Link href="/" className="inline-flex items-center gap-2.5 font-semibold">
          <Image
            src="/nano_logo.png"
            alt="Nano Syllabus"
            width={34}
            height={34}
            className="size-[34px] object-contain"
          />
          <span>nanosyllabus</span>
        </Link>

        <section className="mt-12 overflow-hidden rounded-3xl border border-border bg-bg-primary shadow-xl">
          <div className="bg-text-primary px-6 py-8 text-text-inverse sm:px-10 sm:py-10">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-white/60">
              Community invitation
            </p>
            <h1 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">
              Join {titleCase(invite.community.name)}
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-white/70">
              One shared academic space for the program&apos;s real subjects, course material,
              challenge activity, and peer contributions.
            </p>
          </div>

          <div className="p-6 sm:p-10">
            <dl className="grid gap-5 border-b border-border pb-8 sm:grid-cols-3">
              <div>
                <Building2 className="size-5 text-text-secondary" aria-hidden="true" />
                <dt className="mt-3 text-xs font-medium uppercase tracking-wider text-text-muted">
                  Institution
                </dt>
                <dd className="mt-1 text-sm font-semibold">{invite.community.university}</dd>
              </div>
              <div>
                <Users className="size-5 text-text-secondary" aria-hidden="true" />
                <dt className="mt-3 text-xs font-medium uppercase tracking-wider text-text-muted">
                  Faculty
                </dt>
                <dd className="mt-1 text-sm font-semibold">{invite.community.faculty}</dd>
              </div>
              <div>
                <Clock3 className="size-5 text-text-secondary" aria-hidden="true" />
                <dt className="mt-3 text-xs font-medium uppercase tracking-wider text-text-muted">
                  Valid until
                </dt>
                <dd className="mt-1 text-sm font-semibold">{inviteExpiry(invite.expiresAt)}</dd>
              </div>
            </dl>

            <div className="pt-8">
              {!invite.available ? (
                <div className="rounded-xl border border-border bg-bg-secondary p-4 text-sm leading-6 text-text-secondary">
                  This invitation has expired or reached its member limit. Ask the sender for a new
                  invitation link.
                </div>
              ) : auth.user ? (
                <>
                  <p className="mb-4 text-sm leading-6 text-text-secondary">
                    You are signed in as{" "}
                    <strong className="text-text-primary">{auth.user.email}</strong>. Accepting will
                    make this your active student community.
                  </p>
                  <CommunityInviteAccept token={token} />
                </>
              ) : (
                <>
                  <p className="mb-4 text-sm leading-6 text-text-secondary">
                    Sign in first. We will bring you back here so you can accept this invitation.
                  </p>
                  <Link
                    href={`/login?next=${encodeURIComponent(nextPath)}`}
                    className="inline-flex min-h-12 w-full items-center justify-center rounded-xl bg-text-primary px-5 text-sm font-semibold text-text-inverse hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-strong focus-visible:ring-offset-2"
                  >
                    Sign in to continue
                  </Link>
                </>
              )}
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
