import { SetAppShell } from "@/components/set-app-shell";
import { ChatPageClient } from "@/components/chat-page-client";
import { requireOnboardedUser } from "@/lib/auth";
import { getChatSessionDetail, listChatSessions } from "@/lib/data/chat";
import { normalizeSubjectLabel } from "@/lib/profile-normalization";
import { getRevisionNoteDetail } from "@/lib/data/notes";

export const dynamic = "force-dynamic";
const INITIAL_CHAT_MESSAGE_LIMIT = 10;

export default async function ChatPage({
  searchParams,
}: {
  searchParams: Promise<{ session?: string; subject?: string; prompt?: string; referenceNoteId?: string }>;
}) {
  const { user, profile } = await requireOnboardedUser();
  const params = await searchParams;
  const sessionResult = await listChatSessions(user.id, {
    limit: 12,
    offset: 0,
  });
  const activeSession = params.session
    ? await getChatSessionDetail(params.session, user.id, { limit: INITIAL_CHAT_MESSAGE_LIMIT })
    : null;

  let referenceNote = null;
  if (params.referenceNoteId && !params.session) {
    try {
      referenceNote = await getRevisionNoteDetail(params.referenceNoteId, user.id);
    } catch (_) {
      // silently ignore – note may have been deleted
    }
  }

  return (
    <>
      <SetAppShell title="Chat" />
      <ChatPageClient
        user={user}
        defaultLanguage={profile!.languagePref}
        profileBoard={profile!.board}
        profileGrade={profile!.grade}
        profileSubjects={profile!.subjects}
        initialSessions={sessionResult.sessions}
        initialHasMore={sessionResult.hasMore}
        initialSession={activeSession}
        initialSubjectContext={params.subject ? normalizeSubjectLabel(decodeURIComponent(params.subject)) : null}
        initialPrompt={params.prompt ? decodeURIComponent(params.prompt) : null}
        initialReferenceNote={referenceNote}
      />
    </>
  );
}
