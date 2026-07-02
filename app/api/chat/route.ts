import { createHash } from "node:crypto";
import { after, NextResponse } from "next/server";
import { z } from "zod";
import { canSpendCredits, CHAT_MESSAGE_CREDIT_COST, computeNextBalance } from "@/lib/billing";
import { resolveResponseLanguage } from "@/lib/chat-language-mode";
import { ensureStarterCreditsForUser, getCreditBalanceForUser } from "@/lib/data/billing";
import { normalizeBoard, normalizeBoardScore, normalizeCollege, normalizeFullName, normalizeGrade, normalizeSubjectLabel, normalizeSubjects, normalizeTargetGrade } from "@/lib/profile-normalization";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { chatTenant, listTenantSubjects, type TenantChatSource, type TenantSubject } from "@/lib/tenant/client";
import { deriveSessionTitle } from "@/lib/utils";
import type { AssistantAnswerTrace, AssistantCitation } from "@/lib/types";

type RetrievalMode = "default" | "web";
type ResponseLanguage = "EN" | "RN";

const requestSchema = z.object({
  sessionId: z.string().uuid().nullable().optional(),
  language: z.enum(["EN", "RN"]).default("EN"),
  messageLanguage: z.enum(["EN", "RN"]).optional(),
  answerStyle: z.enum(["simple", "balanced", "detailed"]).optional(),
  retrievalMode: z.enum(["default", "web"]).optional(),
  subjectContext: z.string().trim().min(1).max(120).nullable().optional(),
  tenantSubject: z
    .object({
      name: z.string().trim().min(1).max(160),
      slug: z.string().trim().min(1).max(200),
      namespaceSlug: z.string().trim().min(1).max(200),
      folderPath: z.string().trim().min(1).max(800),
    })
    .nullable()
    .optional(),
  messages: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string(),
      }),
    )
    .min(1),
});

function toDataStreamPayload(text: string) {
  return `0:${JSON.stringify(text)}\ne:{"finishReason":"stop","usage":{"promptTokens":0,"completionTokens":0},"isContinued":false}\n`;
}

function errorToDebugMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (error && typeof error === "object" && "message" in error) return String(error.message);
  return String(error);
}

function hashDebugValue(value: unknown) {
  return createHash("sha256")
    .update(typeof value === "string" ? value : JSON.stringify(value))
    .digest("hex")
    .slice(0, 16);
}

function summarizeTenantFailure(error: unknown) {
  const normalized = errorToDebugMessage(error).toLowerCase();
  if (normalized.includes("timeout") || normalized.includes("timed out") || normalized.includes("deadline")) {
    return "timeout";
  }
  if (normalized.includes("401") || normalized.includes("403") || normalized.includes("unauthorized")) {
    return "auth";
  }
  if (normalized.includes("404") || normalized.includes("not found")) {
    return "not_found";
  }
  return "unknown";
}

function logTenantChatDebug(
  stage: string,
  details: Record<string, unknown>,
  error?: unknown,
) {
  const payload = {
    stage,
    ...details,
    ...(error ? { error: errorToDebugMessage(error) } : {}),
  };

  if (error || stage.includes("failed") || stage.includes("not_matched") || stage.includes("empty_answer")) {
    console.error("[TENANT_CHAT]", payload);
    return;
  }

  console.log("[TENANT_CHAT]", payload);
}

function normalizeTenantSubjectFromRequest(
  tenantSubject: NonNullable<z.infer<typeof requestSchema>["tenantSubject"]>,
): TenantSubject {
  const namespaceFromPath = tenantSubject.folderPath.split("/")[0]?.trim();

  return {
    name: tenantSubject.name,
    slug: tenantSubject.slug,
    namespace: namespaceFromPath || tenantSubject.namespaceSlug,
    namespace_slug: tenantSubject.namespaceSlug,
    full_path: `nano-syllabus/${tenantSubject.folderPath}`,
    folder_path: tenantSubject.folderPath,
    chunk_count: 0,
  };
}

function matchesRequestedSubject(subject: TenantSubject, requestedSubject: string | null) {
  if (!requestedSubject?.trim()) return true;
  return normalizeSubjectLabel(subject.name) === normalizeSubjectLabel(requestedSubject);
}

async function resolveTenantSubjectForChat({
  requestedSubject,
  profileSubjects,
  tenantSubject,
}: {
  requestedSubject: string | null;
  profileSubjects: string[];
  tenantSubject?: NonNullable<z.infer<typeof requestSchema>["tenantSubject"]> | null;
}) {
  const normalizedProfileSubjects = new Set(profileSubjects.map((subject) => normalizeSubjectLabel(subject)));

  if (tenantSubject) {
    const normalizedTenantSubjectName = normalizeSubjectLabel(tenantSubject.name);
    const requestedMatches = !requestedSubject || normalizeSubjectLabel(requestedSubject) === normalizedTenantSubjectName;
    const profileMatches = normalizedProfileSubjects.size === 0 || normalizedProfileSubjects.has(normalizedTenantSubjectName);

    if (requestedMatches && profileMatches) {
      const match = normalizeTenantSubjectFromRequest(tenantSubject);
      return {
        match,
        scopedSubjects: [match],
        source: "request_metadata" as const,
      };
    }
  }

  const tenantSubjects = await listTenantSubjects();
  const scopedSubjects = tenantSubjects.filter((subject) =>
    normalizedProfileSubjects.size === 0
      ? matchesRequestedSubject(subject, requestedSubject)
      : normalizedProfileSubjects.has(normalizeSubjectLabel(subject.name)),
  );
  const match =
    scopedSubjects.find((subject) => matchesRequestedSubject(subject, requestedSubject)) ??
    (scopedSubjects.length === 1 ? scopedSubjects[0] : null);

  return {
    match,
    scopedSubjects,
    source: "tenant_subjects_lookup" as const,
  };
}

function normalizeContextSummary(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function hasMissingColumnError(error: { message?: string; details?: string } | null, columnName: string) {
  const message = `${error?.message ?? ""} ${error?.details ?? ""}`.toLowerCase();
  return message.includes("column") && message.includes(columnName.toLowerCase());
}

async function getLatestTenantContextSummaryFromMessageMetadata({
  supabase,
  sessionId,
}: {
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>;
  sessionId: string | null;
}) {
  if (!sessionId) return "";

  const { data } = await supabase
    .from("chat_messages")
    .select("metadata")
    .eq("session_id", sessionId)
    .eq("role", "assistant")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const metadata =
    data?.metadata && typeof data.metadata === "object" && !Array.isArray(data.metadata)
      ? (data.metadata as Record<string, unknown>)
      : null;

  return normalizeContextSummary(metadata?.tenant_context_summary);
}

async function getLatestTenantContextSummary({
  supabase,
  sessionId,
}: {
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>;
  sessionId: string | null;
}) {
  if (!sessionId) return "";

  const { data, error } = await supabase
    .from("chat_sessions")
    .select("last_context_summary")
    .eq("id", sessionId)
    .maybeSingle();

  if (!error) {
    const sessionRow =
      data && typeof data === "object" && !Array.isArray(data)
        ? (data as { last_context_summary?: unknown })
        : null;
    return normalizeContextSummary(sessionRow?.last_context_summary);
  }

  return getLatestTenantContextSummaryFromMessageMetadata({
    supabase,
    sessionId,
  });
}

async function persistSessionContextSummary({
  supabase,
  sessionId,
  userId,
  contextSummary,
}: {
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>;
  sessionId: string;
  userId: string;
  contextSummary: string;
}) {
  const { error } = await supabase
    .from("chat_sessions")
    .update({
      last_context_summary: normalizeContextSummary(contextSummary),
    })
    .eq("id", sessionId)
    .eq("user_id", userId);

  return {
    ok: !error,
    error,
    missingColumn: hasMissingColumnError(error, "last_context_summary"),
  };
}

function buildTenantCitations({
  subjectName,
  folderPath,
  sources,
}: {
  subjectName: string;
  folderPath: string;
  sources?: TenantChatSource[];
}): AssistantCitation[] {
  return (sources ?? []).map((source, index) => {
    const sourceTitle = source.title || source.source_path || folderPath;
    return {
      chunkId: `tenant-${index}`,
      documentId: source.source_path || folderPath,
      sourceType: "syllabus" as const,
      sourceLabel: sourceTitle,
      sourceTitle,
      sourceName: source.source_path || folderPath,
      subject: source.subject || subjectName,
      chapter: source.semester ?? null,
      topic: null,
      excerpt: source.excerpt,
    };
  });
}

function buildAnswerTrace(input: AssistantAnswerTrace): AssistantAnswerTrace {
  return input;
}

function shouldRetryAssistantInsertWithoutMetadata(error: { message?: string; details?: string } | null) {
  const message = `${error?.message ?? ""} ${error?.details ?? ""}`.toLowerCase();
  return Boolean(message && (message.includes("metadata") || message.includes("column")));
}

async function persistAssistantCompletion({
  supabase,
  sessionId,
  userId,
  answer,
  language,
  citations,
  subjectTags,
  subjectContext,
  answerTrace,
  contextSummary,
}: {
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>;
  sessionId: string;
  userId: string;
  answer: string;
  language: ResponseLanguage;
  citations: AssistantCitation[];
  subjectTags: string[];
  subjectContext: string | null;
  answerTrace: AssistantAnswerTrace;
  contextSummary: string;
}) {
  const basePayload = {
    session_id: sessionId,
    role: "assistant" as const,
    content: answer,
    language,
    grounded: citations.length > 0,
    citations,
    follow_up_suggestions: [],
  };

  const attempt = await supabase
    .from("chat_messages")
    .insert({
      ...basePayload,
      metadata: {
        answer_trace: answerTrace,
        tenant_context_summary: contextSummary,
      },
    })
    .select("id")
    .single();

  let assistantMessage = attempt.data;
  let assistantError = attempt.error;

  if (!assistantMessage && shouldRetryAssistantInsertWithoutMetadata(assistantError)) {
    const metadataFreeAttempt = await supabase
      .from("chat_messages")
      .insert(basePayload)
      .select("id")
      .single();
    assistantMessage = metadataFreeAttempt.data;
    assistantError = metadataFreeAttempt.error;
  }

  if (assistantError || !assistantMessage) {
    return null;
  }

  await supabase
    .from("chat_sessions")
    .update({
      updated_at: new Date().toISOString(),
      subject_tags: subjectTags,
      subject_context: subjectContext,
    })
    .eq("id", sessionId);

  const latestBalance = await getCreditBalanceForUser(userId);
  const nextBalance = computeNextBalance(latestBalance, -CHAT_MESSAGE_CREDIT_COST);

  const { error: chargeError } = await supabase.from("credits_ledger").insert({
    user_id: userId,
    type: "usage",
    amount: -CHAT_MESSAGE_CREDIT_COST,
    balance_after: Math.max(nextBalance, 0),
    reference_type: "chat_message",
    reference_id: assistantMessage.id,
    description: "Credit used for successful assistant response",
  });

  if (chargeError && chargeError.code !== "23505") {
    console.error("Failed to record credit usage", chargeError);
  }

  return assistantMessage.id;
}

async function resolveChatSession({
  supabase,
  userId,
  sessionId,
  question,
  subjectContext,
}: {
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>;
  userId: string;
  sessionId: string | null;
  question: string;
  subjectContext: string | null;
}) {
  if (sessionId) {
    const { data: sessionRow } = await supabase
      .from("chat_sessions")
      .select("id, subject_tags, subject_context")
      .eq("id", sessionId)
      .eq("user_id", userId)
      .maybeSingle();

    if (!sessionRow) {
      throw new Error("Chat session not found.");
    }

    return {
      id: sessionRow.id as string,
      subjectContext: sessionRow.subject_context
        ? normalizeSubjectLabel(sessionRow.subject_context)
        : subjectContext,
    };
  }

  const { data: insertedSession, error: sessionError } = await supabase
    .from("chat_sessions")
    .insert({
      user_id: userId,
      title: deriveSessionTitle(question, subjectContext),
      subject_context: subjectContext,
      subject_tags: subjectContext ? [subjectContext] : [],
    })
    .select("id, subject_context")
    .single();

  if (sessionError || !insertedSession) {
    throw new Error("Failed to create chat session.");
  }

  return {
    id: insertedSession.id as string,
    subjectContext: insertedSession.subject_context ?? subjectContext,
  };
}

export async function POST(request: Request) {
  const requestStartedAt = Date.now();
  const requestId = `chat_${requestStartedAt}_${Math.random().toString(36).slice(2, 8)}`;
  let generationMs = 0;

  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const parsed = requestSchema.parse(await request.json());
    const retrievalMode: RetrievalMode = parsed.retrievalMode ?? "default";
    const resolvedLanguage = resolveResponseLanguage({
      chatLanguage: parsed.language,
      messageLanguage: parsed.messageLanguage,
    });
    const latestUserMessage = [...parsed.messages].reverse().find((message) => message.role === "user");
    const question = latestUserMessage?.content.trim() ?? "";
    const questionHash = hashDebugValue(question);

    if (!question) {
      return NextResponse.json({ error: "Message content is required." }, { status: 400 });
    }

    const { data: profileRow } = await supabase
      .from("student_profiles")
      .select("*")
      .eq("user_id", user.id)
      .maybeSingle();

    if (!profileRow) {
      return NextResponse.json({ error: "Onboarding required." }, { status: 400 });
    }

    const currentBalance = await ensureStarterCreditsForUser(user.id);
    if (!canSpendCredits(currentBalance)) {
      return NextResponse.json(
        { error: "No credits left. Buy a plan to continue chatting." },
        { status: 402 },
      );
    }

    const profile = {
      fullName: normalizeFullName(profileRow.full_name ?? ""),
      college: normalizeCollege(profileRow.college ?? ""),
      board: normalizeBoard(profileRow.board ?? ""),
      grade: normalizeGrade(profileRow.grade ?? ""),
      boardScore: profileRow.board_score ? normalizeBoardScore(profileRow.board_score) : null,
      subjects: normalizeSubjects(profileRow.subjects ?? []),
      targetGrade: normalizeTargetGrade(profileRow.target_grade ?? ""),
    };
    void profile.fullName;
    void profile.college;
    void profile.board;
    void profile.grade;
    void profile.boardScore;
    void profile.targetGrade;

    const requestedSubject = parsed.subjectContext ? normalizeSubjectLabel(parsed.subjectContext) : null;

    const subjectLookupStartedAt = Date.now();

    logTenantChatDebug("tenant_subject_lookup_started", {
      requestId,
      retrievalMode,
      requestedSubject,
      questionHash,
      profileSubjectCount: profile.subjects.length,
      hasTenantSubjectMetadata: Boolean(parsed.tenantSubject),
    });

    let tenantSubjectResolution: Awaited<ReturnType<typeof resolveTenantSubjectForChat>>;
    try {
      tenantSubjectResolution = await resolveTenantSubjectForChat({
        requestedSubject,
        profileSubjects: profile.subjects,
        tenantSubject: parsed.tenantSubject ?? null,
      });
    } catch (error) {
      logTenantChatDebug(
        "tenant_subject_lookup_failed",
        {
          requestId,
          requestedSubject,
          profileSubjects: profile.subjects,
          lookupMs: Date.now() - subjectLookupStartedAt,
        },
        error,
      );
      return NextResponse.json(
        {
          error: "Tenant subject lookup failed.",
          code: "TENANT_SUBJECT_LOOKUP_FAILED",
          requestId,
        },
        { status: 502 },
      );
    }

    const { match: tenantSubject, scopedSubjects } = tenantSubjectResolution;

    logTenantChatDebug("tenant_subject_lookup_succeeded", {
      requestId,
      requestedSubject,
      lookupMs: Date.now() - subjectLookupStartedAt,
      source: tenantSubjectResolution.source,
      scopedSubjectCount: scopedSubjects.length,
      matchedSubject: tenantSubject?.name ?? null,
    });

    if (!tenantSubject) {
      logTenantChatDebug("tenant_subject_not_matched", {
        requestId,
        requestedSubject,
        profileSubjects: profile.subjects,
        scopedSubjects: scopedSubjects.map((subject) => subject.name),
      });
      return NextResponse.json(
        {
          error: "Selected subject could not be matched to a tenant subject in your current semester scope.",
          code: "TENANT_SUBJECT_NOT_MATCHED",
          requestId,
        },
        { status: 400 },
      );
    }

    const sessionSubjectContext = normalizeSubjectLabel(tenantSubject.name);
    const tenantNamespaces = [tenantSubject.namespace || tenantSubject.namespace_slug];
    const sessionPromise = resolveChatSession({
      supabase,
      userId: user.id,
      sessionId: parsed.sessionId ?? null,
      question,
      subjectContext: sessionSubjectContext,
    });
    const contextSummaryPromise = getLatestTenantContextSummary({
      supabase,
      sessionId: parsed.sessionId ?? null,
    });

    let contextSummary = "";
    let session: Awaited<typeof sessionPromise>;
    try {
      [session, contextSummary] = await Promise.all([sessionPromise, contextSummaryPromise]);
    } catch (error) {
      logTenantChatDebug(
        "tenant_session_or_context_failed",
        {
          requestId,
          requestedSessionId: parsed.sessionId ?? null,
          requestedSubject,
        },
        error,
      );
      return NextResponse.json(
        {
          error: errorToDebugMessage(error),
          code: "TENANT_SESSION_CONTEXT_FAILED",
          requestId,
        },
        { status: 400 },
      );
    }

    const tenantStartedAt = Date.now();
    logTenantChatDebug("tenant_chat_started", {
      requestId,
      retrievalMode,
      subject: tenantSubject.name,
      subjectName: tenantSubject.name,
      folderPath: tenantSubject.folder_path,
      namespace: tenantSubject.namespace_slug,
      contextSummaryHash: contextSummary ? hashDebugValue(contextSummary) : null,
      contextSummaryLength: contextSummary.length,
      question,
      questionHash,
      payloadHash: hashDebugValue({
        question,
        context_summary: contextSummary,
        subject: tenantSubject.name,
        tenant: "nano-syllabus",
        namespaces: tenantNamespaces,
        top_k: 8,
      }),
      promptLength: question.length,
    });

    const tenantPromise = chatTenant({
      question,
      contextSummary,
      subject: tenantSubject.name,
      tenant: "nano-syllabus",
      namespaces: tenantNamespaces,
      topK: 8,
    });

    let tenantResponse: Awaited<typeof tenantPromise>;
    try {
      tenantResponse = await tenantPromise;
      generationMs = Date.now() - tenantStartedAt;
    } catch (error) {
      generationMs = Date.now() - tenantStartedAt;
      const failureReason = summarizeTenantFailure(error);
      logTenantChatDebug(
        "tenant_chat_failed",
        {
          requestId,
          sessionId: session.id,
          subject: tenantSubject.name,
          subjectName: tenantSubject.name,
          folderPath: tenantSubject.folder_path,
          namespace: tenantSubject.namespace_slug,
          contextSummaryHash: contextSummary ? hashDebugValue(contextSummary) : null,
          contextSummaryLength: contextSummary.length,
          question,
          questionHash,
          promptLength: question.length,
          failureReason,
          generationMs,
        },
        error,
      );
      return NextResponse.json(
        {
          error: failureReason === "timeout" ? "Tenant answer API timed out. Please retry once." : errorToDebugMessage(error),
          code: failureReason === "timeout" ? "TENANT_PROMPT_TIMEOUT" : "TENANT_PROMPT_FAILED",
          requestId,
        },
        { status: failureReason === "not_found" ? 404 : 502 },
      );
    }

    const answer = (tenantResponse.answer || "").trim();
    if (!answer) {
      logTenantChatDebug("tenant_empty_answer", {
        requestId,
        sessionId: session.id,
        subject: tenantSubject.name,
        subjectName: tenantSubject.name,
        folderPath: tenantSubject.folder_path,
        namespace: tenantSubject.namespace_slug,
        question,
        questionHash,
        promptLength: question.length,
        detail: tenantResponse.detail ?? null,
        citationCount: Array.isArray(tenantResponse.sources) ? tenantResponse.sources.length : 0,
        responseKeys: Object.keys(tenantResponse),
      });
      return NextResponse.json(
        {
          error: "Tenant API returned no answer.",
          code: "TENANT_EMPTY_ANSWER",
          requestId,
        },
        { status: 502 },
      );
    }

    const returnedContextSummary = normalizeContextSummary(tenantResponse.context_summary);

    logTenantChatDebug("tenant_chat_succeeded", {
      requestId,
      sessionId: session.id,
      subject: tenantSubject.name,
      subjectName: tenantSubject.name,
      questionHash,
      payloadHash: hashDebugValue({
        question,
        context_summary: contextSummary,
        subject: tenantSubject.name,
        tenant: "nano-syllabus",
        namespaces: tenantNamespaces,
        top_k: 8,
      }),
      generationMs,
      answerLength: answer.length,
      citationCount: Array.isArray(tenantResponse.sources) ? tenantResponse.sources.length : 0,
      chunksRetrieved: tenantResponse.chunks_retrieved ?? null,
      servedFrom: tenantResponse.served_from ?? null,
      returnedContextSummaryHash: returnedContextSummary ? hashDebugValue(returnedContextSummary) : null,
      returnedContextSummaryLength: returnedContextSummary.length,
    });

    const citations = buildTenantCitations({
      subjectName: tenantSubject.name,
      folderPath: tenantSubject.folder_path,
      sources: tenantResponse.sources,
    });

    const sessionContextPersist = await persistSessionContextSummary({
      supabase,
      sessionId: session.id,
      userId: user.id,
      contextSummary: returnedContextSummary,
    });

    if (!sessionContextPersist.ok && !sessionContextPersist.missingColumn) {
      logTenantChatDebug("tenant_session_context_persist_failed", {
        requestId,
        sessionId: session.id,
        subject: tenantSubject.name,
        subjectName: tenantSubject.name,
        contextSummaryHash: returnedContextSummary ? hashDebugValue(returnedContextSummary) : null,
        contextSummaryLength: returnedContextSummary.length,
      }, sessionContextPersist.error);
    }

    const totalMs = Date.now() - requestStartedAt;
    const subjectTags = [session.subjectContext ?? sessionSubjectContext];
    const answerTrace = buildAnswerTrace({
      routePath: "tenant_chat",
      routeScopeDebug: tenantSubject.folder_path,
      retrievalMode,
      answerMode: "tenant_chat",
      answerModeReason: "raw_question_and_context_summary_sent_to_tenant",
      matchedScope: tenantSubject.name,
      answerModel: "tenant:/api/chat",
      grounded: citations.length > 0,
      citationCount: citations.length,
      lookupMs: 0,
      generationMs,
      rewriteMs: 0,
      followupMs: 0,
      totalMs,
    });

    after(async () => {
      const persistStartedAt = Date.now();
      const { error: userMessageError } = await supabase.from("chat_messages").insert({
        session_id: session.id,
        role: "user",
        content: question,
        language: resolvedLanguage,
      });

      if (userMessageError) {
        logTenantChatDebug(
          "user_message_persist_failed_after_response",
          {
            requestId,
            sessionId: session.id,
            subject: tenantSubject.name,
            subjectName: tenantSubject.name,
            persistMs: Date.now() - persistStartedAt,
          },
          userMessageError,
        );
        return;
      }

      const assistantMessageId = await persistAssistantCompletion({
        supabase,
        sessionId: session.id,
        userId: user.id,
        answer,
        language: resolvedLanguage,
        citations,
        subjectTags,
        subjectContext: session.subjectContext ?? sessionSubjectContext,
        answerTrace,
        contextSummary: returnedContextSummary,
      });

      if (!assistantMessageId) {
        logTenantChatDebug("assistant_message_persist_failed_after_response", {
          requestId,
          sessionId: session.id,
          subject: tenantSubject.name,
          subjectName: tenantSubject.name,
          persistMs: Date.now() - persistStartedAt,
        });
        return;
      }

      logTenantChatDebug("tenant_persist_succeeded_after_response", {
        requestId,
        sessionId: session.id,
        subject: tenantSubject.name,
        subjectName: tenantSubject.name,
        assistantMessageId,
        persistMs: Date.now() - persistStartedAt,
        contextSummaryHash: returnedContextSummary ? hashDebugValue(returnedContextSummary) : null,
        contextSummaryLength: returnedContextSummary.length,
      });
    });

    return new Response(toDataStreamPayload(answer), {
      status: 200,
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "x-session-id": session.id,
        "x-request-id": requestId,
        "x-tenant-grounded": citations.length > 0 ? "1" : "0",
        "x-tenant-citations": String(citations.length),
        "x-tenant-chunks-retrieved": String(tenantResponse.chunks_retrieved ?? citations.length),
        "x-tenant-served-from": tenantResponse.served_from ?? "",
        "x-retrieval-mode": retrievalMode,
        "x-subject-context": session.subjectContext ?? sessionSubjectContext,
        "x-thinking-enabled": "0",
        "x-answer-mode": "tenant_chat",
        "x-answer-mode-reason": "raw_question_and_context_summary_sent_to_tenant",
        "x-answer-model": "tenant:/api/chat",
        "x-matched-scope": tenantSubject.name,
        "x-route-path": "tenant_chat",
        "x-route-scope-debug": tenantSubject.folder_path,
        "x-history-strategy": "tenant_context_summary",
        "x-history-messages": "1",
        "x-tenant-lookup-ms": "0",
        "x-generation-ms": String(generationMs),
        "x-question-sha": questionHash,
        "x-payload-sha": hashDebugValue({
          question,
          context_summary: contextSummary,
          subject: tenantSubject.name,
          tenant: "nano-syllabus",
          namespaces: tenantNamespaces,
          top_k: 8,
        }),
        "x-subject-slug": tenantSubject.slug,
        "x-namespace-slug": tenantSubject.namespace_slug,
        "x-tenant-context-summary": returnedContextSummary ? "1" : "0",
        "x-tenant-context-summary-length": String(returnedContextSummary.length),
        "x-rewrite-ms": "0",
        "x-followup-ms": "0",
        "x-total-ms": String(totalMs),
      },
    });
  } catch (error) {
    console.error("Chat route failed", error);
    return NextResponse.json(
      {
        error: errorToDebugMessage(error) || "Unexpected server error while processing chat.",
        requestId,
      },
      { status: 500 },
    );
  }
}
