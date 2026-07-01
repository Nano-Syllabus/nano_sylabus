import { createHash } from "node:crypto";
import { after, NextResponse } from "next/server";
import { z } from "zod";
import { canSpendCredits, CHAT_MESSAGE_CREDIT_COST, computeNextBalance } from "@/lib/billing";
import { resolveResponseLanguage } from "@/lib/chat-language-mode";
import { ensureStarterCreditsForUser, getCreditBalanceForUser } from "@/lib/data/billing";
import { normalizeBoard, normalizeBoardScore, normalizeCollege, normalizeFullName, normalizeGrade, normalizeSubjectLabel, normalizeSubjects, normalizeTargetGrade } from "@/lib/profile-normalization";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { listTenantSubjects, promptTenant, type TenantPromptCitation, type TenantSubject } from "@/lib/tenant/client";
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
  return {
    name: tenantSubject.name,
    slug: tenantSubject.slug,
    namespace: tenantSubject.namespaceSlug,
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

function buildTenantCitations({
  subjectName,
  folderPath,
  citations,
}: {
  subjectName: string;
  folderPath: string;
  citations?: TenantPromptCitation[];
}): AssistantCitation[] {
  return (citations ?? []).map((citation, index) => {
    const sourceTitle = citation.title || citation.source || folderPath;
    return {
      chunkId: `tenant-${index}`,
      documentId: folderPath,
      sourceType: "syllabus" as const,
      sourceLabel: sourceTitle,
      sourceTitle,
      sourceName: citation.source || folderPath,
      subject: subjectName,
      chapter: citation.chapter ?? null,
      topic: citation.topic ?? null,
      excerpt: citation.excerpt,
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
    const sessionPromise = resolveChatSession({
      supabase,
      userId: user.id,
      sessionId: parsed.sessionId ?? null,
      question,
      subjectContext: sessionSubjectContext,
    });

    const tenantStartedAt = Date.now();
    logTenantChatDebug("tenant_prompt_started", {
      requestId,
      retrievalMode,
      subject: tenantSubject.slug,
      subjectName: tenantSubject.name,
      folderPath: tenantSubject.folder_path,
      namespace: tenantSubject.namespace_slug,
      question,
      questionHash,
      payloadHash: hashDebugValue({
        subject: tenantSubject.slug,
        folder_path: tenantSubject.folder_path,
        prompt: question,
        namespace: tenantSubject.namespace_slug,
      }),
      promptLength: question.length,
    });

    const tenantPromise = promptTenant({
      userId: user.id,
      subject: tenantSubject.slug,
      folderPath: tenantSubject.folder_path,
      prompt: question,
      namespace: tenantSubject.namespace_slug,
    });

    let tenantResponse: Awaited<typeof tenantPromise>;
    let session: Awaited<typeof sessionPromise>;
    try {
      [tenantResponse, session] = await Promise.all([tenantPromise, sessionPromise]);
      generationMs = Date.now() - tenantStartedAt;
    } catch (error) {
      generationMs = Date.now() - tenantStartedAt;
      const failureReason = summarizeTenantFailure(error);
      logTenantChatDebug(
        "tenant_prompt_or_session_failed",
        {
          requestId,
          subject: tenantSubject.slug,
          subjectName: tenantSubject.name,
          folderPath: tenantSubject.folder_path,
          namespace: tenantSubject.namespace_slug,
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
        subject: tenantSubject.slug,
        subjectName: tenantSubject.name,
        folderPath: tenantSubject.folder_path,
      namespace: tenantSubject.namespace_slug,
      question,
      questionHash,
      promptLength: question.length,
        detail: tenantResponse.detail ?? null,
        citationCount: Array.isArray(tenantResponse.citations) ? tenantResponse.citations.length : 0,
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

    logTenantChatDebug("tenant_prompt_succeeded", {
      requestId,
      sessionId: session.id,
      subject: tenantSubject.slug,
      subjectName: tenantSubject.name,
      questionHash,
      payloadHash: hashDebugValue({
        subject: tenantSubject.slug,
        folder_path: tenantSubject.folder_path,
        prompt: question,
        namespace: tenantSubject.namespace_slug,
      }),
      generationMs,
      answerLength: answer.length,
      citationCount: Array.isArray(tenantResponse.citations) ? tenantResponse.citations.length : 0,
    });

    const citations = buildTenantCitations({
      subjectName: tenantSubject.name,
      folderPath: tenantSubject.folder_path,
      citations: tenantResponse.citations,
    });
    const totalMs = Date.now() - requestStartedAt;
    const subjectTags = [session.subjectContext ?? sessionSubjectContext];
    const answerTrace = buildAnswerTrace({
      routePath: "tenant_prompt",
      routeScopeDebug: tenantSubject.folder_path,
      retrievalMode,
      answerMode: "tenant_prompt",
      answerModeReason: "raw_question_sent_to_tenant",
      matchedScope: tenantSubject.name,
      answerModel: "tenant:v1/prompt",
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
            subject: tenantSubject.slug,
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
      });

      if (!assistantMessageId) {
        logTenantChatDebug("assistant_message_persist_failed_after_response", {
          requestId,
          sessionId: session.id,
          subject: tenantSubject.slug,
          subjectName: tenantSubject.name,
          persistMs: Date.now() - persistStartedAt,
        });
        return;
      }

      logTenantChatDebug("tenant_persist_succeeded_after_response", {
        requestId,
        sessionId: session.id,
        subject: tenantSubject.slug,
        subjectName: tenantSubject.name,
        assistantMessageId,
        persistMs: Date.now() - persistStartedAt,
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
        "x-retrieval-mode": retrievalMode,
        "x-subject-context": session.subjectContext ?? sessionSubjectContext,
        "x-thinking-enabled": "0",
        "x-answer-mode": "tenant_prompt",
        "x-answer-mode-reason": "raw_question_sent_to_tenant",
        "x-answer-model": "tenant:v1/prompt",
        "x-matched-scope": tenantSubject.name,
        "x-route-path": "tenant_prompt",
        "x-route-scope-debug": tenantSubject.folder_path,
        "x-history-strategy": "tenant_direct",
        "x-history-messages": "1",
        "x-tenant-lookup-ms": "0",
        "x-generation-ms": String(generationMs),
        "x-question-sha": questionHash,
        "x-payload-sha": hashDebugValue({
          subject: tenantSubject.slug,
          folder_path: tenantSubject.folder_path,
          prompt: question,
          namespace: tenantSubject.namespace_slug,
        }),
        "x-subject-slug": tenantSubject.slug,
        "x-namespace-slug": tenantSubject.namespace_slug,
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
