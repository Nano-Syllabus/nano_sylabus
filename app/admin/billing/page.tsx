import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { CheckCircle2, Clock3, CreditCard, XCircle } from "lucide-react";
import { AdminBillingFrame, AdminPageHeader } from "@/components/admin-billing-frame";
import { assertAdminRequest } from "@/lib/admin-access";
import { getAdminScope, scopeSite } from "@/lib/admin-scope";
import { listAdminPaymentSubmissions } from "@/lib/data/billing";
import type { PaymentSubmissionStatus } from "@/lib/types";
import { AdminPaymentQueue } from "@/components/admin-payment-queue";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Payment reviews · Nano Syllabus Admin",
  robots: { index: false, follow: false },
};

const STATUSES = ["all", "submitted", "approved", "rejected"] as const;

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
  const activeStatus = (STATUSES as readonly string[]).includes(requestedStatus ?? "")
    ? (requestedStatus as "all" | PaymentSubmissionStatus)
    : "all";
  const submissions = await listAdminPaymentSubmissions({
    onlySite: scopeSite(await getAdminScope(access)),
  });
  const pending = submissions.filter((submission) => submission.status === "submitted").length;
  const approved = submissions.filter((submission) => submission.status === "approved").length;
  const rejected = submissions.filter((submission) => submission.status === "rejected").length;

  return (
    <AdminBillingFrame active="billing">
      <AdminPageHeader
        title="Payments"
        description="Students who paid by uploading a receipt get access straight away. Check each receipt here and turn access off if it is fake."
      />

      <section
        aria-label="Payment totals"
        className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4"
      >
        <Metric
          label="All receipts"
          value={submissions.length}
          icon={<CreditCard size={18} />}
        />
        <Metric label="Needs review" value={pending} icon={<Clock3 size={18} />} />
        <Metric label="Approved" value={approved} icon={<CheckCircle2 size={18} />} />
        <Metric label="Rejected" value={rejected} icon={<XCircle size={18} />} />
      </section>

      <AdminPaymentQueue submissions={submissions} initialStatus={activeStatus} />
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
