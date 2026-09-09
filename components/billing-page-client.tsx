"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Check, CheckCircle2, Mail, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/field";
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
  "Limited AI Tutor", "Document Chat", "Limited Mock Exams",
  "Exam Readiness", "Daily Challenges", "Progress Tracking",
];

const PLAN_COPY = {
  individual: {
    title: "Individual",
    description: "A complete exam-preparation system for one student.",
    fallbackFeatures: ["AI Tutor", "Document Chat", "Mock Exams", "Exam Readiness", "Daily Challenges", "Handwritten Answer Feedback"],
  },
  group: {
    title: "Group",
    description: "One package for five students studying together.",
    fallbackFeatures: ["5 Student Accounts", "AI Tutor For Everyone", "Mock Exams", "Handwritten Answer Feedback", "Individual Readiness & Progress", "Shared Accountability"],
  },
} as const;

function formatMoney(plan: SubscriptionPlan) {
  return `${plan.currency === "NPR" ? "Rs." : plan.currency} ${plan.price.toLocaleString("en-NP")}`;
}

function FeatureList({
  features,
  variant,
}: {
  features: string[];
  variant: "free" | "individual" | "group";
}) {
  return (
    <ul className="mt-[23px] m-0 list-none p-0 font-[family-name:var(--font-poppins)] text-[14px] font-medium tracking-[0.42px] text-text-secondary">
      {features.map((feature, index) => {
        const unlimited =
          (variant === "individual" && index < 3) ||
          (variant === "group" && (index === 1 || index === 2));
        return (
          <li key={feature} className="flex h-[30px] items-center gap-[10px] whitespace-nowrap leading-[20px]">
            <span className="flex h-[30px] w-[22px] shrink-0 items-center justify-center" aria-hidden="true">
              {unlimited ? (
                <span className="relative -top-px text-[25px] font-semibold leading-none text-[#219653]">∞</span>
              ) : (
                <Check className="size-[19px] text-[#1d57fd]" strokeWidth={2.4} />
              )}
            </span>
            <span>{feature}</span>
          </li>
        );
      })}
    </ul>
  );
}

export function BillingPageClient({ overview, paymentConfig, user }: {
  overview: StudentBillingOverview;
  paymentConfig: PaymentMethodConfig | null;
  user: AppUser;
}) {
  const router = useRouter();
  const [creatingPlanId, setCreatingPlanId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [selectedInvoice, setSelectedInvoice] = useState<CheckoutInvoice | null>(null);
  const [groupPlan, setGroupPlan] = useState<SubscriptionPlan | null>(null);
  const [reviewConfirmation, setReviewConfirmation] = useState<{ invoiceCode: string } | null>(null);

  const plans = useMemo(() => {
    const active = overview.plans.filter((plan) => plan.isActive);
    return {
      individual: active.find((plan) => plan.productType === "individual") ?? null,
      group: active.find((plan) => plan.productType === "group") ?? null,
    };
  }, [overview.plans]);

  const activeSubscription = useMemo(() => {
    const now = Date.now();
    return overview.subscriptions.find((subscription) => {
      if (subscription.status !== "active") return false;
      return !subscription.endsAt || new Date(subscription.endsAt).getTime() > now;
    }) ?? null;
  }, [overview.subscriptions]);

  const activePlan = useMemo(() => {
    if (!activeSubscription) return null;
    return overview.plans.find((plan) => plan.id === activeSubscription.planId)
      ?? overview.invoices.find((invoice) => invoice.planId === activeSubscription.planId)?.plan
      ?? null;
  }, [activeSubscription, overview.invoices, overview.plans]);

  const activePlanLabel = activePlan?.productType === "group" ? "Group Unlimited" : "Individual Unlimited";

  async function requestInvoice(plan: SubscriptionPlan, purchaseDetails?: {
    groupName: string; organizerEmail: string; studentEmails: string[];
  }): Promise<CheckoutInvoice> {
    const response = await fetch("/api/billing/invoices", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ planId: plan.id, paymentMethod: "bank_transfer", ...(purchaseDetails ? { purchaseDetails } : {}) }),
    });
    const payload = (await response.json().catch(() => ({}))) as {
      error?: string;
      invoice?: Pick<CheckoutInvoice, "id" | "status" | "amount" | "subtotal" | "currency" | "invoiceCode">;
    };
    if (!response.ok || !payload.invoice) {
      throw new Error(payload.error || "Could not prepare the payment. Please try again.");
    }
    return { ...payload.invoice, plan, paymentSubmission: null };
  }

  async function createInvoice(plan: SubscriptionPlan, purchaseDetails?: {
    groupName: string; organizerEmail: string; studentEmails: string[];
  }) {
    setCreatingPlanId(plan.id); setError("");
    try {
      const invoice = await requestInvoice(plan, purchaseDetails);
      setGroupPlan(null);
      setSelectedInvoice(invoice);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Could not reach Nano Syllabus. Check your connection and try again.");
    } finally { setCreatingPlanId(null); }
  }

  function startPlan(plan: SubscriptionPlan | null) {
    if (!plan) {
      setError("This plan is not available yet. Please try again later.");
      return;
    }
    if (plan.productType === "group") setGroupPlan(plan);
    else void createInvoice(plan);
  }

  return (
    <>
      <main className="min-h-full bg-bg-primary px-5 py-12 text-text-primary sm:px-8 lg:py-16">
        {error ? <p role="alert" className="mx-auto mb-6 max-w-2xl rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p> : null}

        <header className="mx-auto mb-[50px] flex max-w-[1002px] flex-col items-center text-center font-[family-name:var(--font-poppins)]">
          <h1 className="text-[32px] font-bold leading-[1.3] tracking-[-0.64px] text-text-primary">
            Study without limits!
          </h1>
          <p className="mt-[13px] text-[14px] font-medium leading-[1.5] tracking-[-0.14px] text-text-secondary">
            {user.hasUnlimitedAccess
              ? `Your ${activePlanLabel} plan is active with unlimited NanoAI access.`
              : "Start learning for free. Upgrade when you’re ready for more."}
          </p>
          <div className="mt-[24px] inline-flex h-[39px] items-center rounded-full border border-border bg-card p-[3px] shadow-[0_2px_5px_rgba(0,0,0,0.16)]" aria-label="Billing period">
            <button
              type="button"
              aria-pressed="true"
              className="h-[31px] rounded-full bg-[#0f2b7f] px-[24px] text-[10px] font-semibold uppercase tracking-[0.6px] text-white"
            >
              Monthly
            </button>
            <button
              type="button"
              disabled
              title="Yearly billing is not available yet"
              className="h-[31px] rounded-full px-[24px] text-[10px] font-semibold uppercase tracking-[0.6px] text-text-primary disabled:cursor-not-allowed disabled:opacity-100"
            >
              Yearly
            </button>
          </div>
        </header>

        <section aria-label="Subscription plans" className="mx-auto grid max-w-[1100px] items-end justify-center gap-8 xl:grid-cols-[repeat(3,minmax(0,330px))] xl:gap-[55px]">
          <PricingCard
            title="Free"
            description="Start learning with the essentials"
            price="Rs. 0"
            features={FREE_FEATURES}
            featureVariant="free"
            actionLabel={user.hasUnlimitedAccess ? "Included with your plan" : "Get Started"}
            onAction={() => router.push("/app/today")}
            disabled={user.hasUnlimitedAccess}
          />
          <PricingCard
            title={PLAN_COPY.individual.title}
            description={PLAN_COPY.individual.description}
            price={plans.individual ? formatMoney(plans.individual) : "Rs. 1,500"}
            features={[...PLAN_COPY.individual.fallbackFeatures]}
            featureVariant="individual"
            actionLabel={activePlan?.productType === "individual" ? "Current plan" : "Get Individual"}
            loading={creatingPlanId === plans.individual?.id}
            onAction={() => startPlan(plans.individual)}
            disabled={activePlan?.productType === "individual"}
            current={activePlan?.productType === "individual"}
            accessEndsAt={activePlan?.productType === "individual" ? activeSubscription?.endsAt : null}
            featured
          />
          <PricingCard
            title={PLAN_COPY.group.title}
            description={PLAN_COPY.group.description}
            price={plans.group ? formatMoney(plans.group) : "Rs. 5,000"}
            features={[...PLAN_COPY.group.fallbackFeatures]}
            featureVariant="group"
            actionLabel={activePlan?.productType === "group" ? "Current plan" : user.hasUnlimitedAccess ? "Upgrade to Group" : "Get Group"}
            loading={creatingPlanId === plans.group?.id}
            onAction={() => startPlan(plans.group)}
            disabled={activePlan?.productType === "group"}
            current={activePlan?.productType === "group"}
            accessEndsAt={activePlan?.productType === "group" ? activeSubscription?.endsAt : null}
          />
        </section>

        <section className="mx-auto mt-16 max-w-[1002px] border-t border-border pt-10">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-text-muted">Payment activity</p>
              <h2 className="mt-2 font-[family-name:var(--font-poppins)] text-3xl font-semibold">Your invoices</h2>
            </div>
            <p className="text-sm text-text-secondary">{user.hasUnlimitedAccess ? "Unlimited plan active" : `${overview.balance} messages available`}</p>
          </div>
          {overview.invoices.length ? (
            <div className="mt-6 space-y-3">
              {overview.invoices.map((invoice) => (
                <article key={invoice.id} className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-border bg-bg-primary p-5">
                  <div>
                    <p className="font-semibold">{invoice.plan.name}</p>
                    <p className="mt-1 text-sm text-text-secondary">{invoice.currency} {invoice.amount.toLocaleString()} · {formatDate(invoice.createdAt)}</p>
                    <p className="mt-2 text-xs uppercase tracking-wider text-text-muted">{invoice.status.replaceAll("_", " ")}</p>
                  </div>
                  {!["paid", "rejected", "cancelled"].includes(invoice.status) ? (
                    <Button size="sm" onClick={() => setSelectedInvoice(invoice)}>{invoice.paymentSubmission ? "Edit payment" : "Open payment QR"}</Button>
                  ) : null}
                </article>
              ))}
            </div>
          ) : <div className="mt-6 rounded-2xl border border-dashed border-border p-8 text-center text-sm text-text-secondary">No invoices yet. Choose a paid plan above when you are ready.</div>}
        </section>
      </main>

      {groupPlan ? <GroupDetailsModal plan={groupPlan} user={user} loading={creatingPlanId === groupPlan.id} onClose={() => setGroupPlan(null)} onContinue={(details) => void createInvoice(groupPlan, details)} /> : null}
      {selectedInvoice ? (
        <PaymentSubmissionModal
          invoice={selectedInvoice}
          paymentConfig={paymentConfig}
          onClose={() => setSelectedInvoice(null)}
          onSaved={() => {
            setReviewConfirmation({ invoiceCode: selectedInvoice.invoiceCode });
            setSelectedInvoice(null);
            router.refresh();
          }}
        />
      ) : null}
      {reviewConfirmation ? (
        <PaymentReviewConfirmation
          invoiceCode={reviewConfirmation.invoiceCode}
          email={user.email}
          onClose={() => setReviewConfirmation(null)}
        />
      ) : null}
    </>
  );
}

function PricingCard({ title, description, price, features, featureVariant, actionLabel, loading = false, disabled = false, current = false, accessEndsAt = null, onAction, featured = false }: {
  title: string; description: string; price: string; features: string[]; featureVariant: "free" | "individual" | "group"; actionLabel: string; loading?: boolean; disabled?: boolean; current?: boolean; accessEndsAt?: string | null; onAction: () => void; featured?: boolean;
}) {
  return (
    <article className={cn("relative mx-auto h-[570px] w-full max-w-[330px] overflow-visible rounded-[28px] border border-border bg-card font-[family-name:var(--font-poppins)]", featured &&
          "h-[580px] border-2 border-[#20a8ff] bg-gradient-to-b from-[color-mix(in_srgb,#20a8ff_6%,var(--card))] to-[color-mix(in_srgb,#20a8ff_16%,var(--card))]")}>
      {featured || current ? <span className="absolute left-1/2 top-0 z-10 -translate-x-1/2 -translate-y-1/2 whitespace-nowrap rounded-[20px] bg-[linear-gradient(175deg,#4db3ff_13.6%,#1689f5_84.5%)] px-[23.5px] py-[6px] text-[12px] font-semibold tracking-[0.621px] text-white">{current ? "Current Plan" : "Most Popular"}</span> : null}
      <div className={cn("flex h-full flex-col px-8 pb-[52px] pt-[50px]", featured && "px-8 pb-[38px] pt-[52px]")}>
        <div>
          <h2 className="text-[25px] font-medium leading-normal tracking-[0.48px] text-text-primary">{title}</h2>
          <p className="mt-[6px] text-[33px] font-semibold leading-normal tracking-[0.48px] text-text-primary">{price}</p>
          <p className="mt-[6px] min-h-[44px] max-w-[266px] text-[14px] font-medium leading-[22px] tracking-[0.42px] text-text-muted">
            {title === "Group" ? <>One package for <span className="font-semibold text-[#1d57fd]">five students</span> studying together.</> : description}
          </p>
          <div className="mt-[16px] h-px w-full bg-border" />
          <FeatureList features={features} variant={featureVariant} />
        </div>
        <div className="mt-[30px]">
          <button type="button" className={cn("flex min-h-[40px] w-full items-center justify-center gap-[6px] rounded-[10px] bg-text-primary px-[19px] py-[9px] font-[family-name:var(--font-inter)] text-[14px] font-semibold text-text-inverse transition hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1689f5] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-70", featured && "bg-[linear-gradient(180deg,#4db3ff,#1689f5)]", current && "bg-[#e8f6ee] text-[#187a42]")} onClick={onAction} disabled={loading || disabled} aria-busy={loading}>
            {current ? <CheckCircle2 className="size-4" aria-hidden="true" /> : null}
            {loading ? "Preparing payment..." : actionLabel}
            {!loading && !disabled ? <Image src="/figma-pricing-arrow.svg" alt="" width={20} height={20} aria-hidden="true" className="size-5" /> : null}
          </button>
          {current ? (
            <p className="mt-2 text-center text-[12px] font-medium text-text-secondary">
              {accessEndsAt ? `Active until ${formatDate(accessEndsAt)}` : "Active with no expiry date"}
            </p>
          ) : null}
        </div>
      </div>
    </article>
  );
}

function GroupDetailsModal({ plan, user, loading, onClose, onContinue }: {
  plan: SubscriptionPlan; user: AppUser; loading: boolean; onClose: () => void;
  onContinue: (details: { groupName: string; organizerEmail: string; studentEmails: string[] }) => void;
}) {
  const [groupName, setGroupName] = useState("");
  const [studentEmails, setStudentEmails] = useState("");
  const emails = studentEmails.split(/[\n,]/).map((value) => value.trim()).filter(Boolean);
  return (
    <ModalFrame title="Set up your study group" onClose={onClose} locked={loading}>
      <p className="text-sm leading-6 text-text-secondary">Add a group name and up to five student emails before opening the official payment QR.</p>
      <div className="mt-5 space-y-4">
        <Field label="Group name"><Input value={groupName} onChange={(event) => setGroupName(event.target.value)} autoFocus /></Field>
        <Field label="Student emails" hint="Separate emails with commas or new lines · maximum 5"><Textarea rows={5} value={studentEmails} onChange={(event) => setStudentEmails(event.target.value)} placeholder="student@example.com" /></Field>
      </div>
      <Button size="lg" className="mt-6 w-full rounded-2xl" disabled={loading || groupName.trim().length < 2 || emails.length < 1 || emails.length > 5} onClick={() => onContinue({ groupName: groupName.trim(), organizerEmail: user.email, studentEmails: emails })}>
        {loading ? "Preparing payment..." : `Continue to ${plan.currency} ${plan.price.toLocaleString()} payment`}
      </Button>
    </ModalFrame>
  );
}

function PaymentSubmissionModal({ invoice, paymentConfig, onClose, onSaved }: {
  invoice: CheckoutInvoice;
  paymentConfig: PaymentMethodConfig | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [reference, setReference] = useState(invoice.paymentSubmission?.reference ?? "");
  const [payerName, setPayerName] = useState(invoice.paymentSubmission?.proofMeta?.payerName ?? "");
  const [receipt, setReceipt] = useState<File | null>(null);
  const [note, setNote] = useState(invoice.paymentSubmission?.proofMeta?.note ?? "");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  async function submitPayment() {
    setSaving(true); setError("");
    const formData = new FormData();
    formData.set("invoiceId", invoice.id); formData.set("reference", reference); formData.set("payerName", payerName); formData.set("note", note);
    if (receipt) formData.set("receipt", receipt);
    const response = await fetch("/api/billing/payments", { method: "POST", body: formData });
    setSaving(false);
    if (!response.ok) { const payload = (await response.json().catch(() => ({}))) as { error?: string }; setError(payload.error || "Failed to submit payment."); return; }
    onSaved();
  }

  return (
    <ModalFrame title="Scan, pay and send your receipt" onClose={onClose} locked={saving} wide>
      <div className="grid gap-7 md:grid-cols-[220px_1fr]">
        <div>
          {paymentConfig ? <Image src={paymentConfig.qrImageUrl} alt={`Official ${paymentConfig.displayName} payment QR`} width={220} height={220} unoptimized className="aspect-square w-full rounded-2xl border border-border bg-card object-contain p-2" /> : <div className="flex aspect-square items-center justify-center rounded-2xl border border-dashed border-border p-5 text-center text-sm text-text-secondary">Payment QR is not configured yet.</div>}
          {paymentConfig ? <div className="mt-3 text-sm text-text-secondary"><p className="font-semibold text-text-primary">{paymentConfig.bankName || paymentConfig.displayName}</p><p>{paymentConfig.accountName}</p>{paymentConfig.accountNumber ? <p>A/C {paymentConfig.accountNumber}</p> : null}</div> : null}
        </div>
        <div>
          <div className="rounded-2xl bg-bg-secondary p-4">
            <div className="flex items-center justify-between gap-4"><span className="text-sm text-text-secondary">Total today</span><strong className="text-xl">{invoice.currency} {invoice.amount.toLocaleString()}</strong></div>
            <p className="mt-3 border-t border-border pt-3 font-mono text-sm">Remark: {invoice.invoiceCode}</p>
          </div>
          <div className="mt-5 space-y-4">
            <Field label="Transaction reference"><Input value={reference} onChange={(event) => setReference(event.target.value)} /></Field>
            <Field label="Payer name"><Input value={payerName} onChange={(event) => setPayerName(event.target.value)} /></Field>
            <Field label="Payment receipt" hint="JPG, PNG, WebP, or PDF · maximum 5 MB"><Input type="file" accept="image/jpeg,image/png,image/webp,application/pdf" onChange={(event) => setReceipt(event.target.files?.[0] ?? null)} /></Field>
            <Field label="Note (optional)"><Textarea rows={2} value={note} onChange={(event) => setNote(event.target.value)} /></Field>
          </div>
          {error ? <p role="alert" className="mt-4 text-sm text-destructive">{error}</p> : null}
          <Button size="lg" className="mt-6 w-full rounded-2xl" onClick={() => void submitPayment()} disabled={!paymentConfig || saving || !reference.trim() || !payerName.trim() || (!receipt && !invoice.paymentSubmission?.proofStoragePath)}>{saving ? "Uploading receipt..." : "Submit payment for verification"}</Button>
        </div>
      </div>
    </ModalFrame>
  );
}

function PaymentReviewConfirmation({ invoiceCode, email, onClose }: {
  invoiceCode: string;
  email: string;
  onClose: () => void;
}) {
  return (
    <ModalFrame title="Payment submitted" onClose={onClose}>
      <div className="flex flex-col items-center text-center">
        <span className="flex size-16 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
          <CheckCircle2 className="size-8" aria-hidden="true" />
        </span>
        <h3 className="mt-5 text-xl font-semibold text-text-primary">We’re reviewing your payment</h3>
        <p className="mt-2 max-w-sm text-sm leading-6 text-text-secondary">
          Verification usually takes 2–5 minutes. We’ll email you as soon as your paid access is activated.
        </p>
        <div className="mt-5 w-full rounded-2xl border border-border bg-bg-secondary p-4 text-left">
          <p className="text-xs font-semibold uppercase tracking-wider text-text-muted">Invoice</p>
          <p className="mt-1 font-mono text-sm font-semibold text-text-primary">{invoiceCode}</p>
          <div className="mt-3 flex items-center gap-2 border-t border-border pt-3 text-sm text-text-secondary">
            <Mail className="size-4 shrink-0" aria-hidden="true" />
            <span className="truncate">Activation update will be sent to {email}</span>
          </div>
        </div>
        <Button type="button" size="lg" className="mt-6 w-full rounded-2xl" onClick={onClose}>
          Done
        </Button>
      </div>
    </ModalFrame>
  );
}

function ModalFrame({ title, children, onClose, locked = false, wide = false }: { title: string; children: ReactNode; onClose: () => void; locked?: boolean; wide?: boolean }) {
  const dialogRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden"; dialogRef.current?.focus();
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === "Escape" && !locked) onClose(); };
    document.addEventListener("keydown", closeOnEscape);
    return () => { document.body.style.overflow = previousOverflow; document.removeEventListener("keydown", closeOnEscape); };
  }, [locked, onClose]);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4 backdrop-blur-sm" onMouseDown={(event) => { if (event.target === event.currentTarget && !locked) onClose(); }}>
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="billing-dialog-title" tabIndex={-1} className={cn("max-h-[calc(100dvh-2rem)] w-full overflow-y-auto rounded-3xl border border-border bg-bg-primary p-6 shadow-2xl focus:outline-none sm:p-8", wide ? "max-w-4xl" : "max-w-lg")}>
        <div className="mb-6 flex items-start justify-between gap-4"><h2 id="billing-dialog-title" className="font-display text-2xl font-semibold">{title}</h2><button type="button" onClick={onClose} disabled={locked} aria-label="Close payment dialog" className="flex size-10 shrink-0 items-center justify-center rounded-full bg-bg-secondary text-text-secondary transition hover:text-text-primary disabled:opacity-50"><X className="size-4" aria-hidden="true" /></button></div>
        {children}
      </div>
    </div>
  );
}
