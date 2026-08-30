import type { Metadata } from "next";
import { CommunityCatalogClient } from "@/components/community-catalog-client";
import { LandingHeader } from "@/components/landing-header";
import { listPublicCommunities } from "@/lib/data/communities";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Browse communities — NanoSyllabus",
  description:
    "Find and join university, faculty, year, semester, and subject communities on NanoSyllabus.",
};

export default async function CommunitiesPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const communities = await listPublicCommunities(user?.id);

  return (
    <div className="exam-prep-theme hero-glow min-h-screen bg-background text-foreground">
      <LandingHeader dark />
      <CommunityCatalogClient initialCommunities={communities} signedIn={Boolean(user)} />
    </div>
  );
}
