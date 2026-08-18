import { SetAppShell } from "@/components/set-app-shell";
import { ChatPageClient } from "@/components/chat-page-client";
import { requireOnboardedUser } from "@/lib/auth";
import { getChatSessionDetail, listChatSessions } from "@/lib/data/chat";
import { normalizeSubjectLabel } from "@/lib/profile-normalization";
import { getRevisionNoteDetail } from "@/lib/data/notes";
import {
  listCreatorPrivateSubjectAccess,
  listStudentCourseSubjects,
} from "@/lib/student-courses";

export const dynamic = "force-dynamic";
const INITIAL_CHAT_MESSAGE_LIMIT = 10;

export default async function ChatPage({
  searchParams,
}: {
  searchParams: Promise<{
    session?: string;
    subject?: string;
    prompt?: string;
    referenceNoteId?: string;
  }>;
}) {
  const { user, profile } = await requireOnboardedUser();
  const params = await searchParams;

  // None of these depend on each other, so they go out together. Run in
  // sequence they stacked four Supabase round trips in front of the first byte
  // of HTML, which is what made opening a chat feel unresponsive.
  const [sessionResult, activeSession, courseSubjects, privateSubjects, referenceNote] =
    await Promise.all([
      listChatSessions(user.id, { limit: 12, offset: 0 }),
      params.session
        ? getChatSessionDetail(params.session, user.id, { limit: INITIAL_CHAT_MESSAGE_LIMIT })
        : Promise.resolve(null),
      listStudentCourseSubjects(user.id),
      listCreatorPrivateSubjectAccess(user.id),
      params.referenceNoteId && !params.session
        ? // Silently ignore – the note may have been deleted.
          getRevisionNoteDetail(params.referenceNoteId, user.id).catch(() => null)
        : Promise.resolve(null),
    ]);

  const noteSubjectOptions = [
    ...privateSubjects.map((subject) => ({
      courseId: subject.courseId,
      courseName: "Private",
      subjectSlug: subject.subjectSlug,
      subjectName: subject.subjectName,
    })),
    ...courseSubjects.map((subject) => ({
      courseId: subject.courseId,
      courseName: subject.courseName,
      subjectSlug: subject.subjectSlug,
      subjectName: subject.subjectName,
    })),
  ];

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
        initialSubjectContext={
          params.subject ? normalizeSubjectLabel(decodeURIComponent(params.subject)) : null
        }
        initialPrompt={params.prompt ? decodeURIComponent(params.prompt) : null}
        initialReferenceNote={referenceNote}
        noteSubjectOptions={noteSubjectOptions}
      />
    </>
  );
}
