import Link from "next/link";
import { SetAppShell } from "@/components/set-app-shell";
import { RevisionDocsClient } from "@/components/revision-docs-client";
import { Button } from "@/components/ui/button";
import { requireOnboardedUser } from "@/lib/auth";
import { getNoteAccessPolicy } from "@/lib/data/note-access";
import { getStudentRevisionDocs } from "@/lib/data/student-revision-docs";

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
 * documentation is: a tree down the left in the course's own shape —
 *
 *     Semester  →  Subject  →  Unit  →  Topic
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
 */
export default async function RevisionPage() {
  const { user } = await requireOnboardedUser();
  const access = await getNoteAccessPolicy(user.id);
  // Not fetched when the gate is closed: building the tree for a reader who will
  // not be shown it is work nobody asked for.
  const docs = access.revisionEnabled ? await getStudentRevisionDocs(user.id) : null;

  return (
    <>
      <SetAppShell title="Revision" />
      {docs ? (
        <RevisionDocsClient docs={docs} />
      ) : (
        <div className="mx-auto max-w-2xl rounded-2xl border border-border bg-bg-primary p-8 text-center">
          <h2 className="font-display text-3xl">Revision is a paid feature</h2>
          <p className="mt-3 text-sm text-text-secondary">
            Upgrade from Free to keep every challenge you have worked through — its concepts, past
            questions and worked examples — as docs you can come back to.
          </p>
          <Link href="/app/billing" className="mt-6 inline-block">
            <Button>View plans</Button>
          </Link>
        </div>
      )}
    </>
  );
}
