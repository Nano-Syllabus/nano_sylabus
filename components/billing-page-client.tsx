"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import { BookOpen, Check, CheckCircle2, LoaderCircle, ShieldCheck, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/field";
import { ReceiptUploadFromPhone } from "@/components/receipt-upload-from-phone";
import type {
  AppUser,
  BillingInvoiceSummary,
  PaymentMethodConfig,
  StudentBillingOverview,
  SubscriptionPlan,
} from "@/lib/types";
import { cn, formatDate } from "@/lib/utils";

type CheckoutInvoice = Pick<
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
    <ul className="m-0 mt-4 list-none space-y-2.5 p-0 text-[12.5px] font-medium leading-[1.4] text-[#293044]">
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
        if (subscription.status !== "active") return false;
        return !subscription.endsAt || new Date(subscription.endsAt).getTime() > now;
      }) ?? null
    );
  }, [overview.subscriptions]);

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

  async function updateSubscriptionCancellation(action: "cancel" | "resume") {
    if (!activeSubscription) return;
    setUpdatingSubscription(true);
    setError("");
    try {
      const response = await fetch("/api/billing/subscriptions/cancel", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ subscriptionId: activeSubscription.id, action }),
      });
      const payload = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        throw new Error(payload.error || "Could not update your subscription.");
      }
      setCancelConfirmationOpen(false);
      router.refresh();
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Could not update your subscription. Please try again.",
      );
    } finally {
      setUpdatingSubscription(false);
    }
  }

  return (
    <>
      {/* This route intentionally keeps the Figma light-artboard palette in both app themes. */}
      <main className="min-h-full bg-[#fbfcfe] px-4 pb-16 pt-7 text-[#111827] sm:px-6 lg:px-8 lg:pb-20 lg:pt-9">
        {error ? (
          <div
            role="alert"
            className="mx-auto mb-5 flex max-w-[1000px] items-center justify-between gap-3 rounded-lg border border-red-200 bg-red-50 py-2 pl-4 pr-2 text-sm text-red-700"
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

        <header className="mx-auto flex max-w-[1000px] flex-col items-center text-center font-[family-name:var(--font-poppins)]">
          <h1 className="text-[28px] font-bold leading-tight tracking-[-0.04em] text-[#111827] sm:text-[34px]">
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
                "h-10 rounded-full px-6 text-[10px] font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3353f4] focus-visible:ring-offset-2",
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
                "h-10 rounded-full px-6 text-[10px] font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3353f4] focus-visible:ring-offset-2",
                billingMonths === 3 ? "bg-[#111827] text-white" : "text-[#7b8498]",
              )}
            >
              3 months
            </button>
          </div>
        </header>

        <section
          aria-label="Subscription plans"
          className="mx-auto mt-8 grid max-w-[1000px] grid-cols-[minmax(0,320px)] items-stretch justify-center gap-4 lg:grid-cols-3 lg:gap-5"
        >
          <PricingCard
            title="Free"
            eyebrow="Current Plan"
            price="Rs. 0"
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
            actionLabel={activePlan?.id === plans.plus?.id ? "Current plan" : "Choose Plus"}
            loading={creatingPlanId === plans.plus?.id}
            onAction={() => startPlan(plans.plus)}
            disabled={activePlan?.id === plans.plus?.id}
            current={activePlan?.id === plans.plus?.id}
            accessEndsAt={activePlan?.id === plans.plus?.id ? activeSubscription?.endsAt : null}
            cancellationScheduled={
              activePlan?.id === plans.plus?.id && activeSubscription?.cancelAtPeriodEnd
            }
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
            actionLabel={activePlan?.id === plans.pro?.id ? "Current plan" : "Choose Pro"}
            loading={creatingPlanId === plans.pro?.id}
            onAction={() => startPlan(plans.pro)}
            disabled={activePlan?.id === plans.pro?.id}
            current={activePlan?.id === plans.pro?.id}
            accessEndsAt={activePlan?.id === plans.pro?.id ? activeSubscription?.endsAt : null}
            cancellationScheduled={
              activePlan?.id === plans.pro?.id && activeSubscription?.cancelAtPeriodEnd
            }
          />
        </section>

        <section className="mx-auto mt-10 max-w-[1000px] font-[family-name:var(--font-poppins)]">
          <div className="text-center">
            <h2 className="text-[24px] font-bold tracking-[-0.035em] text-[#111827] sm:text-[28px]">
              You don’t have to prepare alone.
            </h2>
            <p className="mt-1.5 text-[11px] font-medium text-[#8a93a5]">
              See the work happening across NanoSyllabus.
            </p>
          </div>

          <div className="mt-5 grid overflow-hidden rounded-xl border border-[#e1e6ee] bg-white sm:grid-cols-3">
            {[
              [1_248, "Challenges completed this week"],
              [386, "Handwritten answers reviewed"],
              [72, "Students joined study sessions"],
            ].map(([value, label], index) => (
              <div
                key={label}
                className={cn(
                  "px-5 py-4",
                  index > 0 && "border-t border-[#e1e6ee] sm:border-l sm:border-t-0",
                )}
              >
                <p className="text-[24px] font-bold leading-none tracking-[-0.04em] text-[#111827]">
                  {Number(value).toLocaleString("en-NP")}
                </p>
                <p className="mt-1.5 text-[10px] font-medium text-[#7b8498]">{label}</p>
              </div>
            ))}
          </div>

          <h2 className="mt-7 text-center text-[22px] font-bold tracking-[-0.03em] text-[#111827] sm:text-[25px]">
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
                    <p className="truncate text-[11px] font-semibold text-[#111827]">
                      {testimonial.name}
                    </p>
                    <p className="truncate text-[8px] font-medium text-[#929bad]">
                      {testimonial.course}
                    </p>
                  </div>
                  <span className="shrink-0 rounded-full bg-[#d9ff69] px-2 py-1 text-[7px] font-semibold text-[#28320e]">
                    {testimonial.badge}
                  </span>
                </div>
                <p className="mt-4 text-[10px] font-medium leading-[1.55] text-[#697387]">
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

          <div className="mt-6 grid items-center gap-5 rounded-xl bg-[linear-gradient(105deg,#3047ef_0%,#3b58f7_55%,#397be8_100%)] px-6 py-5 text-white lg:grid-cols-[72px_1fr_auto] lg:px-8">
            <BookOpen className="size-12 stroke-[1.4]" aria-hidden="true" />
            <div>
              <h2 className="text-[16px] font-semibold">Ready for more than 3 challenges a day?</h2>
              <p className="mt-1 text-[10px] text-white/80">
                Get unlimited practice and a study plan built around your exam dates.
              </p>
            </div>
            <div className="flex flex-col items-center gap-2 sm:items-end">
              <button
                type="button"
                onClick={() => startPlan(plans.plus)}
                disabled={
                  creatingPlanId === plans.plus?.id || activePlan?.id === plans.plus?.id
                }
                className="min-h-9 rounded-md bg-white px-4 text-[10px] font-semibold text-[#111827] transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80 disabled:cursor-not-allowed disabled:opacity-70"
              >
                {activePlan?.id === plans.plus?.id
                  ? "Plus is active"
                  : billingMonths === 1
                    ? `Choose Plus - ${formatPlanPrice(plans.plus, 1, 450)}/month ↗`
                    : `Choose Plus - ${formatPlanPrice(plans.plus, 3, 450)}/3 months ↗`}
              </button>
              <button
                type="button"
                onClick={() => router.push("/app/today")}
                className="min-h-10 rounded-md px-2 text-[9px] font-medium text-white underline decoration-white/60 underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80"
              >
                Keep using Free
              </button>
            </div>
          </div>
          <p className="mt-5 text-center text-[9px] font-medium text-[#a0a8b7]">
            NanoSyllabus · Learn. Practise. Get feedback. Study together.
          </p>
        </section>

        {activeSubscription && activePlan ? (
          <section
            aria-label="Manage subscription"
            className="mx-auto mt-10 flex max-w-[1000px] flex-col gap-5 rounded-xl border border-[#e1e6ee] bg-white p-5 sm:flex-row sm:items-center sm:justify-between"
          >
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-text-muted">
                Your subscription
              </p>
              <h2 className="mt-2 font-[family-name:var(--font-poppins)] text-xl font-semibold text-text-primary">
                {activePlanLabel}
              </h2>
              <p className="mt-2 max-w-xl text-sm leading-6 text-text-secondary">
                {activeSubscription.cancelAtPeriodEnd
                  ? `Cancellation is scheduled. You will keep ${activePlanLabel} access until ${formatDate(activeSubscription.endsAt!)} and then move to the Free plan.`
                  : `Your paid access is active until ${formatDate(activeSubscription.endsAt!)}. You can cancel anytime without losing the time you have already paid for.`}
              </p>
            </div>
            {activeSubscription.cancelAtPeriodEnd ? (
              <Button
                type="button"
                variant="outline"
                className="shrink-0"
                disabled={updatingSubscription}
                onClick={() => void updateSubscriptionCancellation("resume")}
              >
                {updatingSubscription ? "Updating..." : "Keep subscription"}
              </Button>
            ) : (
              <Button
                type="button"
                variant="danger"
                className="shrink-0"
                disabled={updatingSubscription}
                onClick={() => setCancelConfirmationOpen(true)}
              >
                Cancel subscription
              </Button>
            )}
          </section>
        ) : null}

        <section className="mx-auto mt-12 max-w-[1000px] border-t border-[#e1e6ee] pt-8">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-text-muted">
                Payment activity
              </p>
              <h2 className="mt-2 font-[family-name:var(--font-poppins)] text-3xl font-semibold">
                Your invoices
              </h2>
            </div>
            <p className="text-sm text-text-secondary">
              {activePlan
                ? activeSubscription?.cancelAtPeriodEnd && activeSubscription.endsAt
                  ? `Plan ends ${formatDate(activeSubscription.endsAt)}`
                  : `${activePlanLabel} plan active`
                : user.hasUnlimitedAccess
                  ? "Unlimited plan active"
                  : `${overview.balance} messages available`}
            </p>
          </div>
          {overview.invoices.length ? (
            <div className="mt-6 space-y-3">
              {overview.invoices.map((invoice) => (
                <article
                  key={invoice.id}
                  className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-border bg-bg-primary p-5"
                >
                  <div>
                    <p className="font-semibold">{invoice.plan.name}</p>
                    <p className="mt-1 text-sm text-text-secondary">
                      {invoice.currency} {invoice.amount.toLocaleString()} ·{" "}
                      {formatDate(invoice.createdAt)}
                    </p>
                    <p className="mt-2 text-xs uppercase tracking-wider text-text-muted">
                      {invoice.status.replaceAll("_", " ")}
                    </p>
                  </div>
                  {!["paid", "rejected", "cancelled"].includes(invoice.status) ? (
                    <Button size="sm" onClick={() => setSelectedInvoice(invoice)}>
                      {invoice.paymentSubmission ? "Edit payment" : "Open payment QR"}
                    </Button>
                  ) : null}
                </article>
              ))}
            </div>
          ) : (
            <div className="mt-6 rounded-2xl border border-dashed border-border p-8 text-center text-sm text-text-secondary">
              No invoices yet. Choose a paid plan above when you are ready.
            </div>
          )}
        </section>
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
          endsAt={activeSubscription.endsAt}
          loading={updatingSubscription}
          onClose={() => setCancelConfirmationOpen(false)}
          onConfirm={() => void updateSubscriptionCancellation("cancel")}
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
  cancellationScheduled = false,
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
  cancellationScheduled?: boolean;
  onAction: () => void;
  featured?: boolean;
}) {
  return (
    <article
      className={cn(
        "relative mx-auto flex min-h-[400px] w-full max-w-[320px] flex-col rounded-xl border border-[#dfe4ed] bg-white p-5 font-[family-name:var(--font-poppins)] shadow-[0_1px_2px_rgba(15,23,42,0.04)]",
        featured && "border-[#aab7e7] shadow-[0_4px_14px_rgba(39,64,190,0.08)]",
      )}
    >
      {featured ? (
        <h2 className="mb-2.5 w-fit rounded-md bg-[#d9ff69] px-2 py-1 text-[9px] font-semibold leading-none text-[#24300e]">
          {title}
        </h2>
      ) : null}
      {!featured ? (
        <h2 className="text-[22px] font-semibold leading-tight tracking-[-0.025em] text-[#111827]">
          {title}
        </h2>
      ) : null}
      <p className="mt-1 text-[28px] font-bold leading-tight tracking-[-0.025em] text-[#111827]">
        {price}
      </p>
      <p className="mt-1 min-h-4 text-[9px] font-medium text-[#8992a3]">{eyebrow}</p>
      <div className="mt-4 h-px w-full bg-[#d8dee8]" />
      {includes ? <p className="mt-4 text-[9px] font-semibold text-[#222a3a]">{includes}</p> : null}
      <FeatureList features={features} />
      <div className="mt-auto pt-7">
        <button
          type="button"
          className={cn(
            "flex min-h-10 w-full items-center justify-center gap-2 rounded-md bg-[#111827] px-4 py-2 text-[10px] font-semibold text-white transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3353f4] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:bg-[#e4e6e9] disabled:text-[#747c8d] disabled:opacity-100",
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
          <p className="mt-2 text-center text-[10px] font-medium text-[#697387]">
            {accessEndsAt
              ? cancellationScheduled
                ? `Ends ${formatDate(accessEndsAt)}`
                : `Active until ${formatDate(accessEndsAt)}`
              : "Active with no expiry date"}
          </p>
        ) : null}
      </div>
    </article>
  );
}

function PaymentSubmissionModal({
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
  const [reference, setReference] = useState(invoice.paymentSubmission?.reference ?? "");
  const [payerName, setPayerName] = useState(invoice.paymentSubmission?.proofMeta?.payerName ?? "");
  const [receipt, setReceipt] = useState<File | null>(null);
  const [mobileUploadSessionId, setMobileUploadSessionId] = useState<string | null>(null);
  const [mobileReceiptName, setMobileReceiptName] = useState("");
  const [fileInputKey, setFileInputKey] = useState(0);
  const [note, setNote] = useState(invoice.paymentSubmission?.proofMeta?.note ?? "");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  async function submitPayment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const activationStartedAt = Date.now();
    setSaving(true);
    setError("");
    const formData = new FormData();
    formData.set("invoiceId", invoice.id);
    formData.set("reference", reference);
    formData.set("payerName", payerName);
    formData.set("note", note);
    if (receipt) formData.set("receipt", receipt);
    else if (mobileUploadSessionId) formData.set("mobileUploadSessionId", mobileUploadSessionId);
    const response = await fetch("/api/billing/payments", { method: "POST", body: formData });
    if (!response.ok) {
      const payload = (await response.json().catch(() => ({}))) as { error?: string };
      setError(payload.error || "Failed to submit payment.");
      setSaving(false);
      return;
    }
    const payload = (await response.json().catch(() => ({}))) as {
      access?: string;
    };
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
  }

  return (
    <ModalFrame title="Scan, pay and send your receipt" onClose={onClose} locked={saving} wide>
      <form onSubmit={submitPayment} className="grid gap-7 md:grid-cols-[220px_1fr]">
        <div>
          {paymentConfig ? (
            <Image
              src={paymentConfig.qrImageUrl}
              alt={`Official ${paymentConfig.displayName} payment QR`}
              width={220}
              height={220}
              unoptimized
              className="aspect-square w-full rounded-2xl border border-border bg-card object-contain p-2"
            />
          ) : (
            <div className="flex aspect-square items-center justify-center rounded-2xl border border-dashed border-border p-5 text-center text-sm text-text-secondary">
              Payment QR is not configured yet.
            </div>
          )}
          {paymentConfig ? (
            <div className="mt-3 text-sm text-text-secondary">
              <p className="font-semibold text-text-primary">
                {paymentConfig.bankName || paymentConfig.displayName}
              </p>
              <p>{paymentConfig.accountName}</p>
              {paymentConfig.accountNumber ? <p>A/C {paymentConfig.accountNumber}</p> : null}
            </div>
          ) : null}
        </div>
        <div>
          <div className="rounded-2xl bg-bg-secondary p-4">
            <div className="flex items-center justify-between gap-4">
              <span className="text-sm text-text-secondary">Total today</span>
              <strong className="text-xl">
                {invoice.currency} {invoice.amount.toLocaleString()}
              </strong>
            </div>
            <p className="mt-3 border-t border-border pt-3 font-mono text-sm">
              Remark: {invoice.invoiceCode}
            </p>
          </div>
          <div className="mt-5 space-y-4">
            <Field label="Transaction reference">
              <Input value={reference} onChange={(event) => setReference(event.target.value)} />
            </Field>
            <Field label="Payer name">
              <Input value={payerName} onChange={(event) => setPayerName(event.target.value)} />
            </Field>
            <div>
              <p className="text-xs font-medium uppercase tracking-wider text-text-secondary">
                Payment receipt *
              </p>
              <div className="mt-3 grid gap-3 sm:grid-cols-[minmax(0,1fr)_280px] sm:items-stretch">
                <div className="rounded-xl border border-border bg-bg-primary p-3">
                  <label
                    htmlFor="payment-receipt"
                    className="text-sm font-semibold text-text-primary"
                  >
                    Choose on this computer
                  </label>
                  <Input
                    key={fileInputKey}
                    id="payment-receipt"
                    type="file"
                    accept="image/jpeg,image/png,image/webp,application/pdf"
                    onChange={(event) => {
                      setReceipt(event.target.files?.[0] ?? null);
                      if (event.target.files?.[0]) {
                        setMobileUploadSessionId(null);
                        setMobileReceiptName("");
                      }
                    }}
                    className="mt-2 h-auto min-h-11 py-2 file:mr-2 file:rounded-md file:border-0 file:bg-bg-tertiary file:px-2 file:py-1 file:text-xs file:font-semibold"
                  />
                  <p className="mt-2 text-xs leading-5 text-text-muted">
                    JPG, PNG, WebP, or PDF · max 5 MB
                  </p>
                </div>
                <ReceiptUploadFromPhone
                  invoiceId={invoice.id}
                  onReady={(sessionId, fileName) => {
                    setMobileUploadSessionId(sessionId);
                    setMobileReceiptName(fileName);
                    setReceipt(null);
                    setFileInputKey((current) => current + 1);
                  }}
                  onCleared={() => {
                    setMobileUploadSessionId(null);
                    setMobileReceiptName("");
                  }}
                />
              </div>
              {mobileReceiptName ? (
                <p className="sr-only" role="status">
                  Receipt {mobileReceiptName} received from phone.
                </p>
              ) : null}
            </div>
            <Field label="Note (optional)">
              <Textarea rows={2} value={note} onChange={(event) => setNote(event.target.value)} />
            </Field>
          </div>
          {error ? (
            <p role="alert" className="mt-4 text-sm text-destructive">
              {error}
            </p>
          ) : null}
          {saving ? (
            <div
              className="mt-5 flex items-start gap-3 rounded-2xl border border-border bg-bg-secondary p-4 text-left"
              role="status"
              aria-live="polite"
            >
              <LoaderCircle
                className="mt-0.5 size-5 shrink-0 animate-spin text-text-primary motion-reduce:animate-none"
                aria-hidden="true"
              />
              <div>
                <p className="text-sm font-semibold text-text-primary">Activating your access</p>
                <p className="mt-1 text-xs leading-5 text-text-secondary">
                  Your receipt is saved. Access will be ready in about five seconds.
                </p>
              </div>
            </div>
          ) : null}
          <Button
            type="submit"
            size="lg"
            className="mt-6 w-full rounded-2xl"
            disabled={
              !paymentConfig ||
              saving ||
              !reference.trim() ||
              !payerName.trim() ||
              (!receipt && !mobileUploadSessionId && !invoice.paymentSubmission?.proofStoragePath)
            }
            aria-busy={saving}
          >
            {saving ? "Activating access..." : "Submit payment & activate access"}
          </Button>
        </div>
      </form>
    </ModalFrame>
  );
}

function PaymentActivationConfirmation({
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
  endsAt,
  loading,
  onClose,
  onConfirm,
}: {
  planName: string;
  endsAt: string | null;
  loading: boolean;
  onClose: () => void;
  onConfirm: () => void;
}) {
  return (
    <ModalFrame title={`Cancel ${planName}?`} onClose={onClose} locked={loading}>
      <p className="text-sm leading-6 text-text-secondary">
        Your plan will not continue after the current paid period. You will keep every paid feature
        until{" "}
        <strong className="font-semibold text-text-primary">
          {endsAt ? formatDate(endsAt) : "your plan ends"}
        </strong>
        , then your account will move to the Free plan.
      </p>
      <div className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-900">
        This does not issue a refund or remove access early.
      </div>
      <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
        <Button type="button" variant="outline" disabled={loading} onClick={onClose}>
          Keep plan
        </Button>
        <Button type="button" variant="danger" disabled={loading} onClick={onConfirm}>
          {loading ? "Cancelling..." : "Cancel at period end"}
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
