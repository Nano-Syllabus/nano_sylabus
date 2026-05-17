import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { NotesLibraryClient } from "@/components/notes-library-client";
import { Button } from "@/components/ui/button";
import { requireOnboardedUser } from "@/lib/auth";
import { getNoteAccessPolicy } from "@/lib/data/note-access";
import { listRevisionNotes } from "@/lib/data/notes";

export default async function NotesPage() {
  const { user } = await requireOnboardedUser();
  const [notes, access] = await Promise.all([
    listRevisionNotes(user.id),
    getNoteAccessPolicy(user.id),
  ]);

  return (
    <AppShell
      user={user}
      title={
        <span className="flex items-center gap-3">
          My Notes
          <span className="font-mono-ui text-xs text-text-muted">
            {notes.length} saved
            {Number.isFinite(access.maxNotes) ? ` / ${access.maxNotes}` : ""}
          </span>
        </span>
      }
      actions={
        access.revisionEnabled ? (
          <Link href="/app/notes/revision">
            <Button size="sm">Start revision →</Button>
          </Link>
        ) : (
          <Link href="/app/billing">
            <Button size="sm" variant="outline">
              Upgrade for revision
            </Button>
          </Link>
        )
      }
    >
      <NotesLibraryClient notes={notes} />
    </AppShell>
  );
}
