import Link from "next/link";
import { SetAppShell } from "@/components/set-app-shell";
import { NotesLibraryClient } from "@/components/notes-library-client";
import { Button } from "@/components/ui/button";
import { requireOnboardedUser } from "@/lib/auth";
import { getNoteAccessPolicy } from "@/lib/data/note-access";
import { listRevisionNotes } from "@/lib/data/notes";

export default async function NotesPage({
  searchParams,
}: {
  searchParams: Promise<{ subject?: string }>;
}) {
  const { user } = await requireOnboardedUser();
  const { subject } = await searchParams;
  const [notes, access] = await Promise.all([
    listRevisionNotes(user.id),
    getNoteAccessPolicy(user.id),
  ]);

  return (
    <>
      <SetAppShell
        title={
          <span className="flex items-center gap-3">
            My Notes
          </span>
        }
        actions={
          access.revisionEnabled ? (
            <Link href="/app/notes/revision">
              <Button size="sm">Start revision →</Button>
            </Link>
          ) : null
        }
      />
      <NotesLibraryClient notes={notes} initialSubjectSlug={subject?.trim() || null} />
    </>
  );
}
