import Link from "next/link";
import { SetAppShell } from "@/components/set-app-shell";
import { RevisionDocsClient } from "@/components/revision-docs-client";
import { Button } from "@/components/ui/button";
import { requireOnboardedUser } from "@/lib/auth";
import { getNoteAccessPolicy } from "@/lib/data/note-access";
import { getStudentRevisionDocs } from "@/lib/data/student-revision-docs";

export const dynamic = "force-dynamic";

/**
 * Revision is documentation now.
 *
 * It used to be a flashcard deck over saved notes and nothing else. The material
 * a student actually worked through — the reading a passed challenge was built
 * from, its past questions, its worked examples — was written once and then had
 * nowhere to live. This page is where it lives, under the course's own semester /
 * subject / unit shape.
 *
 * The deck is still here, at `/app/notes/revision/cards`, and the docs link to
 * it: it revises a different corpus (notes the student wrote) and replacing one
 * with the other would have lost a feature rather than added one.
 *
 * GATED, ON THE SAME POLICY AS THE DECK
 * -------------------------------------
 * `revisionEnabled` is what separates Free from paid here, and the docs are part
 * of revision rather than a way around it. The gate is decided on the SERVER and
 * the docs are not fetched when it is closed — a paywall a client could skip by
 * not rendering it is not a paywall, and building the tree for a reader who will
 * not be shown it is work nobody asked for.
 */
export default async function RevisionPage() {
  const { user } = await requireOnboardedUser();
  const access = await getNoteAccessPolicy(user.id);
  const docs = access.revisionEnabled ? await getStudentRevisionDocs(user.id) : null;

  return (
    <>
      <SetAppShell
        title={
          <Link href="/app/notes" className="text-text-secondary hover:text-text-primary">
            ← My Notes
          </Link>
        }
      />
      {docs ? (
        <RevisionDocsClient docs={docs} />
      ) : (
        <div className="mx-auto max-w-2xl rounded-2xl border border-border bg-bg-primary p-8 text-center">
          <h2 className="font-display text-3xl">Revision is a paid feature</h2>
          <p className="mt-3 text-sm text-text-secondary">
            Upgrade from Free to keep every passed challenge — its concepts, past questions and
            worked examples — as revision docs you can come back to.
          </p>
          <Link href="/app/billing" className="mt-6 inline-block">
            <Button>View plans</Button>
          </Link>
        </div>
      )}
    </>
  );
}
