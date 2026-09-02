import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight, Gift, ShieldCheck, Users } from "lucide-react";
import { BillingReferralClaim } from "@/components/billing-referral-claim";
import { getCurrentAuth } from "@/lib/auth";
import { getBillingReferralByCode } from "@/lib/data/billing-referrals";

type PageProps = { params: Promise<{ code: string }> };

export const dynamic = "force-dynamic";

const focusRing =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-strong focus-visible:ring-offset-2";

export default async function BillingReferralPage({ params }: PageProps) {
  const { code } = await params;
  const [referral, auth] = await Promise.all([getBillingReferralByCode(code), getCurrentAuth()]);
  if (!referral) notFound();

  const normalizedCode = referral.code;
  const nextPath = `/r/${encodeURIComponent(normalizedCode)}`;

  return (
    <main className="min-h-screen bg-bg-secondary px-4 py-8 text-text-primary sm:px-6">
      <div className="mx-auto w-full max-w-2xl">
        <Link href="/" className="inline-flex items-center gap-2.5 font-semibold">
          <Image src="/nano_logo.png" alt="Nano Syllabus" width={34} height={34} className="size-[34px] object-contain" />
          <span>nanosyllabus</span>
        </Link>

        <section className="mt-12 overflow-hidden rounded-3xl border border-border bg-bg-primary shadow-xl">
          <div className="bg-text-primary px-6 py-9 text-text-inverse sm:px-10 sm:py-11">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-white/60">A real student referral</p>
            <h1 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">
              {referral.referrerName} invited you to NanoSyllabus Pro
            </h1>
            <p className="mt-3 max-w-xl text-sm leading-6 text-white/70">
              Learn from your course material, practise with real exam questions, and keep your readiness in one place.
            </p>
          </div>

          <div className="p-6 sm:p-10">
            {!referral.active ? (
              <div className="rounded-xl border border-border bg-bg-secondary p-4 text-sm leading-6 text-text-secondary">
                This referral link is no longer active. Ask the sender for a new one.
              </div>
            ) : (
              <>
                <div className="grid gap-3 sm:grid-cols-3">
                  <div className="rounded-2xl border border-border bg-bg-secondary p-4">
                    <Gift className="size-5 text-text-secondary" aria-hidden="true" />
                    <p className="mt-3 text-sm font-semibold">1 free month</p>
                    <p className="mt-1 text-xs leading-5 text-text-muted">For both people after a paid Pro signup is approved.</p>
                  </div>
                  <div className="rounded-2xl border border-border bg-bg-secondary p-4">
                    <ShieldCheck className="size-5 text-text-secondary" aria-hidden="true" />
                    <p className="mt-3 text-sm font-semibold">Automatic and auditable</p>
                    <p className="mt-1 text-xs leading-5 text-text-muted">Rewards come from the billing database, not a display counter.</p>
                  </div>
                  <div className="rounded-2xl border border-border bg-bg-secondary p-4">
                    <Users className="size-5 text-text-secondary" aria-hidden="true" />
                    <p className="mt-3 text-sm font-semibold">Code {normalizedCode}</p>
                    <p className="mt-1 text-xs leading-5 text-text-muted">{referral.claimCount} account{referral.claimCount === 1 ? "" : "s"} already joined from this link.</p>
                  </div>
                </div>

                <div className="mt-8 border-t border-border pt-8">
                  {auth.user ? (
                    <>
                      <p className="mb-4 text-sm leading-6 text-text-secondary">
                        You are signed in as <strong className="text-text-primary">{auth.user.email}</strong>. Save this referral before purchasing Pro.
                      </p>
                      <BillingReferralClaim code={normalizedCode} />
                    </>
                  ) : (
                    <>
                      <p className="mb-4 text-sm leading-6 text-text-secondary">
                        Create or sign in to your account, then save the referral before your first paid Pro subscription.
                      </p>
                      <div className="grid gap-3 sm:grid-cols-2">
                        <Link href={`/signup?next=${encodeURIComponent(nextPath)}`} className={`inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-text-primary px-5 text-sm font-semibold text-text-inverse hover:opacity-90 ${focusRing}`}>
                          Create account <ArrowRightIcon />
                        </Link>
                        <Link href={`/login?next=${encodeURIComponent(nextPath)}`} className={`inline-flex min-h-12 items-center justify-center rounded-xl border border-border px-5 text-sm font-semibold hover:bg-bg-secondary ${focusRing}`}>
                          Sign in
                        </Link>
                      </div>
                    </>
                  )}
                </div>
              </>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}

function ArrowRightIcon() {
  return <ArrowRight className="size-4" aria-hidden="true" />;
}
