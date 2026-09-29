import { getActiveCommunity } from "@/lib/data/active-community";
import { unlocksEveryTopic } from "@/lib/data/student-challenges";
import { getStudentRevisionDocs, revisionDocsIndex } from "@/lib/data/student-revision-docs";
import { errorJson, privateJson } from "@/lib/http/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getVerifiedUser } from "@/lib/supabase/verified-user";

export const dynamic = "force-dynamic";

/**
 * Revision's navigator: every subject, unit and topic, WITHOUT the pages.
 *
 * Read by the browser rather than awaited in the `/app/notes` server component,
 * for the reason `/api/student/dashboard` gives: a server component cannot paint
 * past its own awaits, so the whole screen sat under `loading.tsx` on every
 * visit. Behind a route it is a TanStack query, kept in the browser cache and
 * painted from there on the next load; the one reconcile per load runs under it.
 *
 * The plan (which topics are startable) and the active faculty are read
 * alongside the challenge rows, not in front of them.
 */
export async function GET(request: Request) {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await getVerifiedUser(supabase);
    if (!user) return errorJson("Unauthorized", 401);

    const docs = await getStudentRevisionDocs(user.id, {
      // The same check the start route makes, so the page never offers a Start
      // button the route then refuses.
      unlockAll: unlocksEveryTopic(user.id).catch(() => false),
      communityId: getActiveCommunity(user.id).then((active) => active.selected?.id ?? null),
    });
    return privateJson({ docs: revisionDocsIndex(docs) }, { request });
  } catch (error) {
    return errorJson(
      error instanceof Error ? error.message : "Could not load your revision docs.",
      502,
    );
  }
}
