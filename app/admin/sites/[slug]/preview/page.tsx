import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { LandingPreview } from "@/components/landing-preview";
import { assertAdminRequest } from "@/lib/admin-access";
import { getAdminScope, scopeAllowsSite } from "@/lib/admin-scope";
import { MAIN_SITE_SLUG } from "@/lib/landing-site-host";
import { getLandingSite } from "@/lib/data/landing-sites";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Preview · Nano Syllabus Admin",
  robots: { index: false, follow: false },
};

/**
 * The draft, rendered with the real landing design. The editor shows this in
 * an iframe and streams every keystroke into it (see `LandingPreview`), so it
 * behaves like the live page at the iframe's own width — phone or desktop.
 */
export default async function AdminSitePreviewPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const access = await assertAdminRequest();
  if ("error" in access) {
    if (access.status === 401) redirect(`/login?next=${encodeURIComponent(`/admin/sites/${slug}`)}`);
    if (access.status === 403) redirect("/app/today");
    throw new Error("Admin access could not be verified. Please retry.");
  }

  const scope = await getAdminScope(access);
  if (!scopeAllowsSite(scope, slug)) redirect("/admin/sites");

  const site = await getLandingSite(slug);
  if (!site) notFound();

  return <LandingPreview initialContent={site.draft} examSlug={slug === MAIN_SITE_SLUG ? undefined : slug} />;
}
