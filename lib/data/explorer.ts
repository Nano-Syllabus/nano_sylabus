import { createSupabaseServerClient } from "@/lib/supabase/server";
import { normalizeBoard, normalizeGrade, normalizeSubjectLabel, normalizeSubjects } from "@/lib/profile-normalization";
import type {
  StudentProfile,
  SubjectExplorerSessionSummary,
  SubjectExplorerSummary,
} from "@/lib/types";

function uniqueSubjects(values: string[]) {
  return normalizeSubjects(values);
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
    [
      "account",
      "business",
      "economics",
      "management",
      "marketing",
      "finance",
      "entrepreneur",
    ].some((token) => normalized.includes(token))
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

export async function listExplorerSubjects(userId: string, profile: StudentProfile) {
  const supabase = await createSupabaseServerClient();
  const normalizedBoard = normalizeBoard(profile.board);
  const normalizedGrade = normalizeGrade(profile.grade);
  const sessionResult = await supabase
    .from("chat_sessions")
    .select("id, updated_at, subject_tags")
    .eq("user_id", userId);

  if (sessionResult.error) throw sessionResult.error;

  const sessions = sessionResult.data ?? [];
  const sessionIds = sessions.map((session) => session.id);

  const { data: messageRows, error: messageError } = sessionIds.length
    ? await supabase
        .from("chat_messages")
        .select("session_id, role")
        .in("session_id", sessionIds)
    : { data: [], error: null };

  if (messageError) throw messageError;

  const questionCountBySessionId = new Map<string, number>();
  (messageRows ?? []).forEach((row) => {
    if (row.role !== "user") return;
    questionCountBySessionId.set(
      row.session_id,
      (questionCountBySessionId.get(row.session_id) ?? 0) + 1,
    );
  });

  const profileSubjects = uniqueSubjects(profile.subjects);
  const sessionSubjects = uniqueSubjects(
    sessions.flatMap((session) => (Array.isArray(session.subject_tags) ? session.subject_tags : [])),
  );

  const allSubjects = uniqueSubjects([...profileSubjects, ...sessionSubjects]);

  const summaries = allSubjects.map((subject) => {
    const matchingSessions = sessions.filter((session) =>
      Array.isArray(session.subject_tags) && session.subject_tags.includes(subject),
    );

    return {
      subject,
      board: normalizedBoard,
      grade: normalizedGrade,
      category: categorizeSubject(subject),
      inProfile: profileSubjects.includes(subject),
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
    .select("session_id, role, language")
    .in("session_id", sessionIds);

  if (messageError) throw messageError;

  const rowsBySessionId = new Map<string, Array<{ role: string; language: string }>>();
  (messageRows ?? []).forEach((row) => {
    const list = rowsBySessionId.get(row.session_id) ?? [];
    list.push({ role: row.role, language: row.language });
    rowsBySessionId.set(row.session_id, list);
  });

  return sessions.map((session) => {
    const rows = rowsBySessionId.get(session.id) ?? [];
    const assistantLanguages = rows
      .filter((row) => row.role === "assistant")
      .map((row) => row.language);

    const language = assistantLanguages[0] === "RN" ? "RN" : "EN";

    return {
      id: session.id,
      userId: session.user_id,
      title: session.title,
      createdAt: session.created_at,
      updatedAt: session.updated_at,
      subjectTags: Array.isArray(session.subject_tags) ? session.subject_tags : [],
      subjectContext: session.subject_context ?? null,
      isPinned: Boolean(session.is_pinned),
      turnCount: rows.length,
      language,
    } satisfies SubjectExplorerSessionSummary;
  });
}
