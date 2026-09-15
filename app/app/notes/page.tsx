import Link from "next/link";
import { SetAppShell } from "@/components/set-app-shell";
import { NotesLibraryClient } from "@/components/notes-library-client";
import { Button } from "@/components/ui/button";
import { requireOnboardedUser } from "@/lib/auth";
import { listRevisionNotes } from "@/lib/data/notes";

/**
 * "Revision" in the nav lands here, so this page owns BOTH halves of revision:
 * the notes a student wrote, and — one link away — the material they proved they
 * learned. The second half is the revision docs, where every passed challenge
 * files its reading, past questions and worked examples.
 *
 * The link is shown to everyone, including Free. It used to be rendered only when
 * `getNoteAccessPolicy` said `revisionEnabled`, which cost a subscription lookup
 * on every visit and, worse, meant a Free student was never told the docs exist —
 * the feature was invisible rather than locked. `/app/notes/revision` decides the
 * paywall on the server and answers Free with the upgrade page, so hiding the
 * door here bought no enforcement, only silence.
 */
export default async function NotesPage({
  searchParams,
}: {
  searchParams: Promise<{ subject?: string }>;
}) {
  const { user } = await requireOnboardedUser();
  const { subject } = await searchParams;
  const notes = await listRevisionNotes(user.id);

  return (
    <>
      <SetAppShell
        title={
          <span className="flex items-center gap-3">
            My Notes
          </span>
        }
        actions={
          <Link href="/app/notes/revision">
            <Button size="sm">Revision docs →</Button>
          </Link>
        }
      />
      <NotesLibraryClient notes={notes} initialSubjectSlug={subject?.trim() || null} />
    </>
  );
}
