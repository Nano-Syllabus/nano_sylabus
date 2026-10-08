import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { AdminBillingFrame } from "@/components/admin-billing-frame";
import { AdminSiteEditor } from "@/components/admin-site-editor";
import { assertAdminRequest } from "@/lib/admin-access";
import { getAdminScope, scopeAllowsSite } from "@/lib/admin-scope";
import { countSiteStudents, getLandingSite, listCommunityChoices } from "@/lib/data/landing-sites";
import { rootDomain } from "@/lib/landing-site-host";
import { listSubscriptionPlans } from "@/lib/data/billing";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Edit website · Nano Syllabus Admin",
  robots: { index: false, follow: false },
};

export default async function AdminSiteEditorPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const access = await assertAdminRequest();
  if ("error" in access) {
    if (access.status === 401)
      redirect(`/login?next=${encodeURIComponent(`/admin/sites/${slug}`)}`);
    if (access.status === 403) redirect("/app/today");
    throw new Error("Admin access could not be verified. Please retry.");
  }

  const scope = await getAdminScope(access);
  if (!scopeAllowsSite(scope, slug)) redirect("/admin/sites");

  const [site, allCommunities, plans, studentCount] = await Promise.all([
    getLandingSite(slug),
    listCommunityChoices(),
    listSubscriptionPlans(),
    countSiteStudents(slug).catch(() => 0),
  ]);
  if (!site) notFound();
  // An admin links only faculties already on the site or ones they created.
  const communities = scope.all
    ? allCommunities
    : allCommunities.filter((choice) =>
        scope.faculties.some((own) => own.slug === choice.slug),
      );

  return (
    <AdminBillingFrame active="sites" wide>
      <AdminSiteEditor
        initialSite={site}
        rootDomain={rootDomain()}
        communities={communities}
        plans={plans}
        studentCount={studentCount}
        canDelete={scope.all}
      />
    </AdminBillingFrame>
  );
}
