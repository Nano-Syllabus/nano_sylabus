import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AdminBillingFrame, AdminPageHeader } from "@/components/admin-billing-frame";
import { AdminSitesList } from "@/components/admin-sites-list";
import { assertAdminRequest } from "@/lib/admin-access";
import { listLandingSites } from "@/lib/data/landing-sites";
import { rootDomain } from "@/lib/landing-site-host";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Websites · Nano Syllabus Admin",
  robots: { index: false, follow: false },
};

export default async function AdminSitesPage() {
  const access = await assertAdminRequest();
  if ("error" in access) {
    if (access.status === 401) redirect("/login?next=%2Fadmin%2Fsites");
    if (access.status === 403) redirect("/app/today");
    throw new Error("Admin access could not be verified. Please retry.");
  }

  let sites: Awaited<ReturnType<typeof listLandingSites>> | null = null;
  let loadError: string | null = null;
  try {
    sites = await listLandingSites();
  } catch (error) {
    console.error("[admin/sites]", error);
    loadError =
      "Couldn’t load the websites. If this is new, the landing_sites table may not exist yet — apply the Supabase migration 20260930120000_landing_sites.sql.";
  }

  return (
    <AdminBillingFrame active="sites">
      <AdminPageHeader
        title="Websites"
        description={`Each subdomain of ${rootDomain()} gets the same landing page design with its own text. Edit the words, preview, then publish.`}
      />
      {loadError ? (
        <p className="mt-6 rounded-lg border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-700 dark:text-red-300">
          {loadError}
        </p>
      ) : (
        <AdminSitesList initialSites={sites ?? []} rootDomain={rootDomain()} />
      )}
    </AdminBillingFrame>
  );
}
