import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { assertAdminRequest } from "@/lib/admin-access";
import { AdminAnalyticsDashboard } from "@/components/admin-analytics-dashboard";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Platform overview · Nano Syllabus Admin",
  robots: { index: false, follow: false },
};

export default async function AdminPage() {
  const access = await assertAdminRequest();
  if ("error" in access) {
    if (access.status === 401) redirect("/login?next=%2Fadmin");
    if (access.status === 403) redirect("/app/today");
    throw new Error("Admin access could not be verified. Please retry.");
  }
  return <AdminAnalyticsDashboard />;
}
