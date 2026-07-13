import { createHash } from "node:crypto";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
import { z } from "zod";
import { canSpendCredits, CHAT_MESSAGE_CREDIT_COST, computeNextBalance } from "@/lib/billing";
import { resolveResponseLanguage } from "@/lib/chat-language-mode";
import { ensureStarterCreditsForUser, getCreditBalanceForUser } from "@/lib/data/billing";
import { normalizeBoard, normalizeBoardScore, normalizeCollege, normalizeFullName, normalizeGrade, normalizeSubjectLabel, normalizeSubjects, normalizeTargetGrade } from "@/lib/profile-normalization";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { chatTenantStream, listTenantSubjects, type TenantChatSource, type TenantSubject, type TenantTokenUsage } from "@/lib/tenant/client";
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
  truncateFromId: z.string().optional(),
  messages: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string(),
        createdAt: z.string().optional(),
        attachments: z
          .array(
            z.object({
              id: z.string().trim().min(1).max(120),
              name: z.string().trim().min(1).max(180),
              mimeType: z.string().trim().min(1).max(120).refine((value) => value.startsWith("image/")),
              size: z.number().int().nonnegative().max(5 * 1024 * 1024),
              dataUrl: z.string().trim().min(1).max(7_000_000).refine((value) => value.startsWith("data:image/")),
            }),
          )
          .max(4)
          .optional(),
      }),
    )
    .min(1),
});

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
  tenantSubject,
}: {
  requestedSubject: string | null;
  tenantSubject?: NonNullable<z.infer<typeof requestSchema>["tenantSubject"]> | null;
}) {
  if (tenantSubject) {
    const normalizedTenantSubjectName = normalizeSubjectLabel(tenantSubject.name);
    const requestedMatches = !requestedSubject || normalizeSubjectLabel(requestedSubject) === normalizedTenantSubjectName;

    if (requestedMatches) {
      const match = normalizeTenantSubjectFromRequest(tenantSubject);
      return {
        match,
        scopedSubjects: [match],
        source: "request_metadata" as const,
      };
    }
  }

  const tenantSubjects = await listTenantSubjects();
  const scopedSubjects = requestedSubject
    ? tenantSubjects.filter((subject) => matchesRequestedSubject(subject, requestedSubject))
    : tenantSubjects;
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

function normalizeRequestAttachments(
  attachments: NonNullable<z.infer<typeof requestSchema>["messages"][number]["attachments"]> | undefined,
) {
  return (attachments ?? []).map((attachment) => ({
    id: attachment.id,
    name: attachment.name,
    mimeType: attachment.mimeType,
    size: attachment.size,
    dataUrl: attachment.dataUrl,
  }));
}

function hasMissingColumnError(error: { message?: string; details?: string } | null, columnName: string) {
  const message = `${error?.message ?? ""} ${error?.details ?? ""}`.toLowerCase();
  return message.includes("column") && message.includes(columnName.toLowerCase());
}

function normalizeTokenUsage(usage?: TenantTokenUsage | null): TenantTokenUsage {
  const inputTokens = usage?.inputTokens ?? 0;
  const outputTokens = usage?.outputTokens ?? 0;
  const totalTokens = usage?.totalTokens ?? inputTokens + outputTokens;

  return {
    inputTokens,
    outputTokens,
    totalTokens,
  };
}

function shouldRetryMessageInsertWithoutTokenUsage(error: { message?: string; details?: string } | null) {
  const message = `${error?.message ?? ""} ${error?.details ?? ""}`.toLowerCase();
  return Boolean(
    message &&
      message.includes("column") &&
      (message.includes("input_tokens") ||
        message.includes("output_tokens") ||
        message.includes("total_tokens")),
  );
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

function buildAnswerInstruction({
  language,
  subjectName,
  grade,
  board,
  hasAttachments = false,
}: {
  language: ResponseLanguage;
  subjectName: string;
  grade: string;
  board: string;
  hasAttachments?: boolean;
}) {
  const languageRule =
    language === "EN"
      ? "Answer in English."
      : "Answer in Roman Nepali.";

  return [
    "You are an expert IOE Electronics and Communication Engineering professor and exam mentor.",
    `Teach the subject: ${subjectName}.`,
    board ? `Academic authority/context: ${board}.` : null,
    grade ? `Target level: ${grade}.` : "Target level: IOE Bachelor engineering students.",
    "Use the retrieved syllabus/source context as the authority.",
    hasAttachments
      ? "When images or files are attached, read/extract the attachment content first and use it as the primary input for this turn. If the attachment is readable, explain or answer the visible attachment content even when syllabus retrieval is sparse."
      : null,
    "Give a deep, clear, exam-ready answer: short and direct for simple questions; detailed, step-by-step, and concept-first for theory, derivations, design, and numerical questions.",
    "When relevant, include definition, core idea, working/principle, formulas, truth table or table, diagram description, key points, applications, and a concise conclusion.",
    "Use headings and bullets for readability, and keep explanations student-friendly without losing technical accuracy.",
    "For ALL mathematical formulas, equations, and derivations, ALWAYS wrap them in double dollar signs ($$ ... $$) on their own separate lines so they render as centered blocks. Use single dollar signs ($ ... $) ONLY for small inline variables within text.",
    "Never use \\[ or \\( for math, only use $$ and $.",
    "Do not invent chapters, marks, syllabus units, references, or facts not supported by the retrieved context or readable attachment content.",
    "If neither the provided source context nor the readable attachment content contains enough information, clearly say that the provided context does not contain enough information.",
    languageRule,
  ]
    .filter(Boolean)
    .join(" ");
}

function toSse(event: string, payload: unknown) {
  return `event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`;
}

function shouldRetryAssistantInsertWithoutMetadata(error: { message?: string; details?: string } | null) {
  const message = `${error?.message ?? ""} ${error?.details ?? ""}`.toLowerCase();
  return Boolean(message && message.includes("column") && message.includes("metadata"));
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
  tokenUsage,
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
  tokenUsage: TenantTokenUsage;
}) {
  const normalizedTokenUsage = normalizeTokenUsage(tokenUsage);
  const basePayload = {
    session_id: sessionId,
    role: "assistant" as const,
    content: answer,
    language,
    grounded: citations.length > 0,
    citations,
    follow_up_suggestions: [],
    input_tokens: normalizedTokenUsage.inputTokens,
    output_tokens: normalizedTokenUsage.outputTokens,
    total_tokens: normalizedTokenUsage.totalTokens,
  };

  const attempt = await supabase
    .from("chat_messages")
    .insert({
      ...basePayload,
      metadata: {
        answer_trace: answerTrace,
        tenant_context_summary: contextSummary,
        tenant_token_usage: normalizedTokenUsage,
      },
    })
    .select("id")
    .single();

  let assistantMessage = attempt.data;
  let assistantError = attempt.error;

  if (
    !assistantMessage &&
    (shouldRetryAssistantInsertWithoutMetadata(assistantError) ||
      shouldRetryMessageInsertWithoutTokenUsage(assistantError))
  ) {
    const { input_tokens, output_tokens, total_tokens, ...tokenFreeBasePayload } = basePayload;
    void input_tokens;
    void output_tokens;
    void total_tokens;
    const retryPayload = shouldRetryMessageInsertWithoutTokenUsage(assistantError)
      ? tokenFreeBasePayload
      : basePayload;
    const metadataFreeAttempt = await supabase
      .from("chat_messages")
      .insert(retryPayload)
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
    const latestUserAttachments = normalizeRequestAttachments(latestUserMessage?.attachments);
    const questionHash = hashDebugValue(question);

    if (!question && latestUserAttachments.length === 0) {
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
          error: "Selected subject could not be matched to an available tenant subject.",
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
      question: question || "Image attachment",
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

    const tenantContextSummary = normalizeContextSummary(contextSummary);
    const hasAttachments = latestUserAttachments.length > 0;
    const tenantQuestion =
      question ||
      "Read the attached image and explain the visible content clearly. If it contains notes, a diagram, or a question, answer based on that image.";
    const tenantQuestionHash = hashDebugValue(tenantQuestion);

    const answerInstruction = buildAnswerInstruction({
      language: resolvedLanguage,
      subjectName: tenantSubject.name,
      grade: profile.grade,
      board: profile.board,
      hasAttachments,
    });
    const tenantStartedAt = Date.now();
    logTenantChatDebug("tenant_chat_started", {
      requestId,
      retrievalMode,
      responseLanguage: resolvedLanguage,
      subject: tenantSubject.name,
      subjectName: tenantSubject.name,
      folderPath: tenantSubject.folder_path,
      namespace: tenantSubject.namespace_slug,
      contextSummaryHash: tenantContextSummary ? hashDebugValue(tenantContextSummary) : null,
      contextSummaryLength: tenantContextSummary.length,
      question: tenantQuestion,
      questionHash: tenantQuestionHash,
      attachmentCount: latestUserAttachments.length,
      transport: hasAttachments ? "multipart/form-data" : "application/json",
      payloadHash: hashDebugValue({
        question: tenantQuestion,
        context_summary: tenantContextSummary,
        answer_instruction: answerInstruction,
        subject: tenantSubject.name,
        tenant: "nano-syllabus",
        namespaces: tenantNamespaces,
        top_k: 8,
        attachment_count: latestUserAttachments.length,
      }),
      promptLength: tenantQuestion.length,
    });

    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        void (async () => {
        const encoder = new TextEncoder();
        const enqueue = (event: string, payload: unknown) => {
          controller.enqueue(encoder.encode(toSse(event, payload)));
        };

        const answerParts: string[] = [];
        let tenantSources: TenantChatSource[] = [];
        let returnedContextSummary = "";
        let chunksRetrieved: number | null = null;
        let servedFrom: string | null = null;
        let tenantTokenUsage = normalizeTokenUsage(null);

        try {
          enqueue("status", {
            message: "Connecting to syllabus stream...",
          });

          await chatTenantStream(
            {
              question: tenantQuestion,
              answerInstruction,
              contextSummary: tenantContextSummary,
              subject: tenantSubject.name,
              tenant: "nano-syllabus",
              namespaces: tenantNamespaces,
              topK: 8,
              attachments: latestUserAttachments,
            },
            (event) => {
              if (event.type === "status") {
                enqueue("status", {
                  message: event.message,
                  query: event.query,
                  served_from: event.served_from,
                });
                return;
              }

              if (event.type === "token") {
                answerParts.push(event.text);
                enqueue("token", { text: event.text });
                return;
              }

              if (event.type === "sources") {
                tenantSources = event.sources;
                chunksRetrieved = event.chunks_retrieved ?? null;
                servedFrom = event.served_from ?? null;
                returnedContextSummary = normalizeContextSummary(event.context_summary);
                enqueue("sources", {
                  sources: tenantSources,
                  chunks_retrieved: chunksRetrieved,
                  served_from: servedFrom,
                  context_summary: returnedContextSummary ? "1" : "0",
                });
                return;
              }

              if (event.type === "error") {
                enqueue("error", { message: event.message });
                return;
              }

              if (event.type === "done") {
                tenantTokenUsage = normalizeTokenUsage(event.usage);
              }
            },
          );

          generationMs = Date.now() - tenantStartedAt;
          const answer = answerParts.join("").trim();
          if (!answer) {
            logTenantChatDebug("tenant_empty_answer", {
              requestId,
              sessionId: session.id,
              subject: tenantSubject.name,
              subjectName: tenantSubject.name,
              folderPath: tenantSubject.folder_path,
              namespace: tenantSubject.namespace_slug,
              question: tenantQuestion,
              questionHash: tenantQuestionHash,
              promptLength: tenantQuestion.length,
              citationCount: tenantSources.length,
            });
            enqueue("error", {
              code: "TENANT_EMPTY_ANSWER",
              message: "Tenant API returned no answer.",
            });
            controller.close();
            return;
          }

          logTenantChatDebug("tenant_chat_succeeded", {
            requestId,
            sessionId: session.id,
            subject: tenantSubject.name,
            subjectName: tenantSubject.name,
            questionHash: tenantQuestionHash,
            payloadHash: hashDebugValue({
              question: tenantQuestion,
              answer_instruction: answerInstruction,
              context_summary: tenantContextSummary,
              subject: tenantSubject.name,
              tenant: "nano-syllabus",
              namespaces: tenantNamespaces,
              top_k: 8,
              attachment_count: latestUserAttachments.length,
            }),
            generationMs,
            answerLength: answer.length,
            citationCount: tenantSources.length,
            chunksRetrieved,
            servedFrom,
            returnedContextSummaryHash: returnedContextSummary ? hashDebugValue(returnedContextSummary) : null,
            returnedContextSummaryLength: returnedContextSummary.length,
            inputTokens: tenantTokenUsage.inputTokens,
            outputTokens: tenantTokenUsage.outputTokens,
            totalTokens: tenantTokenUsage.totalTokens,
          });

          const citations = buildTenantCitations({
            subjectName: tenantSubject.name,
            folderPath: tenantSubject.folder_path,
            sources: tenantSources,
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
            routePath: "tenant_chat_stream",
            routeScopeDebug: tenantSubject.folder_path,
            retrievalMode,
            answerMode: "tenant_chat_stream",
            answerModeReason: "raw_question_answer_instruction_and_context_summary_sent_to_tenant_stream",
            matchedScope: tenantSubject.name,
            answerModel: "tenant:/api/chat/stream",
            grounded: citations.length > 0,
            citationCount: citations.length,
            lookupMs: 0,
            generationMs,
            rewriteMs: 0,
            followupMs: 0,
            totalMs,
          });

          const persistStartedAt = Date.now();

          if (parsed.truncateFromId && !parsed.truncateFromId.startsWith("local-")) {
            const { data: targetMessage } = await supabase
              .from("chat_messages")
              .select("created_at")
              .eq("id", parsed.truncateFromId)
              .eq("session_id", session.id)
              .maybeSingle();

            if (targetMessage) {
              await supabase
                .from("chat_messages")
                .delete()
                .eq("session_id", session.id)
                .gte("created_at", targetMessage.created_at);
            }
          }

          const userMessagePayload = {
            session_id: session.id,
            role: "user",
            content: question,
            language: resolvedLanguage,
            created_at: parsed.messages[parsed.messages.length - 1].createdAt || undefined,
            metadata: latestUserAttachments.length > 0 ? { attachments: latestUserAttachments } : {},
            input_tokens: tenantTokenUsage.inputTokens,
            output_tokens: 0,
            total_tokens: tenantTokenUsage.inputTokens,
          };
          const userMessageInsert = await supabase
            .from("chat_messages")
            .insert(userMessagePayload)
            .select("id")
            .single();
          let userMessageError = userMessageInsert.error;

          if (
            shouldRetryMessageInsertWithoutTokenUsage(userMessageError) ||
            shouldRetryAssistantInsertWithoutMetadata(userMessageError)
          ) {
            const { input_tokens, output_tokens, total_tokens, metadata, ...tokenAndMetadataFreeUserMessagePayload } = userMessagePayload;
            void input_tokens;
            void output_tokens;
            void total_tokens;
            void metadata;
            const tokenFreeUserMessagePayload = {
              ...tokenAndMetadataFreeUserMessagePayload,
              metadata,
            };
            const retryUserMessagePayload = shouldRetryAssistantInsertWithoutMetadata(userMessageError)
              ? tokenAndMetadataFreeUserMessagePayload
              : tokenFreeUserMessagePayload;
            const retryUserMessageInsert = await supabase
              .from("chat_messages")
              .insert(retryUserMessagePayload)
              .select("id")
              .single();
            userMessageError = retryUserMessageInsert.error;
          }

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
            enqueue("error", { message: "Answer generated, but saving your message failed." });
            controller.close();
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
            tokenUsage: tenantTokenUsage,
          });

          if (!assistantMessageId) {
            logTenantChatDebug("assistant_message_persist_failed_after_response", {
              requestId,
              sessionId: session.id,
              subject: tenantSubject.name,
              subjectName: tenantSubject.name,
              persistMs: Date.now() - persistStartedAt,
            });
            enqueue("error", { message: "Answer generated, but saving the response failed." });
            controller.close();
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
            inputTokens: tenantTokenUsage.inputTokens,
            outputTokens: tenantTokenUsage.outputTokens,
            totalTokens: tenantTokenUsage.totalTokens,
          });

          enqueue("done", {
            ok: true,
            sessionId: session.id,
            requestId,
            generationMs,
            totalMs,
            citationCount: citations.length,
            chunksRetrieved,
            servedFrom,
            tokenUsage: tenantTokenUsage,
          });
          controller.close();
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
              responseLanguage: resolvedLanguage,
              contextSummaryHash: tenantContextSummary ? hashDebugValue(tenantContextSummary) : null,
              contextSummaryLength: tenantContextSummary.length,
              question: tenantQuestion,
              questionHash: tenantQuestionHash,
              promptLength: tenantQuestion.length,
              failureReason,
              generationMs,
              attachmentCount: latestUserAttachments.length,
            },
            error,
          );
          enqueue("error", {
            code: failureReason === "timeout" ? "TENANT_PROMPT_TIMEOUT" : "TENANT_PROMPT_FAILED",
            message:
              failureReason === "timeout"
                ? "Tenant answer API timed out. Please retry once."
                : errorToDebugMessage(error),
          });
          controller.close();
        }
        })();
      },
    });

    return new Response(stream, {
      status: 200,
      headers: {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        "X-Accel-Buffering": "no",
        Connection: "keep-alive",
        "x-session-id": session.id,
        "x-request-id": requestId,
        "x-tenant-grounded": "0",
        "x-tenant-citations": "0",
        "x-tenant-chunks-retrieved": "0",
        "x-tenant-served-from": "",
        "x-retrieval-mode": retrievalMode,
        "x-subject-context": session.subjectContext ?? sessionSubjectContext,
        "x-thinking-enabled": "1",
        "x-answer-mode": "tenant_chat_stream",
        "x-answer-mode-reason": "raw_question_answer_instruction_and_context_summary_sent_to_tenant_stream",
        "x-answer-model": "tenant:/api/chat/stream",
        "x-matched-scope": tenantSubject.name,
        "x-route-path": "tenant_chat_stream",
        "x-route-scope-debug": tenantSubject.folder_path,
        "x-history-strategy": "tenant_context_summary",
        "x-history-messages": "1",
        "x-tenant-lookup-ms": "0",
        "x-generation-ms": String(generationMs),
        "x-question-sha": tenantQuestionHash,
        "x-payload-sha": hashDebugValue({
          question: tenantQuestion,
          answer_instruction: answerInstruction,
          context_summary: tenantContextSummary,
          subject: tenantSubject.name,
          tenant: "nano-syllabus",
          namespaces: tenantNamespaces,
          top_k: 8,
          attachment_count: latestUserAttachments.length,
        }),
        "x-subject-slug": tenantSubject.slug,
        "x-namespace-slug": tenantSubject.namespace_slug,
        "x-tenant-context-summary": "0",
        "x-tenant-context-summary-length": "0",
        "x-rewrite-ms": "0",
        "x-followup-ms": "0",
        "x-total-ms": "0",
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
