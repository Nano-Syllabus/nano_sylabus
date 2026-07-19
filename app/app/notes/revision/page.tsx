import Link from "next/link";
import { SetAppShell } from "@/components/set-app-shell";
import { RevisionModeClient } from "@/components/revision-mode-client";
import { Button } from "@/components/ui/button";
import { requireOnboardedUser } from "@/lib/auth";
import { getNoteAccessPolicy } from "@/lib/data/note-access";
import { listRevisionNotes } from "@/lib/data/notes";

export default async function RevisionPage() {
  const { user } = await requireOnboardedUser();
  const [notes, access] = await Promise.all([
    listRevisionNotes(user.id),
    getNoteAccessPolicy(user.id),
  ]);

  return (
    <>
      <SetAppShell
        title={
          <Link href="/app/notes" className="text-text-secondary hover:text-text-primary">
            ← My Notes
          </Link>
        }
      />
      {access.revisionEnabled ? (
        <RevisionModeClient notes={notes} />
      ) : (
        <div className="mx-auto max-w-2xl rounded-2xl border border-border bg-bg-primary p-8 text-center">
          <h2 className="font-display text-3xl">Revision mode is a paid feature</h2>
          <p className="mt-3 text-sm text-text-secondary">
            Upgrade from Free to start focused revision sessions with your saved notes.
          </p>
          <Link href="/app/billing" className="mt-6 inline-block">
            <Button>View plans</Button>
          </Link>
        </div>
      )}
    </>
  );
}
