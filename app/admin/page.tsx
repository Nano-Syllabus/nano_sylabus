import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { assertAdminRequest } from "@/lib/admin-access";
import { getAdminScope, scopeSite } from "@/lib/admin-scope";
import { AdminAnalyticsDashboard } from "@/components/admin-analytics-dashboard";
import { AdminBillingFrame } from "@/components/admin-billing-frame";
import { listAdminPaymentSubmissions } from "@/lib/data/billing";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Overview · Nano Syllabus Admin",
  robots: { index: false, follow: false },
};

export default async function AdminPage() {
  const access = await assertAdminRequest();
  if ("error" in access) {
    if (access.status === 401) redirect("/login?next=%2Fadmin");
    if (access.status === 403) redirect("/app/today");
    throw new Error("Admin access could not be verified. Please retry.");
  }
  // The review queue is the one thing an admin must act on; a failed read hides the banner, not the page.
  const pendingPayments = await getAdminScope(access)
    .then((scope) => listAdminPaymentSubmissions({ onlySite: scopeSite(scope) }))
    .then((rows) => rows.filter((row) => row.status === "submitted").length)
    .catch(() => null);

  return (
    <AdminBillingFrame active="overview">
      <AdminAnalyticsDashboard pendingPayments={pendingPayments} />
    </AdminBillingFrame>
  );
}
