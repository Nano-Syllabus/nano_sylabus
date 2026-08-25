import { createSupabaseServerClient } from "@/lib/supabase/server";
import { listPracticeAttempts, listTopicMastery } from "@/lib/data/student-mastery";
import {
  normalizeBoard,
  normalizeGrade,
  normalizeSubjectLabel,
  normalizeSubjects,
} from "@/lib/profile-normalization";
import {
  findTenantSubject,
  listPracticeTopics,
  listTenantSubjectNames,
  listTenantSubjects,
} from "@/lib/tenant/client";
import type {
  StudentProfile,
  SubjectExplorerSessionSummary,
  SubjectExplorerSummary,
} from "@/lib/types";

function uniqueSubjects(values: string[]) {
  return normalizeSubjects(values);
}

function identityKey(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export type ExplorerSubjectEntry = {
  name: string;
  slug: string;
  private?: boolean;
  category?: string;
  board?: string;
  grade?: string;
};

function uniqueSubjectEntries(entries: ExplorerSubjectEntry[]) {
  const seen = new Set<string>();
  const unique: ExplorerSubjectEntry[] = [];

  for (const entry of entries) {
    const name = entry.name.trim();
    const slug = entry.slug.trim() || name;
    const key = slug.toLowerCase();
    if (!name || seen.has(key)) continue;
    seen.add(key);
    unique.push({ ...entry, name, slug });
  }

  return unique;
}

export async function listExplorerSubjects(
  userId: string,
  profile: StudentProfile,
  allowedSubjects?: ExplorerSubjectEntry[],
  privateSubjects: ExplorerSubjectEntry[] = [],
) {
  const supabase = await createSupabaseServerClient();
  const normalizedBoard = normalizeBoard(profile.board);
  const normalizedGrade = normalizeGrade(profile.grade);
  const [sessionResult, tenantSubjects, mastery, attempts] = await Promise.all([
    supabase.from("chat_sessions").select("id, updated_at, subject_tags").eq("user_id", userId),
    listTenantSubjects(),
    listTopicMastery(userId),
    listPracticeAttempts(userId, 500),
  ]);

  if (sessionResult.error) throw sessionResult.error;

  const sessions = sessionResult.data ?? [];

  const profileSubjects = uniqueSubjects(profile.subjects);
  const profileSubjectKeys = new Set(profileSubjects.map((subject) => subject.toLowerCase()));
  const courseSubjectEntries = allowedSubjects
    ? uniqueSubjectEntries(
        allowedSubjects.flatMap((entry) => {
          const subject =
            findTenantSubject(tenantSubjects, entry.slug) ??
            findTenantSubject(tenantSubjects, entry.name);
          return subject ? [{ ...entry, name: subject.name, slug: subject.slug }] : [];
        }),
      )
    : uniqueSubjectEntries(
        listTenantSubjectNames(tenantSubjects, profileSubjects).map((name) => {
          const subject = findTenantSubject(tenantSubjects, name);
          return subject
            ? {
                name: subject.name,
                slug: subject.slug,
                category: "Subject",
                board: normalizedBoard,
                grade: normalizedGrade,
              }
            : {
                name,
                slug: name,
                category: "Subject",
                board: normalizedBoard,
                grade: normalizedGrade,
              };
        }),
      );
  // Course subjects are the primary list. Private creator subjects are added
  // afterwards and deduplicated so a matching enrolled subject is not shown twice.
  const subjectEntries = uniqueSubjectEntries([
    ...courseSubjectEntries,
    ...privateSubjects.map((entry) => ({
      ...entry,
      private: true,
      category: entry.category || "Private subject",
      board: entry.board || "",
      grade: entry.grade || "",
    })),
  ]);

  const topicCatalogs = await Promise.all(
    subjectEntries.map(async (entry) => {
      const tenantSubject =
        findTenantSubject(tenantSubjects, entry.slug) ??
        findTenantSubject(tenantSubjects, entry.name);
      if (!tenantSubject) return null;

      try {
        const response = await listPracticeTopics({
          subject: tenantSubject.slug,
          namespaces: [tenantSubject.namespace],
          totalMarks: 20,
          maxQuestions: 5,
        });
        return response.topics ?? [];
      } catch {
        // Chat activity and persisted mastery remain useful even when the
        // tenant topic catalog is temporarily unavailable.
        return null;
      }
    }),
  );

  // Group the sessions by subject tag once. Doing it inside the map below
  // rescanned every session for every subject on the page.
  const sessionsBySubjectKey = new Map<string, typeof sessions>();
  for (const session of sessions) {
    if (!Array.isArray(session.subject_tags)) continue;
    for (const tag of new Set(
      session.subject_tags.map((value) => normalizeSubjectLabel(String(value)).toLowerCase()),
    )) {
      const bucket = sessionsBySubjectKey.get(tag);
      if (bucket) bucket.push(session);
      else sessionsBySubjectKey.set(tag, [session]);
    }
  }

  // Only the sessions actually shown need a question count, and only the
  // student's own turns count. Previously this pulled every chat message row
  // the account had ever produced across the wire to count a handful of them.
  const countedSessionIds = [
    ...new Set(
      subjectEntries.flatMap(({ name }) =>
        (sessionsBySubjectKey.get(normalizeSubjectLabel(name).toLowerCase()) ?? []).map(
          (session) => session.id,
        ),
      ),
    ),
  ];

  const questionCountBySessionId = new Map<string, number>();
  if (countedSessionIds.length) {
    const { data: messageRows, error: messageError } = await supabase
      .from("chat_messages")
      .select("session_id")
      .eq("role", "user")
      .in("session_id", countedSessionIds);

    if (messageError) throw messageError;

    for (const row of messageRows ?? []) {
      questionCountBySessionId.set(
        row.session_id,
        (questionCountBySessionId.get(row.session_id) ?? 0) + 1,
      );
    }
  }

  const summaries = subjectEntries.map((entry, index) => {
    const { name: subject, slug, private: isPrivate } = entry;
    const subjectKey = normalizeSubjectLabel(subject).toLowerCase();
    const matchingSessions = sessionsBySubjectKey.get(subjectKey) ?? [];
    const identityKeys = new Set([identityKey(slug), identityKey(subject)]);
    const subjectMastery = mastery.filter(
      (topic) =>
        identityKeys.has(identityKey(topic.subjectSlug)) ||
        identityKeys.has(identityKey(topic.subjectName)),
    );
    const catalog = topicCatalogs[index];
    const catalogTopicKeys = new Set((catalog ?? []).map((topic) => topic.topic_key));
    const masteredTopicKeys = new Set(subjectMastery.map((topic) => topic.topicKey));
    const syllabusTopicCount = catalog
      ? catalogTopicKeys.size
      : masteredTopicKeys.size
        ? masteredTopicKeys.size
        : null;
    const practicedTopicCount = new Set(
      subjectMastery.filter((topic) => topic.attempts > 0).map((topic) => topic.topicKey),
    ).size;
    const latestAttempt = attempts.find(
      (attempt) =>
        identityKeys.has(identityKey(attempt.subjectSlug)) ||
        identityKeys.has(identityKey(attempt.subjectName)),
    );
    const lastActivityAt = [
      ...matchingSessions.map((session) => session.updated_at),
      latestAttempt?.createdAt,
    ]
      .filter((value): value is string => Boolean(value))
      .sort((left, right) => new Date(right).getTime() - new Date(left).getTime())[0] ?? null;

    return {
      slug,
      subject,
      board: entry.board?.trim() || "",
      grade: entry.grade?.trim() || "",
      category: entry.category?.trim() || (isPrivate ? "Private subject" : "Subject"),
      private: isPrivate,
      inProfile: profileSubjectKeys.has(subject.toLowerCase()),
      sessionCount: matchingSessions.length,
      questionCount: matchingSessions.reduce(
        (total, session) => total + (questionCountBySessionId.get(session.id) ?? 0),
        0,
      ),
      lastActivityAt,
      syllabusTopicCount,
      weakTopicCount: subjectMastery.filter((topic) => topic.status === "weak").length,
      untestedTopicCount:
        syllabusTopicCount === null ? null : Math.max(0, syllabusTopicCount - practicedTopicCount),
      latestPracticeScore:
        latestAttempt && latestAttempt.totalMarks > 0
          ? Math.max(
              0,
              Math.min(100, (latestAttempt.totalScore / latestAttempt.totalMarks) * 100),
            )
          : null,
    } satisfies SubjectExplorerSummary;
  });

  return summaries.sort((left, right) => {
    if (left.private !== right.private) return left.private ? 1 : -1;
    if (left.inProfile !== right.inProfile) return left.inProfile ? -1 : 1;
    if (left.questionCount !== right.questionCount) return right.questionCount - left.questionCount;
    if (left.lastActivityAt && right.lastActivityAt) {
      return new Date(right.lastActivityAt).getTime() - new Date(left.lastActivityAt).getTime();
    }
    if (left.lastActivityAt) return -1;
    if (right.lastActivityAt) return 1;
    return left.subject.localeCompare(right.subject);
  });
}

export async function listSubjectSessions(userId: string, subject: string) {
  const supabase = await createSupabaseServerClient();
  const normalizedSubject = normalizeSubjectLabel(subject);
  const { data: sessionRows, error: sessionError } = await supabase
    .from("chat_sessions")
    .select("*")
    .eq("user_id", userId)
    .contains("subject_tags", [normalizedSubject])
    .order("updated_at", { ascending: false });

  if (sessionError) throw sessionError;

  const sessions = sessionRows ?? [];
  if (sessions.length === 0) return [] as SubjectExplorerSessionSummary[];

  const sessionIds = sessions.map((session) => session.id);
  const { data: messageRows, error: messageError } = await supabase
    .from("chat_messages")
    .select("session_id, role")
    .in("session_id", sessionIds);

  if (messageError) throw messageError;

  const rowsBySessionId = new Map<string, Array<{ role: string }>>();
  (messageRows ?? []).forEach((row) => {
    const list = rowsBySessionId.get(row.session_id) ?? [];
    list.push({ role: row.role });
    rowsBySessionId.set(row.session_id, list);
  });

  return sessions.map((session) => {
    const rows = rowsBySessionId.get(session.id) ?? [];

    return {
      id: session.id,
      userId: session.user_id,
      title: session.title,
      createdAt: session.created_at,
      updatedAt: session.updated_at,
      subjectTags: Array.isArray(session.subject_tags) ? session.subject_tags : [],
      subjectContext: session.subject_context ?? null,
      isPinned: Boolean(session.is_pinned),
      messageCount: rows.length,
    } satisfies SubjectExplorerSessionSummary;
  });
}
