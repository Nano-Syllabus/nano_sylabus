import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  normalizeBoard,
  normalizeGrade,
  normalizeSubjectLabel,
  normalizeSubjects,
} from "@/lib/profile-normalization";
import { findTenantSubject, listTenantSubjectNames, listTenantSubjects } from "@/lib/tenant/client";
import type {
  StudentProfile,
  SubjectExplorerSessionSummary,
  SubjectExplorerSummary,
} from "@/lib/types";

function uniqueSubjects(values: string[]) {
  return normalizeSubjects(values);
}

type ExplorerSubjectEntry = {
  name: string;
  slug: string;
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
    unique.push({ name, slug });
  }

  return unique;
}

function categorizeSubject(subject: string): SubjectExplorerSummary["category"] {
  const normalized = subject.toLowerCase();
  if (
    [
      "physics",
      "chemistry",
      "biology",
      "science",
      "mathematics",
      "math",
      "computer",
      "statistics",
    ].some((token) => normalized.includes(token))
  ) {
    return "Science";
  }

  if (
    ["account", "business", "economics", "management", "marketing", "finance", "entrepreneur"].some(
      (token) => normalized.includes(token),
    )
  ) {
    return "Management";
  }

  if (
    [
      "engineering",
      "technical",
      "it",
      "programming",
      "network",
      "electronics",
      "instrumentation",
      "circuit",
      "logic",
      "machine",
      "communication",
      "system",
      "electrical",
      "filter",
      "civil",
      "mechanical",
    ].some((token) => normalized.includes(token))
  ) {
    return "Technical";
  }

  if (
    [
      "english",
      "nepali",
      "history",
      "geography",
      "sociology",
      "political",
      "philosophy",
      "psychology",
      "humanities",
      "civics",
    ].some((token) => normalized.includes(token))
  ) {
    return "Humanities";
  }

  return "General";
}

export async function listExplorerSubjects(
  userId: string,
  profile: StudentProfile,
  allowedSubjects?: string[],
) {
  const supabase = await createSupabaseServerClient();
  const normalizedBoard = normalizeBoard(profile.board);
  const normalizedGrade = normalizeGrade(profile.grade);
  const [sessionResult, tenantSubjects] = await Promise.all([
    supabase.from("chat_sessions").select("id, updated_at, subject_tags").eq("user_id", userId),
    listTenantSubjects(),
  ]);

  if (sessionResult.error) throw sessionResult.error;

  const sessions = sessionResult.data ?? [];

  const profileSubjects = uniqueSubjects(profile.subjects);
  const profileSubjectKeys = new Set(profileSubjects.map((subject) => subject.toLowerCase()));
  const subjectEntries = allowedSubjects
    ? uniqueSubjectEntries(
        allowedSubjects.flatMap((value) => {
          const subject = findTenantSubject(tenantSubjects, value);
          return subject ? [{ name: subject.name, slug: subject.slug }] : [];
        }),
      )
    : uniqueSubjectEntries(
        listTenantSubjectNames(tenantSubjects, profileSubjects).map((name) => {
          const subject = findTenantSubject(tenantSubjects, name);
          return subject ? { name: subject.name, slug: subject.slug } : { name, slug: name };
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

  const summaries = subjectEntries.map(({ name: subject, slug }) => {
    const subjectKey = normalizeSubjectLabel(subject).toLowerCase();
    const matchingSessions = sessionsBySubjectKey.get(subjectKey) ?? [];

    return {
      slug,
      subject,
      board: normalizedBoard,
      grade: normalizedGrade,
      category: categorizeSubject(subject),
      inProfile: profileSubjectKeys.has(subject.toLowerCase()),
      sessionCount: matchingSessions.length,
      questionCount: matchingSessions.reduce(
        (total, session) => total + (questionCountBySessionId.get(session.id) ?? 0),
        0,
      ),
      lastActivityAt:
        matchingSessions
          .map((session) => session.updated_at)
          .sort((left, right) => new Date(right).getTime() - new Date(left).getTime())[0] ?? null,
    } satisfies SubjectExplorerSummary;
  });

  return summaries.sort((left, right) => {
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
