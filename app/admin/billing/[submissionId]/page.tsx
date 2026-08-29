import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { AdminBillingFrame } from "@/components/admin-billing-frame";
import { AdminPaymentDetailClient } from "@/components/admin-payment-detail-client";
import { assertAdminRequest } from "@/lib/admin-access";
import { getAdminPaymentSubmissionDetail } from "@/lib/data/billing";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Review payment · Nano Syllabus Admin",
  robots: { index: false, follow: false },
};

export default async function AdminPaymentReviewPage({
  params,
}: {
  params: Promise<{ submissionId: string }>;
}) {
  const access = await assertAdminRequest();
  if ("error" in access) {
    if (access.status === 401) redirect("/login?next=%2Fadmin%2Fbilling");
    if (access.status === 403) redirect("/app/today");
    throw new Error("Admin access could not be verified. Please retry.");
  }

  const { submissionId } = await params;
  const submission = await getAdminPaymentSubmissionDetail(submissionId);
  if (!submission) notFound();

  return (
    <AdminBillingFrame>
      <Link
        href="/admin/billing"
        className="inline-flex min-h-10 items-center gap-2 rounded-md text-sm text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
      >
        <ArrowLeft size={16} /> Back to payment queue
      </Link>
      <div className="mt-4">
        <p className="text-xs font-medium tracking-widest text-muted-foreground uppercase">Receipt verification</p>
        <h1 className="mt-2 font-display text-3xl font-semibold tracking-tight">{submission.studentName}</h1>
        <p className="mt-1.5 text-sm text-muted-foreground">
          Compare the private receipt with the transaction reference before making a final decision.
        </p>
      </div>
      <AdminPaymentDetailClient submission={submission} />
    </AdminBillingFrame>
  );
}
