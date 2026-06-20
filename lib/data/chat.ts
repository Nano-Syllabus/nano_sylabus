import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { normalizeSubjectLabel, normalizeSubjects } from "@/lib/profile-normalization";
import type {
  AssistantAnswerTrace,
  AssistantCitation,
  ChatMessageRecord,
  ChatSessionDetail,
  ChatSessionSummary,
  MessageFeedback,
} from "@/lib/types";

function normalizeAnswerTrace(input: unknown): AssistantAnswerTrace | null {
  if (!input || typeof input !== "object") return null;

  const trace = input as Record<string, unknown>;
  if (typeof trace.routePath !== "string" || typeof trace.retrievalMode !== "string") return null;

  return {
    routePath: trace.routePath,
    routeScopeDebug: typeof trace.routeScopeDebug === "string" ? trace.routeScopeDebug : null,
    retrievalMode: trace.retrievalMode === "chapter" ? "chapter" : "default",
    answerMode: typeof trace.answerMode === "string" ? trace.answerMode : null,
    answerModeReason: typeof trace.answerModeReason === "string" ? trace.answerModeReason : null,
    matchedScope: typeof trace.matchedScope === "string" ? trace.matchedScope : null,
    topicCardUsed: Boolean(trace.topicCardUsed),
    topicCardTitle: typeof trace.topicCardTitle === "string" ? trace.topicCardTitle : null,
    topicCardSource:
      trace.topicCardSource === "persisted" || trace.topicCardSource === "derived"
        ? trace.topicCardSource
        : null,
    questionBankUsed: Boolean(trace.questionBankUsed),
    answerModel: typeof trace.answerModel === "string" ? trace.answerModel : null,
    usedFallback: Boolean(trace.usedFallback),
    usedQualityRescue: Boolean(trace.usedQualityRescue),
    fallbackReason: typeof trace.fallbackReason === "string" ? trace.fallbackReason : null,
    grounded: Boolean(trace.grounded),
    ragChunks: typeof trace.ragChunks === "number" ? trace.ragChunks : 0,
    ragMs: typeof trace.ragMs === "number" ? trace.ragMs : 0,
    generationMs: typeof trace.generationMs === "number" ? trace.generationMs : 0,
    rewriteMs: typeof trace.rewriteMs === "number" ? trace.rewriteMs : 0,
    followupMs: typeof trace.followupMs === "number" ? trace.followupMs : 0,
    totalMs: typeof trace.totalMs === "number" ? trace.totalMs : 0,
  };
}

function normalizeSession(row: any): ChatSessionSummary {
  return {
    id: row.id,
    userId: row.user_id,
    title: row.title,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    subjectTags: normalizeSubjects(Array.isArray(row.subject_tags) ? row.subject_tags : []),
    subjectContext: row.subject_context ? normalizeSubjectLabel(row.subject_context) : null,
    isPinned: Boolean(row.is_pinned),
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
    answerTrace: normalizeAnswerTrace(row.metadata?.answer_trace),
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
    .order("is_pinned", { ascending: false })
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
    isPinned?: boolean;
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

  if (typeof payload.isPinned === "boolean") {
    updatePayload.is_pinned = payload.isPinned;
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
  const supabase = createSupabaseAdminClient();
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
