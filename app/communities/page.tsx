import { isStudentAmbassador } from "@/lib/data/student-ambassadors";
import type { Metadata } from "next";
import { cookies } from "next/headers";
import { DM_Sans, Plus_Jakarta_Sans } from "next/font/google";
import { CommunityCatalogClient } from "@/components/community-catalog-client";
import { listPublicCommunities } from "@/lib/data/communities";
import { buildCanonicalUrl } from "@/lib/site";
import {
  ACTIVE_COMMUNITY_COOKIE,
  communitySwitchState,
  savedCommunitySlug,
} from "@/lib/community-switch";
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
  const supabase = await createSupabaseServerClient();
  // Auth and the catalogue at the same time: the shared list does not wait for
  // the viewer, only the viewer's own memberships do.
  const userPromise = getVerifiedUser(supabase).then((result) => result.data.user);
  const [params, user, communities, store] = await Promise.all([
    searchParams,
    userPromise,
    listPublicCommunities(userPromise.then((viewer) => viewer?.id)),
    cookies(),
  ]);
  // The faculty the student portal is showing — a joined one, or one they own
  // and opened as a student — so joining another asks to switch from it.
  const studying = user
    ? communitySwitchState(
        user.id,
        communities,
        savedCommunitySlug(store.get(ACTIVE_COMMUNITY_COOKIE)?.value, user.id),
      ).selected
    : null;

  return (
    <div className={`${dmSans.variable} ${jakarta.variable} min-h-screen bg-white text-[#101114]`}>
      <CommunityCatalogClient
        initialCommunities={communities}
        signedIn={Boolean(user)}
        studyingSlug={studying?.slug ?? null}
        initialShowCreate={params.create === "1" && (await isStudentAmbassador(user?.email))}
        initialPhoneNumber={
          typeof user?.user_metadata?.phone_number === "string"
            ? user.user_metadata.phone_number
            : ""
        }
      />
    </div>
  );
}
