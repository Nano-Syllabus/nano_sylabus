import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { CheckCircle2, Clock3, CreditCard, ExternalLink, XCircle } from "lucide-react";
import { AdminBillingFrame } from "@/components/admin-billing-frame";
import { assertAdminRequest } from "@/lib/admin-access";
import { listAdminPaymentSubmissions } from "@/lib/data/billing";
import type { PaymentSubmissionStatus } from "@/lib/types";
import { formatDate } from "@/lib/utils";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Payment reviews · Nano Syllabus Admin",
  robots: { index: false, follow: false },
};

const filters: Array<{ value: "all" | PaymentSubmissionStatus; label: string }> = [
  { value: "all", label: "All" },
  { value: "submitted", label: "Needs review" },
  { value: "approved", label: "Approved" },
  { value: "rejected", label: "Rejected" },
];

export default async function AdminBillingPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const access = await assertAdminRequest();
  if ("error" in access) {
    if (access.status === 401) redirect("/login?next=%2Fadmin%2Fbilling");
    if (access.status === 403) redirect("/app/today");
    throw new Error("Admin access could not be verified. Please retry.");
  }

  const requestedStatus = (await searchParams).status;
  const activeStatus = filters.some((filter) => filter.value === requestedStatus)
    ? (requestedStatus as "all" | PaymentSubmissionStatus)
    : "all";
  const submissions = await listAdminPaymentSubmissions();
  const visible = activeStatus === "all"
    ? submissions
    : submissions.filter((submission) => submission.status === activeStatus);
  const pending = submissions.filter((submission) => submission.status === "submitted").length;
  const approved = submissions.filter((submission) => submission.status === "approved").length;
  const rejected = submissions.filter((submission) => submission.status === "rejected").length;

  return (
    <AdminBillingFrame>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-medium tracking-widest text-muted-foreground uppercase">Billing operations</p>
          <h1 className="mt-2 font-display text-3xl font-semibold tracking-tight">Payment reviews</h1>
          <p className="mt-1.5 max-w-2xl text-sm leading-6 text-muted-foreground">
            Review real receipt submissions. Approval marks the invoice paid and activates the purchased plan.
          </p>
        </div>
        <Link
          href="/admin/billing"
          className="inline-flex min-h-10 items-center gap-2 rounded-md border border-border bg-card px-4 text-sm font-medium hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          Refresh queue
        </Link>
      </div>

      <section aria-label="Payment totals" className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Metric label="Total submissions" value={submissions.length} icon={<CreditCard size={18} />} />
        <Metric label="Needs review" value={pending} icon={<Clock3 size={18} />} />
        <Metric label="Approved" value={approved} icon={<CheckCircle2 size={18} />} />
        <Metric label="Rejected" value={rejected} icon={<XCircle size={18} />} />
      </section>

      <section className="mt-6 overflow-hidden rounded-lg border border-border bg-card">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-4 sm:px-5">
          <div>
            <h2 className="font-display text-lg font-semibold">Submission queue</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">Newest submissions appear first.</p>
          </div>
          <nav aria-label="Filter payment submissions" className="flex flex-wrap gap-1 rounded-md bg-muted p-1">
            {filters.map((filter) => (
              <Link
                key={filter.value}
                href={filter.value === "all" ? "/admin/billing" : `/admin/billing?status=${filter.value}`}
                aria-current={activeStatus === filter.value ? "page" : undefined}
                className={`inline-flex min-h-9 items-center rounded px-3 text-xs font-medium focus-visible:outline-2 focus-visible:outline-ring ${activeStatus === filter.value ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
              >
                {filter.label}
              </Link>
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
                  <th className="px-5 py-3 text-right font-medium"><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {visible.map((submission) => (
                  <tr key={submission.id} className="hover:bg-muted/35">
                    <td className="px-5 py-4 font-medium">{submission.studentName}</td>
                    <td className="px-5 py-4 text-muted-foreground">{submission.planName}</td>
                    <td className="px-5 py-4 font-mono text-xs">{submission.reference}</td>
                    <td className="px-5 py-4">{formatMoney(submission.amount, submission.currency)}</td>
                    <td className="px-5 py-4 text-muted-foreground">{formatDate(submission.submittedAt)}</td>
                    <td className="px-5 py-4"><StatusBadge status={submission.status} /></td>
                    <td className="px-5 py-4 text-right">
                      <Link
                        href={`/admin/billing/${submission.id}`}
                        className="inline-flex min-h-9 items-center gap-2 rounded-md border border-border px-3 text-xs font-medium hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring"
                      >
                        Review <ExternalLink size={13} />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </AdminBillingFrame>
  );
}

function Metric({ label, value, icon }: { label: string; value: number; icon: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-border bg-card p-5">
      <div className="flex items-center justify-between text-muted-foreground">
        <p className="text-sm">{label}</p>
        {icon}
      </div>
      <p className="mt-4 font-display text-3xl font-semibold tabular-nums">{value}</p>
    </div>
  );
}

function StatusBadge({ status }: { status: PaymentSubmissionStatus }) {
  const classes = status === "approved"
    ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
    : status === "rejected"
      ? "bg-destructive/10 text-destructive"
      : "bg-amber-500/10 text-amber-700 dark:text-amber-300";
  return <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium capitalize ${classes}`}>{status}</span>;
}

function formatMoney(amount: number, currency: string) {
  return `${currency} ${new Intl.NumberFormat("en-NP", { maximumFractionDigits: 2 }).format(amount)}`;
}
