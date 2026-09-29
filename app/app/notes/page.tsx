import { cookies } from "next/headers";
import { SetAppShell } from "@/components/set-app-shell";
import { RevisionDocsView } from "@/components/revision-docs-client";
import { requireOnboardedUser } from "@/lib/auth";
import { ACTIVE_COMMUNITY_COOKIE, savedCommunitySlug } from "@/lib/community-switch";

export const dynamic = "force-dynamic";

/**
 * Revision IS the docs. There is no mode to choose.
 *
 * This route used to be the saved-notes library, with the docs one button away in
 * the header — so "Revision" in the nav opened a mostly-empty note list, and the
 * thing a student actually revises from was a click they had to know about. The
 * two-panel header ("My Notes" / "Revision docs →") was asking the reader to pick
 * between a filing cabinet and the course, every single visit.
 *
 * So the nav destination is the documentation now, and it is navigated the way
 * documentation is: a navigator down the right in the course's own shape —
 *
 *     Subject (chosen in a picker)  →  Unit  →  Topic
 *
 * — which is the syllabus, so finding last week's topic is the same motion as
 * finding it in the syllabus. Each leaf is a challenge the student has worked
 * through, shown as its reading, its past questions and its worked examples.
 *
 * The saved notes did not go anywhere: they are a different corpus (what the
 * student wrote, not what the course taught), they live at `/app/notes/saved`,
 * and the docs tree links to them alongside the flashcard deck. Folding them into
 * this page would have mixed the two claims it makes — "you worked through this"
 * and "you wrote this down" are not the same shelf.
 *
 * NOT GATED
 * ---------
 * The docs used to answer Free with an upgrade card. There was nothing to sell
 * behind it: every page here is material the student has ALREADY been given —
 * the reading a challenge was built from, written and paid for when they opened
 * it — and the docs only hand it back instead of throwing it away when the
 * challenge closes. Charging to re-read what you were already shown reads as a
 * punishment, and it hit hardest the student who does not yet know the feature
 * exists. The flashcard deck at `/app/notes/revision/cards` keeps its own gate;
 * that one revises a different corpus and is a different product decision.
 *
 * What IS gated is reaching ahead. The navigator lists the whole syllabus, and a
 * topic no challenge has reached yet is locked on Free: it opens when the queue,
 * which runs in syllabus order, gets to it. Plus and Pro can start any topic from
 * here (user, 2026-09-25). Filed pages stay open to everyone, as above.
 */
/*
 * A SHELL, NOT A DATA PAGE (2026-09-29), for the reason `/app/today` gives: this
 * used to await the whole docs build — plan, faculty, every challenge row and
 * every catalogue, in four rounds — before sending anything, so `loading.tsx`
 * covered the screen on every visit and nothing the browser had cached could
 * help. The navigator now comes from `/api/student/revision/docs` and each page
 * from `/api/student/revision/topic/[id]`, both held in the browser cache.
 *
 * The cookie is read only to partition that cache by faculty; it costs no query.
 */
export default async function RevisionPage() {
  const [{ user }, store] = await Promise.all([requireOnboardedUser(), cookies()]);
  const community = savedCommunitySlug(store.get(ACTIVE_COMMUNITY_COOKIE)?.value, user.id) ?? "";

  return (
    <>
      <SetAppShell title="Revision" />
      <RevisionDocsView community={community} />
    </>
  );
}
