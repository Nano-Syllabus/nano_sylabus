import Link from "next/link";
import { Button } from "@/components/ui/button";
import { SetAppShell } from "@/components/set-app-shell";
import { SettingsForm } from "@/components/settings-form";
import { requireOnboardedUser } from "@/lib/auth";
import { countStudentExamsSat } from "@/lib/data/student-stats";
import { HydrationBoundary, prefetchQueries } from "@/lib/query/hydrate";
import { publishedCatalogServerQuery } from "@/lib/query/server";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const { user, profile } = await requireOnboardedUser();

  // Two independent reads: a Supabase count and the tenant catalog (usually its
  // in-process memo). Neither needs the other, so awaiting them in sequence
  // would have added the slower one's latency to the faster one's for nothing.
  //
  // The auth check stays ahead of both, deliberately — it can redirect, and
  // starting work for a request that is about to be sent elsewhere is work
  // thrown away.
  const [examsSat, dehydratedState] = await Promise.all([
    countStudentExamsSat(user.id),
    prefetchQueries((client) => client.prefetchQuery(publishedCatalogServerQuery)),
  ]);

  return (
    <>
      <SetAppShell
        title="Settings"
      />
      {/*
        The subject chips in this form come from the published catalog, which
        `SettingsForm` reads through `usePublishedCatalog`. Prefetching it here
        means the chips are in the HTML: no post-hydration request, no
        rearranging as they arrive. Prefetch failures are non-fatal — the hook
        falls back to fetching client-side with its own retry.
      */}
      <HydrationBoundary state={dehydratedState}>
        <SettingsForm user={user} profile={profile!} examsSat={examsSat} />
      </HydrationBoundary>
    </>
  );
}
