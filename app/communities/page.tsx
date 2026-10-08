import { mayUseAmbassadorWorkspace } from "@/lib/data/student-ambassadors";
import type { Metadata } from "next";
import { DM_Sans, Plus_Jakarta_Sans } from "next/font/google";
import { CommunityCatalogClient } from "@/components/community-catalog-client";
import { listLiveExamSites } from "@/lib/data/landing-sites";
import { siteOrigin } from "@/lib/landing-site-host";
import { buildCanonicalUrl } from "@/lib/site";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getVerifiedUser } from "@/lib/supabase/verified-user";

export const dynamic = "force-dynamic";

// The browse cards' type pairing; scoped to this page, not loaded app-wide.
// No `weight` list: DM Sans is variable, and the static-weight request makes Google
// serve `/l/font?kit=…&skey=…` files whose `&` breaks Turbopack's font loader.
const dmSans = DM_Sans({ subsets: ["latin"], variable: "--font-dm-sans" });
const jakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  weight: ["700", "800"],
  variable: "--font-jakarta",
});

export const metadata: Metadata = {
  title: "Exam sites — NanoSyllabus",
  description:
    "Choose your exam site on NanoSyllabus.",
  alternates: {
    canonical: buildCanonicalUrl("/communities"),
  },
  openGraph: {
    title: "Exam sites — NanoSyllabus",
    description:
      "Choose your exam site on NanoSyllabus.",
    url: buildCanonicalUrl("/communities"),
  },
};

export default async function CommunitiesPage({
  searchParams,
}: {
  searchParams: Promise<{ create?: string }>;
}) {
  const supabase = await createSupabaseServerClient();
  // Only exam sites are listed here now (user, 2026-10-07); faculties are
  // joined through each site.
  const [params, user, sites] = await Promise.all([
    searchParams,
    getVerifiedUser(supabase).then((result) => result.data.user),
    listLiveExamSites(),
  ]);

  return (
    <div className={`${dmSans.variable} ${jakarta.variable} min-h-screen bg-white text-[#101114]`}>
      <CommunityCatalogClient
        examSites={sites.map((site) => ({ ...site, href: siteOrigin(site.slug) }))}
        signedIn={Boolean(user)}
        initialShowCreate={params.create === "1" && (await mayUseAmbassadorWorkspace(user))}
        initialPhoneNumber={
          typeof user?.user_metadata?.phone_number === "string"
            ? user.user_metadata.phone_number
            : ""
        }
      />
    </div>
  );
}
