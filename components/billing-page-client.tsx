"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/field";
import { getCreditWarning } from "@/lib/billing";
import type {
  BillingInvoiceSummary,
  PaymentMethod,
  StudentBillingOverview,
  SubscriptionPlan,
} from "@/lib/types";
import { formatDate } from "@/lib/utils";

const PAYMENT_METHOD_LABEL: Record<PaymentMethod, string> = {
  esewa: "eSewa",
  khalti: "Khalti",
  bank_transfer: "Bank transfer",
};

export function BillingPageClient({ overview }: { overview: StudentBillingOverview }) {
  const router = useRouter();
  const [creatingPlanId, setCreatingPlanId] = useState<string | null>(null);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [selectedInvoice, setSelectedInvoice] = useState<BillingInvoiceSummary | null>(null);

  const activeSubscriptions = useMemo(
    () => overview.subscriptions.filter((subscription) => subscription.status === "active"),
    [overview.subscriptions],
  );

  async function createInvoice(plan: SubscriptionPlan) {
    setCreatingPlanId(plan.id);
    setError("");
    setStatus("");

    const response = await fetch("/api/billing/invoices", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        planId: plan.id,
        paymentMethod: "bank_transfer",
      }),
    });

    setCreatingPlanId(null);

    if (!response.ok) {
      const payload = (await response.json()) as { error?: string };
      setError(payload.error || "Failed to create invoice.");
      return;
    }

    setStatus(`Invoice created for ${plan.name}. Submit your payment details below.`);
    router.refresh();
  }

  const warning = getCreditWarning(overview.balance);

  return (
    <>
      <div className="mx-auto max-w-6xl px-5 py-8">
        <section className="grid gap-4 md:grid-cols-[1.3fr_1fr]">
          <div className="rounded-2xl border border-border bg-bg-primary p-6">
            <p className="text-[11px] font-mono-ui uppercase text-text-muted">Available credits</p>
            <div className="mt-3 flex items-end gap-3">
              <div className="font-display text-6xl leading-none">{overview.balance}</div>
              <p className="mb-2 text-sm text-text-secondary">messages you can still send</p>
            </div>
            {warning ? <p className="mt-4 text-sm text-text-secondary">{warning}</p> : null}
          </div>

          <div className="rounded-2xl border border-border bg-bg-secondary p-6">
            <p className="text-[11px] font-mono-ui uppercase text-text-muted">Current status</p>
            {activeSubscriptions.length ? (
              <div className="mt-3 space-y-2">
                {activeSubscriptions.map((subscription) => (
                  <div key={subscription.id} className="rounded-xl border border-border bg-bg-primary p-4">
                    <p className="text-sm font-medium">Active purchase</p>
                    <p className="mt-1 text-xs text-text-secondary">
                      Started {formatDate(subscription.startsAt)}
                      {subscription.endsAt ? ` · Ends ${formatDate(subscription.endsAt)}` : ""}
                    </p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="mt-3 text-sm text-text-secondary">
                No paid plan has been approved yet. Choose a pack to top up credits.
              </p>
            )}
          </div>
        </section>

        <section className="mt-8">
          <div className="mb-4">
            <p className="text-[11px] font-mono-ui uppercase text-text-muted">Buy credits</p>
            <h2 className="mt-1 font-display text-3xl">Choose a study pack</h2>
          </div>

          {overview.plans.length ? (
            <div className="grid gap-4 lg:grid-cols-3">
              {overview.plans.map((plan) => (
                <article key={plan.id} className="rounded-2xl border border-border bg-bg-primary p-5">
                  <p className="font-display text-2xl">{plan.name}</p>
                  <div className="mt-3 flex items-end gap-2">
                    <span className="font-display text-5xl leading-none">{plan.credits}</span>
                    <span className="mb-1 text-sm text-text-secondary">credits</span>
                  </div>
                  <p className="mt-2 text-sm text-text-secondary">
                    NPR {plan.price} · {plan.billingType === "one_time" ? "One-time purchase" : "Monthly"}
                  </p>

                  <p className="mt-5 text-xs text-text-secondary">
                    Pay with the official bank QR, then upload the receipt for verification.
                  </p>

                  <Button
                    className="mt-5 w-full"
                    onClick={() => void createInvoice(plan)}
                    disabled={creatingPlanId === plan.id}
                  >
                    {creatingPlanId === plan.id ? "Creating invoice..." : "Generate invoice"}
                  </Button>
                </article>
              ))}
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed border-border bg-bg-primary p-8 text-center">
              <p className="text-sm text-text-secondary">
                No real plans are configured yet. Add active plans in the database before opening billing to students.
              </p>
            </div>
          )}
        </section>

        <section className="mt-10">
          <div className="mb-4">
            <p className="text-[11px] font-mono-ui uppercase text-text-muted">Invoices</p>
            <h2 className="mt-1 font-display text-3xl">Your payment activity</h2>
          </div>

          {error ? (
            <p className="mb-4 rounded-md border border-destructive/40 bg-[color:var(--note-red)] px-3 py-2 text-sm text-destructive">
              {error}
            </p>
          ) : null}
          {status ? (
            <p className="mb-4 rounded-md border border-border bg-bg-secondary px-3 py-2 text-sm text-text-secondary">
              {status}
            </p>
          ) : null}

          {overview.invoices.length ? (
            <div className="space-y-3">
              {overview.invoices.map((invoice) => (
                <div
                  key={invoice.id}
                  className="rounded-2xl border border-border bg-bg-primary p-5"
                >
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                      <p className="font-medium">{invoice.plan.name}</p>
                      <p className="mt-1 text-sm text-text-secondary">
                        NPR {invoice.amount} · {PAYMENT_METHOD_LABEL[invoice.paymentMethod]} · {formatDate(invoice.createdAt)}
                      </p>
                      <p className="mt-2 text-xs uppercase tracking-wider text-text-muted">
                        Status: {invoice.status.replaceAll("_", " ")}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {invoice.status !== "paid" && invoice.status !== "rejected" && invoice.status !== "cancelled" ? (
                        <Button size="sm" onClick={() => setSelectedInvoice(invoice)}>
                          {invoice.paymentSubmission ? "Edit payment details" : "Submit payment"}
                        </Button>
                      ) : null}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-text-secondary">
              No invoices yet. Generate your first invoice from a pack above.
            </div>
          )}
        </section>
      </div>

      {selectedInvoice ? (
        <PaymentSubmissionModal
          invoice={selectedInvoice}
          onClose={() => setSelectedInvoice(null)}
          onSaved={(message) => {
            setSelectedInvoice(null);
            setStatus(message);
            router.refresh();
          }}
        />
      ) : null}
    </>
  );
}

function PaymentSubmissionModal({
  invoice,
  onClose,
  onSaved,
}: {
  invoice: BillingInvoiceSummary;
  onClose: () => void;
  onSaved: (message: string) => void;
}) {
  const [reference, setReference] = useState(invoice.paymentSubmission?.reference ?? "");
  const [payerName, setPayerName] = useState(invoice.paymentSubmission?.proofMeta?.payerName ?? "");
  const [receipt, setReceipt] = useState<File | null>(null);
  const [note, setNote] = useState(invoice.paymentSubmission?.proofMeta?.note ?? "");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !saving) onClose();
    };
    document.addEventListener("keydown", closeOnEscape);
    dialogRef.current?.focus();
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [onClose, saving]);

  async function submitPayment() {
    setSaving(true);
    setError("");

    const formData = new FormData();
    formData.set("invoiceId", invoice.id);
    formData.set("reference", reference);
    formData.set("payerName", payerName);
    formData.set("note", note);
    if (receipt) formData.set("receipt", receipt);

    const response = await fetch("/api/billing/payments", {
      method: "POST",
      body: formData,
    });

    setSaving(false);

    if (!response.ok) {
      const payload = (await response.json()) as { error?: string };
      setError(payload.error || "Failed to submit payment.");
      return;
    }

    onSaved("Payment details submitted. An admin will review them before credits are granted.");
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="payment-dialog-title"
        tabIndex={-1}
        onClick={(event) => event.stopPropagation()}
        className="w-full max-w-lg rounded-2xl border border-border bg-bg-primary p-6 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-strong"
      >
        <h3 id="payment-dialog-title" className="font-display text-2xl">Submit payment details</h3>
        <p className="mt-2 text-sm text-text-secondary">
          {invoice.plan.name} · NPR {invoice.amount} · {PAYMENT_METHOD_LABEL[invoice.paymentMethod]}
        </p>

        <div className="mt-5 space-y-4">
          <Field label="Transaction reference">
            <Input value={reference} autoComplete="off" spellCheck={false} onChange={(event) => setReference(event.target.value)} />
          </Field>
          <Field label="Payer name">
            <Input value={payerName} autoComplete="name" onChange={(event) => setPayerName(event.target.value)} />
          </Field>
          <Field label="Payment receipt" hint="JPG, PNG, WebP, or PDF · maximum 5 MB">
            <Input
              type="file"
              accept="image/jpeg,image/png,image/webp,application/pdf"
              onChange={(event) => setReceipt(event.target.files?.[0] ?? null)}
            />
          </Field>
          <Field label="Note">
            <Textarea value={note} rows={3} onChange={(event) => setNote(event.target.value)} />
          </Field>
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
        </div>

        <div className="mt-6 flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={() => void submitPayment()}
            disabled={saving || !reference.trim() || !payerName.trim() || (!receipt && !invoice.paymentSubmission?.proofStoragePath)}
            aria-busy={saving}
          >
            {saving ? "Submitting..." : "Submit payment"}
          </Button>
        </div>
      </div>
    </div>
  );
}
