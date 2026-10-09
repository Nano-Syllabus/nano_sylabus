"use client";

import Link from "next/link";
import { useState } from "react";
import { CreditCard, ExternalLink } from "lucide-react";
import type { AdminPaymentSubmissionSummary, PaymentSubmissionStatus } from "@/lib/types";
import { formatDate } from "@/lib/utils";

type Filter = "all" | PaymentSubmissionStatus;

const filters: Array<{ value: Filter; label: string }> = [
  { value: "all", label: "All" },
  { value: "submitted", label: "Needs review" },
  { value: "approved", label: "Approved" },
  { value: "rejected", label: "Rejected" },
];

/**
 * The receipt queue. Every row is already on the page, so the status filter
 * switches in place (no server round trip); the URL keeps ?status= so a reload
 * or a shared link opens the same view.
 */
export function AdminPaymentQueue({
  submissions,
  initialStatus,
}: {
  submissions: AdminPaymentSubmissionSummary[];
  initialStatus: Filter;
}) {
  const [activeStatus, setActiveStatus] = useState<Filter>(initialStatus);
  const visible =
    activeStatus === "all"
      ? submissions
      : submissions.filter((submission) => submission.status === activeStatus);
  const counts: Record<Filter, number> = {
    all: submissions.length,
    submitted: submissions.filter((submission) => submission.status === "submitted").length,
    approved: submissions.filter((submission) => submission.status === "approved").length,
    rejected: submissions.filter((submission) => submission.status === "rejected").length,
  };

  function choose(next: Filter) {
    setActiveStatus(next);
    const url = new URL(window.location.href);
    if (next === "all") url.searchParams.delete("status");
    else url.searchParams.set("status", next);
    window.history.replaceState(window.history.state, "", url);
  }

  return (
      <section className="mt-6 overflow-hidden rounded-lg border border-border bg-card">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-4 sm:px-5">
          <div>
            <h2 className="font-display text-lg font-semibold">Submission queue</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">Newest submissions appear first.</p>
          </div>
          <nav
            aria-label="Filter payment submissions"
            className="flex flex-wrap gap-1 rounded-md bg-muted p-1"
          >
            {filters.map((filter) => (
              <button
                key={filter.value}
                type="button"
                onClick={() => choose(filter.value)}
                aria-pressed={activeStatus === filter.value}
                className={`inline-flex min-h-9 items-center rounded px-3 text-xs font-medium focus-visible:outline-2 focus-visible:outline-ring ${activeStatus === filter.value ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
              >
                {filter.label}
                <span className="ml-1.5 tabular-nums opacity-70">{counts[filter.value]}</span>
              </button>
            ))}
          </nav>
        </div>

        {visible.length === 0 ? (
          <div className="px-5 py-16 text-center">
            <CreditCard className="mx-auto text-muted-foreground" size={28} strokeWidth={1.5} />
            <h3 className="mt-4 font-display text-lg font-semibold">No payment submissions here</h3>
            <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
              {submissions.length === 0
                ? "When a student uploads a receipt, it will appear in this queue. No placeholder rows are shown."
                : "No real submissions match this status filter."}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] border-collapse text-left text-sm">
              <thead className="bg-muted/60 text-[11px] tracking-wider text-muted-foreground uppercase">
                <tr>
                  <th className="px-5 py-3 font-medium">Student</th>
                  <th className="px-5 py-3 font-medium">Plan</th>
                  <th className="px-5 py-3 font-medium">Reference</th>
                  <th className="px-5 py-3 font-medium">Amount</th>
                  <th className="px-5 py-3 font-medium">Submitted</th>
                  <th className="px-5 py-3 font-medium">Status</th>
                  <th className="px-5 py-3 text-right font-medium">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {visible.map((submission) => (
                  <tr key={submission.id} className="hover:bg-muted/35">
                    <td className="px-5 py-4">
                      <p className="font-medium">{submission.studentName}</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {submission.studentEmail || "Email unavailable"}
                      </p>
                    </td>
                    <td className="px-5 py-4 text-muted-foreground">{submission.planName}</td>
                    <td className="px-5 py-4 font-mono text-xs">{submission.reference}</td>
                    <td className="px-5 py-4">
                      {formatMoney(submission.amount, submission.currency)}
                    </td>
                    <td className="px-5 py-4 text-muted-foreground">
                      {formatDate(submission.submittedAt)}
                    </td>
                    <td className="px-5 py-4">
                      <StatusBadge status={submission.status} />
                    </td>
                    <td className="px-5 py-4 text-right">
                      <Link
                        href={`/admin/billing/${submission.id}`}
                        className="inline-flex min-h-9 items-center gap-2 rounded-md border border-border px-3 text-xs font-medium hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring"
                      >
                        {submission.status === "approved" ? "View" : "Review"}{" "}
                        <ExternalLink size={13} />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
  );
}

function StatusBadge({ status }: { status: PaymentSubmissionStatus }) {
  const classes =
    status === "approved"
      ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
      : status === "rejected"
        ? "bg-destructive/10 text-destructive"
        : "bg-amber-500/10 text-amber-700 dark:text-amber-300";
  return (
    <span
      className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium capitalize ${classes}`}
    >
      {status}
    </span>
  );
}

function formatMoney(amount: number, currency: string) {
  return `${currency} ${new Intl.NumberFormat("en-NP", { maximumFractionDigits: 2 }).format(amount)}`;
}
