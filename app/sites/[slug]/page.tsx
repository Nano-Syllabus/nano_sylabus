import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { LandingView } from "@/components/landing-view";
import { getPublishedLandingSite } from "@/lib/data/landing-sites";
import { MAIN_SITE_SLUG, siteOrigin } from "@/lib/landing-site-host";
import { getEnrollmentExam } from "@/lib/data/exam-enrollment";

/**
 * A subdomain's landing page. Middleware rewrites `highschool.nanosyllabus.com/`
 * here as `/sites/highschool`; visitors never see this path.
 *
 * Built on first visit and kept until the site is published again.
 */
export const revalidate = 600;
export const dynamicParams = true;

export function generateStaticParams() {
  return [];
}

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const site = await getPublishedLandingSite(slug);
  if (!site) return {};
  const url = `${siteOrigin(slug)}/`;
  return {
    title: site.content.seo.title,
    description: site.content.seo.description,
    alternates: { canonical: url },
    openGraph: { title: site.content.seo.title, description: site.content.seo.description, url },
  };
}

export default async function SiteLandingPage({ params }: Props) {
  const { slug } = await params;
  const site = slug === MAIN_SITE_SLUG ? null : await getPublishedLandingSite(slug);
  // Unknown or hidden subdomains land on the main site instead of a 404.
  if (!site) redirect(siteOrigin(MAIN_SITE_SLUG));
  const exam = site.examConfig.enabled ? await getEnrollmentExam(slug) : null;
  // Sign-in and the dashboard live on this subdomain itself.
  const appOrigin = "";
  return (
    <LandingView
      content={site.content}
      appOrigin={appOrigin}
      // Always this site's own faculty step, never Browse communities (user,
      // 2026-10-08) — even while its faculties aren't switched on yet.
      examSlug={slug}
      examFaculties={exam?.faculties}
    />
  );
}
