"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import {
  ArrowRight,
  Check,
  CheckCircle2,
  CreditCard,
  LoaderCircle,
  ShieldCheck,
  Smartphone,
  Upload,
  UploadCloud,
  Wallet,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ReceiptUploadFromPhone } from "@/components/receipt-upload-from-phone";
import type {
  AppUser,
  BillingInvoiceSummary,
  PaymentMethodConfig,
  StudentBillingOverview,
  SubscriptionPlan,
} from "@/lib/types";
import { cn, formatDate } from "@/lib/utils";

export type CheckoutInvoice = Pick<
  BillingInvoiceSummary,
  "id" | "status" | "amount" | "currency" | "invoiceCode" | "subtotal" | "paymentSubmission"
> & { plan: SubscriptionPlan };

const FREE_FEATURES = [
  "3 challenges / day",
  "AI answer grading",
  "All semesters & subjects",
  "Community PDFs & materials",
  "Learning analytics",
  "Group study sessions",
];

const PLAN_COPY = {
  plus: {
    title: "Plus",
    description: "Everything in Free",
    fallbackFeatures: ["Unlimited challenges", "Exam calendar & study plan", "Romanized Nepali"],
  },
  pro: {
    title: "Pro",
    description: "Everything in Plus",
    fallbackFeatures: [
      "AI tutor",
      "AI concept videos & animations",
      "English & Nepali",
    ],
  },
} as const;

const TESTIMONIALS = [
  {
    name: "Aayush K.",
    course: "Computer Engineering · TU",
    badge: "Top Performer",
    image: "/landing-new/avatar-2.png",
    quote:
      "I stopped waiting to finish every chapter before practising. One topic at a time finally felt manageable.",
  },
  {
    name: "Sneha P.",
    course: "Civil Engineering · PU",
    badge: "Rising Achiever",
    image: "/landing-new/avatar-1.png",
    quote: "The handwritten feedback showed me the exact reason my solution lost its way.",
  },
  {
    name: "Resha D.",
    course: "Computer Engineering · PU",
    badge: "Consistent Learner",
    image: "/landing-new/avatar-3.png",
    quote:
      "Breaking my study into smaller topics helped me stay focused and finally make real progress.",
  },
] as const;

function formatPlanPrice(plan: SubscriptionPlan | null, months: 1 | 3, fallback: number) {
  const price = (plan?.price ?? fallback) * months;
  return `Rs. ${price.toLocaleString("en-NP")}`;
}

function FeatureList({ features }: { features: string[] }) {
  return (
    <ul className="type-student-body m-0 mt-4 list-none space-y-3 p-0 font-medium text-[#293044]">
      {features.map((feature) => (
        <li key={feature} className="flex items-start gap-2.5">
          <Check
            className="mt-px size-3.5 shrink-0 text-[#3353f4]"
            strokeWidth={2.2}
            aria-hidden="true"
          />
          <span>{feature}</span>
        </li>
      ))}
    </ul>
  );
}

export function BillingPageClient({
  overview,
  paymentConfig,
  user,
}: {
  overview: StudentBillingOverview;
  paymentConfig: PaymentMethodConfig | null;
  user: AppUser;
}) {
  const router = useRouter();
  const [billingMonths, setBillingMonths] = useState<1 | 3>(1);
  const [creatingPlanId, setCreatingPlanId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [selectedInvoice, setSelectedInvoice] = useState<CheckoutInvoice | null>(null);
  const [activationConfirmation, setActivationConfirmation] = useState<{
    invoiceCode: string;
  } | null>(null);
  const [cancelConfirmationOpen, setCancelConfirmationOpen] = useState(false);
  const [updatingSubscription, setUpdatingSubscription] = useState(false);
  const [cancelledSubscriptionIds, setCancelledSubscriptionIds] = useState<string[]>([]);
  const [success, setSuccess] = useState("");

  const plans = useMemo(() => {
    const active = overview.plans.filter((plan) => plan.isActive);
    return {
      plus: active.find((plan) => plan.slug === "plus-monthly") ?? null,
      pro:
        active.find((plan) => plan.slug === "individual-unlimited") ??
        active.find((plan) => plan.productType === "individual" && plan.isUnlimited) ??
        null,
    };
  }, [overview.plans]);

  const activeSubscription = useMemo(() => {
    const now = Date.now();
    return (
      overview.subscriptions.find((subscription) => {
        if (cancelledSubscriptionIds.includes(subscription.id)) return false;
        if (subscription.status !== "active") return false;
        return !subscription.endsAt || new Date(subscription.endsAt).getTime() > now;
      }) ?? null
    );
  }, [cancelledSubscriptionIds, overview.subscriptions]);

  const activePlan = useMemo(() => {
    if (!activeSubscription) return null;
    return (
      overview.plans.find((plan) => plan.id === activeSubscription.planId) ??
      overview.invoices.find((invoice) => invoice.planId === activeSubscription.planId)?.plan ??
      null
    );
  }, [activeSubscription, overview.invoices, overview.plans]);

  const activePlanLabel = activePlan?.slug === "plus-monthly"
    ? "Plus"
    : activePlan?.productType === "group"
      ? "Group"
      : "Pro";
  const plusIsCurrent = Boolean(activePlan && plans.plus && activePlan.id === plans.plus.id);
  const proIsCurrent = Boolean(activePlan && plans.pro && activePlan.id === plans.pro.id);

  const hasUnlimitedAccess = cancelledSubscriptionIds.length > 0
    ? overview.subscriptions.some((subscription) => {
        if (
          cancelledSubscriptionIds.includes(subscription.id) ||
          subscription.status !== "active"
        ) {
          return false;
        }
        if (subscription.endsAt && new Date(subscription.endsAt).getTime() <= Date.now()) {
          return false;
        }
        return overview.plans.some(
          (plan) => plan.id === subscription.planId && plan.isUnlimited,
        );
      })
    : user.hasUnlimitedAccess;

  async function requestInvoice(
    plan: SubscriptionPlan,
    months: 1 | 3,
  ): Promise<CheckoutInvoice> {
    const response = await fetch("/api/billing/invoices", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        planId: plan.id,
        paymentMethod: "bank_transfer",
        billingMonths: months,
      }),
    });
    const payload = (await response.json().catch(() => ({}))) as {
      error?: string;
      invoice?: Pick<
        CheckoutInvoice,
        "id" | "status" | "amount" | "subtotal" | "currency" | "invoiceCode"
      >;
    };
    if (!response.ok || !payload.invoice) {
      throw new Error(payload.error || "Could not prepare the payment. Please try again.");
    }
    return { ...payload.invoice, plan, paymentSubmission: null };
  }

  async function createInvoice(
    plan: SubscriptionPlan,
  ) {
    setCreatingPlanId(plan.id);
    setError("");
    setSuccess("");
    try {
      const invoice = await requestInvoice(plan, billingMonths);
      setSelectedInvoice(invoice);
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Could not reach Nano Syllabus. Check your connection and try again.",
      );
    } finally {
      setCreatingPlanId(null);
    }
  }

  function startPlan(plan: SubscriptionPlan | null) {
    if (!plan) {
      setError("This plan is not available yet. Please try again later.");
      return;
    }
    void createInvoice(plan);
  }

  async function cancelSubscription() {
    if (!activeSubscription) return;
    setUpdatingSubscription(true);
    setError("");
    setSuccess("");
    try {
      const response = await fetch("/api/billing/subscriptions/cancel", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ subscriptionId: activeSubscription.id, action: "cancel" }),
      });
      const payload = (await response.json().catch(() => ({}))) as {
        error?: string;
        subscription?: { status?: string };
        cancelledSubscriptionIds?: string[];
      };
      if (!response.ok) {
        throw new Error(payload.error || "Could not cancel your subscription.");
      }
      if (payload.subscription?.status !== "cancelled") {
        throw new Error("Your subscription did not cancel. Please try again.");
      }
      const cancelledIds = payload.cancelledSubscriptionIds?.length
        ? payload.cancelledSubscriptionIds
        : [activeSubscription.id];
      setCancelledSubscriptionIds((current) => Array.from(new Set([...current, ...cancelledIds])));
      setSuccess("Subscription cancelled. You can choose the same plan or a different plan now.");
      setCancelConfirmationOpen(false);
      router.refresh();
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Could not cancel your subscription. Please try again.",
      );
    } finally {
      setUpdatingSubscription(false);
    }
  }

  return (
    <>
      {/* This route intentionally keeps the Figma light-artboard palette in both app themes. */}
      <main className="min-h-full bg-[#fbfcfe] pb-20 pt-6 text-[#111827]">
        {error ? (
          <div
            role="alert"
            className="student-page-width mb-5 flex items-center justify-between gap-3 rounded-lg border border-red-200 bg-red-50 py-2 pl-4 pr-2 text-sm text-red-700"
          >
            <span>{error}</span>
            <button
              type="button"
              onClick={() => setError("")}
              aria-label="Dismiss billing error"
              className="flex size-10 shrink-0 items-center justify-center rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500"
            >
              <X className="size-4" aria-hidden="true" />
            </button>
          </div>
        ) : null}
        {success ? (
          <div
            role="status"
            className="student-page-width mb-5 flex items-center justify-between gap-3 rounded-lg border border-emerald-200 bg-emerald-50 py-2 pl-4 pr-2 text-sm text-emerald-800"
          >
            <span>{success}</span>
            <button
              type="button"
              onClick={() => setSuccess("")}
              aria-label="Dismiss billing confirmation"
              className="flex size-10 shrink-0 items-center justify-center rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600"
            >
              <X className="size-4" aria-hidden="true" />
            </button>
          </div>
        ) : null}

        <header className="student-page-width flex flex-col items-center text-center">
          <h1 className="type-student-page-title text-[#111827]">
            Simple plans. Bigger dreams.
          </h1>
          <div
            className="mt-5 inline-flex h-11 items-center rounded-full border border-[#dfe4ed] bg-white p-[2px]"
            aria-label="Billing period"
          >
            <button
              type="button"
              aria-pressed={billingMonths === 1}
              onClick={() => setBillingMonths(1)}
              className={cn(
                "h-10 rounded-full px-6 text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3353f4] focus-visible:ring-offset-2",
                billingMonths === 1 ? "bg-[#111827] text-white" : "text-[#7b8498]",
              )}
            >
              1 month
            </button>
            <button
              type="button"
              aria-pressed={billingMonths === 3}
              onClick={() => setBillingMonths(3)}
              className={cn(
                "h-10 rounded-full px-6 text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3353f4] focus-visible:ring-offset-2",
                billingMonths === 3 ? "bg-[#111827] text-white" : "text-[#7b8498]",
              )}
            >
              3 months
            </button>
          </div>
          <Link
            href="/app/invoices"
            className="mt-3 inline-flex min-h-10 items-center gap-2 rounded-md px-3 text-sm font-medium text-[#5064da] hover:text-[#3049ed] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3353f4] focus-visible:ring-offset-2"
          >
            View payment activity <ArrowRight className="size-4" aria-hidden="true" />
          </Link>
        </header>

        <section
          aria-label="Subscription plans"
          className="student-page-width mt-8 grid grid-cols-1 items-stretch gap-4 lg:grid-cols-3 lg:gap-5"
        >
          <PricingCard
            title="Free"
            eyebrow={activePlan ? "Base plan" : "Current Plan"}
            price="Rs. 0"
            includes="Everything in Free"
            features={FREE_FEATURES}
            actionLabel={activePlan ? "Included in your plan" : "Current plan"}
            onAction={() => router.push("/app/today")}
            disabled
          />
          <PricingCard
            title={PLAN_COPY.plus.title}
            eyebrow={
              billingMonths === 1
                ? `3 months · ${formatPlanPrice(plans.plus, 3, 450)}`
                : `1 month · ${formatPlanPrice(plans.plus, 1, 450)}`
            }
            price={formatPlanPrice(plans.plus, billingMonths, 450)}
            includes={PLAN_COPY.plus.description}
            features={[...PLAN_COPY.plus.fallbackFeatures]}
            actionLabel={plusIsCurrent ? "Current plan" : "Choose Plus"}
            loading={creatingPlanId === plans.plus?.id}
            onAction={() => startPlan(plans.plus)}
            disabled={plusIsCurrent}
            current={plusIsCurrent}
            accessEndsAt={plusIsCurrent ? activeSubscription?.endsAt : null}
            featured
          />
          <PricingCard
            title={PLAN_COPY.pro.title}
            eyebrow={
              billingMonths === 1
                ? `3 months · ${formatPlanPrice(plans.pro, 3, 1500)}`
                : `1 month · ${formatPlanPrice(plans.pro, 1, 1500)}`
            }
            price={formatPlanPrice(plans.pro, billingMonths, 1500)}
            includes={PLAN_COPY.pro.description}
            features={[...PLAN_COPY.pro.fallbackFeatures]}
            actionLabel={proIsCurrent ? "Current plan" : "Choose Pro"}
            loading={creatingPlanId === plans.pro?.id}
            onAction={() => startPlan(plans.pro)}
            disabled={proIsCurrent}
            current={proIsCurrent}
            accessEndsAt={proIsCurrent ? activeSubscription?.endsAt : null}
          />
        </section>

        <section className="student-page-width mt-10">
          <div className="text-center">
            <h2 className="type-student-section-title text-[#111827]">
              You don’t have to prepare alone.
            </h2>
            <p className="type-student-body mt-1.5 font-medium text-[#697387]">
              See the work happening across NanoSyllabus.
            </p>
          </div>

          <div className="mt-5 grid overflow-hidden rounded-xl border border-[#e1e6ee] bg-white sm:grid-cols-3">
            {[
              [overview.socialProof.challengesCompletedThisWeek, "Challenges completed this week"],
              [overview.socialProof.handwrittenAnswersReviewed, "Handwritten answers reviewed"],
              [overview.socialProof.activeStudyCommunityMembers, "Students active in study communities"],
            ].map(([value, label], index) => (
              <div
                key={label}
                className={cn(
                  "px-5 py-4",
                  index > 0 && "border-t border-[#e1e6ee] sm:border-l sm:border-t-0",
                )}
              >
                <p className="type-student-metric text-[#111827]">
                  {Number(value).toLocaleString("en-NP")}
                </p>
                <p className="type-student-body mt-1.5 font-medium text-[#697387]">{label}</p>
              </div>
            ))}
          </div>

          <h2 className="type-student-section-title mt-7 text-center text-[#111827]">
            Real Stories, Real Growth
          </h2>
          <div className="mt-4 grid gap-4 lg:grid-cols-3">
            {TESTIMONIALS.map((testimonial) => (
              <article
                key={testimonial.name}
                className="min-h-[130px] rounded-xl border border-[#e1e6ee] bg-white px-5 py-4"
              >
                <div className="flex items-center gap-3">
                  <Image
                    src={testimonial.image}
                    alt=""
                    width={34}
                    height={34}
                    className="size-[34px] rounded-full object-cover"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="type-student-card-title truncate text-[#111827]">
                      {testimonial.name}
                    </p>
                    <p className="type-student-body truncate font-medium text-[#697387]">
                      {testimonial.course}
                    </p>
                  </div>
                  <span className="type-student-body shrink-0 rounded-full bg-[#d9ff69] px-2 py-1 font-semibold text-[#28320e]">
                    {testimonial.badge}
                  </span>
                </div>
                <p className="type-student-body mt-4 font-medium text-[#697387]">
                  <span className="mr-2 text-base font-bold leading-none text-[#c9ee47]">“</span>
                  {testimonial.quote}
                </p>
              </article>
            ))}
          </div>
          <div className="mt-3 flex justify-center gap-1.5" aria-hidden="true">
            <span className="size-1.5 rounded-full bg-[#3353f4]" />
            <span className="size-1.5 rounded-full bg-[#dce1ea]" />
            <span className="size-1.5 rounded-full bg-[#dce1ea]" />
          </div>

          {!activePlan ? (
            <div className="relative mt-6 overflow-hidden rounded-[20px] bg-[#3049ed] px-6 py-6 text-white sm:px-8 sm:py-7">
              <Image
                src="/figma-pricing-book-open.svg"
                alt=""
                width={85}
                height={85}
                className="mx-auto mb-4 size-14 lg:absolute lg:left-8 lg:top-1/2 lg:mb-0 lg:size-16 lg:-translate-y-1/2"
              />
              <div className="relative mx-auto flex max-w-[560px] flex-col items-center text-center">
                <h2 className="type-student-card-title text-white">
                  Ready for more than 3 challenges a day?
                </h2>
                <p className="type-student-body mt-1.5 font-medium text-[#c7d2fe]">
                  Get unlimited practice and a study plan built around your exam dates.
                </p>
                <div className="mt-3 flex flex-col items-center gap-2">
                  <button
                    type="button"
                    onClick={() => startPlan(plans.plus)}
                    disabled={creatingPlanId === plans.plus?.id}
                    className="min-h-10 rounded-md bg-white px-5 text-sm font-semibold text-[#111827] transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-[#3049ed] disabled:cursor-not-allowed disabled:opacity-70"
                  >
                    {billingMonths === 1
                      ? `Choose Plus - ${formatPlanPrice(plans.plus, 1, 450)}/month ↗`
                      : `Choose Plus - ${formatPlanPrice(plans.plus, 3, 450)}/3 months ↗`}
                  </button>
                  <button
                    type="button"
                    onClick={() => router.push("/app/today")}
                    className="min-h-10 rounded-md px-3 text-sm font-medium text-[#e0e7ff] underline decoration-[#e0e7ff] underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-[#3049ed]"
                  >
                    Keep using Free
                  </button>
                </div>
              </div>
            </div>
          ) : null}
          <p className="type-student-body mt-5 text-center font-medium text-[#697387]">
            NanoSyllabus · Learn. Practise. Get feedback. Study together.
          </p>
        </section>

        {activeSubscription && activePlan ? (
          <section
            aria-label="Manage subscription"
            className="student-page-width mt-10 flex flex-col gap-5 rounded-xl border border-[#e1e6ee] bg-white p-5 sm:flex-row sm:items-center sm:justify-between"
          >
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-text-muted">
                Your subscription
              </p>
              <h2 className="type-student-section-title mt-2 text-text-primary">
                {activePlanLabel}
              </h2>
              <p className="mt-2 max-w-xl text-sm leading-6 text-text-secondary">
                Your paid access is active
                {activeSubscription.endsAt
                  ? ` until ${formatDate(activeSubscription.endsAt)}`
                  : ""}
                . Cancelling ends access immediately, after which you can choose this plan or a
                different plan again.
              </p>
            </div>
            <Button
              type="button"
              variant="danger"
              className="shrink-0"
              disabled={updatingSubscription}
              onClick={() => setCancelConfirmationOpen(true)}
            >
              Cancel subscription
            </Button>
          </section>
        ) : null}

      </main>

      {selectedInvoice ? (
        <PaymentSubmissionModal
          invoice={selectedInvoice}
          paymentConfig={paymentConfig}
          onClose={() => setSelectedInvoice(null)}
          onSaved={() => {
            setActivationConfirmation({ invoiceCode: selectedInvoice.invoiceCode });
            setSelectedInvoice(null);
            router.refresh();
          }}
        />
      ) : null}
      {activationConfirmation ? (
        <PaymentActivationConfirmation
          invoiceCode={activationConfirmation.invoiceCode}
          onClose={() => setActivationConfirmation(null)}
        />
      ) : null}
      {cancelConfirmationOpen && activeSubscription && activePlan ? (
        <CancelSubscriptionConfirmation
          planName={activePlanLabel}
          loading={updatingSubscription}
          onClose={() => setCancelConfirmationOpen(false)}
          onConfirm={() => void cancelSubscription()}
        />
      ) : null}
    </>
  );
}

function PricingCard({
  title,
  eyebrow,
  price,
  includes,
  features,
  actionLabel,
  loading = false,
  disabled = false,
  current = false,
  accessEndsAt = null,
  onAction,
  featured = false,
}: {
  title: string;
  eyebrow: string;
  price: string;
  includes?: string;
  features: string[];
  actionLabel: string;
  loading?: boolean;
  disabled?: boolean;
  current?: boolean;
  accessEndsAt?: string | null;
  onAction: () => void;
  featured?: boolean;
}) {
  return (
    <article
      className={cn(
        "relative flex min-h-[400px] w-full flex-col rounded-xl border border-[#dfe4ed] bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,0.04)]",
        featured && "border-[#aab7e7] shadow-[0_4px_14px_rgba(39,64,190,0.08)]",
      )}
    >
      {featured ? (
        <h2 className="type-student-meta mb-2.5 w-fit rounded-md bg-[#d9ff69] px-2 py-1 font-semibold text-[#24300e]">
          {title}
        </h2>
      ) : null}
      {!featured ? (
        <h2 className="type-student-card-title text-[#111827]">
          {title}
        </h2>
      ) : null}
      <p className="type-student-metric mt-1 text-[#111827]">
        {price}
      </p>
      <p className="type-student-body mt-1 min-h-4 font-medium text-[#697387]">{eyebrow}</p>
      <div className="mt-4 h-px w-full bg-[#d8dee8]" />
      {includes ? (
        <h3 className="type-student-card-title mt-4 text-[#222a3a]">{includes}</h3>
      ) : null}
      <FeatureList features={features} />
      <div className="mt-auto pt-7">
        <button
          type="button"
          className={cn(
            "flex min-h-10 w-full items-center justify-center gap-2 rounded-md bg-[#111827] px-4 py-2 text-sm font-semibold text-white transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3353f4] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:bg-[#e4e6e9] disabled:text-[#747c8d] disabled:opacity-100",
            featured && !current && "bg-[#3548f5]",
            current && "bg-[#e8f6ee] text-[#187a42]",
          )}
          onClick={onAction}
          disabled={loading || disabled}
          aria-busy={loading}
        >
          {current ? <CheckCircle2 className="size-4" aria-hidden="true" /> : null}
          {loading ? "Preparing payment..." : actionLabel}
          {!loading && !disabled ? <span aria-hidden="true">→</span> : null}
        </button>
        {current ? (
          <p className="type-student-body mt-2 text-center font-medium text-[#697387]">
            {accessEndsAt
              ? `Active until ${formatDate(accessEndsAt)}`
              : "Active with no expiry date"}
          </p>
        ) : null}
      </div>
    </article>
  );
}

export function PaymentSubmissionModal({
  invoice,
  paymentConfig,
  onClose,
  onSaved,
}: {
  invoice: CheckoutInvoice;
  paymentConfig: PaymentMethodConfig | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [receipt, setReceipt] = useState<File | null>(null);
  const [mobileUploadSessionId, setMobileUploadSessionId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialogRef.current?.focus();
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !saving) onClose();
    };
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [saving, onClose]);

  const hasProof = Boolean(
    receipt || mobileUploadSessionId || invoice.paymentSubmission?.proofStoragePath,
  );

  function handleFileSelect(file: File) {
    if (!file) return;
    const validTypes = ["image/jpeg", "image/png", "image/webp", "application/pdf"];
    if (!validTypes.includes(file.type) && !/\.(jpe?g|png|webp|pdf)$/i.test(file.name)) {
      setError("Please select a JPG, PNG, WebP, or PDF file.");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setError("File size must be 5 MB or less.");
      return;
    }
    setError("");
    setReceipt(file);
    setMobileUploadSessionId(null);
  }

  async function submitPayment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!hasProof) {
      setError("Please upload your payment screenshot before submitting.");
      return;
    }

    const activationStartedAt = Date.now();
    setSaving(true);
    setError("");

    const formData = new FormData();
    formData.set("invoiceId", invoice.id);
    if (receipt) {
      formData.set("receipt", receipt);
    } else if (mobileUploadSessionId) {
      formData.set("mobileUploadSessionId", mobileUploadSessionId);
    }

    try {
      const response = await fetch("/api/billing/payments", { method: "POST", body: formData });
      if (!response.ok) {
        const payload = (await response.json().catch(() => ({}))) as { error?: string };
        setError(payload.error || "Failed to submit payment.");
        setSaving(false);
        return;
      }
      const payload = (await response.json().catch(() => ({}))) as { access?: string };
      if (payload.access !== "active") {
        setError("Your payment was saved, but access is not active yet. Please try again.");
        setSaving(false);
        return;
      }

      const remainingConfirmationDelay = Math.max(0, 3_000 - (Date.now() - activationStartedAt));
      if (remainingConfirmationDelay > 0) {
        await new Promise((resolve) => window.setTimeout(resolve, remainingConfirmationDelay));
      }
      setSaving(false);
      onSaved();
    } catch {
      setError("Network error while submitting payment. Please try again.");
      setSaving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-3 sm:p-4 backdrop-blur-sm"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !saving) onClose();
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="billing-dialog-title"
        tabIndex={-1}
        className="max-h-[min(94dvh,850px)] w-full max-w-[1040px] overflow-y-auto rounded-[32px] bg-white p-7 text-[#111827] shadow-2xl focus:outline-none sm:p-9 md:p-10"
      >
        {/* Modal Header */}
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3.5 sm:gap-4">
            <div className="flex size-13 shrink-0 items-center justify-center rounded-full bg-[#e3f7d4] text-[#24591e] sm:size-14">
              <CreditCard className="size-6 sm:size-7" strokeWidth={2.2} aria-hidden="true" />
            </div>
            <div>
              <h2
                id="billing-dialog-title"
                className="font-display text-2xl font-bold tracking-tight text-gray-950 sm:text-[28px]"
              >
                Verify your payment
              </h2>
              <p className="mt-0.5 text-sm font-medium text-gray-500 sm:text-base">
                Complete these 2 steps to activate your access.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            aria-label="Close payment dialog"
            className="flex size-9 shrink-0 items-center justify-center rounded-full bg-gray-100 text-gray-400 transition hover:bg-gray-200 hover:text-gray-700 disabled:opacity-50 sm:size-10"
          >
            <X className="size-4 sm:size-5" aria-hidden="true" />
          </button>
        </div>

        <form onSubmit={submitPayment} className="mt-7 sm:mt-8">
          {/* Two Steps Grid */}
          <div className="grid gap-6 lg:grid-cols-2 lg:items-stretch">
            {/* Step 1: Pay via QR */}
            <div className="flex flex-col justify-between rounded-[22px] border border-[#e4f5e0] bg-[#f8fdf9] p-6 sm:p-7">
              <div>
                <h3 className="text-base font-bold text-gray-900 sm:text-lg">
                  1. Pay via QR
                </h3>

                <div className="mt-5 flex items-center gap-4 sm:gap-6">
                  {/* QR Code Container */}
                  <div className="flex size-[160px] shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-gray-200/80 bg-white p-2.5 shadow-xs sm:size-[180px]">
                    {paymentConfig ? (
                      <Image
                        src={paymentConfig.qrImageUrl}
                        alt={`Official ${paymentConfig.displayName} payment QR`}
                        width={180}
                        height={180}
                        unoptimized
                        className="size-full rounded-xl object-contain"
                      />
                    ) : (
                      <div className="flex size-full flex-col items-center justify-center p-2 text-center text-xs text-gray-400">
                        Payment QR not configured yet
                      </div>
                    )}
                  </div>

                  {/* Payment Amount & Remarks */}
                  <div className="min-w-0 flex-1">
                    <div className="flex size-7 items-center justify-center rounded-lg bg-[#e3f7d4] text-[#24591e]">
                      <Wallet className="size-4" aria-hidden="true" />
                    </div>
                    <p className="mt-1.5 text-xs font-semibold text-gray-500 sm:text-sm">Payment amount</p>
                    <p className="font-display text-2xl font-bold tracking-tight text-gray-950 sm:text-3xl">
                      {invoice.currency} {invoice.amount.toLocaleString()}
                    </p>

                    <div className="my-3.5 w-full border-t border-gray-200/70" />

                    <p className="text-xs font-semibold text-gray-500 sm:text-sm">Remarks</p>
                    <div className="mt-1.5 inline-flex items-center rounded-lg bg-[#e3f7d4] px-3 py-1.5 text-xs font-bold text-[#24591e] sm:text-sm">
                      Invoice ID: {invoice.invoiceCode}
                    </div>
                  </div>
                </div>
              </div>

              {/* Step 1 Bottom Notice */}
              <div className="mt-6 flex items-start gap-3 rounded-xl border border-[#d6f2ca] bg-[#eefae8] p-3.5 text-xs sm:text-[13px] leading-relaxed text-gray-700">
                <Smartphone className="mt-0.5 size-4 shrink-0 text-[#24591e]" aria-hidden="true" />
                <p>
                  Make sure the screenshot clearly shows the invoice ID ({invoice.invoiceCode}) in
                  the remarks section after payment.
                </p>
              </div>
            </div>

            {/* Step 2: Upload payment screenshot */}
            <div className="flex flex-col justify-between rounded-[22px] border border-gray-200/90 bg-white p-6 sm:p-7">
              <div>
                <h3 className="text-base font-bold text-gray-900 sm:text-lg">
                  2. Upload payment screenshot
                </h3>

                <div className="mt-5 grid grid-cols-1 items-stretch gap-3.5 sm:grid-cols-[1fr_auto_1fr]">
                  {/* Option A: Device File Upload */}
                  <div
                    onDragOver={(e) => {
                      e.preventDefault();
                      setIsDragging(true);
                    }}
                    onDragLeave={() => setIsDragging(false)}
                    onDrop={(e) => {
                      e.preventDefault();
                      setIsDragging(false);
                      const file = e.dataTransfer.files?.[0];
                      if (file) handleFileSelect(file);
                    }}
                    onClick={() => fileInputRef.current?.click()}
                    className={cn(
                      "relative flex min-h-[220px] flex-1 cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed p-4 text-center transition-colors sm:p-5",
                      isDragging
                        ? "border-emerald-500 bg-emerald-50/50"
                        : receipt
                          ? "border-emerald-400 bg-emerald-50/30"
                          : "border-gray-200 bg-gray-50/40 hover:border-gray-300",
                    )}
                  >
                    {receipt ? (
                      <div className="flex flex-col items-center p-1">
                        <CheckCircle2 className="size-9 text-emerald-600 mb-1" aria-hidden="true" />
                        <p className="max-w-[150px] truncate text-xs font-bold text-gray-900 sm:text-sm">
                          {receipt.name}
                        </p>
                        <p className="mt-0.5 text-xs text-gray-500">
                          {(receipt.size / (1024 * 1024)).toFixed(2)} MB
                        </p>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setReceipt(null);
                          }}
                          className="mt-2.5 text-xs font-semibold text-red-600 hover:underline"
                        >
                          Change file
                        </button>
                      </div>
                    ) : (
                      <>
                        <UploadCloud className="size-9 text-gray-800" strokeWidth={1.8} aria-hidden="true" />
                        <p className="mt-2 text-sm font-bold text-gray-900 sm:text-[15px]">
                          Upload screenshot
                        </p>
                        <p className="mt-0.5 max-w-[150px] text-xs leading-snug text-gray-500">
                          Drag and drop or click to upload from your device.
                        </p>
                        <span className="mt-3 inline-flex items-center gap-1.5 rounded-xl bg-[#e3f7d4] px-4 py-2 text-xs font-bold text-gray-900 shadow-xs transition hover:bg-[#d5f3c1] sm:text-sm">
                          <Upload className="size-4" aria-hidden="true" />
                          Choose file
                        </span>
                        <p className="mt-2 text-[10.5px] text-gray-400">
                          JPG, PNG, WebP or PDF · Max 5 MB
                        </p>
                      </>
                    )}

                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/jpeg,image/png,image/webp,application/pdf"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) handleFileSelect(file);
                      }}
                    />
                  </div>

                  {/* Middle OR Divider */}
                  <div className="relative flex items-center justify-center my-1 sm:my-0 sm:flex-col">
                    <div className="hidden sm:block absolute inset-y-0 w-px bg-gray-200" />
                    <div className="sm:hidden absolute inset-x-0 h-px bg-gray-200" />
                    <span className="relative z-10 flex size-7 items-center justify-center rounded-full border border-gray-200 bg-white text-xs font-bold text-gray-400 shadow-2xs">
                      OR
                    </span>
                  </div>

                  {/* Option B: Scan QR for Phone Upload */}
                  <ReceiptUploadFromPhone
                    invoiceId={invoice.id}
                    variant="qr-card"
                    onReady={(sessionId) => {
                      setMobileUploadSessionId(sessionId);
                      setReceipt(null);
                    }}
                    onCleared={() => {
                      setMobileUploadSessionId(null);
                    }}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Error display */}
          {error ? (
            <p role="alert" className="mt-4 text-center text-sm font-medium text-destructive">
              {error}
            </p>
          ) : null}

          {/* Saving Status Notification */}
          {saving ? (
            <div
              className="mt-4 flex items-center justify-center gap-2.5 rounded-xl border border-gray-200 bg-gray-50 p-3 text-sm text-gray-700"
              role="status"
              aria-live="polite"
            >
              <LoaderCircle className="size-4 animate-spin text-gray-900" />
              <span>Activating your access. Please wait a few seconds...</span>
            </div>
          ) : null}

          {/* Main CTA Button */}
          <Button
            type="submit"
            size="lg"
            disabled={!hasProof || saving || !paymentConfig}
            className={cn(
              "mt-6 w-full rounded-2xl py-4 text-base font-bold transition-all",
              hasProof && !saving && paymentConfig
                ? "bg-[#101828] text-white hover:bg-black active:scale-[0.99] shadow-sm cursor-pointer"
                : "bg-[#d0d7e2] text-white cursor-not-allowed hover:bg-[#d0d7e2]",
            )}
            aria-busy={saving}
          >
            {saving ? "Activating access..." : "Submit payment & activate access"}
          </Button>
        </form>
      </div>
    </div>
  );
}

export function PaymentActivationConfirmation({
  invoiceCode,
  onClose,
}: {
  invoiceCode: string;
  onClose: () => void;
}) {
  return (
    <ModalFrame title="Access activated" onClose={onClose}>
      <div className="flex flex-col items-center text-center">
        <span className="flex size-16 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
          <CheckCircle2 className="size-8" aria-hidden="true" />
        </span>
        <h3 className="mt-5 text-xl font-semibold text-text-primary">Your paid access is active</h3>
        <p className="mt-2 max-w-sm text-sm leading-6 text-text-secondary">
          You can use all features included in your plan now. Your receipt has also been saved for
          the billing record.
        </p>
        <div className="mt-5 w-full rounded-2xl border border-border bg-bg-secondary p-4 text-left">
          <p className="text-xs font-semibold uppercase tracking-wider text-text-muted">Invoice</p>
          <p className="mt-1 font-mono text-sm font-semibold text-text-primary">{invoiceCode}</p>
          <div className="mt-3 flex items-center gap-2 border-t border-border pt-3 text-sm text-emerald-700">
            <ShieldCheck className="size-4 shrink-0" aria-hidden="true" />
            <span>Plan access activated by Nano Syllabus</span>
          </div>
        </div>
        <Button type="button" size="lg" className="mt-6 w-full rounded-2xl" onClick={onClose}>
          Done
        </Button>
      </div>
    </ModalFrame>
  );
}

function CancelSubscriptionConfirmation({
  planName,
  loading,
  onClose,
  onConfirm,
}: {
  planName: string;
  loading: boolean;
  onClose: () => void;
  onConfirm: () => void;
}) {
  return (
    <ModalFrame title={`Cancel ${planName}?`} onClose={onClose} locked={loading}>
      <p className="text-sm leading-6 text-text-secondary">
        This immediately ends your {planName} access and moves your account to the Free plan. You
        can buy {planName} again or choose a different plan right after cancellation.
      </p>
      <div className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-900">
        Any remaining paid time will be forfeited. This action does not issue an automatic refund.
      </div>
      <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
        <Button type="button" variant="outline" disabled={loading} onClick={onClose}>
          Keep plan
        </Button>
        <Button type="button" variant="danger" disabled={loading} onClick={onConfirm}>
          {loading ? "Cancelling..." : "Cancel now"}
        </Button>
      </div>
    </ModalFrame>
  );
}

function ModalFrame({
  title,
  children,
  onClose,
  locked = false,
  wide = false,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  locked?: boolean;
  wide?: boolean;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialogRef.current?.focus();
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !locked) onClose();
    };
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [locked, onClose]);
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4 backdrop-blur-sm"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !locked) onClose();
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="billing-dialog-title"
        tabIndex={-1}
        className={cn(
          "max-h-[calc(100dvh-2rem)] w-full overflow-y-auto rounded-3xl border border-border bg-bg-primary p-6 shadow-2xl focus:outline-none sm:p-8",
          wide ? "max-w-4xl" : "max-w-lg",
        )}
      >
        <div className="mb-6 flex items-start justify-between gap-4">
          <h2 id="billing-dialog-title" className="font-display text-2xl font-semibold">
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            disabled={locked}
            aria-label="Close payment dialog"
            className="flex size-10 shrink-0 items-center justify-center rounded-full bg-bg-secondary text-text-secondary transition hover:text-text-primary disabled:opacity-50"
          >
            <X className="size-4" aria-hidden="true" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
