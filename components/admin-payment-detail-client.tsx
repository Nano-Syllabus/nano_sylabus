"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { CheckCircle2, ExternalLink, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { AdminPaymentSubmissionDetail } from "@/lib/types";
import { formatDate } from "@/lib/utils";

export function AdminPaymentDetailClient({
  submission,
}: {
  submission: AdminPaymentSubmissionDetail;
}) {
  const router = useRouter();
  const [loadingAction, setLoadingAction] = useState<"approve" | "reject" | null>(null);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  async function runAction(action: "approve" | "reject") {
    setLoadingAction(action);
    setError("");
    setSuccess("");

    const response = await fetch(`/api/admin/payments/${submission.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    });

    setLoadingAction(null);

    if (!response.ok) {
      const payload = (await response.json()) as { error?: string };
      setError(payload.error || `Failed to ${action} payment.`);
      return;
    }

    setSuccess(action === "approve" ? "Payment approved and the purchased plan is active." : "Payment rejected. The invoice was closed without granting access.");
    router.refresh();
  }

  const isFinalized = submission.status !== "submitted";

  return (
    <div className="mt-6">
      <div className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
        <section className="overflow-hidden rounded-lg border border-border bg-card">
          <div className="border-b border-border px-5 py-4">
            <p className="text-[11px] font-medium tracking-widest text-muted-foreground uppercase">Payment proof</p>
          </div>
          <div className="space-y-4 px-5 py-5">
            <DetailRow label="Student" value={submission.studentName} />
            <DetailRow label="Reference" value={submission.reference} />
            <DetailRow label="Payer name" value={submission.payerName || "Not provided"} />
            {submission.screenshotUrl ? (
              <div className="space-y-2 border-b border-border pb-4">
                <p className="text-[10px] font-mono-ui uppercase text-text-muted">Private receipt</p>
                <a
                  href={submission.screenshotUrl}
                  target="_blank"
                  rel="noreferrer"
                className="inline-flex min-h-10 items-center gap-2 text-sm font-medium underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-ring"
              >
                  Open receipt in a new tab <ExternalLink size={14} />
                </a>
                {submission.screenshotUrl.split("?")[0]?.toLowerCase().endsWith(".pdf") ? (
                  <iframe title="Submitted payment receipt preview" src={submission.screenshotUrl} className="h-[560px] w-full rounded-md border border-border bg-muted" />
                ) : (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={submission.screenshotUrl} alt="Submitted payment receipt preview" className="max-h-[560px] w-full rounded-md bg-muted object-contain" />
                )}
              </div>
            ) : (
              <DetailRow label="Private receipt" value="Not provided" />
            )}
            <DetailRow label="Note" value={submission.note || "No note"} />
            <DetailRow label="Submitted" value={formatDate(submission.submittedAt)} />
            {submission.reviewedAt ? (
              <DetailRow label="Reviewed" value={formatDate(submission.reviewedAt)} />
            ) : null}
          </div>
        </section>

        <section className="h-fit overflow-hidden rounded-lg border border-border bg-card">
          <div className="border-b border-border px-5 py-4">
            <p className="text-[11px] font-medium tracking-widest text-muted-foreground uppercase">Invoice summary</p>
          </div>
          <div className="space-y-4 px-5 py-5">
            <DetailRow label="Plan" value={submission.planName} />
            <DetailRow label="Credits" value={`${submission.planCredits}`} />
            <DetailRow label="Amount" value={`${submission.currency} ${submission.amount}`} />
            <DetailRow label="Invoice status" value={submission.invoiceStatus} />
            <DetailRow label="Submission status" value={submission.status} />
          </div>

          {error ? <p role="alert" className="mx-5 mb-4 rounded-md bg-destructive/10 px-4 py-3 text-sm text-destructive">{error}</p> : null}
          {success ? (
            <p role="status" className="mx-5 mb-4 flex gap-2 rounded-md bg-emerald-500/10 px-4 py-3 text-sm text-emerald-700 dark:text-emerald-300">
              {submission.status === "rejected" ? <XCircle size={17} className="shrink-0" /> : <CheckCircle2 size={17} className="shrink-0" />}
              {success}
            </p>
          ) : null}

          <div className="flex flex-col gap-2 px-5 pb-5">
            <Button
              onClick={() => void runAction("approve")}
              disabled={isFinalized || loadingAction !== null}
            >
              {loadingAction === "approve" ? "Approving..." : "Approve & activate plan"}
            </Button>
            <Button
              variant="danger"
              onClick={() => void runAction("reject")}
              disabled={isFinalized || loadingAction !== null}
            >
              {loadingAction === "reject" ? "Rejecting..." : "Reject payment"}
            </Button>
          </div>
        </section>
      </div>
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="border-b border-border pb-3 last:border-b-0 last:pb-0">
      <p className="text-[10px] font-medium tracking-widest text-muted-foreground uppercase">{label}</p>
      <p className="mt-1 break-all text-sm text-foreground">{value}</p>
    </div>
  );
}
