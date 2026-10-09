import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AdminBillingFrame, AdminPageHeader } from "@/components/admin-billing-frame";
import { AdminSitesList } from "@/components/admin-sites-list";
import { assertAdminRequest } from "@/lib/admin-access";
import { getAdminScope } from "@/lib/admin-scope";
import { listCommunityChoices, listLandingSites, type CommunityChoice } from "@/lib/data/landing-sites";
import { listSiteAdmins, type SiteAdmin } from "@/lib/data/admin-users";
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
  let admins: Record<string, SiteAdmin[]> = {};
  let faculties: CommunityChoice[] = [];
  let loadError: string | null = null;
  try {
    const [loaded, adminBySite, choices] = await Promise.all([
      listLandingSites(),
      listSiteAdmins(),
      listCommunityChoices(),
    ]);
    const scope = await getAdminScope(access);
    // An admin sees their own subdomain, and links only faculties on it or theirs.
    sites = scope.all ? loaded : loaded.filter((site) => site.slug === scope.site?.slug);
    faculties = scope.all
      ? choices
      : choices.filter((choice) => scope.faculties.some((own) => own.slug === choice.slug));
    // Managers' emails are for super admins only (user, 2026-10-08).
    admins = Object.fromEntries(
      [...adminBySite].map(([slug, list]) => [
        slug,
        access.role === "super_admin" ? list : list.map((admin) => ({ ...admin, email: "" })),
      ]),
    );
  } catch (error) {
    console.error("[admin/sites]", error);
    loadError =
      "Couldn’t load the websites. If this is new, the landing_sites table may not exist yet — apply the Supabase migration 20260930120000_landing_sites.sql.";
  }

  return (
    <AdminBillingFrame active="sites">
      <AdminPageHeader
        title="Websites"
        description={`Every exam website on ${rootDomain()}. Link faculties and admins here; open a site to edit its page, exam and checkout, then publish.`}
      />
      {loadError ? (
        <p className="mt-6 rounded-lg border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-700 dark:text-red-300">
          {loadError}
        </p>
      ) : (
        <AdminSitesList
          initialSites={sites ?? []}
          initialAdmins={admins}
          faculties={faculties}
          canAssignAdmins={access.role === "super_admin"}
          canCreateSites={access.role === "super_admin"}
          viewerUserId={access.userId}
          rootDomain={rootDomain()}
        />
      )}
    </AdminBillingFrame>
  );
}
