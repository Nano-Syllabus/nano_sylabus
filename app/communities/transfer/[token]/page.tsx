import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Building2, Clock3, Users } from "lucide-react";
import { CommunityTransferRespond } from "@/components/community-transfer-respond";
import { getCurrentAuth } from "@/lib/auth";
import {
  getOwnershipTransferByToken,
  validTransferToken,
} from "@/lib/data/community-ownership-transfer";
import { titleCase } from "@/lib/utils";

type PageProps = { params: Promise<{ token: string }> };

export const dynamic = "force-dynamic";

function expiry(value: string) {
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Kathmandu",
  }).format(new Date(value));
}

const closedMessage = {
  expired: "This transfer link has expired. Ask the community creator to send it again.",
  accepted: "This transfer has already been accepted.",
  declined: "This transfer was declined.",
  cancelled: "This transfer was withdrawn and is no longer open.",
} as const;

/** The page the emailed "Review transfer" link opens. */
export default async function CommunityTransferPage({ params }: PageProps) {
  const { token } = await params;
  if (!validTransferToken(token)) notFound();

  const [transfer, auth] = await Promise.all([getOwnershipTransferByToken(token), getCurrentAuth()]);
  if (!transfer) notFound();

  const nextPath = `/communities/transfer/${token}`;
  const communityName = titleCase(transfer.community.name);

  return (
    <main className="min-h-screen bg-bg-secondary px-4 py-8 text-text-primary sm:px-6">
      <div className="mx-auto w-full max-w-3xl">
        <Link href="/" className="inline-flex items-center gap-2.5 font-semibold">
          <Image
            src="/nanologo.png"
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
              Transfer ownership
            </p>
            <h1 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">
              Become the owner of {communityName}
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-white/70">
              {transfer.fromName} wants to hand this community to you. As the owner you manage its
              subjects, members and settings.
            </p>
          </div>

          <div className="p-6 sm:p-10">
            <dl className="grid gap-5 border-b border-border pb-8 sm:grid-cols-3">
              <div>
                <Building2 className="size-5 text-text-secondary" aria-hidden="true" />
                <dt className="mt-3 text-xs font-medium uppercase tracking-wider text-text-muted">
                  Institution
                </dt>
                <dd className="mt-1 text-sm font-semibold">{transfer.community.university}</dd>
              </div>
              <div>
                <Users className="size-5 text-text-secondary" aria-hidden="true" />
                <dt className="mt-3 text-xs font-medium uppercase tracking-wider text-text-muted">
                  Faculty
                </dt>
                <dd className="mt-1 text-sm font-semibold">{transfer.community.faculty}</dd>
              </div>
              <div>
                <Clock3 className="size-5 text-text-secondary" aria-hidden="true" />
                <dt className="mt-3 text-xs font-medium uppercase tracking-wider text-text-muted">
                  Valid until
                </dt>
                <dd className="mt-1 text-sm font-semibold">{expiry(transfer.expiresAt)}</dd>
              </div>
            </dl>

            <div className="pt-8">
              {transfer.state !== "pending" ? (
                <div className="rounded-xl border border-border bg-bg-secondary p-4 text-sm leading-6 text-text-secondary">
                  {closedMessage[transfer.state]}
                </div>
              ) : !auth.user ? (
                <>
                  <p className="mb-4 text-sm leading-6 text-text-secondary">
                    Sign in with the account this email was sent to. We will bring you back here.
                  </p>
                  <Link
                    href={`/login?next=${encodeURIComponent(nextPath)}`}
                    className="inline-flex min-h-12 w-full items-center justify-center rounded-xl bg-text-primary px-5 text-sm font-semibold text-text-inverse hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-strong focus-visible:ring-offset-2"
                  >
                    Sign in to continue
                  </Link>
                </>
              ) : auth.user.id !== transfer.toUserId ? (
                <div className="rounded-xl border border-border bg-bg-secondary p-4 text-sm leading-6 text-text-secondary">
                  You are signed in as{" "}
                  <strong className="text-text-primary">{auth.user.email}</strong>, but this
                  transfer was sent to a different account. Sign out and sign in with the account
                  that received the email.
                </div>
              ) : (
                <>
                  <p className="mb-4 text-sm leading-6 text-text-secondary">
                    You are signed in as{" "}
                    <strong className="text-text-primary">{auth.user.email}</strong>. Once you
                    accept, you become its creator and {transfer.fromName} becomes a member. Subjects
                    keep their existing material.
                  </p>
                  <CommunityTransferRespond token={token} slug={transfer.community.slug} />
                </>
              )}
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
