"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ArrowRight, FileText } from "lucide-react";
import {
  PaymentActivationConfirmation,
  PaymentSubmissionModal,
  type CheckoutInvoice,
} from "@/components/billing-page-client";
import type { BillingInvoiceSummary, PaymentMethodConfig } from "@/lib/types";
import { formatDate } from "@/lib/utils";

function canSubmitPayment(invoice: BillingInvoiceSummary) {
  return !["paid", "rejected", "cancelled"].includes(invoice.status);
}

export function InvoicesPageClient({
  invoices,
  paymentConfig,
}: {
  invoices: BillingInvoiceSummary[];
  paymentConfig: PaymentMethodConfig | null;
}) {
  const router = useRouter();
  const [selectedInvoice, setSelectedInvoice] = useState<CheckoutInvoice | null>(null);
  const [activationConfirmation, setActivationConfirmation] = useState<string | null>(null);

  return (
    <>
      <main className="student-page-frame">
        <section className="student-page-width px-0">
          <header className="flex flex-col gap-4 border-b border-border pb-6 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="type-student-eyebrow text-text-muted">Payment activity</p>
              <h1 className="type-student-page-title mt-2">Your invoices</h1>
              <p className="type-student-body mt-2 text-text-secondary">
                Review your payment status or complete a pending payment.
              </p>
            </div>
            <Link
              href="/app/billing"
              className="inline-flex min-h-10 items-center justify-center gap-2 self-start rounded-md border border-border px-4 text-sm font-medium text-text-primary hover:bg-bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-strong focus-visible:ring-offset-2 sm:self-auto"
            >
              View plans <ArrowRight className="size-4" aria-hidden="true" />
            </Link>
          </header>

          {invoices.length ? (
            <div className="mt-6 space-y-3">
              {invoices.map((invoice) => (
                <article
                  key={invoice.id}
                  className="student-surface flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div>
                    <p className="type-student-card-title">{invoice.plan.name}</p>
                    <p className="type-student-body mt-1 text-text-secondary">
                      {invoice.currency} {invoice.amount.toLocaleString()} · {formatDate(invoice.createdAt)}
                    </p>
                    <p className="type-student-eyebrow mt-3 text-text-muted">
                      {invoice.status.replaceAll("_", " ")}
                    </p>
                  </div>
                  {canSubmitPayment(invoice) ? (
                    <button
                      type="button"
                      onClick={() => setSelectedInvoice(invoice)}
                      className="inline-flex min-h-10 shrink-0 items-center justify-center rounded-md bg-text-primary px-4 text-sm font-semibold text-text-inverse hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-strong focus-visible:ring-offset-2"
                    >
                      {invoice.paymentSubmission ? "Edit payment" : "Open payment QR"}
                    </button>
                  ) : null}
                </article>
              ))}
            </div>
          ) : (
            <section className="student-surface mt-6 flex min-h-64 flex-col items-center justify-center px-6 text-center">
              <span className="flex size-12 items-center justify-center rounded-xl bg-bg-secondary text-text-secondary">
                <FileText className="size-6" aria-hidden="true" />
              </span>
              <h2 className="type-student-section-title mt-4">No invoices yet</h2>
              <p className="type-student-body mt-2 max-w-sm text-text-secondary">
                Your invoices will appear here after you choose a paid plan.
              </p>
              <Link
                href="/app/billing"
                className="mt-5 inline-flex min-h-10 items-center gap-2 rounded-md bg-text-primary px-4 text-sm font-semibold text-text-inverse hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-strong focus-visible:ring-offset-2"
              >
                View plans <ArrowRight className="size-4" aria-hidden="true" />
              </Link>
            </section>
          )}
        </section>
      </main>

      {selectedInvoice ? (
        <PaymentSubmissionModal
          invoice={selectedInvoice}
          paymentConfig={paymentConfig}
          onClose={() => setSelectedInvoice(null)}
          onSaved={() => {
            setActivationConfirmation(selectedInvoice.invoiceCode);
            setSelectedInvoice(null);
            router.refresh();
          }}
        />
      ) : null}
      {activationConfirmation ? (
        <PaymentActivationConfirmation
          invoiceCode={activationConfirmation}
          onClose={() => setActivationConfirmation(null)}
        />
      ) : null}
    </>
  );
}
