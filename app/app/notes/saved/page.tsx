import Link from "next/link";
import { SetAppShell } from "@/components/set-app-shell";
import { NotesLibraryClient } from "@/components/notes-library-client";
import { requireOnboardedUser } from "@/lib/auth";
import { listRevisionNotes } from "@/lib/data/notes";

/**
 * The notes a student wrote, kept apart from the docs they revise from.
 *
 * This used to be `/app/notes` itself, which made "Revision" in the nav open a
 * note list rather than the course. The two corpora are genuinely different —
 * these are answers the student saved out of chat, the docs are the material
 * their challenges were built from — so they get their own shelf and the docs
 * tree links here, rather than one page trying to be both.
 */
export default async function SavedNotesPage({
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
          <Link href="/app/notes" className="text-text-secondary hover:text-text-primary">
            ← Revision
          </Link>
        }
      />
      <NotesLibraryClient notes={notes} initialSubjectSlug={subject?.trim() || null} />
    </>
  );
}
