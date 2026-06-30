"use client";

import Link from "next/link";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useContext,
  type ChangeEvent,
  type KeyboardEvent,
} from "react";
import { useChat, type Message } from "ai/react";
import { AppShellContext } from "@/components/app-shell-context";

import { Markdown } from "@/components/markdown";
import { Button } from "@/components/ui/button";
import { CompactSelect } from "@/components/ui/compact-select";
import { Field, Input, Textarea } from "@/components/ui/field";
import { dedupeCitationsForDisplay } from "@/lib/citations";
import { normalizeBoard, normalizeGrade, normalizeSubjectLabel } from "@/lib/profile-normalization";
import type {
  AnswerStyle,
  AppUser,
  ChatMessageRecord,
  ChatSessionDetail,
  ChatSessionSummary,
  Language,
  NoteColor,
} from "@/lib/types";
import { cn, deriveSessionTitle, formatDate, groupDateLabel } from "@/lib/utils";

/** Strip chapter enrichment from subject context for UI display.
 * e.g. "Instrumentation > Measurement Systems" → "Instrumentation" */
function stripSubjectChapter(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.includes(">") ? trimmed.split(">")[0].trim() : trimmed;
}

const COLOR_LABEL: Record<NoteColor, string> = {
  red: "Must revise",
  yellow: "Review later",
  green: "Got it",
};

const ANSWER_STYLE_STORAGE_KEY = "nano-answer-style";
const RETRIEVAL_MODE_STORAGE_KEY = "nano-retrieval-mode";
const ANSWER_STYLE_LABELS: Record<AnswerStyle, string> = {
  simple: "Simple",
  balanced: "Balanced",
  detailed: "Detailed",
};
type RetrievalMode = "default" | "web" | "chapter";
const RETRIEVAL_MODE_LABELS: Record<Exclude<RetrievalMode, "chapter">, string> = {
  default: "Syllabus",
  web: "Web Search",
};

type TenantChatSubject = {
  name: string;
  slug: string;
  namespaceSlug: string;
  folderPath: string;
};

type TenantCatalogPayload = {
  subjects?: TenantChatSubject[];
};

let tenantSubjectMetadataPromise: Promise<TenantCatalogPayload> | null = null;

function loadTenantSubjectMetadata(): Promise<TenantCatalogPayload> {
  if (!tenantSubjectMetadataPromise) {
    tenantSubjectMetadataPromise = fetch("/api/tenant/subjects", { cache: "no-store" }).then(
      async (response): Promise<TenantCatalogPayload> => {
      if (!response.ok) {
        tenantSubjectMetadataPromise = null;
        return {};
      }

      return (await response.json()) as TenantCatalogPayload;
      },
    );
  }

  return tenantSubjectMetadataPromise;
}

type ThinkingTrace = {
  grounded: boolean;
  ragChunks: number;
  subjectContext: string | null;
  retrievalMode: RetrievalMode;
  answerMode:
    | "quick"
    | "deep"
    | "tenant_prompt"
    | "deterministic_structure_lookup"
    | "deterministic_catalog_lookup"
    | "deterministic_exam_lookup"
    | null;
  answerModeReason: string | null;
  answerModel: string | null;
  routePath: string | null;
  routeScopeDebug: string | null;
  topicCardUsed: boolean;
  topicCardSource: "persisted" | "derived" | null;
  topicCardTitle: string | null;
  questionBankUsed: boolean;
  usedFallback: boolean;
  usedQualityRescue: boolean;
  fallbackReason: string | null;
  matchedScope: string | null;
  ragMs: number | null;
  generationMs: number | null;
  rewriteMs: number | null;
  totalMs: number | null;
};

function formatMs(ms: number | null) {
  if (!ms || ms <= 0) return "0s";
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function buildThoughtSummary(trace: ThinkingTrace) {
  const lines: string[] = [];
  if (trace.routePath === "tenant_prompt") {
    lines.push("Answer came from the tenant subject API using your selected subject scope.");
  } else if (trace.grounded) {
    lines.push(
      `Retrieved ${trace.ragChunks} grounded chunk${trace.ragChunks === 1 ? "" : "s"} from your indexed study sources.`,
    );
  } else {
    lines.push("Grounded study evidence was not available for this response path.");
  }

  if (trace.subjectContext) {
    lines.push(`Focused scope: ${trace.subjectContext}.`);
  }
  if (trace.matchedScope) {
    lines.push(`Best matched source path: ${trace.matchedScope}.`);
  }
  if (trace.routePath) {
    lines.push(`Route path: ${trace.routePath}.`);
  }
  if (trace.routeScopeDebug && trace.routeScopeDebug !== trace.matchedScope) {
    lines.push(`Resolved scope: ${trace.routeScopeDebug}.`);
  }
  if (trace.topicCardUsed) {
    lines.push(
      trace.topicCardSource === "persisted"
        ? `Topic card used: ${trace.topicCardTitle || "stored academic card"} (stored academic card).`
        : `Topic card used: ${trace.topicCardTitle || "derived teaching context"} (derived from grounded chunks).`,
    );
  }
  if (trace.questionBankUsed) {
    lines.push("Question bank evidence was prioritized for this response.");
  }
  if (trace.answerMode) {
    lines.push(
      `Answer mode: ${trace.answerMode}${trace.answerModeReason ? ` (${trace.answerModeReason})` : ""}.`,
    );
  }
  if (trace.answerModel) {
    lines.push(`Model used: ${trace.answerModel}${trace.usedFallback ? " (fallback triggered)" : ""}.`);
  }
  if (trace.usedFallback) {
    lines.push(`Fallback reason: ${trace.fallbackReason || "provider-side primary failure"}.`);
  }
  if (trace.usedQualityRescue) {
    lines.push("Quality rescue: quick draft was upgraded to a stronger pass for better explanation quality.");
  }
  return lines;
}

function buildTracePills(trace: ThinkingTrace) {
  return [
    trace.grounded ? "Grounded" : "Ungrounded",
    trace.retrievalMode === "chapter" ? "Chapter" : RETRIEVAL_MODE_LABELS[trace.retrievalMode],
    trace.answerMode === "deterministic_structure_lookup"
      ? "Chapter lookup"
      : trace.answerMode === "deterministic_catalog_lookup"
        ? "Catalog lookup"
      : trace.answerMode === "deterministic_exam_lookup"
        ? "Exam lookup"
      : trace.answerMode
        ? `${trace.answerMode} answer`
        : null,
    trace.topicCardUsed
      ? trace.topicCardSource === "persisted"
        ? "Stored topic card"
        : "Topic card"
      : null,
    trace.questionBankUsed ? "Question bank" : null,
    trace.usedQualityRescue ? "Quality rescue" : null,
    trace.usedFallback ? "Backup model" : null,
  ].filter(Boolean) as string[];
}

function TopHeaderTitle({ 
  activeSessionTitle, 
}: { 
  activeSessionTitle: string; 
  currentSessionId: string | null; 
  onRename: () => void; 
  onDelete: () => void; 
}) {
  return (
    <div className="relative flex items-center gap-1.5">
      <span className="truncate">{activeSessionTitle}</span>
    </div>
  );
}

export function ChatPageClient({
  user,
  defaultLanguage,
  profileBoard,
  profileGrade,
  profileSubjects,
  initialSessions,
  initialHasMore,
  initialSession,
  initialSubjectContext,
  initialPrompt,
}: {
  user: AppUser;
  defaultLanguage: Language;
  profileBoard: string;
  profileGrade: string;
  profileSubjects: string[];
  initialSessions: ChatSessionSummary[];
  initialHasMore: boolean;
  initialSession: ChatSessionDetail | null;
  initialSubjectContext: string | null;
  initialPrompt: string | null;
}) {
  const [sessions, setSessions] = useState(initialSessions);
  const [hasMoreSessions, setHasMoreSessions] = useState(initialHasMore);
  const [historySearch, setHistorySearch] = useState("");
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState("");
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(initialSession?.id ?? null);
  const chatLanguage = defaultLanguage;
  const [composerLanguage, setComposerLanguage] = useState<Language>(defaultLanguage);
  const [chatError, setChatError] = useState("");
  const [creditBalance, setCreditBalance] = useState(user.creditBalance);
  const [sessionDetail, setSessionDetail] = useState<ChatSessionDetail | null>(initialSession);
  const shell = useContext(AppShellContext);
  const normalizedProfileSubjects = useMemo(
    () =>
      profileSubjects
        .map((subject) => normalizeSubjectLabel(subject))
        .filter(Boolean),
    [profileSubjects],
  );
  const defaultSubjectContext = useMemo(() => {
    const fromInitial = initialSubjectContext ? stripSubjectChapter(normalizeSubjectLabel(initialSubjectContext)) : "";
    if (fromInitial) return fromInitial;

    const fromSession = initialSession?.subjectContext
      ? stripSubjectChapter(normalizeSubjectLabel(initialSession.subjectContext))
      : "";
    if (fromSession) return fromSession;

    return null;
  }, [initialSubjectContext, initialSession?.subjectContext]);
  const [subjectContext, setSubjectContext] = useState<string | null>(defaultSubjectContext);
  const [answerStyle, setAnswerStyle] = useState<AnswerStyle>("detailed");
  const [retrievalMode, setRetrievalMode] = useState<RetrievalMode>("default");
  const [saveState, setSaveState] = useState<{
    message: ChatMessageRecord;
    question: string;
  } | null>(null);
  const [uiFeedback, setUiFeedback] = useState("");
  const [renameState, setRenameState] = useState<ChatSessionSummary | null>(null);
  const [deletingSessionId, setDeletingSessionId] = useState<string | null>(null);
  const [copyingMessageId, setCopyingMessageId] = useState<string | null>(null);
  const [thinkingStatus, setThinkingStatus] = useState<string | null>(null);
  const [matchedScope, setMatchedScope] = useState<string | null>(null);
  const [latestThinkingTrace, setLatestThinkingTrace] = useState<ThinkingTrace | null>(null);
  const [showThinkingTrace, setShowThinkingTrace] = useState(false);
  const [deleteConfirmSession, setDeleteConfirmSession] = useState<ChatSessionSummary | null>(null);
  const [tenantSubjectsByName, setTenantSubjectsByName] = useState<Record<string, TenantChatSubject>>({});
  const pendingTitleRef = useRef<string | null>(null);
  const currentSessionIdRef = useRef<string | null>(initialSession?.id ?? null);
  const searchDebounceRef = useRef<number | null>(null);
  const composerRef = useRef<HTMLTextAreaElement | null>(null);
  const requestWatchdogRef = useRef<number | null>(null);
  const stopChatRef = useRef<(() => void) | null>(null);

  const initialMessages: Message[] = useMemo(
    () =>
      currentSessionId === initialSession?.id
        ? (initialSession?.messages ?? []).map((message) => ({
            id: message.id,
            role: message.role,
            content: message.content,
          }))
        : [],
    [initialSession, currentSessionId],
  );
  const availableSubjects = useMemo(() => {
    const all = [...normalizedProfileSubjects, stripSubjectChapter(subjectContext)]
      .map((item) => (item ? normalizeSubjectLabel(item) : ""))
      .filter(Boolean) as string[];
    return Array.from(new Set(all)).sort((left, right) =>
      left.localeCompare(right, undefined, { sensitivity: "base", numeric: true }),
    );
  }, [normalizedProfileSubjects, subjectContext]);
  const subjectActionOptions = useMemo(
    () =>
      availableSubjects.length > 0
        ? [
            { label: "Subjects", value: "" },
            ...availableSubjects.map((subject) => ({ label: subject, value: subject })),
          ]
        : [{ label: "Subjects", value: "" }],
    [availableSubjects],
  );
  const selectedTenantSubject = useMemo(() => {
    const normalizedSubjectContext = normalizeSubjectLabel(stripSubjectChapter(subjectContext) ?? "");
    if (!normalizedSubjectContext) return null;
    return tenantSubjectsByName[normalizedSubjectContext] ?? null;
  }, [subjectContext, tenantSubjectsByName]);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(ANSWER_STYLE_STORAGE_KEY);
      if (stored === "simple" || stored === "balanced" || stored === "detailed") {
        setAnswerStyle(stored);
      }
    } catch {}
  }, []);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(RETRIEVAL_MODE_STORAGE_KEY);
      if (stored === "default" || stored === "web" || stored === "chapter") {
        setRetrievalMode(stored);
      }
    } catch {}
  }, []);

  useEffect(() => {
    let active = true;

    const hydrateTenantSubjectMetadata = async () => {
      try {
        const payload = await loadTenantSubjectMetadata();
        if (!active) return;

        const profileSubjectSet = new Set(normalizedProfileSubjects);
        const nextSubjectsByName: Record<string, TenantChatSubject> = {};

        for (const subject of payload.subjects ?? []) {
          const normalizedName = normalizeSubjectLabel(subject.name);
          if (!normalizedName || !profileSubjectSet.has(normalizedName)) continue;
          if (!subject.slug || !subject.folderPath || !subject.namespaceSlug) continue;
          nextSubjectsByName[normalizedName] = subject;
        }

        setTenantSubjectsByName(nextSubjectsByName);
      } catch {
        // Chat still works through the server-side subject lookup if metadata is not ready yet.
      }
    };

    void hydrateTenantSubjectMetadata();

    return () => {
      active = false;
    };
  }, [normalizedProfileSubjects]);

  useEffect(() => {
    try {
      window.localStorage.setItem(ANSWER_STYLE_STORAGE_KEY, answerStyle);
    } catch {}
  }, [answerStyle]);

  useEffect(() => {
    try {
      window.localStorage.setItem(RETRIEVAL_MODE_STORAGE_KEY, retrievalMode);
    } catch {}
  }, [retrievalMode]);

  useEffect(() => {
    currentSessionIdRef.current = currentSessionId;
  }, [currentSessionId]);

  useEffect(() => {
    setMatchedScope(null);
  }, [currentSessionId]);

  useEffect(() => {
    const handleNewChat = () => {
      setCurrentSessionId(null);
      currentSessionIdRef.current = null;
      setSessionDetail(null);
      setMessages([]);
      stopChatRef.current?.();
      if (requestWatchdogRef.current) {
        window.clearTimeout(requestWatchdogRef.current);
        requestWatchdogRef.current = null;
      }
      setThinkingStatus(null);
      window.history.replaceState(null, "", "/app/chat");
    };
    window.addEventListener("app:new-chat", handleNewChat);
    return () => window.removeEventListener("app:new-chat", handleNewChat);
  }, []);

  useEffect(() => {
    return () => {
      if (requestWatchdogRef.current) {
        window.clearTimeout(requestWatchdogRef.current);
        requestWatchdogRef.current = null;
      }
    };
  }, []);

  const fetchSessions = useCallback(async function fetchSessions({
    reset,
    offset,
  }: {
    reset: boolean;
    offset?: number;
  }) {
    setHistoryLoading(true);
    setHistoryError("");
    const query = new URLSearchParams();
    query.set("limit", "12");
    query.set("offset", String(offset ?? 0));
    if (historySearch.trim()) {
      query.set("q", historySearch.trim());
    }

    const response = await fetch(`/api/chat/sessions?${query.toString()}`, {
      cache: "no-store",
    });

    setHistoryLoading(false);

    if (!response.ok) {
      const payload = (await response.json()) as { error?: string };
      setHistoryError(payload.error || "Failed to load chat history.");
      return;
    }

    const payload = (await response.json()) as {
      sessions: ChatSessionSummary[];
      hasMore: boolean;
    };

    setHasMoreSessions(payload.hasMore);
    setSessions((prev) => {
      if (reset) return payload.sessions;
      const existingIds = new Set(prev.map((session) => session.id));
      return [...prev, ...payload.sessions.filter((session) => !existingIds.has(session.id))];
    });
  }, [historySearch]);

  useEffect(() => {
    if (searchDebounceRef.current) {
      window.clearTimeout(searchDebounceRef.current);
    }

    searchDebounceRef.current = window.setTimeout(() => {
      void fetchSessions({ reset: true });
    }, 250);

    return () => {
      if (searchDebounceRef.current) {
        window.clearTimeout(searchDebounceRef.current);
      }
    };
  }, [historySearch, fetchSessions]);

  // Listen for fast client-side session switching from sidebar
  useEffect(() => {
    const handleSwitch = async (event: Event) => {
      const sessionId = (event as CustomEvent).detail?.sessionId;
      if (!sessionId || sessionId === currentSessionIdRef.current) return;

      // Update ref immediately so subsequent clicks are ignored
      currentSessionIdRef.current = sessionId;

      stopChatRef.current?.();
      if (requestWatchdogRef.current) {
        window.clearTimeout(requestWatchdogRef.current);
        requestWatchdogRef.current = null;
      }
      setThinkingStatus(null);

      // Fetch data FIRST, then update all state at once (no intermediate empty flash)
      const response = await fetch(`/api/chat/session?session=${sessionId}`, {
        cache: "no-store",
      });
      if (!response.ok) return;
      const detail = (await response.json()) as ChatSessionDetail;

      // Batch all state updates — React batches these into a single render
      setCurrentSessionId(sessionId);
      setChatError("");
      setMatchedScope(null);
      setLatestThinkingTrace(null);
      setSessionDetail(detail);
      setSubjectContext(stripSubjectChapter(detail.subjectContext) || defaultSubjectContext);
      setMessages(
        detail.messages.map((message) => ({
          id: message.id,
          role: message.role,
          content: message.content,
        })),
      );
      setSessions((prev) =>
        prev
          .map((session) =>
            session.id === sessionId
              ? {
                  ...session,
                  title: detail.title,
                  updatedAt: detail.updatedAt,
                  subjectTags: detail.subjectTags,
                  subjectContext: detail.subjectContext,
                }
              : session,
          )
          .sort(
            (left, right) =>
              new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime(),
          ),
      );
    };
    window.addEventListener("chat-switch-session", handleSwitch);
    return () => window.removeEventListener("chat-switch-session", handleSwitch);
  }, [defaultSubjectContext]);

  async function refreshCredits() {
    const response = await fetch("/api/billing/credits", { cache: "no-store" });
    if (!response.ok) return;
    const payload = (await response.json()) as { balance: number };
    setCreditBalance(payload.balance);
  }

  async function refreshSession(sessionId: string) {
    const response = await fetch(`/api/chat/session?session=${sessionId}`, {
      cache: "no-store",
    });

    if (!response.ok) return;
    const detail = (await response.json()) as ChatSessionDetail;
    setSessionDetail(detail);
    setMessages(
      detail.messages.map((message) => ({
        id: message.id,
        role: message.role,
        content: message.content,
      })),
    );
    setSubjectContext(stripSubjectChapter(detail.subjectContext) || defaultSubjectContext);
    setSessions((prev) =>
      prev
        .map((session) =>
          session.id === sessionId
            ? {
                ...session,
                title: detail.title,
                updatedAt: detail.updatedAt,
                subjectTags: detail.subjectTags,
                subjectContext: detail.subjectContext,
              }
            : session,
        )
        .sort(
          (left, right) =>
            new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime(),
        ),
    );
  }

  const activeSessionTitle =
    sessions.find((session) => session.id === currentSessionId)?.title ??
    sessionDetail?.title ??
    "Start a new conversation";

  const {
    messages,
    input,
    handleInputChange,
    append,
    stop,
    isLoading,
    setInput,
    setMessages,
  } = useChat({
    api: "/api/chat",
    initialMessages,
    body: {
      sessionId: currentSessionId,
      subjectContext,
      tenantSubject: selectedTenantSubject,
      answerStyle,
      retrievalMode,
    },
    onResponse(response) {
      // Backend has started responding — reset the watchdog with a generous
      // streaming budget so a slow-but-active stream is not killed.
      if (requestWatchdogRef.current) {
        window.clearTimeout(requestWatchdogRef.current);
        requestWatchdogRef.current = window.setTimeout(() => {
          setThinkingStatus("This question is taking longer than expected...");
          setChatError(
            "Answer generation is taking too long right now. We stopped this try so you are not stuck; please retry once.",
          );
          stop();
        }, 90_000);
      }
      const returnedSessionId = response.headers.get("x-session-id");
      const responseMatchedScope = response.headers.get("x-matched-scope")?.trim() || null;
      const ragChunks = Number(response.headers.get("x-rag-chunks") || "0");
      const grounded = response.headers.get("x-rag-grounded") === "1";
      const responseRetrievalModeHeader = response.headers.get("x-retrieval-mode");
      const responseRetrievalMode =
        responseRetrievalModeHeader === "chapter" || responseRetrievalModeHeader === "web"
          ? responseRetrievalModeHeader
          : "default";
      const responseSubjectContext = response.headers.get("x-subject-context")?.trim() || null;
      const answerModeHeader = response.headers.get("x-answer-mode");
      const answerMode =
        answerModeHeader === "quick" ||
        answerModeHeader === "deep" ||
        answerModeHeader === "tenant_prompt" ||
        answerModeHeader === "deterministic_structure_lookup" ||
        answerModeHeader === "deterministic_catalog_lookup" ||
        answerModeHeader === "deterministic_exam_lookup"
          ? answerModeHeader
          : null;
      const answerModeReason = response.headers.get("x-answer-mode-reason")?.trim() || null;
      const answerModel = response.headers.get("x-answer-model")?.trim() || null;
      const routePath = response.headers.get("x-route-path")?.trim() || null;
      const routeScopeDebug = response.headers.get("x-route-scope-debug")?.trim() || null;
      const topicCardUsed = response.headers.get("x-topic-card-used") === "1";
      const topicCardSourceHeader = response.headers.get("x-topic-card-source");
      const topicCardSource =
        topicCardSourceHeader === "persisted" || topicCardSourceHeader === "derived"
          ? topicCardSourceHeader
          : null;
      const topicCardTitle = response.headers.get("x-topic-card-title")?.trim() || null;
      const questionBankUsed = response.headers.get("x-question-bank-used") === "1";
      const usedFallback = response.headers.get("x-answer-fallback") === "1";
      const usedQualityRescue = response.headers.get("x-answer-quality-rescue") === "1";
      const fallbackReason = response.headers.get("x-answer-fallback-reason")?.trim() || null;
      const ragMsRaw = Number(response.headers.get("x-rag-ms") || "");
      const generationMsRaw = Number(response.headers.get("x-generation-ms") || "");
      const rewriteMsRaw = Number(response.headers.get("x-rewrite-ms") || "");
      const totalMsRaw = Number(response.headers.get("x-total-ms") || "");

      setLatestThinkingTrace({
        grounded,
        ragChunks,
        retrievalMode: responseRetrievalMode,
        subjectContext: responseSubjectContext,
        answerMode,
        answerModeReason,
        answerModel,
        routePath,
        routeScopeDebug,
        topicCardUsed,
        topicCardSource,
        topicCardTitle,
        questionBankUsed,
        usedFallback,
        usedQualityRescue,
        fallbackReason,
        matchedScope: responseMatchedScope,
        ragMs: Number.isFinite(ragMsRaw) ? ragMsRaw : null,
        generationMs: Number.isFinite(generationMsRaw) ? generationMsRaw : null,
        rewriteMs: Number.isFinite(rewriteMsRaw) ? rewriteMsRaw : null,
        totalMs: Number.isFinite(totalMsRaw) ? totalMsRaw : null,
      });

      if (responseMatchedScope) setMatchedScope(responseMatchedScope);
      if (grounded && ragChunks > 0) {
        setThinkingStatus(`Thinking with ${ragChunks} grounded chunks...`);
      } else {
        setThinkingStatus("Building the answer...");
      }

      if (!returnedSessionId || currentSessionIdRef.current) return;

      const title = pendingTitleRef.current || "New chat";
      setCurrentSessionId(returnedSessionId);
      currentSessionIdRef.current = returnedSessionId;
      window.history.replaceState(null, "", `/app/chat?session=${returnedSessionId}`);
      setSessions((prev) => [
        {
          id: returnedSessionId,
          userId: user.id,
          title,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          subjectTags: subjectContext ? [subjectContext] : [],
          subjectContext,
          isPinned: false,
        },
        ...prev,
      ]);
      window.dispatchEvent(new CustomEvent("chat-session-updated"));
    },
    async onFinish() {
      if (requestWatchdogRef.current) {
        window.clearTimeout(requestWatchdogRef.current);
        requestWatchdogRef.current = null;
      }
      setThinkingStatus("Saving the response...");
      setChatError("");
      const resolvedSessionId = currentSessionIdRef.current;
      if (!resolvedSessionId) return;
      await Promise.all([refreshSession(resolvedSessionId), refreshCredits()]);
      setThinkingStatus(null);
    },
    onError(error) {
      if (requestWatchdogRef.current) {
        window.clearTimeout(requestWatchdogRef.current);
        requestWatchdogRef.current = null;
      }
      setThinkingStatus(null);
      const rawMessage = error.message || "";
      let parsedError = "";
      let parsedCode = "";
      
      try {
        const parsed = JSON.parse(rawMessage);
        if (parsed && typeof parsed.error === "string") {
          parsedError = parsed.error;
        }
        if (parsed && typeof parsed.code === "string") {
          parsedCode = parsed.code;
        }
      } catch (e) {
        // Not a JSON string
      }

      if (parsedCode === "MODEL_GENERATION_FAILED" || rawMessage.includes("MODEL_GENERATION_FAILED")) {
        setChatError(
          parsedError ||
          rawMessage.replace(/^.*MODEL_GENERATION_FAILED[:\s-]*("})?/i, "").replace(/["}]+$/, "").trim() ||
          "The answer model failed for this question. Please retry."
        );
        return;
      }

      if (rawMessage.trim() === "An error occurred.") {
        setChatError(
          "Answer model yo try मा fail bhayo. Feri send gara; simple questions ko lagi lighter model use garne banाइएको छ.",
        );
        return;
      }

      if (
        rawMessage.includes("RAG_RETRIEVAL_FAILED") ||
        rawMessage.toLowerCase().includes("syllabus context")
      ) {
        setChatError(
          "Syllabus context could not be loaded right now, so we paused this answer to avoid ungrounded output. Please retry.",
        );
        return;
      }

      setChatError(parsedError || rawMessage || "Something went wrong while generating a response.");
    },
  });

  const groupedSessions = useMemo(() => {
    const groups = new Map<string, ChatSessionSummary[]>();
    sessions.forEach((session) => {
      const group = groupDateLabel(session.updatedAt);
      const list = groups.get(group) ?? [];
      list.push(session);
      groups.set(group, list);
    });

    return ["Today", "Yesterday", "Last 7 Days", "Older"].map((group) => ({
      group,
      items: groups.get(group) ?? [],
    }));
  }, [sessions]);

  const persistedAssistantMessages = useMemo(
    () => (sessionDetail?.messages ?? []).filter((message) => message.role === "assistant"),
    [sessionDetail],
  );

  const assistantQuestions = useMemo(() => {
    const questions: string[] = [];
    const allMessages = sessionDetail?.messages ?? [];
    for (let index = 0; index < allMessages.length; index += 1) {
      const message = allMessages[index];
      if (message.role === "assistant") {
        const previous = index > 0 ? allMessages[index - 1] : null;
        questions.push(previous?.role === "user" ? previous.content : activeSessionTitle);
      }
    }
    return questions;
  }, [sessionDetail, activeSessionTitle]);

  const activeSessionSummary = useMemo<ChatSessionSummary | null>(() => {
    const foundSession = sessions.find((session) => session.id === currentSessionId);
    if (foundSession) return foundSession;
    if (!sessionDetail) return null;

    return {
      id: sessionDetail.id,
      userId: sessionDetail.userId,
      title: sessionDetail.title,
      createdAt: sessionDetail.createdAt,
      updatedAt: sessionDetail.updatedAt,
      subjectTags: sessionDetail.subjectTags,
      subjectContext: sessionDetail.subjectContext,
      isPinned: sessionDetail.isPinned,
    };
  }, [currentSessionId, sessionDetail, sessions]);

  async function sendCurrentMessage() {
    const trimmed = input.trim();
    if (!trimmed || isLoading) return;
    if (creditBalance <= 0) {
      setChatError("No credits left. Buy a plan to continue chatting.");
      return;
    }

    if (requestWatchdogRef.current) {
      window.clearTimeout(requestWatchdogRef.current);
      requestWatchdogRef.current = null;
    }

    pendingTitleRef.current = deriveSessionTitle(trimmed, subjectContext);
    setChatError("");
    setShowThinkingTrace(false);
    setThinkingStatus("Retrieving syllabus context...");
    setInput("");
    requestWatchdogRef.current = window.setTimeout(() => {
      setThinkingStatus("This question is taking longer than expected...");
      setChatError(
        "Answer generation is taking too long right now. We stopped this try so you are not stuck; please retry once.",
      );
      stop();
    }, 60_000);

    await append(
      {
        role: "user",
        content: trimmed,
      },
      {
        body: {
          sessionId: currentSessionId,
          language: chatLanguage,
          messageLanguage: composerLanguage,
          subjectContext,
          tenantSubject: selectedTenantSubject,
          answerStyle,
          retrievalMode,
        },
      },
    );
  }

  async function submitMessage(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await sendCurrentMessage();
  }

  async function renameCurrentSession(title: string) {
    const targetSession = renameState ?? activeSessionSummary;
    if (!targetSession?.id) return;

    const response = await fetch(`/api/chat/sessions/${targetSession.id}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ title }),
    });

    if (!response.ok) {
      const payload = (await response.json()) as { error?: string };
      setChatError(payload.error || "Failed to rename chat.");
      return;
    }

    const updated = (await response.json()) as ChatSessionSummary;
    setSessions((prev) =>
      prev.map((s) => (s.id === targetSession.id ? { ...s, title } : s)),
    );
    window.dispatchEvent(new CustomEvent("chat-session-updated"));
    setSessionDetail((prev) => (prev ? { ...prev, title: updated.title, updatedAt: updated.updatedAt } : prev));
    setRenameState(null);
  }

  async function deleteCurrentSession() {
    const targetSession = deleteConfirmSession ?? activeSessionSummary;
    if (!targetSession?.id) return;
    setDeletingSessionId(targetSession.id);
    setChatError("");

    const response = await fetch(`/api/chat/sessions/${targetSession.id}`, {
      method: "DELETE",
    });

    setDeletingSessionId(null);

    if (!response.ok) {
      const payload = (await response.json()) as { error?: string };
      setChatError(payload.error || "Failed to delete chat.");
      return;
    }

    setSessions((prev) => prev.filter((session) => session.id !== targetSession.id));
    if (currentSessionIdRef.current === targetSession.id) {
      setCurrentSessionId(null);
      currentSessionIdRef.current = null;
      setSessionDetail(null);
      setSubjectContext(defaultSubjectContext);
      setMessages([]);
      window.history.replaceState(null, "", "/app/chat");
    }
  }

  const updateSessionSubjectContext = useCallback(async (nextSubjectContext: string | null) => {
    const normalizedSubjectContext = nextSubjectContext ? normalizeSubjectLabel(nextSubjectContext) : null;
    const previousSubjectContext = subjectContext;
    setChatError("");
    setSubjectContext(normalizedSubjectContext);

    if (!activeSessionSummary) return;

    const response = await fetch(`/api/chat/sessions/${activeSessionSummary.id}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ subjectContext: normalizedSubjectContext }),
    });

    if (!response.ok) {
      setSubjectContext(previousSubjectContext);
      const payload = (await response.json()) as { error?: string };
      setChatError(payload.error || "Failed to update session subject.");
      return;
    }

    const updated = (await response.json()) as ChatSessionSummary;
    setSessions((prev) => prev.map((session) => (session.id === updated.id ? updated : session)));
    setSessionDetail((prev) =>
      prev
        ? {
            ...prev,
            subjectContext: updated.subjectContext,
            subjectTags: updated.subjectTags,
            updatedAt: updated.updatedAt,
          }
        : prev,
    );
  }, [activeSessionSummary, subjectContext]);

  async function copyAssistantMessage(message: ChatMessageRecord) {
    setCopyingMessageId(message.id);
    try {
      await navigator.clipboard.writeText(message.content);
      setUiFeedback("Answer copied to clipboard.");
    } catch {
      setChatError("Failed to copy the answer.");
    } finally {
      setCopyingMessageId(null);
    }
  }

  function applySuggestedPrompt(prompt: string) {
    setInput(prompt);
    composerRef.current?.focus();
  }

  function applyAnswerStyle(style: AnswerStyle) {
    setAnswerStyle(style);
    setUiFeedback(`${ANSWER_STYLE_LABELS[style]} answers will be preferred from now on.`);
  }

  useEffect(() => {
    if (!initialPrompt?.trim()) return;
    setInput(initialPrompt.trim());
    composerRef.current?.focus();
  }, [initialPrompt, setInput]);

  useEffect(() => {
    shell.setTitle(
      <TopHeaderTitle 
        activeSessionTitle={activeSessionTitle}
        currentSessionId={currentSessionId}
        onRename={() => {
          if (currentSessionId) {
            setRenameState(
              activeSessionSummary ?? {
                id: currentSessionId,
                userId: user.id,
                title: activeSessionTitle,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
                subjectTags: [],
                subjectContext,
                isPinned: false,
              },
            );
          }
        }}
        onDelete={() => {
          if (currentSessionId) {
            setDeleteConfirmSession(
              activeSessionSummary ?? {
                id: currentSessionId,
                userId: user.id,
                title: activeSessionTitle,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
                subjectTags: [],
                subjectContext,
                isPinned: false,
              },
            );
          }
        }}
      />
    );
    return () => shell.setTitle(null);
  }, [activeSessionTitle, currentSessionId, shell, activeSessionSummary, user.id, subjectContext]);

  useEffect(() => {
    shell.setActions(
      <div className="flex items-center">
        <CompactSelect
          value={composerLanguage}
          onChange={(v) => setComposerLanguage(v as "EN" | "RN")}
          options={[
            { label: "English", value: "EN" },
            { label: "Roman Nepali", value: "RN" }
          ]}
        />
      </div>
    );
    return () => shell.setActions(null);
  }, [shell, composerLanguage, setComposerLanguage]);

  useEffect(() => {
    stopChatRef.current = stop;
  }, [stop]);




  const hasMessages = messages.length > 0;
  
  const firstName = user?.fullName?.split(" ")[0] || "Student";
  const capitalizedFirstName = firstName.charAt(0).toUpperCase() + firstName.slice(1);

  const renderInputForm = () => (
    <form onSubmit={submitMessage} className="w-full rounded-[16px] border border-black/5 dark:border-white/5 bg-bg-secondary p-2.5 px-3.5 shadow-[0_4px_24px_rgba(0,0,0,0.15)] flex flex-col justify-between">
      <textarea
        ref={composerRef}
        value={input}
        onChange={(event: ChangeEvent<HTMLTextAreaElement>) => handleInputChange(event)}
        onKeyDown={(event: KeyboardEvent<HTMLTextAreaElement>) => {
          if (event.key === "Enter" && !event.shiftKey) {
            event.preventDefault();
            void sendCurrentMessage();
          }
        }}
        rows={1}
        placeholder="How can I help you today?"
        className="min-h-[44px] w-full resize-none bg-transparent px-2 py-1.5 text-[15px] leading-7 text-text-primary outline-none placeholder:text-text-muted"
      />
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-1 md:gap-3">
          <button type="button" className="text-text-muted hover:text-text-primary p-1.5 ml-1 hidden md:block">
             <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14M5 12h14"/></svg>
          </button>
          <CompactSelect
            value={stripSubjectChapter(subjectContext) ?? subjectActionOptions[0]?.value ?? ""}
            onChange={(value) => void updateSessionSubjectContext(value || null)}
            options={subjectActionOptions}
            direction="up"
          />
          <CompactSelect
            value={retrievalMode}
            onChange={(v) => setRetrievalMode(v as RetrievalMode)}
            options={(Object.keys(RETRIEVAL_MODE_LABELS) as Array<Exclude<RetrievalMode, "chapter">>).map(mode => ({
              label: RETRIEVAL_MODE_LABELS[mode],
              value: mode
            }))}
            direction="up"
          />
        </div>
        <Button
          type="submit"
          disabled={isLoading || !input.trim() || creditBalance <= 0}
          className="h-10 min-w-[90px] rounded-full px-4 text-[15px] font-medium bg-black dark:bg-white text-white dark:text-black hover:opacity-80 disabled:opacity-50 transition"
        >
          {isLoading ? "Sending..." : "Send →"}
        </Button>
      </div>
    </form>
  );

  return (
    <div className="flex h-full min-h-0 flex-col bg-bg-primary">
      <section className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        {/* matchedScope banner hidden temporarily */}


        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="mx-auto flex w-full max-w-5xl flex-col px-4 pb-24 pt-5 md:px-5 xl:px-6">
            {messages.length === 0 ? (
              <div className="mx-auto flex min-h-[75vh] w-full max-w-3xl flex-col items-center justify-center text-center">
                <div className="flex flex-row items-center justify-center gap-4 sm:gap-5 text-text-primary mb-8 text-center">
                  <h1 className="font-display text-3xl sm:text-[40px] leading-tight font-normal tracking-tight">
                    <svg width="42" height="42" viewBox="0 0 24 24" fill="none" stroke="url(#premium-blue)" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round" className="inline-block align-text-bottom mr-3 sm:mr-4 drop-shadow-[0_0_10px_rgba(96,165,250,0.65)]">
                      <defs>
                        <linearGradient id="premium-blue" x1="0%" y1="0%" x2="100%" y2="100%">
                          <stop offset="0%" stopColor="#60A5FA" />
                          <stop offset="100%" stopColor="#2563EB" />
                        </linearGradient>
                      </defs>
                      <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/>
                      <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>
                    </svg>
                    One step closer to your dreams, {capitalizedFirstName}.
                  </h1>
                </div>
                
                <div className="w-full text-left">
                  {chatError ? (
                    <p className="mb-3 rounded-2xl border border-destructive/40 bg-[color:var(--note-red)] px-4 py-3 text-sm text-destructive">
                      {chatError}
                    </p>
                  ) : null}
                  {renderInputForm()}
                </div>

              </div>
            ) : (
              <div className="space-y-5">
                {messages.map((message, index) => {
                  const assistantOrdinal =
                    message.role === "assistant"
                      ? messages.slice(0, index + 1).filter((item) => item.role === "assistant").length - 1
                      : -1;
                  const persistedAssistant =
                    assistantOrdinal >= 0 ? persistedAssistantMessages[assistantOrdinal] ?? null : null;
                  const displayCitations = persistedAssistant?.citations
                    ? dedupeCitationsForDisplay(persistedAssistant.citations)
                    : [];
                  const question = assistantOrdinal >= 0 ? assistantQuestions[assistantOrdinal] ?? activeSessionTitle : "";

                  return (
                    <article
                      key={message.id}
                      className={cn(
                        "animate-fade-in flex flex-col",
                        message.role === "user" ? "ml-auto w-fit max-w-[min(900px,92%)]" : "mr-auto w-full max-w-[1020px]",
                      )}
                    >
                      <div
                        className={cn(
                          message.role === "user"
                            ? "rounded-[24px] px-4 py-2.5 bg-bg-tertiary text-text-primary shadow-sm"
                            : "py-2 text-text-primary w-full",
                        )}
                      >
                        {message.role === "assistant" ? (
                          <Markdown text={message.content} className="text-[16px] leading-[28px] font-medium" />
                        ) : (
                          <div className="whitespace-pre-wrap text-[16px] leading-[24px] text-text-primary font-medium">
                            {message.content}
                          </div>
                        )}



                        {persistedAssistant ? (
                          <div className="mt-5 space-y-4">
                            <div className="flex flex-wrap items-center gap-2">
                              <Button
                                type="button"
                                size="sm"
                                variant="ghost"
                                onClick={() => void copyAssistantMessage(persistedAssistant)}
                                disabled={copyingMessageId === persistedAssistant.id}
                                data-testid={`copy-message-${persistedAssistant.id}`}
                                className="rounded-full"
                              >
                                {copyingMessageId === persistedAssistant.id ? "Copying..." : "Copy"}
                              </Button>
                              <Button
                                type="button"
                                size="sm"
                                variant={persistedAssistant.savedNoteId ? "outline" : "filled"}
                                className="rounded-full"
                                onClick={() =>
                                  setSaveState({
                                    message: persistedAssistant,
                                    question,
                                  })
                                }
                                data-testid={`save-note-${persistedAssistant.id}`}
                              >
                                {persistedAssistant.savedNoteId ? "Edit note" : "Save as note"}
                              </Button>
                              {persistedAssistant.savedNoteId ? (
                                <Link href={`/app/notes/${persistedAssistant.savedNoteId}`}>
                                  <Button size="sm" variant="ghost" className="rounded-full">
                                    Open note →
                                  </Button>
                                </Link>
                              ) : null}
                            </div>


                          </div>
                        ) : null}
                      </div>
                    </article>
                  );
                })}

                {isLoading ? (
                  <div className="mr-auto w-full max-w-[1020px] px-2 py-4">
                    <p className="mb-2 text-[13px] text-text-muted">{thinkingStatus || "Generating..."}</p>
                    <div className="flex items-center">
                      <span className="typing-dot" />
                      <span className="typing-dot" />
                      <span className="typing-dot" />
                    </div>
                  </div>
                ) : null}
              </div>
            )}
          </div>
        </div>

        {messages.length > 0 ? (
          <div className="bg-bg-primary px-4 pb-4 pt-3 md:px-5 xl:px-6">
            <div className="mx-auto max-w-3xl">
              {chatError ? (
                <p className="mb-3 rounded-2xl border border-destructive/40 bg-[color:var(--note-red)] px-4 py-3 text-sm text-destructive">
                  {chatError}
                </p>
              ) : null}
              {renderInputForm()}
            </div>
          </div>
        ) : null}
      </section>

      {saveState ? (
        <SaveNoteModal
          initialMessage={saveState.message}
          initialQuestion={saveState.question}
          onClose={() => setSaveState(null)}
          onSaved={async (text) => {
            setUiFeedback(text);
            setSaveState(null);
            const resolvedSessionId = currentSessionIdRef.current;
            if (resolvedSessionId) {
              await refreshSession(resolvedSessionId);
            }
          }}
        />
      ) : null}
      {renameState ? (
        <RenameSessionModal
          session={renameState}
          onClose={() => setRenameState(null)}
          onSave={(title) => void renameCurrentSession(title)}
        />
      ) : null}

      {deleteConfirmSession ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm" onClick={() => !deletingSessionId && setDeleteConfirmSession(null)}>
          <div onClick={(e) => e.stopPropagation()} className="w-full max-w-md rounded-xl border border-border bg-bg-primary p-6 animate-in slide-in-from-bottom-4 duration-200">
            <h3 className="font-display text-xl mb-2 text-text-primary">Delete chat?</h3>
            <p className="text-sm text-text-secondary mb-6">This action cannot be undone. All messages in this chat will be permanently removed.</p>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setDeleteConfirmSession(null)} disabled={!!deletingSessionId}>Cancel</Button>
              <Button 
                variant="danger" 
                onClick={async () => {
                  await deleteCurrentSession();
                  setDeleteConfirmSession(null);
                }} 
                disabled={!!deletingSessionId}
              >
                {deletingSessionId ? "Deleting..." : "Delete chat"}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function SaveNoteModal({
  initialMessage,
  initialQuestion,
  onClose,
  onSaved,
}: {
  initialMessage: ChatMessageRecord;
  initialQuestion: string;
  onClose: () => void;
  onSaved: (message: string) => Promise<void>;
}) {
  const [title, setTitle] = useState(initialQuestion || initialMessage.content.slice(0, 80));
  const [subjectTag, setSubjectTag] = useState(
    initialMessage.citations[0]?.subject || "General",
  );
  const [chapterTag, setChapterTag] = useState(
    initialMessage.citations[0]?.chapter || initialMessage.citations[0]?.topic || "",
  );
  const [annotation, setAnnotation] = useState("");
  const [colorLabel, setColorLabel] = useState<NoteColor>("yellow");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [hydratingExistingNote, setHydratingExistingNote] = useState(Boolean(initialMessage.savedNoteId));

  useEffect(() => {
    let ignore = false;

    async function loadExistingNote() {
      if (!initialMessage.savedNoteId) {
        setHydratingExistingNote(false);
        return;
      }

      setHydratingExistingNote(true);
      setError("");

      const response = await fetch(`/api/notes/${initialMessage.savedNoteId}`, {
        cache: "no-store",
      });

      if (!response.ok) {
        const payload = (await response.json()) as { error?: string };
        if (!ignore) {
          setError(payload.error || "Failed to load note details.");
          setHydratingExistingNote(false);
        }
        return;
      }

      const note = (await response.json()) as {
        title: string;
        subjectTag: string;
        chapterTag: string | null;
        annotation: string | null;
        colorLabel: NoteColor;
      };

      if (ignore) return;

      setTitle(note.title);
      setSubjectTag(note.subjectTag);
      setChapterTag(note.chapterTag ?? "");
      setAnnotation(note.annotation ?? "");
      setColorLabel(note.colorLabel);
      setHydratingExistingNote(false);
    }

    void loadExistingNote();

    return () => {
      ignore = true;
    };
  }, [initialMessage.savedNoteId]);

  async function handleSave() {
    if (hydratingExistingNote) return;
    setLoading(true);
    setError("");

    const response = await fetch("/api/notes", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        sessionId: initialMessage.sessionId,
        messageId: initialMessage.id,
        title,
        subjectTag,
        chapterTag,
        annotation,
        colorLabel,
      }),
    });

    setLoading(false);

    if (!response.ok) {
      const payload = (await response.json()) as { error?: string };
      setError(payload.error || "Failed to save note.");
      return;
    }

    await onSaved(initialMessage.savedNoteId ? "Note updated." : "Note saved.");
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm"
      onClick={onClose}
      data-testid="save-note-modal-overlay"
    >
      <div
        onClick={(event) => event.stopPropagation()}
        className="w-full max-w-lg rounded-xl border border-border bg-bg-primary p-6 animate-slide-up"
        data-testid="save-note-modal"
      >
        <h3 className="font-display text-2xl">{initialMessage.savedNoteId ? "Edit note" : "Save as note"}</h3>
        <div className="mt-5 space-y-4">
          {hydratingExistingNote ? (
            <p className="text-sm text-text-secondary">Loading your saved note details...</p>
          ) : null}
          <Field label="Title">
            <Input value={title} onChange={(event) => setTitle(event.target.value)} />
          </Field>
          <Field label="Subject">
            <Input
              data-testid="save-note-subject"
              value={subjectTag}
              onChange={(event) => setSubjectTag(event.target.value)}
            />
          </Field>
          <Field label="Chapter / topic">
            <Input value={chapterTag} onChange={(event) => setChapterTag(event.target.value)} />
          </Field>
          <Field label="Annotation">
            <Textarea
              data-testid="save-note-annotation"
              value={annotation}
              onChange={(event) => setAnnotation(event.target.value)}
              rows={3}
            />
          </Field>
          <div>
            <p className="mb-2 text-[10px] font-mono-ui uppercase text-text-muted">Color label</p>
            <div className="flex gap-2">
              {(["red", "yellow", "green"] as const).map((color) => (
                <button
                  key={color}
                  type="button"
                  onClick={() => setColorLabel(color)}
                  className={
                    "flex-1 rounded-md border px-2 py-2 text-xs transition " +
                    (colorLabel === color ? "border-text-primary bg-bg-secondary font-medium" : "border-border")
                  }
                >
                  {COLOR_LABEL[color]}
                </button>
              ))}
            </div>
          </div>
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
        </div>
        <div className="mt-6 flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={loading || hydratingExistingNote}>
            {loading ? "Saving..." : initialMessage.savedNoteId ? "Update note" : "Save note"}
          </Button>
        </div>
      </div>
    </div>
  );
}

function RenameSessionModal({
  session,
  onClose,
  onSave,
}: {
  session: ChatSessionSummary;
  onClose: () => void;
  onSave: (title: string) => void;
}) {
  const [title, setTitle] = useState(session.title);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        onClick={(event) => event.stopPropagation()}
        className="w-full max-w-md rounded-xl border border-border bg-bg-primary p-6 animate-slide-up"
      >
        <h3 className="font-display text-2xl">Rename chat</h3>
        <div className="mt-5">
          <Field label="Title">
            <Input value={title} onChange={(event) => setTitle(event.target.value)} />
          </Field>
        </div>
        <div className="mt-6 flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => onSave(title.trim())} disabled={!title.trim()}>
            Save
          </Button>
        </div>
      </div>
    </div>
  );
}
