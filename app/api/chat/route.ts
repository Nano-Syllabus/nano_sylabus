import { createHash } from "node:crypto";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
import { z } from "zod";
import { canSpendCredits, CHAT_MESSAGE_CREDIT_COST, computeNextBalance } from "@/lib/billing";
import { resolveResponseLanguage } from "@/lib/chat-language-mode";
import { ensureStarterCreditsForUser, getCreditBalanceForUser } from "@/lib/data/billing";
import {
  normalizeBoard,
  normalizeBoardScore,
  normalizeCollege,
  normalizeFullName,
  normalizeGrade,
  normalizeSubjectLabel,
  normalizeSubjects,
  normalizeTargetGrade,
} from "@/lib/profile-normalization";
import {
  getStudentCourseSubjectAccess,
  getStudentCourseSubjectAccessForCourse,
  type StudentCourseSubjectAccess,
} from "@/lib/student-courses";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { askTeacherSubjectStream, TeacherApiError, type ApiRecord } from "@/lib/teacher-app/client";
import {
  chatTenantStream,
  getTenantName,
  type TenantChatSource,
  type TenantSubject,
  type TenantTokenUsage,
} from "@/lib/tenant/client";
import { deriveSessionTitle } from "@/lib/utils";
import type { AssistantAnswerTrace, AssistantCitation } from "@/lib/types";

type RetrievalMode = "default" | "web";
type ResponseLanguage = "EN" | "RN";
const MAX_TENANT_CONTEXT_SUMMARY_CHARS = 4_000;

// Enrolled subjects use the course UUID directly. Owner-only private subjects
// use an explicit, non-UUID token so they cannot be confused with a course id.
// Keep validating both forms at the request boundary; the access lookup below
// still verifies enrollment/ownership before any teacher content is queried.
const privateSubjectCourseIdPattern =
  /^private:[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const subjectCourseIdSchema = z
  .string()
  .trim()
  .refine(
    (value) =>
      z.string().uuid().safeParse(value).success || privateSubjectCourseIdPattern.test(value),
    { message: "Invalid course id" },
  );

const requestSchema = z.object({
  sessionId: z.string().uuid().nullable().optional(),
  language: z.enum(["EN", "RN"]).default("EN"),
  messageLanguage: z.enum(["EN", "RN"]).optional(),
  answerStyle: z.enum(["simple", "balanced", "detailed"]).optional(),
  retrievalMode: z.enum(["default", "web"]).optional(),
  subjectContext: z.string().trim().min(1).max(120).nullable().optional(),
  tenantSubject: z
    .object({
      courseId: subjectCourseIdSchema.optional(),
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
              mimeType: z
                .string()
                .trim()
                .min(1)
                .max(120)
                .refine((value) => value.startsWith("image/")),
              size: z
                .number()
                .int()
                .nonnegative()
                .max(5 * 1024 * 1024),
              dataUrl: z
                .string()
                .trim()
                .min(1)
                .max(7_000_000)
                .refine((value) => value.startsWith("data:image/")),
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
  if (
    normalized.includes("timeout") ||
    normalized.includes("timed out") ||
    normalized.includes("deadline")
  ) {
    return "timeout";
  }
  if (
    normalized.includes("401") ||
    normalized.includes("403") ||
    normalized.includes("unauthorized")
  ) {
    return "auth";
  }
  if (normalized.includes("404") || normalized.includes("not found")) {
    return "not_found";
  }
  return "unknown";
}

function logTenantChatDebug(stage: string, details: Record<string, unknown>, error?: unknown) {
  const payload = {
    stage,
    ...details,
    ...(error ? { error: errorToDebugMessage(error) } : {}),
  };

  if (
    error ||
    stage.includes("failed") ||
    stage.includes("not_matched") ||
    stage.includes("empty_answer")
  ) {
    console.error("[TENANT_CHAT]", payload);
    return;
  }

  console.log("[TENANT_CHAT]", payload);
}

function trustedTenantSubject(access: StudentCourseSubjectAccess): TenantSubject {
  const namespaceFromPath = access.folderPath.split("/")[0]?.trim();
  return {
    name: access.subjectName,
    slug: access.subjectSlug,
    namespace: namespaceFromPath || access.subjectSlug,
    namespace_slug: access.subjectSlug,
    full_path: access.folderPath,
    folder_path: access.folderPath,
    chunk_count: 0,
  };
}

function privateCollectionSource(value: unknown, index: number): TenantChatSource | null {
  if (!value || typeof value !== "object") return null;
  const chunk = value as ApiRecord;
  const source =
    chunk.source && typeof chunk.source === "object" ? (chunk.source as ApiRecord) : {};
  const metadata =
    chunk.metadata && typeof chunk.metadata === "object" ? (chunk.metadata as ApiRecord) : {};
  const sourcePath = String(
    source.filename ||
      source.doc ||
      source.source_path ||
      metadata.filename ||
      metadata.source ||
      "Indexed source",
  ).trim();
  const excerpt = String(
    chunk.text || chunk.content || chunk.chunk || chunk.snippet || source.excerpt || "",
  ).trim();
  const pageValue = source.page ?? metadata.page;
  const page = Number(pageValue);

  return {
    rank: index + 1,
    title: sourcePath,
    source_path: sourcePath,
    excerpt: excerpt || undefined,
    score: typeof chunk.score === "number" ? chunk.score : undefined,
    pages: Number.isFinite(page) && page > 0 ? [page] : null,
  };
}

function derivePrivateNextTopic({
  explicitTopic,
  nextContextChunk,
}: {
  explicitTopic?: string;
  nextContextChunk?: ApiRecord;
}) {
  const explicit = explicitTopic?.trim();
  if (explicit) return explicit;

  const nextTitle =
    typeof nextContextChunk?.title === "string"
      ? nextContextChunk.title.trim()
      : typeof nextContextChunk?.source_path === "string"
        ? nextContextChunk.source_path.trim()
        : "";
  if (nextTitle) return nextTitle;

  return "";
}

function teacherCollectionNamespace(handle: string) {
  const normalizedHandle = handle
    .trim()
    .toLowerCase()
    .replace(/-teacher$/, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return normalizedHandle ? `${normalizedHandle}-teacher` : "";
}

function normalizeContextSummary(value: unknown) {
  if (typeof value !== "string") return "";

  const normalized = value.trim();
  if (normalized.length <= MAX_TENANT_CONTEXT_SUMMARY_CHARS) return normalized;

  const clipped = normalized.slice(0, MAX_TENANT_CONTEXT_SUMMARY_CHARS);
  const lastBoundary = Math.max(
    clipped.lastIndexOf("\n"),
    clipped.lastIndexOf(". "),
    clipped.lastIndexOf(" "),
  );
  return clipped
    .slice(0, lastBoundary > 3_000 ? lastBoundary : MAX_TENANT_CONTEXT_SUMMARY_CHARS)
    .trim();
}

function normalizeRequestAttachments(
  attachments:
    | NonNullable<z.infer<typeof requestSchema>["messages"][number]["attachments"]>
    | undefined,
) {
  return (attachments ?? []).map((attachment) => ({
    id: attachment.id,
    name: attachment.name,
    mimeType: attachment.mimeType,
    size: attachment.size,
    dataUrl: attachment.dataUrl,
  }));
}

function hasMissingColumnError(
  error: { message?: string; details?: string } | null,
  columnName: string,
) {
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

function shouldRetryMessageInsertWithoutTokenUsage(
  error: { message?: string; details?: string } | null,
) {
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

function buildTenantNextSuggestion(nextTopic: string) {
  const normalized = nextTopic.trim();
  if (!normalized) return [];
  return [`Next: ${normalized}`];
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
      ? "Answer only in clear English, even when the question or retrieved source is in Nepali."
      : "Answer only in natural Roman Nepali written with Latin letters, even when the question or retrieved source is in English. Do not write English prose or Devanagari script; keep only unavoidable technical terms in English.";

  return [
    languageRule,
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
    "CRITICAL: Whenever you need to draw or show ANY circuit, block diagram, state machine, or visual diagram, you MUST generate the diagram using TikZ (LaTeX). ALWAYS wrap your TikZ code inside a standard markdown code block with the language set to 'tikz' (i.e. ```tikz). Do NOT use ASCII art, plaintext, or pseudocode for diagrams.",
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

function shouldRetryAssistantInsertWithoutMetadata(
  error: { message?: string; details?: string } | null,
) {
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
  followUpSuggestions,
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
  followUpSuggestions: string[];
}) {
  const normalizedTokenUsage = normalizeTokenUsage(tokenUsage);
  const basePayload = {
    session_id: sessionId,
    role: "assistant" as const,
    content: answer,
    language,
    grounded: citations.length > 0,
    citations,
    follow_up_suggestions: followUpSuggestions,
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
    const latestUserMessage = [...parsed.messages]
      .reverse()
      .find((message) => message.role === "user");
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

    const requestedSubject = parsed.subjectContext
      ? normalizeSubjectLabel(parsed.subjectContext)
      : null;

    const subjectLookupStartedAt = Date.now();

    logTenantChatDebug("tenant_subject_lookup_started", {
      requestId,
      retrievalMode,
      requestedSubject,
      questionHash,
      profileSubjectCount: profile.subjects.length,
      hasTenantSubjectMetadata: Boolean(parsed.tenantSubject),
    });

    const requestedSubjectValue =
      parsed.tenantSubject?.slug || parsed.tenantSubject?.name || requestedSubject || "";
    let subjectAccess: StudentCourseSubjectAccess | null;
    try {
      subjectAccess = parsed.tenantSubject?.courseId
        ? await getStudentCourseSubjectAccessForCourse(
            user.id,
            parsed.tenantSubject.courseId,
            parsed.tenantSubject.slug,
          )
        : await getStudentCourseSubjectAccess(user.id, requestedSubjectValue);
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
          error: "Course subject lookup failed.",
          code: "COURSE_SUBJECT_LOOKUP_FAILED",
          requestId,
        },
        { status: 502 },
      );
    }

    logTenantChatDebug("tenant_subject_lookup_succeeded", {
      requestId,
      requestedSubject,
      lookupMs: Date.now() - subjectLookupStartedAt,
      source: parsed.tenantSubject?.courseId?.startsWith("private:")
        ? "owner_private_subject"
        : parsed.tenantSubject?.courseId
          ? "enrolled_course_subject"
          : "enrolled_subject_lookup",
      matchedSubject: subjectAccess?.subjectName ?? null,
    });

    if (!subjectAccess) {
      logTenantChatDebug("tenant_subject_not_matched", {
        requestId,
        requestedSubject,
        profileSubjects: profile.subjects,
      });
      const requestedPrivateSubject = parsed.tenantSubject?.courseId?.startsWith("private:");
      return NextResponse.json(
        {
          error: requestedPrivateSubject
            ? "This private subject is no longer available."
            : "Enroll in a course containing this subject first.",
          code: "COURSE_SUBJECT_ACCESS_REQUIRED",
          requestId,
        },
        { status: 403 },
      );
    }

    const tenantSubject = trustedTenantSubject(subjectAccess);
    const isPrivateSubject = subjectAccess.accessKind === "owner-private";
    const admin = createSupabaseAdminClient();
    const { data: creator, error: creatorError } = await admin
      .from("teachers")
      .select("handle,collection_sk")
      .eq("id", subjectAccess.teacherId)
      .maybeSingle();

    if (creatorError) {
      return NextResponse.json(
        {
          error: "Course creator lookup failed.",
          code: "COURSE_CREATOR_LOOKUP_FAILED",
          requestId,
        },
        { status: 502 },
      );
    }

    const creatorHandle = String(creator?.handle || "").trim();
    const privateCollectionKey = String(creator?.collection_sk || "").trim();
    if (isPrivateSubject && !privateCollectionKey) {
      return NextResponse.json(
        {
          error: "This private subject's study collection is not ready.",
          code: "PRIVATE_COLLECTION_NOT_READY",
          requestId,
        },
        { status: 409 },
      );
    }
    if (!isPrivateSubject && !creatorHandle) {
      return NextResponse.json(
        {
          error: "This course creator's study collection is not ready.",
          code: "COURSE_COLLECTION_NOT_READY",
          requestId,
        },
        { status: 409 },
      );
    }

    const teacherNamespace = teacherCollectionNamespace(creatorHandle);
    let tenantName = "";
    if (!isPrivateSubject) {
      try {
        tenantName = await getTenantName();
      } catch (error) {
        logTenantChatDebug(
          "tenant_identity_lookup_failed",
          { requestId, teacherNamespace, subject: tenantSubject.name },
          error,
        );
        return NextResponse.json(
          {
            error: "Study chat service is not ready.",
            code: "TENANT_IDENTITY_LOOKUP_FAILED",
            requestId,
          },
          { status: 502 },
        );
      }
    }

    const sessionSubjectContext = normalizeSubjectLabel(tenantSubject.name);
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
    const chatRoutePath = isPrivateSubject ? "owner_private_collection_chat" : "tenant_chat_stream";
    const chatAnswerReason = isPrivateSubject
      ? "owner_private_subject_answered_from_collection_key"
      : "enrolled_course_subject_streamed_from_scoped_teacher_namespace";
    const chatAnswerModel = isPrivateSubject
      ? "teacher:/v1/collection/ask/stream"
      : "tenant:/api/chat/stream";
    const chatRouteScope = isPrivateSubject ? tenantSubject.slug : teacherNamespace;
    const privateConversationHistory = parsed.messages
      .slice(0, -1)
      .slice(-10)
      .map((message) => ({
        role: message.role,
        content: message.content.trim().slice(0, 4_000),
      }))
      .filter((message) => message.content);
    const privateAnswerPrompt = [
      answerInstruction,
      tenantContextSummary
        ? `Use this rolling conversation context when helpful:\n${tenantContextSummary}`
        : "",
    ]
      .filter(Boolean)
      .join("\n\n");
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
      transport: isPrivateSubject
        ? "teacher-collection-json"
        : latestUserAttachments.length > 0
          ? "multipart/form-data"
          : "application/json",
      routePath: chatRoutePath,
      routeScope: chatRouteScope,
      payloadHash: hashDebugValue({
        question: tenantQuestion,
        context_summary: tenantContextSummary,
        answer_instruction: answerInstruction,
        subject: tenantSubject.name,
        tenant: tenantName,
        namespaces: [teacherNamespace],
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
          let tenantNextTopic = "";
          let chunksRetrieved: number | null = null;
          let servedFrom: string | null = null;
          let tenantTokenUsage = normalizeTokenUsage(null);
          let privateSourcesSent = false;

          try {
            enqueue("status", { message: "Connecting to syllabus stream..." });

            if (isPrivateSubject) {
              if (latestUserAttachments.length > 0) {
                throw new Error(
                  "Image attachments are not supported in private-subject chat yet. Ask with text or open the material from Study Space.",
                );
              }
              enqueue("status", { message: "Reading your private subject materials..." });
              await askTeacherSubjectStream(
                privateCollectionKey,
                tenantSubject.name,
                tenantQuestion,
                8,
                privateAnswerPrompt,
                privateConversationHistory,
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
                    if (event.text) {
                      answerParts.push(event.text);
                      enqueue("token", { text: event.text });
                    }
                    return;
                  }

                  if (event.type === "sources") {
                    const rawChunks = Array.isArray(event.chunks)
                      ? event.chunks
                      : Array.isArray(event.sources)
                        ? event.sources
                        : [];
                    tenantSources = rawChunks
                      .map(privateCollectionSource)
                      .filter((source): source is TenantChatSource => source !== null);
                    chunksRetrieved = event.chunks_retrieved ?? tenantSources.length;
                    servedFrom = event.served_from ?? "owner_private_collection";
                    tenantNextTopic = derivePrivateNextTopic({
                      explicitTopic: event.next_topic,
                      nextContextChunk: event.next_context_chunk,
                    });
                    privateSourcesSent = true;
                    enqueue("sources", {
                      sources: tenantSources,
                      chunks_retrieved: chunksRetrieved,
                      served_from: servedFrom,
                      context_summary: "0",
                      next_topic: tenantNextTopic || undefined,
                    });
                    return;
                  }

                  if (event.type === "done") {
                    tenantTokenUsage = normalizeTokenUsage(event.usage ?? null);
                    return;
                  }

                  if (event.type === "error") {
                    throw new Error(event.message);
                  }
                },
              );
              if (!privateSourcesSent) {
                chunksRetrieved = tenantSources.length;
                servedFrom = servedFrom ?? "owner_private_collection";
                enqueue("sources", {
                  sources: tenantSources,
                  chunks_retrieved: chunksRetrieved,
                  served_from: servedFrom,
                  context_summary: "0",
                  next_topic: tenantNextTopic || undefined,
                });
              }
            } else {
              await chatTenantStream(
                {
                  question: tenantQuestion,
                  answerInstruction,
                  contextSummary: tenantContextSummary,
                  subject: tenantSubject.name,
                  tenant: tenantName,
                  namespaces: [teacherNamespace],
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
                    tenantNextTopic =
                      event.next_topic?.trim() || event.next_context_chunk?.title?.trim() || "";
                    enqueue("sources", {
                      sources: tenantSources,
                      chunks_retrieved: chunksRetrieved,
                      served_from: servedFrom,
                      context_summary: returnedContextSummary ? "1" : "0",
                      next_topic: tenantNextTopic || undefined,
                    });
                    return;
                  }

                  if (event.type === "error") {
                    throw new Error(event.message);
                  }

                  if (event.type === "done") {
                    tenantTokenUsage = normalizeTokenUsage(event.usage);
                  }
                },
              );
            }

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
                message: "Course material API returned no answer.",
              });
              controller.close();
              return;
            }

            if (!returnedContextSummary) {
              returnedContextSummary = normalizeContextSummary(
                `${tenantContextSummary ? `${tenantContextSummary}\n` : ""}User: ${tenantQuestion}\nAssistant: ${answer}`,
              );
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
                tenant: tenantName,
                namespaces: [teacherNamespace],
                top_k: 8,
                attachment_count: latestUserAttachments.length,
              }),
              generationMs,
              answerLength: answer.length,
              citationCount: tenantSources.length,
              chunksRetrieved,
              servedFrom,
              returnedContextSummaryHash: returnedContextSummary
                ? hashDebugValue(returnedContextSummary)
                : null,
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
            const followUpSuggestions = buildTenantNextSuggestion(tenantNextTopic);

            const sessionContextPersist = await persistSessionContextSummary({
              supabase,
              sessionId: session.id,
              userId: user.id,
              contextSummary: returnedContextSummary,
            });

            if (!sessionContextPersist.ok && !sessionContextPersist.missingColumn) {
              logTenantChatDebug(
                "tenant_session_context_persist_failed",
                {
                  requestId,
                  sessionId: session.id,
                  subject: tenantSubject.name,
                  subjectName: tenantSubject.name,
                  contextSummaryHash: returnedContextSummary
                    ? hashDebugValue(returnedContextSummary)
                    : null,
                  contextSummaryLength: returnedContextSummary.length,
                },
                sessionContextPersist.error,
              );
            }

            const totalMs = Date.now() - requestStartedAt;
            const subjectTags = [session.subjectContext ?? sessionSubjectContext];
            const answerTrace = buildAnswerTrace({
              routePath: chatRoutePath,
              routeScopeDebug: chatRouteScope,
              retrievalMode,
              answerMode: chatRoutePath,
              answerModeReason: chatAnswerReason,
              matchedScope: tenantSubject.name,
              answerModel: chatAnswerModel,
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
              metadata:
                latestUserAttachments.length > 0 ? { attachments: latestUserAttachments } : {},
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
              const {
                input_tokens,
                output_tokens,
                total_tokens,
                metadata,
                ...tokenAndMetadataFreeUserMessagePayload
              } = userMessagePayload;
              void input_tokens;
              void output_tokens;
              void total_tokens;
              void metadata;
              const tokenFreeUserMessagePayload = {
                ...tokenAndMetadataFreeUserMessagePayload,
                metadata,
              };
              const retryUserMessagePayload = shouldRetryAssistantInsertWithoutMetadata(
                userMessageError,
              )
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
              followUpSuggestions,
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
              contextSummaryHash: returnedContextSummary
                ? hashDebugValue(returnedContextSummary)
                : null,
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
            const privateApiError =
              isPrivateSubject && error instanceof TeacherApiError ? error : null;
            const clientErrorMessage = privateApiError
              ? privateApiError.status === 404
                ? "No indexed material was found for this private subject. Add or re-index a material, then try again."
                : privateApiError.status === 401
                  ? "This private subject's collection key is no longer valid."
                  : "Could not answer from this private subject's materials."
              : errorToDebugMessage(error);
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
                contextSummaryHash: tenantContextSummary
                  ? hashDebugValue(tenantContextSummary)
                  : null,
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
                  ? "Course answer API timed out. Please retry once."
                  : clientErrorMessage,
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
        "x-answer-mode": chatRoutePath,
        "x-answer-mode-reason": chatAnswerReason,
        "x-answer-model": chatAnswerModel,
        "x-matched-scope": tenantSubject.name,
        "x-route-path": chatRoutePath,
        "x-route-scope-debug": chatRouteScope,
        "x-history-strategy": "rolling_context_summary",
        "x-history-messages": "0",
        "x-tenant-lookup-ms": "0",
        "x-generation-ms": String(generationMs),
        "x-question-sha": tenantQuestionHash,
        "x-payload-sha": hashDebugValue({
          question: tenantQuestion,
          answer_instruction: answerInstruction,
          context_summary: tenantContextSummary,
          subject: tenantSubject.name,
          tenant: tenantName,
          namespaces: [teacherNamespace],
          top_k: 8,
          attachment_count: latestUserAttachments.length,
        }),
        "x-subject-slug": tenantSubject.slug,
        "x-namespace-slug": chatRouteScope,
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
