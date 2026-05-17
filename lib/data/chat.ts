import { createSupabaseServerClient } from "@/lib/supabase/server";
import { normalizeSubjectLabel, normalizeSubjects } from "@/lib/profile-normalization";
import type {
  AssistantCitation,
  ChatMessageRecord,
  ChatSessionDetail,
  ChatSessionSummary,
  MessageFeedback,
} from "@/lib/types";

function normalizeSession(row: any): ChatSessionSummary {
  return {
    id: row.id,
    userId: row.user_id,
    title: row.title,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    subjectTags: normalizeSubjects(Array.isArray(row.subject_tags) ? row.subject_tags : []),
    subjectContext: row.subject_context ? normalizeSubjectLabel(row.subject_context) : null,
  };
}

function normalizeMessage(row: any): ChatMessageRecord {
  return {
    id: row.id,
    sessionId: row.session_id,
    role: row.role,
    content: row.content,
    language: row.language,
    createdAt: row.created_at,
    grounded: row.grounded ?? false,
    citations: Array.isArray(row.citations) ? (row.citations as AssistantCitation[]) : [],
    feedback: row.feedback === "up" || row.feedback === "down" ? (row.feedback as MessageFeedback) : null,
    followUpSuggestions: Array.isArray(row.follow_up_suggestions) ? row.follow_up_suggestions : [],
    savedNoteId: null,
  };
}

export async function listChatSessions(
  userId: string,
  options?: {
    search?: string;
    limit?: number;
    offset?: number;
  },
) {
  const search = options?.search?.trim() ?? "";
  const limit = options?.limit ?? 20;
  const offset = options?.offset ?? 0;
  const supabase = await createSupabaseServerClient();
  let query = supabase
    .from("chat_sessions")
    .select("*", { count: "exact" })
    .eq("user_id", userId)
    .order("updated_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (search) {
    query = query.ilike("title", `%${search}%`);
  }

  const { data, error, count } = await query;

  if (error) throw error;
  const sessions = (data ?? []).map(normalizeSession);
  return {
    sessions,
    total: count ?? sessions.length,
    hasMore: offset + sessions.length < (count ?? sessions.length),
  };
}

export async function getChatSessionDetail(sessionId: string, userId: string) {
  const supabase = await createSupabaseServerClient();
  const { data: sessionRow, error: sessionError } = await supabase
    .from("chat_sessions")
    .select("*")
    .eq("id", sessionId)
    .eq("user_id", userId)
    .maybeSingle();

  if (sessionError) throw sessionError;
  if (!sessionRow) return null;

  const { data: messageRows, error: messageError } = await supabase
    .from("chat_messages")
    .select("*")
    .eq("session_id", sessionId)
    .order("created_at", { ascending: true });

  if (messageError) throw messageError;

  const { data: noteRows, error: noteError } = await supabase
    .from("revision_notes")
    .select("id, message_id")
    .eq("user_id", userId)
    .eq("session_id", sessionId);

  if (noteError) throw noteError;

  const noteByMessageId = new Map((noteRows ?? []).map((note) => [note.message_id, note.id]));

  return {
    ...normalizeSession(sessionRow),
    messages: (messageRows ?? []).map((row) => ({
      ...normalizeMessage(row),
      savedNoteId: noteByMessageId.get(row.id) ?? null,
    })),
  } satisfies ChatSessionDetail;
}

export async function updateChatSession(
  sessionId: string,
  userId: string,
  payload: {
    title?: string;
    subjectContext?: string | null;
  },
) {
  const supabase = await createSupabaseServerClient();
  const updatePayload: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };

  if (typeof payload.title === "string") {
    updatePayload.title = payload.title;
  }

  if (payload.subjectContext !== undefined) {
    const normalizedSubjectContext = payload.subjectContext
      ? normalizeSubjectLabel(payload.subjectContext)
      : null;
    updatePayload.subject_context = normalizedSubjectContext;
    updatePayload.subject_tags = normalizedSubjectContext ? [normalizedSubjectContext] : [];
  }

  const { data, error } = await supabase
    .from("chat_sessions")
    .update(updatePayload)
    .eq("id", sessionId)
    .eq("user_id", userId)
    .select("*")
    .maybeSingle();

  if (error) throw error;
  return data ? normalizeSession(data) : null;
}

export async function deleteChatSession(sessionId: string, userId: string) {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("chat_sessions")
    .delete()
    .eq("id", sessionId)
    .eq("user_id", userId)
    .select("id")
    .maybeSingle();

  if (error) throw error;
  return Boolean(data);
}
