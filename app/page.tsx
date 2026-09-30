import type { Metadata } from "next";
import { LandingView } from "@/components/landing-view";
import { getPublishedLandingSite } from "@/lib/data/landing-sites";
import { MAIN_SITE_SLUG } from "@/lib/landing-site-host";
import { buildCanonicalUrl } from "@/lib/site";
import { DEFAULT_LANDING_CONTENT } from "@/lib/landing-content";

// Static between publishes: Publish in /admin/sites clears this page's cache.
export const revalidate = 600;

async function mainContent() {
  return (await getPublishedLandingSite(MAIN_SITE_SLUG))?.content ?? DEFAULT_LANDING_CONTENT;
}

export async function generateMetadata(): Promise<Metadata> {
  const { seo } = await mainContent();
  return {
    title: seo.title,
    description: seo.description,
    alternates: { canonical: buildCanonicalUrl("/") },
    openGraph: { title: seo.title, description: seo.description, url: buildCanonicalUrl("/") },
  };
}

export default async function LandingPage() {
  return <LandingView content={await mainContent()} />;
}
