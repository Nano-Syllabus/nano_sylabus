import { buildAnswerPreview, deriveAdminAnswerState } from "@/lib/admin-answer-review";
import {
  normalizeBoard,
  normalizeCollege,
  normalizeFullName,
  normalizeGrade,
  normalizeSubjectLabel,
  normalizeSubjects,
  normalizeTargetGrade,
} from "@/lib/profile-normalization";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type {
  AdminAnswerDetail,
  AdminAnswerHealthBreakdownItem,
  AdminAnswerHealthSnapshot,
  AdminAnswerFilter,
  AdminAnswerSummary,
  AdminListPage,
  AssistantAnswerTrace,
  AssistantCitation,
  ChatMessageRecord,
  Language,
  MessageFeedback,
} from "@/lib/types";

interface AdminAnswerMessageRow {
  id: string;
  session_id: string;
  role: "user" | "assistant";
  content: string;
  language: Language;
  created_at: string;
  grounded: boolean | null;
  citations: AssistantCitation[] | null;
  feedback: MessageFeedback | null;
  follow_up_suggestions: string[] | null;
  admin_review_note: string | null;
  admin_reviewed_at: string | null;
  admin_reviewed_by: string | null;
  metadata: unknown | null;
}

interface AdminAnswerHealthRow {
  id: string;
  created_at: string;
  grounded: boolean | null;
  feedback: MessageFeedback | null;
  admin_reviewed_at: string | null;
  metadata: unknown | null;
}

interface ChatSessionRow {
  id: string;
  user_id: string;
  title: string;
  subject_context: string | null;
}

interface StudentProfileRow {
  user_id: string;
  full_name: string | null;
  college: string | null;
  board: string | null;
  grade: string | null;
  subjects: string[] | null;
  target_grade: string | null;
  language_pref: Language | null;
}

interface AuthLookup {
  email: string;
  fullName: string;
}

const BASE_CHAT_MESSAGE_SELECT =
  "id, session_id, role, content, language, created_at, grounded, citations, feedback, follow_up_suggestions, admin_review_note, admin_reviewed_at, admin_reviewed_by";

function withMetadataSelect(includeMetadata: boolean) {
  return includeMetadata ? `${BASE_CHAT_MESSAGE_SELECT}, metadata` : BASE_CHAT_MESSAGE_SELECT;
}

function isMissingMetadataColumnError(error: { message?: string; details?: string } | null) {
  const message = `${error?.message || ""} ${error?.details || ""}`.toLowerCase();
  return message.includes("metadata") && message.includes("column");
}

function normalizeAnswerTrace(input: unknown): AssistantAnswerTrace | null {
  if (!input || typeof input !== "object" || Array.isArray(input)) return null;
  const value = input as Record<string, unknown>;
  if (typeof value.routePath !== "string" || typeof value.answerMode !== "string") return null;

  return {
    routePath: value.routePath,
    routeScopeDebug: typeof value.routeScopeDebug === "string" ? value.routeScopeDebug : "",
    retrievalMode: value.retrievalMode === "chapter" ? "chapter" : "default",
    answerMode: value.answerMode,
    answerModeReason: typeof value.answerModeReason === "string" ? value.answerModeReason : "",
    matchedScope: typeof value.matchedScope === "string" ? value.matchedScope : null,
    topicCardUsed: Boolean(value.topicCardUsed),
    topicCardTitle: typeof value.topicCardTitle === "string" ? value.topicCardTitle : null,
    topicCardSource:
      value.topicCardSource === "persisted" || value.topicCardSource === "derived"
        ? value.topicCardSource
        : null,
    questionBankUsed: Boolean(value.questionBankUsed),
    answerModel: typeof value.answerModel === "string" ? value.answerModel : null,
    usedFallback: Boolean(value.usedFallback),
    usedQualityRescue: Boolean(value.usedQualityRescue),
    fallbackReason: typeof value.fallbackReason === "string" ? value.fallbackReason : null,
    grounded: Boolean(value.grounded),
    ragChunks: typeof value.ragChunks === "number" ? value.ragChunks : 0,
    ragMs: typeof value.ragMs === "number" ? value.ragMs : 0,
    generationMs: typeof value.generationMs === "number" ? value.generationMs : 0,
    rewriteMs: typeof value.rewriteMs === "number" ? value.rewriteMs : 0,
    followupMs: typeof value.followupMs === "number" ? value.followupMs : 0,
    totalMs: typeof value.totalMs === "number" ? value.totalMs : 0,
  };
}

function normalizeConversationMessage(row: AdminAnswerMessageRow): ChatMessageRecord {
  return {
    id: row.id,
    sessionId: row.session_id,
    role: row.role,
    content: row.content,
    language: row.language,
    createdAt: row.created_at,
    grounded: row.grounded ?? false,
    citations: Array.isArray(row.citations) ? row.citations : [],
    feedback: row.feedback === "up" || row.feedback === "down" ? row.feedback : null,
    followUpSuggestions: Array.isArray(row.follow_up_suggestions) ? row.follow_up_suggestions : [],
    savedNoteId: null,
    answerTrace:
      row.metadata && typeof row.metadata === "object" && !Array.isArray(row.metadata)
        ? normalizeAnswerTrace((row.metadata as Record<string, unknown>).answer_trace)
        : null,
  };
}

function buildAuthLookup(user: any): AuthLookup {
  const email = user.email ?? "";
  const fullName =
    (typeof user.user_metadata?.full_name === "string" && user.user_metadata.full_name.trim()) ||
    email.split("@")[0] ||
    "Student";

  return {
    email,
    fullName: normalizeFullName(fullName),
  };
}

function buildSummary(
  message: AdminAnswerMessageRow,
  session: ChatSessionRow | null,
  profile: StudentProfileRow | null,
  authLookup: AuthLookup | null,
): AdminAnswerSummary {
  const citations = Array.isArray(message.citations) ? message.citations : [];
  const studentName = normalizeFullName(profile?.full_name ?? authLookup?.fullName ?? "Student");

  return {
    messageId: message.id,
    sessionId: message.session_id,
    userId: session?.user_id ?? profile?.user_id ?? "",
    studentName,
    studentEmail: authLookup?.email ?? "",
    college: normalizeCollege(profile?.college ?? ""),
    board: normalizeBoard(profile?.board ?? ""),
    grade: normalizeGrade(profile?.grade ?? ""),
    subjectContext: session?.subject_context ? normalizeSubjectLabel(session.subject_context) : null,
    sessionTitle: session?.title ?? "Untitled chat",
    answerPreview: buildAnswerPreview(message.content),
    feedback: message.feedback === "up" || message.feedback === "down" ? message.feedback : null,
    grounded: message.grounded ?? false,
    citationCount: citations.length,
    status: deriveAdminAnswerState(
      message.feedback === "up" || message.feedback === "down" ? message.feedback : null,
      message.admin_reviewed_at,
    ),
    createdAt: message.created_at,
    reviewedAt: message.admin_reviewed_at,
    reviewedBy: message.admin_reviewed_by,
    adminReviewNote: message.admin_review_note,
  };
}

async function loadAuthUsersById(userIds: string[]) {
  if (!userIds.length) return new Map<string, AuthLookup>();

  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase.auth.admin.listUsers({
    page: 1,
    perPage: Math.max(100, userIds.length),
  });

  if (error) throw error;

  return new Map(
    (data.users ?? [])
      .filter((user) => userIds.includes(user.id))
      .map((user) => [user.id, buildAuthLookup(user)]),
  );
}

const DEFAULT_ADMIN_PAGE_SIZE = 50;
const MAX_ADMIN_PAGE_SIZE = 100;

function normalizePage(value: number | undefined) {
  if (!value || Number.isNaN(value) || value < 1) return 1;
  return Math.floor(value);
}

function normalizePageSize(value: number | undefined) {
  if (!value || Number.isNaN(value) || value < 1) return DEFAULT_ADMIN_PAGE_SIZE;
  return Math.min(MAX_ADMIN_PAGE_SIZE, Math.floor(value));
}

type AdminAnswerListFilters = {
  q?: string;
  status?: AdminAnswerFilter;
  page?: number;
  pageSize?: number;
};

function roundMetric(value: number) {
  return Number(value.toFixed(1));
}

function sortBreakdownDescending(items: Map<string, number>): AdminAnswerHealthBreakdownItem[] {
  return [...items.entries()]
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .slice(0, 5)
    .map(([label, count]) => ({ label, count }));
}

export function buildAdminAnswerHealthSnapshot(rows: AdminAnswerHealthRow[]): AdminAnswerHealthSnapshot {
  const sampleSize = rows.length;
  if (!sampleSize) {
    return {
      sampleSize: 0,
      groundedRate: 0,
      fallbackRate: 0,
      reviewedRate: 0,
      topicCardRate: 0,
      questionBankRate: 0,
      avgTotalMs: 0,
      avgGenerationMs: 0,
      latestCapturedAt: null,
      routeBreakdown: [],
      modelBreakdown: [],
    };
  }

  let groundedCount = 0;
  let fallbackCount = 0;
  let reviewedCount = 0;
  let topicCardCount = 0;
  let questionBankCount = 0;
  let totalMsSum = 0;
  let generationMsSum = 0;
  let totalMsCount = 0;
  let generationMsCount = 0;
  const routeCounts = new Map<string, number>();
  const modelCounts = new Map<string, number>();

  for (const row of rows) {
    if (row.grounded) groundedCount += 1;
    if (row.admin_reviewed_at) reviewedCount += 1;

    const trace =
      row.metadata && typeof row.metadata === "object" && !Array.isArray(row.metadata)
        ? normalizeAnswerTrace((row.metadata as Record<string, unknown>).answer_trace)
        : null;

    if (!trace) continue;

    if (trace.usedFallback) fallbackCount += 1;
    if (trace.topicCardUsed) topicCardCount += 1;
    if (trace.questionBankUsed) questionBankCount += 1;
    if (trace.totalMs > 0) {
      totalMsSum += trace.totalMs;
      totalMsCount += 1;
    }
    if (trace.generationMs > 0) {
      generationMsSum += trace.generationMs;
      generationMsCount += 1;
    }

    const routeKey = trace.routePath || "unknown";
    routeCounts.set(routeKey, (routeCounts.get(routeKey) ?? 0) + 1);

    const modelKey = trace.answerModel || "unknown";
    modelCounts.set(modelKey, (modelCounts.get(modelKey) ?? 0) + 1);
  }

  return {
    sampleSize,
    groundedRate: roundMetric((groundedCount / sampleSize) * 100),
    fallbackRate: roundMetric((fallbackCount / sampleSize) * 100),
    reviewedRate: roundMetric((reviewedCount / sampleSize) * 100),
    topicCardRate: roundMetric((topicCardCount / sampleSize) * 100),
    questionBankRate: roundMetric((questionBankCount / sampleSize) * 100),
    avgTotalMs: totalMsCount ? roundMetric(totalMsSum / totalMsCount) : 0,
    avgGenerationMs: generationMsCount ? roundMetric(generationMsSum / generationMsCount) : 0,
    latestCapturedAt: rows[0]?.created_at ?? null,
    routeBreakdown: sortBreakdownDescending(routeCounts),
    modelBreakdown: sortBreakdownDescending(modelCounts),
  };
}

export async function listAdminAnswers(filters?: AdminAnswerListFilters): Promise<AdminListPage<AdminAnswerSummary>> {
  const supabase = createSupabaseAdminClient();
  const page = normalizePage(filters?.page);
  const pageSize = normalizePageSize(filters?.pageSize);
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  const status = filters?.status ?? "all";
  const q = filters?.q?.trim();
  const runListQuery = async (includeMetadata: boolean) => {
    let query = supabase
      .from("chat_messages")
      .select(withMetadataSelect(includeMetadata), { count: "exact" })
      .eq("role", "assistant");

    if (status === "reviewed") {
      query = query.not("admin_reviewed_at", "is", null);
    } else if (status === "flagged") {
      query = query.is("admin_reviewed_at", null).eq("feedback", "down");
    } else if (status === "liked") {
      query = query.is("admin_reviewed_at", null).eq("feedback", "up");
    } else if (status === "neutral") {
      query = query.is("admin_reviewed_at", null).is("feedback", null);
    }

    if (q) {
      const escaped = q.replace(/[%_]/g, "\\$&");
      query = query.ilike("content", `%${escaped}%`);
    }

    return query.order("created_at", { ascending: false }).range(from, to);
  };

  let { data: messageRows, error: messageError, count } = await runListQuery(true);
  if (messageError && isMissingMetadataColumnError(messageError)) {
    ({ data: messageRows, error: messageError, count } = await runListQuery(false));
  }

  if (messageError) throw messageError;

  const answers = (messageRows ?? []) as unknown as AdminAnswerMessageRow[];
  const sessionIds = [...new Set(answers.map((row) => row.session_id))];
  if (!sessionIds.length) {
    const total = count ?? 0;
    return {
      items: [],
      total,
      page,
      pageSize,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
    };
  }

  const { data: sessionRows, error: sessionError } = await supabase
    .from("chat_sessions")
    .select("id, user_id, title, subject_context")
    .in("id", sessionIds);

  if (sessionError) throw sessionError;

  const sessions = (sessionRows ?? []) as ChatSessionRow[];
  const sessionsById = new Map(sessions.map((session) => [session.id, session]));
  const userIds = [...new Set(sessions.map((session) => session.user_id))];

  const [{ data: profileRows, error: profileError }, authUsersById] = await Promise.all([
    supabase
      .from("student_profiles")
      .select("user_id, full_name, college, board, grade, subjects, target_grade, language_pref")
      .in("user_id", userIds),
    loadAuthUsersById(userIds),
  ]);

  if (profileError) throw profileError;

  const profilesByUserId = new Map(
    ((profileRows ?? []) as StudentProfileRow[]).map((profile) => [profile.user_id, profile]),
  );

  const items = answers.map((message) => {
    const session = sessionsById.get(message.session_id) ?? null;
    const profile = session ? profilesByUserId.get(session.user_id) ?? null : null;
    const authLookup = session ? authUsersById.get(session.user_id) ?? null : null;
    return buildSummary(message, session, profile, authLookup);
  });

  const total = count ?? items.length;
  return {
    items,
    total,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  };
}

export async function getAdminAnswerHealthSnapshot(
  filters?: Pick<AdminAnswerListFilters, "q" | "status"> & { sampleSize?: number },
) {
  const supabase = createSupabaseAdminClient();
  const status = filters?.status ?? "all";
  const q = filters?.q?.trim();
  const sampleSize = Math.max(25, Math.min(200, Math.floor(filters?.sampleSize ?? 120)));

  const runSnapshotQuery = async (includeMetadata: boolean) => {
    let query = supabase
      .from("chat_messages")
      .select(includeMetadata ? "id, created_at, grounded, feedback, admin_reviewed_at, metadata" : "id, created_at, grounded, feedback, admin_reviewed_at")
      .eq("role", "assistant");

    if (status === "reviewed") {
      query = query.not("admin_reviewed_at", "is", null);
    } else if (status === "flagged") {
      query = query.is("admin_reviewed_at", null).eq("feedback", "down");
    } else if (status === "liked") {
      query = query.is("admin_reviewed_at", null).eq("feedback", "up");
    } else if (status === "neutral") {
      query = query.is("admin_reviewed_at", null).is("feedback", null);
    }

    if (q) {
      const escaped = q.replace(/[%_]/g, "\\$&");
      query = query.ilike("content", `%${escaped}%`);
    }

    return query.order("created_at", { ascending: false }).limit(sampleSize);
  };

  let { data, error } = await runSnapshotQuery(true);
  if (error && isMissingMetadataColumnError(error)) {
    ({ data, error } = await runSnapshotQuery(false));
  }

  if (error) throw error;
  return buildAdminAnswerHealthSnapshot((data ?? []) as unknown as AdminAnswerHealthRow[]);
}

export async function getAdminAnswerDetail(messageId: string) {
  const supabase = createSupabaseAdminClient();
  const runDetailQuery = async (includeMetadata: boolean) =>
    supabase
      .from("chat_messages")
      .select(withMetadataSelect(includeMetadata))
      .eq("id", messageId)
      .eq("role", "assistant")
      .maybeSingle();

  let { data: messageRow, error: messageError } = await runDetailQuery(true);
  if (messageError && isMissingMetadataColumnError(messageError)) {
    ({ data: messageRow, error: messageError } = await runDetailQuery(false));
  }

  if (messageError) throw messageError;
  if (!messageRow) return null;

  const message = messageRow as unknown as AdminAnswerMessageRow;

  const { data: sessionRow, error: sessionError } = await supabase
    .from("chat_sessions")
    .select("id, user_id, title, subject_context")
    .eq("id", message.session_id)
    .maybeSingle();

  if (sessionError) throw sessionError;
  if (!sessionRow) return null;

  const session = sessionRow as ChatSessionRow;

  const [{ data: profileRow, error: profileError }, authUsersById, { data: conversationRows, error: conversationError }] =
    await Promise.all([
      supabase
        .from("student_profiles")
        .select("user_id, full_name, college, board, grade, subjects, target_grade, language_pref")
        .eq("user_id", session.user_id)
        .maybeSingle(),
      loadAuthUsersById([session.user_id]),
      (async () => {
        const runConversationQuery = async (includeMetadata: boolean) =>
          supabase
            .from("chat_messages")
            .select(withMetadataSelect(includeMetadata))
            .eq("session_id", session.id)
            .order("created_at", { ascending: true });

        let result = await runConversationQuery(true);
        if (result.error && isMissingMetadataColumnError(result.error)) {
          result = await runConversationQuery(false);
        }
        return result;
      })(),
    ]);

  if (profileError) throw profileError;
  if (conversationError) throw conversationError;

  const profile = (profileRow as StudentProfileRow | null) ?? null;
  const authLookup = authUsersById.get(session.user_id) ?? null;
  const summary = buildSummary(message, session, profile, authLookup);

  return {
    ...summary,
    content: message.content,
    language: message.language,
    citations: Array.isArray(message.citations) ? message.citations : [],
    subjects: normalizeSubjects(profile?.subjects ?? []),
    targetGrade: normalizeTargetGrade(profile?.target_grade ?? ""),
    languagePref: profile?.language_pref ?? "RN",
    answerTrace:
      message.metadata && typeof message.metadata === "object" && !Array.isArray(message.metadata)
        ? normalizeAnswerTrace((message.metadata as Record<string, unknown>).answer_trace)
        : null,
    conversation: ((conversationRows ?? []) as unknown as AdminAnswerMessageRow[]).map(
      normalizeConversationMessage,
    ),
  } satisfies AdminAnswerDetail;
}

export async function updateAdminAnswerReview(
  messageId: string,
  payload: {
    adminUserId: string;
    reviewed?: boolean;
    adminReviewNote?: string | null;
  },
) {
  const updatePayload: Record<string, unknown> = {};

  if (payload.reviewed !== undefined) {
    updatePayload.admin_reviewed_at = payload.reviewed ? new Date().toISOString() : null;
    updatePayload.admin_reviewed_by = payload.reviewed ? payload.adminUserId : null;
  }

  if (payload.adminReviewNote !== undefined) {
    const note = payload.adminReviewNote?.trim() ?? "";
    updatePayload.admin_review_note = note ? note : null;
  }

  if (!Object.keys(updatePayload).length) {
    throw new Error("No review changes were provided.");
  }

  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("chat_messages")
    .update(updatePayload)
    .eq("id", messageId)
    .eq("role", "assistant")
    .select("id")
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;
  return getAdminAnswerDetail(messageId);
}

export async function bulkUpdateAdminAnswerReview(
  messageIds: string[],
  payload: {
    adminUserId: string;
    reviewed: boolean;
    adminReviewNote?: string | null;
  },
) {
  const normalizedMessageIds = [...new Set(messageIds.map((id) => id.trim()).filter(Boolean))];
  if (!normalizedMessageIds.length) {
    throw new Error("No answer ids were provided for bulk review update.");
  }

  const updatePayload: Record<string, unknown> = {
    admin_reviewed_at: payload.reviewed ? new Date().toISOString() : null,
    admin_reviewed_by: payload.reviewed ? payload.adminUserId : null,
  };

  if (payload.adminReviewNote !== undefined) {
    const note = payload.adminReviewNote?.trim() ?? "";
    updatePayload.admin_review_note = note ? note : null;
  }

  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("chat_messages")
    .update(updatePayload)
    .eq("role", "assistant")
    .in("id", normalizedMessageIds)
    .select("id");

  if (error) throw error;

  return {
    updatedCount: data?.length ?? 0,
    messageIds: (data ?? []).map((row) => row.id as string),
  };
}
