import { AppShell } from "@/components/app-shell";
import { ChatPageClient } from "@/components/chat-page-client";
import { requireOnboardedUser } from "@/lib/auth";
import { getChatSessionDetail, listChatSessions } from "@/lib/data/chat";
import { normalizeSubjectLabel } from "@/lib/profile-normalization";

export default async function ChatPage({
  searchParams,
}: {
  searchParams: Promise<{ session?: string; subject?: string; prompt?: string }>;
}) {
  const { user, profile } = await requireOnboardedUser();
  const params = await searchParams;
  const sessionResult = await listChatSessions(user.id, {
    limit: 12,
    offset: 0,
  });
  const activeSession = params.session
    ? await getChatSessionDetail(params.session, user.id)
    : null;

  return (
    <AppShell user={user} title="Chat">
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
      />
    </AppShell>
  );
}
