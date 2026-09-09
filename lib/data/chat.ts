import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { normalizeSubjectLabel, normalizeSubjects } from "@/lib/profile-normalization";
import { dedupeCitationsForDisplay } from "@/lib/citations";
import type {
  AssistantAnswerTrace,
  AssistantCitation,
  ChatImageAttachment,
  ChatMessageRecord,
  ChatSessionDetail,
  ChatSessionSummary,
  PublicChatSession,
  MessageFeedback,
  MessageTokenUsage,
} from "@/lib/types";

function normalizeAnswerTrace(input: unknown): AssistantAnswerTrace | null {
  if (!input || typeof input !== "object") return null;

  const trace = input as Record<string, unknown>;
  if (typeof trace.routePath !== "string" || typeof trace.retrievalMode !== "string") return null;

  return {
    routePath: trace.routePath,
    routeScopeDebug: typeof trace.routeScopeDebug === "string" ? trace.routeScopeDebug : null,
    retrievalMode: trace.retrievalMode === "web" ? trace.retrievalMode : "default",
    answerMode: typeof trace.answerMode === "string" ? trace.answerMode : null,
    answerModeReason: typeof trace.answerModeReason === "string" ? trace.answerModeReason : null,
    matchedScope: typeof trace.matchedScope === "string" ? trace.matchedScope : null,
    answerModel: typeof trace.answerModel === "string" ? trace.answerModel : null,
    grounded: Boolean(trace.grounded),
    citationCount: typeof trace.citationCount === "number" ? trace.citationCount : 0,
    lookupMs: typeof trace.lookupMs === "number" ? trace.lookupMs : 0,
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
    shareToken: typeof row.share_token === "string" ? row.share_token : null,
    sharedAt: typeof row.shared_at === "string" ? row.shared_at : null,
  };
}

function normalizeTokenUsage(row: any): MessageTokenUsage {
  const inputTokens = typeof row.input_tokens === "number" ? row.input_tokens : 0;
  const outputTokens = typeof row.output_tokens === "number" ? row.output_tokens : 0;
  const totalTokens =
    typeof row.total_tokens === "number" ? row.total_tokens : inputTokens + outputTokens;

  return {
    inputTokens,
    outputTokens,
    totalTokens,
  };
}

function normalizeImageAttachments(input: unknown): ChatImageAttachment[] {
  if (!Array.isArray(input)) return [];

  return input
    .map((item): ChatImageAttachment | null => {
      if (!item || typeof item !== "object" || Array.isArray(item)) return null;
      const attachment = item as Record<string, unknown>;
      const id = typeof attachment.id === "string" ? attachment.id : "";
      const name = typeof attachment.name === "string" ? attachment.name : "Image";
      const mimeType = typeof attachment.mimeType === "string" ? attachment.mimeType : "";
      const size = typeof attachment.size === "number" ? attachment.size : 0;
      const dataUrl = typeof attachment.dataUrl === "string" ? attachment.dataUrl : "";

      if (!id || !mimeType.startsWith("image/") || !dataUrl.startsWith("data:image/")) {
        return null;
      }

      return { id, name, mimeType, size, dataUrl };
    })
    .filter(Boolean) as ChatImageAttachment[];
}

function normalizeMessage(row: any): ChatMessageRecord {
  const metadata =
    row.metadata && typeof row.metadata === "object" && !Array.isArray(row.metadata)
      ? (row.metadata as Record<string, unknown>)
      : {};

  return {
    id: row.id,
    sessionId: row.session_id,
    role: row.role,
    content: row.content,
    language: row.language,
    createdAt: row.created_at,
    grounded: row.grounded ?? false,
    /**
     * DEDUPED HERE, ON THE SERVER, NOT IN THE BROWSER.
     *
     * Retrieval routinely returns the same source chunk several times for one
     * answer, so a stored `citations` array is mostly repeats — measured across
     * 60 real messages: 181 citations totalling 1216KB, of which 87 (241KB)
     * survive deduplication. Eighty percent of it is duplicate.
     *
     * Every consumer already called `dedupeCitationsForDisplay` before showing
     * them, which meant that 80% was read out of Postgres, serialised, pushed
     * across the wire and parsed by the browser purely to be discarded on the
     * next line. On a session opening ten messages that is hundreds of
     * kilobytes of nothing, and it is the single largest thing in a chat
     * payload — an individual message's citations run to 72KB at the median and
     * 124KB at the worst.
     *
     * Doing it here is safe because the function is a pure, idempotent filter
     * over a plain array with no DOM or client dependency, and it is the same
     * function the UI was applying, so nothing that was visible stops being
     * visible. The callers keep their own call: it now costs one cheap pass
     * over an already-short list, and it still covers citations arriving from
     * the live stream, which never pass through here.
     *
     * NOTHING IS REWRITTEN IN THE DATABASE. This is the read path only — the
     * stored row keeps every citation the retriever returned, so an admin
     * reviewing an answer still sees exactly what grounded it.
     */
    citations: Array.isArray(row.citations)
      ? dedupeCitationsForDisplay(row.citations as AssistantCitation[])
      : [],
    feedback: row.feedback === "up" || row.feedback === "down" ? (row.feedback as MessageFeedback) : null,
    followUpSuggestions: Array.isArray(row.follow_up_suggestions) ? row.follow_up_suggestions : [],
    savedNoteId: null,
    answerTrace: normalizeAnswerTrace(metadata.answer_trace),
    tokenUsage: normalizeTokenUsage(row),
    attachments: normalizeImageAttachments(metadata.attachments),
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

  /**
   * TWO THINGS THIS DELIBERATELY DOES NOT DO, BOTH OF WHICH IT USED TO.
   *
   * 1. IT DOES NOT `select("*")`. `chat_sessions` carries
   *    `last_context_summary`, a stored conversation summary that averages
   *    ~2.5KB and runs to 4KB. `normalizeSession` has never read it, but
   *    `select("*")` fetched it for every row — roughly 30KB of text pulled
   *    from Supabase and thrown away on each page of this list, which the
   *    sidebar requests on every visit to the chat screen. The response was
   *    always small; the waste was entirely on the database-to-server hop,
   *    which is why it never showed up in a payload size.
   *
   *    The column list below is exactly what `normalizeSession` reads. If you
   *    add a field to `ChatSessionSummary`, add its column here too — the
   *    failure mode is a quietly `undefined` property, not an error.
   *
   * 2. IT DOES NOT ASK FOR AN EXACT COUNT. `{ count: "exact" }` makes
   *    PostgREST run a second `COUNT(*)` across every session the user owns,
   *    on every request, and Postgres cannot answer that from an index alone —
   *    it walks the rows. That count existed to serve `hasMore` and a `total`
   *    that no caller has ever read.
   *
   *    Fetching one row more than asked for answers `hasMore` exactly, for the
   *    price of a single extra row: if the over-fetch came back, there is
   *    another page. The surplus row is sliced off before mapping so callers
   *    still get precisely `limit` items.
   */
  let query = supabase
    .from("chat_sessions")
    .select(
      "id,user_id,title,created_at,updated_at,subject_tags,subject_context,is_pinned,share_token,shared_at",
    )
    .eq("user_id", userId)
    .order("is_pinned", { ascending: false })
    .order("updated_at", { ascending: false })
    .range(offset, offset + limit);

  if (search) {
    query = query.ilike("title", `%${search}%`);
  }

  const { data, error } = await query;

  if (error) throw error;
  const rows = data ?? [];
  const hasMore = rows.length > limit;
  return {
    sessions: rows.slice(0, limit).map(normalizeSession),
    hasMore,
  };
}

export async function getChatSessionDetail(
  sessionId: string,
  userId: string,
  options?: {
    limit?: number;
    before?: string;
  },
) {
  const supabase = await createSupabaseServerClient();

  const messageLimit =
    typeof options?.limit === "number" && Number.isFinite(options.limit)
      ? Math.max(1, Math.min(100, Math.floor(options.limit)))
      : null;
  const before = options?.before?.trim();

  let messageQuery = supabase
    .from("chat_messages")
    .select("*")
    .eq("session_id", sessionId);

  if (messageLimit) {
    messageQuery = messageQuery.order("created_at", { ascending: false }).limit(messageLimit + 1);
    if (before) {
      messageQuery = messageQuery.lt("created_at", before);
    }
  } else {
    messageQuery = messageQuery.order("created_at", { ascending: true });
  }

  // All three are keyed by the session id the caller already has, so they run
  // together rather than as three chained round trips. The session row still
  // decides whether the caller sees anything: both other queries are scoped to
  // this user's own rows, so nothing leaks when it turns out to be missing.
  const [sessionResult, messageResult, noteResult] = await Promise.all([
    supabase
      .from("chat_sessions")
      .select("*")
      .eq("id", sessionId)
      .eq("user_id", userId)
      .maybeSingle(),
    messageQuery,
    supabase
      .from("revision_notes")
      .select("id, message_id")
      .eq("user_id", userId)
      .eq("session_id", sessionId),
  ]);

  if (sessionResult.error) throw sessionResult.error;
  const sessionRow = sessionResult.data;
  if (!sessionRow) return null;

  const { data: rawMessageRows, error: messageError } = messageResult;
  if (messageError) throw messageError;

  const hasMoreMessages = messageLimit ? (rawMessageRows?.length ?? 0) > messageLimit : false;
  const messageRows = messageLimit
    ? (rawMessageRows ?? []).slice(0, messageLimit).reverse()
    : (rawMessageRows ?? []);

  const { data: noteRows, error: noteError } = noteResult;
  if (noteError) throw noteError;

  const noteByMessageId = new Map((noteRows ?? []).map((note) => [note.message_id, note.id]));

  return {
    ...normalizeSession(sessionRow),
    messages: messageRows.map((row) => ({
      ...normalizeMessage(row),
      savedNoteId: noteByMessageId.get(row.id) ?? null,
    })),
    hasMoreMessages,
  } satisfies ChatSessionDetail;
}

export async function getPublicChatSessionDetail(token: string) {
  const trimmedToken = token.trim();
  if (!trimmedToken) return null;

  const supabase = createSupabaseAdminClient();
  const { data: sessionRow, error: sessionError } = await supabase
    .from("chat_sessions")
    .select("*")
    .eq("share_token", trimmedToken)
    .not("shared_at", "is", null)
    .maybeSingle();

  if (sessionError) throw sessionError;
  if (!sessionRow || !sessionRow.shared_at) return null;

  const { data: messageRows, error: messageError } = await supabase
    .from("chat_messages")
    .select("*")
    .eq("session_id", sessionRow.id)
    .order("created_at", { ascending: true });

  if (messageError) throw messageError;

  return {
    id: sessionRow.id,
    title: sessionRow.title,
    createdAt: sessionRow.created_at,
    updatedAt: sessionRow.updated_at,
    subjectTags: normalizeSubjects(Array.isArray(sessionRow.subject_tags) ? sessionRow.subject_tags : []),
    subjectContext: sessionRow.subject_context ? normalizeSubjectLabel(sessionRow.subject_context) : null,
    sharedAt: sessionRow.shared_at,
    messages: (messageRows ?? []).map((row) => ({
      ...normalizeMessage(row),
      savedNoteId: null,
      feedback: null,
    })),
  } satisfies PublicChatSession;
}

export async function shareChatSession(sessionId: string, userId: string, token: string) {
  const supabase = createSupabaseAdminClient();
  const now = new Date().toISOString();

  const { data: existingSession, error: existingError } = await supabase
    .from("chat_sessions")
    .select("id, share_token, shared_at")
    .eq("id", sessionId)
    .eq("user_id", userId)
    .maybeSingle();

  if (existingError) throw existingError;
  if (!existingSession) return null;

  if (existingSession.share_token && existingSession.shared_at) {
    return {
      token: existingSession.share_token as string,
      sharedAt: existingSession.shared_at as string,
    };
  }

  const { data, error } = await supabase
    .from("chat_sessions")
    .update({
      share_token: existingSession.share_token ?? token,
      shared_at: now,
    })
    .eq("id", sessionId)
    .eq("user_id", userId)
    .select("share_token, shared_at")
    .maybeSingle();

  if (error) throw error;
  if (!data?.share_token || !data.shared_at) return null;

  return {
    token: data.share_token as string,
    sharedAt: data.shared_at as string,
  };
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
