import type { Metadata } from "next";
import { DM_Sans, Plus_Jakarta_Sans } from "next/font/google";
import { CommunityCatalogClient } from "@/components/community-catalog-client";
import { listPublicCommunities } from "@/lib/data/communities";
import { buildCanonicalUrl } from "@/lib/site";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getVerifiedUser } from "@/lib/supabase/verified-user";

export const dynamic = "force-dynamic";

// The browse cards' type pairing; scoped to this page, not loaded app-wide.
const dmSans = DM_Sans({ subsets: ["latin"], weight: ["400", "500", "600", "700"], variable: "--font-dm-sans" });
const jakarta = Plus_Jakarta_Sans({ subsets: ["latin"], weight: ["700", "800"], variable: "--font-jakarta" });

export const metadata: Metadata = {
  title: "Browse communities — NanoSyllabus",
  description:
    "Find and join university, faculty, year, semester, and subject communities on NanoSyllabus.",
  alternates: {
    canonical: buildCanonicalUrl("/communities"),
  },
  openGraph: {
    title: "Browse communities — NanoSyllabus",
    description:
      "Find and join university, faculty, year, semester, and subject communities on NanoSyllabus.",
    url: buildCanonicalUrl("/communities"),
  },
};

export default async function CommunitiesPage({
  searchParams,
}: {
  searchParams: Promise<{ create?: string }>;
}) {
  const params = await searchParams;
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await getVerifiedUser(supabase);
  const communities = await listPublicCommunities(user?.id);

  return (
    <div className={`${dmSans.variable} ${jakarta.variable} min-h-screen bg-white text-[#101114]`}>
      <CommunityCatalogClient
        initialCommunities={communities}
        signedIn={Boolean(user)}
        initialShowCreate={params.create === "1"}
        initialPhoneNumber={
          typeof user?.user_metadata?.phone_number === "string" ? user.user_metadata.phone_number : ""
        }
      />
    </div>
  );
}
