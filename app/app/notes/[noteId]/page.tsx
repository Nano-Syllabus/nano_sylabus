import Link from "next/link";
import { notFound } from "next/navigation";
import { SetAppShell } from "@/components/set-app-shell";
import { NoteDetailClient } from "@/components/note-detail-client";
import { requireOnboardedUser } from "@/lib/auth";
import { getRevisionNoteDetail } from "@/lib/data/notes";

export default async function NoteDetailPage({
  params,
}: {
  params: Promise<{ noteId: string }>;
}) {
  const { user } = await requireOnboardedUser();
  const { noteId } = await params;
  const note = await getRevisionNoteDetail(noteId, user.id);

  if (!note) {
    notFound();
  }

  return (
    <>
      <SetAppShell
        title={
          <Link href="/app/notes" className="text-text-secondary hover:text-text-primary">
            ← My Notes
          </Link>
        }
      />
      <NoteDetailClient note={note} />
    </>
  );
}
