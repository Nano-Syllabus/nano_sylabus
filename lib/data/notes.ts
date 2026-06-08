import { createSupabaseServerClient } from "@/lib/supabase/server";
import type {
  AssistantCitation,
  AssistantAnswerTrace,
  ChatMessageRecord,
  MessageFeedback,
  NoteRevisionLog,
  NoteColor,
  RevisionAction,
  RevisionNoteDetail,
  RevisionNoteSummary,
} from "@/lib/types";

function normalizeCitations(input: unknown): AssistantCitation[] {
  if (!Array.isArray(input)) return [];
  return input.filter(Boolean) as AssistantCitation[];
}

function normalizeAnswerTrace(input: unknown): AssistantAnswerTrace | null {
  if (!input || typeof input !== "object" || Array.isArray(input)) return null;
  const trace = input as Record<string, unknown>;
  return {
    routePath: typeof trace.routePath === "string" ? trace.routePath : "unknown",
    routeScopeDebug: typeof trace.routeScopeDebug === "string" ? trace.routeScopeDebug : "",
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

function normalizeMessage(row: any): ChatMessageRecord {
  const answerTrace =
    row?.metadata && typeof row.metadata === "object" && !Array.isArray(row.metadata)
      ? normalizeAnswerTrace((row.metadata as Record<string, unknown>).answer_trace)
      : null;
  return {
    id: row.id,
    sessionId: row.session_id,
    role: row.role,
    content: row.content,
    language: row.language,
    createdAt: row.created_at,
    grounded: row.grounded ?? false,
    citations: normalizeCitations(row.citations),
    feedback: row.feedback === "up" || row.feedback === "down" ? (row.feedback as MessageFeedback) : null,
    followUpSuggestions: Array.isArray(row.follow_up_suggestions) ? row.follow_up_suggestions : [],
    savedNoteId: null,
    answerTrace,
  };
}

function aggregateRevisionStats(
  logs: Array<{ note_id: string; revised_at: string }>,
  noteId: string,
) {
  const relevant = logs.filter((log) => log.note_id === noteId);
  return {
    reviewedCount: relevant.length,
    lastReviewedAt: relevant[0]?.revised_at ?? null,
  };
}

export async function listRevisionNotes(userId: string) {
  const supabase = await createSupabaseServerClient();
  const { data: notes, error: notesError } = await supabase
    .from("revision_notes")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (notesError) throw notesError;
  if (!notes || notes.length === 0) return [] as RevisionNoteSummary[];

  const messageIds = notes.map((note) => note.message_id);
  const noteIds = notes.map((note) => note.id);

  const { data: answerMessages, error: messagesError } = await supabase
    .from("chat_messages")
    .select("*")
    .in("id", messageIds);

  if (messagesError) throw messagesError;

  const { data: logs, error: logsError } = await supabase
    .from("note_revision_logs")
    .select("id, note_id, revised_at")
    .in("note_id", noteIds)
    .order("revised_at", { ascending: false });

  if (logsError) throw logsError;

  const answerById = new Map((answerMessages ?? []).map((message) => [message.id, message]));

  const sessionIds = Array.from(new Set((answerMessages ?? []).map((message) => message.session_id)));
  const { data: sessionMessages, error: sessionMessagesError } = await supabase
    .from("chat_messages")
    .select("*")
    .in("session_id", sessionIds)
    .order("created_at", { ascending: true });

  if (sessionMessagesError) throw sessionMessagesError;

  const sessionMessageMap = new Map<string, ChatMessageRecord[]>();
  for (const row of sessionMessages ?? []) {
    const list = sessionMessageMap.get(row.session_id) ?? [];
    list.push(normalizeMessage(row));
    sessionMessageMap.set(row.session_id, list);
  }

  return notes.map((note) => {
    const answer = answerById.get(note.message_id);
    const sessionMessagesForNote = sessionMessageMap.get(note.session_id) ?? [];
    const answerIndex = sessionMessagesForNote.findIndex((message) => message.id === note.message_id);
    const question =
      answerIndex > 0 && sessionMessagesForNote[answerIndex - 1]?.role === "user"
        ? sessionMessagesForNote[answerIndex - 1].content
        : "";
    const { reviewedCount, lastReviewedAt } = aggregateRevisionStats(logs ?? [], note.id);

    return {
      id: note.id,
      userId: note.user_id,
      sessionId: note.session_id,
      messageId: note.message_id,
      title: note.title,
      subjectTag: note.subject_tag,
      chapterTag: note.chapter_tag,
      annotation: note.annotation,
      colorLabel: note.colour_label as NoteColor,
      createdAt: note.created_at,
      updatedAt: note.updated_at,
      questionContent: question,
      answerContent: answer?.content ?? "",
      reviewedCount,
      lastReviewedAt,
    } satisfies RevisionNoteSummary;
  });
}

export async function getRevisionNoteDetail(noteId: string, userId: string) {
  const supabase = await createSupabaseServerClient();
  const { data: note, error: noteError } = await supabase
    .from("revision_notes")
    .select("*")
    .eq("id", noteId)
    .eq("user_id", userId)
    .maybeSingle();

  if (noteError) throw noteError;
  if (!note) return null;

  const { data: sessionMessages, error: sessionError } = await supabase
    .from("chat_messages")
    .select("*")
    .eq("session_id", note.session_id)
    .order("created_at", { ascending: true });

  if (sessionError) throw sessionError;

  const normalizedMessages = (sessionMessages ?? []).map(normalizeMessage);
  const answerIndex = normalizedMessages.findIndex((message) => message.id === note.message_id);
  const answer = answerIndex >= 0 ? normalizedMessages[answerIndex] : null;
  const question =
    answerIndex > 0 && normalizedMessages[answerIndex - 1]?.role === "user"
      ? normalizedMessages[answerIndex - 1].content
      : "";

  const { data: logs, error: logsError } = await supabase
    .from("note_revision_logs")
    .select("*")
    .eq("note_id", noteId)
    .order("revised_at", { ascending: false });

  if (logsError) throw logsError;

  const { reviewedCount, lastReviewedAt } = aggregateRevisionStats(logs ?? [], note.id);

  return {
    id: note.id,
    userId: note.user_id,
    sessionId: note.session_id,
    messageId: note.message_id,
    title: note.title,
    subjectTag: note.subject_tag,
    chapterTag: note.chapter_tag,
    annotation: note.annotation,
    colorLabel: note.colour_label as NoteColor,
    createdAt: note.created_at,
    updatedAt: note.updated_at,
    questionContent: question,
    answerContent: answer?.content ?? "",
    citations: answer?.citations ?? [],
    reviewedCount,
    lastReviewedAt,
  } satisfies RevisionNoteDetail;
}

export async function listNoteRevisionLogs(noteIds: string[]) {
  if (noteIds.length === 0) return [] as NoteRevisionLog[];
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("note_revision_logs")
    .select("*")
    .in("note_id", noteIds)
    .order("revised_at", { ascending: false });

  if (error) throw error;

  return (data ?? []).map((row) => ({
    id: row.id,
    noteId: row.note_id,
    userId: row.user_id,
    action: row.action as RevisionAction,
    revisedAt: row.revised_at,
  }));
}
