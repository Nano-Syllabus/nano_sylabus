import { SetAppShell } from "@/components/set-app-shell";
import { ChatPageClient } from "@/components/chat-page-client";
import { requireOnboardedUser } from "@/lib/auth";
import { getChatSessionDetail, listChatSessions } from "@/lib/data/chat";
import { normalizeSubjectLabel } from "@/lib/profile-normalization";
import { getRevisionNoteDetail } from "@/lib/data/notes";
import { getCommunity } from "@/lib/data/communities";
import { getActiveCommunity } from "@/lib/data/active-community";
import { getCommunitySubjectExplorerInsights } from "@/lib/data/community-subject-explorer";
import { listCreatorPrivateSubjectAccess, listStudentCourseSubjects } from "@/lib/student-courses";

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
    semester?: string;
    librarySubject?: string;
    document?: string;
    community?: string;
  }>;
}) {
  const { user, profile } = await requireOnboardedUser();
  const params = await searchParams;

  // None of these depend on each other, so they go out together. Run in
  // sequence they stacked four Supabase round trips in front of the first byte
  // of HTML, which is what made opening a chat feel unresponsive.
  const [
    sessionResult,
    activeSession,
    courseSubjects,
    privateSubjects,
    referenceNote,
    activeCommunity,
  ] = await Promise.all([
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
    getActiveCommunity(user.id, params.community),
  ]);

  const activeStudentCommunity = activeCommunity.selected;
  const libraryCommunity = activeStudentCommunity
    ? await getCommunity(activeStudentCommunity.slug, user.id)
    : null;
  const libraryInsights = libraryCommunity
    ? await getCommunitySubjectExplorerInsights(user.id, libraryCommunity)
    : {};

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

  /**
   * NOTE FOR ANYONE TEMPTED TO HYDRATE THE SIDEBAR'S LIST FROM HERE.
   *
   * It does not work, and it fails silently. `listChatSessions` above reads the
   * same first page the sidebar's `useChatSessions` asks the API for, so
   * seeding the query cache from this page looks like an obvious way to drop
   * that duplicate request — but the sidebar lives in `app/app/layout.tsx`,
   * which React renders BEFORE this page. Its query has already started
   * fetching by the time a `HydrationBoundary` down here could seed anything.
   * Measured: the `/api/chat/sessions` request still fires, exactly as before.
   *
   * Making it work means one of two real changes, not a wrapper:
   *   - hydrate in the LAYOUT, which would put this read on every /app page to
   *     save it on one — a net loss; or
   *   - give `ChatPageClient` and the sidebar a single shared source, instead
   *     of the two independent copies they keep today (this page's
   *     `initialSessions` state, and the sidebar's query).
   */
  return (
    <>
      <SetAppShell title="Library" />
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
        libraryCommunity={libraryCommunity}
        libraryInsights={libraryInsights}
        initialLibrarySelection={{
          termId: params.semester?.trim() || null,
          subjectSlug: params.librarySubject?.trim() || null,
          documentId: params.document?.trim() || null,
        }}
      />
    </>
  );
}
