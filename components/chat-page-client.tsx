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
  type ClipboardEvent,
  type KeyboardEvent,
} from "react";
import { AppShellContext } from "@/components/app-shell-context";

import { Markdown } from "@/components/markdown";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ThinkingSteps } from "@/components/ui/thinking-steps";
import { CompactSelect } from "@/components/ui/compact-select";
import { Field, Input, Textarea } from "@/components/ui/field";
import { dedupeCitationsForDisplay } from "@/lib/citations";
import { normalizeBoard, normalizeGrade, normalizeSubjectLabel } from "@/lib/profile-normalization";
import type {
  AppUser,
  AssistantAnswerTrace,
  ChatImageAttachment,
  ChatMessageRecord,
  ChatSessionDetail,
  ChatSessionSummary,
  Language,
  MessageFeedback,
  NoteColor,
  RevisionNoteDetail,
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

type RetrievalMode = "default" | "web";
const RETRIEVAL_MODE_LABELS: Record<RetrievalMode, string> = {
  default: "Exam mode",
  web: "Study mode",
};

type TenantChatSubject = {
  name: string;
  slug: string;
  namespaceSlug: string;
  folderPath: string;
};

type Message = {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt?: string;
  answerTrace?: AssistantAnswerTrace | null;
  attachments?: ChatImageAttachment[];
};

function keepLocalAttachmentsOnRefresh(
  incomingMessages: ChatMessageRecord[],
  currentMessages: Message[],
): Message[] {
  return incomingMessages.map((message, index) => {
    const currentMessage = currentMessages[index];
    const incomingAttachments = message.attachments ?? [];
    const currentAttachments = currentMessage?.attachments ?? [];
    const shouldKeepLocalAttachments =
      incomingAttachments.length === 0 &&
      currentAttachments.length > 0 &&
      currentMessage?.role === message.role &&
      currentMessage.content === message.content;

    return {
      id: message.id,
      role: message.role,
      content: message.content,
      createdAt: message.createdAt,
      answerTrace: message.answerTrace,
      attachments: shouldKeepLocalAttachments ? currentAttachments : incomingAttachments,
    };
  });
}

const MAX_IMAGE_ATTACHMENTS = 4;
const MAX_IMAGE_ATTACHMENT_BYTES = 5 * 1024 * 1024;
const ACCEPTED_IMAGE_TYPES = new Set(["image/png", "image/jpeg", "image/jpg", "image/webp", "image/gif"]);

type TenantCatalogPayload = {
  subjects?: TenantChatSubject[];
};

type ChatSwitchSessionDetail = {
  sessionId: string;
  title?: string;
  subjectContext?: string | null;
};

async function readJsonResponse<T>(response: Response): Promise<T | null> {
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) {
    return null;
  }

  try {
    return (await response.json()) as T;
  } catch {
    return null;
  }
}

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
  citationCount: number;
  subjectContext: string | null;
  retrievalMode: RetrievalMode;
  answerMode: "tenant_prompt" | "tenant_chat_stream" | null;
  answerModeReason: string | null;
  answerModel: string | null;
  routePath: string | null;
  routeScopeDebug: string | null;
  matchedScope: string | null;
  lookupMs: number | null;
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
      `Received ${trace.citationCount} tenant citation${trace.citationCount === 1 ? "" : "s"} for this answer.`,
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
  if (trace.answerMode) {
    lines.push(
      `Answer mode: ${trace.answerMode}${trace.answerModeReason ? ` (${trace.answerModeReason})` : ""}.`,
    );
  }
  if (trace.answerModel) {
    lines.push(`Model used: ${trace.answerModel}.`);
  }
  return lines;
}

function buildTracePills(trace: ThinkingTrace) {
  return [
    trace.grounded ? "Grounded" : "Ungrounded",
    RETRIEVAL_MODE_LABELS[trace.retrievalMode],
    trace.answerMode
        ? `${trace.answerMode} answer`
        : null,
  ].filter(Boolean) as string[];
}

function createLocalMessage(role: "user" | "assistant", content: string): Message {
  const id =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${role}-${Date.now()}-${Math.random().toString(36).slice(2)}`;

  return { id, role, content, createdAt: new Date().toISOString() };
}

function formatAttachmentSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function isAllowedImageFile(file: File) {
  const type = file.type.toLowerCase();
  const name = file.name.toLowerCase();
  return (
    ACCEPTED_IMAGE_TYPES.has(type) ||
    /\.(png|jpe?g|webp|gif)$/.test(name)
  );
}

function createImageAttachment(file: File): Promise<ChatImageAttachment> {
  if (!isAllowedImageFile(file)) {
    return Promise.reject(new Error("Only PNG, JPG, JPEG, WEBP, and GIF images are supported."));
  }

  if (file.size > MAX_IMAGE_ATTACHMENT_BYTES) {
    return Promise.reject(new Error(`Image must be ${formatAttachmentSize(MAX_IMAGE_ATTACHMENT_BYTES)} or smaller.`));
  }

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === "string" ? reader.result : "";
      if (!result.startsWith("data:image/")) {
        reject(new Error("Could not read this image."));
        return;
      }

      resolve({
        id:
          typeof crypto !== "undefined" && "randomUUID" in crypto
            ? crypto.randomUUID()
            : `image-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        name: file.name || "Pasted image",
        mimeType: file.type || "image/png",
        size: file.size,
        dataUrl: result,
      });
    };
    reader.onerror = () => reject(new Error("Could not read this image."));
    reader.readAsDataURL(file);
  });
}

type ChatStreamEvent =
  | { type: "status"; message: string }
  | { type: "token"; text: string }
  | { type: "sources"; citationCount?: number; chunks_retrieved?: number; served_from?: string }
  | {
      type: "done";
      ok?: boolean;
      sessionId?: string;
      generationMs?: number;
      totalMs?: number;
      citationCount?: number;
    }
  | { type: "error"; message: string; code?: string };

const THINKING_STAGE_MESSAGES = [
  "Reading your message...",
  "Analyzing course syllabus...",
  "Searching for relevant topics...",
  "Structuring the answer...",
  "Cross-referencing study materials...",
  "Synthesizing information...",
  "Formatting response...",
  "Finalizing details...",
  "Almost there, taking a bit longer than usual...",
] as const;

const CHAT_MESSAGE_PAGE_SIZE = 30;
const OLDER_MESSAGE_LOAD_THRESHOLD_PX = 160;
const BOTTOM_STICK_THRESHOLD_PX = 180;

/**
 * Chat history storyboard:
 * 0ms: render the latest message page and jump to the bottom without animation.
 * Scroll near top: fetch one older page while showing a compact loader.
 * After prepend: restore scrollTop by the height delta so the viewport does not jump.
 */

function mapTenantStatusMessage(message: string) {
  const trimmed = message.trim();
  const lower = trimmed.toLowerCase();

  if (!trimmed) return "Working on your answer...";
  if (lower.includes("connecting")) return "Reading your message...";
  if (lower.includes("checking learned") || lower.includes("reading")) {
    return "Reading your message...";
  }
  if (lower.includes("analyzing") || lower.includes("course syllabus")) {
    return "Analyzing course syllabus...";
  }
  if (lower.includes("retrieving") || lower.includes("searching") || lower.includes("source")) {
    return "Searching for relevant topics...";
  }
  if (lower.includes("generating") || lower.includes("structuring") || lower.includes("found")) {
    return "Structuring the answer...";
  }

  return trimmed;
}

function appendThinkingStep(previous: string[], message: string) {
  if (previous.length > 0 && previous[previous.length - 1] === message) return previous;
  if (previous.includes(message)) {
    return [...previous.filter((step) => step !== message), message];
  }
  return [...previous, message];
}

function parseSseBlock(block: string): ChatStreamEvent | null {
  const eventName = block.match(/^event:\s*(.+)$/m)?.[1]?.trim() ?? "message";
  const data = [...block.matchAll(/^data:\s?(.*)$/gm)].map((match) => match[1]).join("\n");
  if (!data) return null;

  let payload: Record<string, unknown> = {};
  try {
    const parsed = JSON.parse(data);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      payload = parsed as Record<string, unknown>;
    }
  } catch {
    payload = { message: data };
  }

  if (eventName === "status") {
    return { type: "status", message: String(payload.message ?? "Working...") };
  }
  if (eventName === "token") {
    return { type: "token", text: String(payload.text ?? "") };
  }
  if (eventName === "sources") {
    return {
      type: "sources",
      citationCount: Array.isArray(payload.sources) ? payload.sources.length : undefined,
      chunks_retrieved:
        typeof payload.chunks_retrieved === "number" ? payload.chunks_retrieved : undefined,
      served_from: typeof payload.served_from === "string" ? payload.served_from : undefined,
    };
  }
  if (eventName === "done") {
    return {
      type: "done",
      ok: typeof payload.ok === "boolean" ? payload.ok : undefined,
      sessionId: typeof payload.sessionId === "string" ? payload.sessionId : undefined,
      generationMs: typeof payload.generationMs === "number" ? payload.generationMs : undefined,
      totalMs: typeof payload.totalMs === "number" ? payload.totalMs : undefined,
      citationCount: typeof payload.citationCount === "number" ? payload.citationCount : undefined,
    };
  }
  if (eventName === "error") {
    return {
      type: "error",
      message: String(payload.message ?? payload.error ?? "Streaming failed."),
      code: typeof payload.code === "string" ? payload.code : undefined,
    };
  }
  return null;
}

function buildMissingSubjectMessage(subjects: string[]) {
  if (subjects.length === 0) {
    return [
      "You haven't selected any subject yet.",
      "",
      "I could not find available subjects for your current semester right now. Please select a subject from the **Subjects** menu, or update your profile subjects first.",
    ].join("\n");
  }

  return [
    "You haven't selected any subject yet.",
    "",
    "Available subjects:",
    ...subjects.map((subject) => `- ${subject}`),
    "",
    "Please select one from the **Subjects** menu, then ask your question again.",
  ].join("\n");
}

function TopHeaderTitle({
  activeSessionTitle,
  currentSessionId,
  onSaveTitle,
  onShare,
  shareLoading,
}: {
  activeSessionTitle: string;
  currentSessionId: string | null;
  onSaveTitle: (title: string) => Promise<void> | void;
  onShare: () => void;
  shareLoading: boolean;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [draftTitle, setDraftTitle] = useState(activeSessionTitle);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!isEditing) {
      setDraftTitle(activeSessionTitle);
    }
  }, [activeSessionTitle, isEditing]);

  async function saveTitle() {
    const nextTitle = draftTitle.trim();

    if (!currentSessionId || !nextTitle || nextTitle === activeSessionTitle) {
      setDraftTitle(activeSessionTitle);
      setIsEditing(false);
      return;
    }

    setIsSaving(true);
    try {
      await onSaveTitle(nextTitle);
      setIsEditing(false);
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="relative flex min-w-0 items-center gap-2">
      {isEditing ? (
        <input
          autoFocus
          value={draftTitle}
          disabled={isSaving}
          onBlur={() => void saveTitle()}
          onFocus={(event) => event.currentTarget.select()}
          onChange={(event) => setDraftTitle(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              void saveTitle();
            }

            if (event.key === "Escape") {
              event.preventDefault();
              setDraftTitle(activeSessionTitle);
              setIsEditing(false);
            }
          }}
          className="h-9 min-w-0 w-[min(58vw,520px)] max-w-[calc(100vw-190px)] rounded-full border border-border bg-bg-secondary px-3 text-sm font-semibold text-text-primary outline-none transition focus:border-text-primary disabled:opacity-60 sm:w-[min(46vw,520px)] sm:text-base"
          aria-label="Edit chat title"
        />
      ) : (
        <button
          type="button"
          disabled={!currentSessionId}
          onClick={() => {
            setDraftTitle(activeSessionTitle);
            setIsEditing(true);
          }}
          className="group inline-flex min-w-0 max-w-[min(58vw,520px)] items-center gap-2 rounded-full px-1 py-1 text-left font-semibold transition hover:bg-bg-secondary disabled:cursor-default disabled:hover:bg-transparent sm:max-w-[min(46vw,520px)]"
          title={currentSessionId ? "Edit chat title" : undefined}
        >
          <span className="min-w-0 truncate">{activeSessionTitle}</span>
        </button>
      )}

    </div>
  );
}

/* ─────────────────────────────────────────────────────────
 * CHAT SESSION SWITCH STORYBOARD
 *
 *    0ms   selected recent + target title become active
 *    0ms   previous conversation is replaced by a stable skeleton
 *  ready   fetched messages fade into the existing chat shell
 * ───────────────────────────────────────────────────────── */
function ChatSessionLoadingSkeleton() {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-label="Loading conversation"
      className="mx-auto w-full max-w-[1020px] animate-fade-in py-8 motion-reduce:animate-none"
    >
      <span className="sr-only">Loading conversation...</span>
      <div className="space-y-10" aria-hidden="true">
        <div className="ml-auto flex w-[min(520px,78%)] flex-col items-end gap-2">
          <div className="h-14 w-full rounded-[24px] bg-bg-tertiary animate-pulse-soft motion-reduce:animate-none" />
          <div className="h-3 w-16 rounded-full bg-bg-secondary animate-pulse-soft motion-reduce:animate-none" />
        </div>
        <div className="mr-auto w-full max-w-3xl space-y-3">
          <div className="h-4 w-1/3 rounded-full bg-bg-tertiary animate-pulse-soft motion-reduce:animate-none" />
          <div className="h-4 w-full rounded-full bg-bg-secondary animate-pulse-soft motion-reduce:animate-none" />
          <div className="h-4 w-[92%] rounded-full bg-bg-secondary animate-pulse-soft motion-reduce:animate-none" />
          <div className="h-4 w-2/3 rounded-full bg-bg-secondary animate-pulse-soft motion-reduce:animate-none" />
        </div>
        <div className="ml-auto h-12 w-[min(360px,64%)] rounded-[24px] bg-bg-tertiary animate-pulse-soft motion-reduce:animate-none" />
        <div className="mr-auto w-full max-w-2xl space-y-3">
          <div className="h-4 w-1/2 rounded-full bg-bg-tertiary animate-pulse-soft motion-reduce:animate-none" />
          <div className="h-4 w-full rounded-full bg-bg-secondary animate-pulse-soft motion-reduce:animate-none" />
          <div className="h-4 w-4/5 rounded-full bg-bg-secondary animate-pulse-soft motion-reduce:animate-none" />
        </div>
      </div>
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
  initialReferenceNote,
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
  initialReferenceNote?: RevisionNoteDetail | null;
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
  const [switchingSessionId, setSwitchingSessionId] = useState<string | null>(null);
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
  const [referenceNote, setReferenceNote] = useState<RevisionNoteDetail | null>(initialReferenceNote ?? null);

  useEffect(() => {
    if (initialReferenceNote) {
      setReferenceNote(initialReferenceNote);
    }
  }, [initialReferenceNote]);

  const [retrievalMode, setRetrievalMode] = useState<RetrievalMode>("default");
  const [saveState, setSaveState] = useState<{
    message: ChatMessageRecord;
    question: string;
  } | null>(null);
  const [uiFeedback, setUiFeedback] = useState("");
  const [renameState, setRenameState] = useState<ChatSessionSummary | null>(null);
  const [deletingSessionId, setDeletingSessionId] = useState<string | null>(null);
  const [copyingMessageId, setCopyingMessageId] = useState<string | null>(null);
  const [feedbackSavingMessageId, setFeedbackSavingMessageId] = useState<string | null>(null);
  const [noteSavingMessageId, setNoteSavingMessageId] = useState<string | null>(null);
  const [shareState, setShareState] = useState<{
    url: string;
    copied: boolean;
  } | null>(null);
  const [shareLoading, setShareLoading] = useState(false);
  const [thinkingSteps, setThinkingSteps] = useState<string[]>([]);
  const [matchedScope, setMatchedScope] = useState<string | null>(null);
  const [latestThinkingTrace, setLatestThinkingTrace] = useState<ThinkingTrace | null>(null);
  const [showThinkingTrace, setShowThinkingTrace] = useState(false);
  const [deleteConfirmSession, setDeleteConfirmSession] = useState<ChatSessionSummary | null>(null);
  const [quotedText, setQuotedText] = useState("");
  const [pendingAttachments, setPendingAttachments] = useState<ChatImageAttachment[]>([]);
  const [attachmentError, setAttachmentError] = useState("");
  const [selectionPopover, setSelectionPopover] = useState<{ top: number; left: number; text: string } | null>(null);
  const [tenantSubjectsByName, setTenantSubjectsByName] = useState<Record<string, TenantChatSubject>>({});
  const pendingTitleRef = useRef<string | null>(null);
  const currentSessionIdRef = useRef<string | null>(initialSession?.id ?? null);
  const searchDebounceRef = useRef<number | null>(null);
  const composerRef = useRef<HTMLTextAreaElement | null>(null);
  const imageInputRef = useRef<HTMLInputElement | null>(null);
  const requestWatchdogRef = useRef<number | null>(null);
  const thinkingStageTimersRef = useRef<number[]>([]);
  const abortControllerRef = useRef<AbortController | null>(null);
  const sessionSwitchAbortRef = useRef<AbortController | null>(null);
  const stopChatRef = useRef<(() => void) | null>(null);
  const sendStartTimeRef = useRef<number>(0);
  const messagesScrollRef = useRef<HTMLDivElement | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const loadingOlderMessagesRef = useRef(false);
  const shouldStickToBottomRef = useRef(true);
  const [responseTimes, setResponseTimes] = useState<Record<string, number>>({});

  const clearThinkingStageTimers = useCallback(() => {
    for (const timer of thinkingStageTimersRef.current) {
      window.clearTimeout(timer);
    }
    thinkingStageTimersRef.current = [];
  }, []);

  const startThinkingStages = useCallback(() => {
    clearThinkingStageTimers();
    setThinkingSteps([THINKING_STAGE_MESSAGES[0]]);

    thinkingStageTimersRef.current = [
      window.setTimeout(() => {
        setThinkingSteps((previous) =>
          previous.length === 0 ? previous : appendThinkingStep(previous, THINKING_STAGE_MESSAGES[1]),
        );
      }, 1_200),
      window.setTimeout(() => {
        setThinkingSteps((previous) =>
          previous.length === 0 ? previous : appendThinkingStep(previous, THINKING_STAGE_MESSAGES[2]),
        );
      }, 3_000),
      window.setTimeout(() => {
        setThinkingSteps((previous) =>
          previous.length === 0 ? previous : appendThinkingStep(previous, THINKING_STAGE_MESSAGES[3]),
        );
      }, 6_000),
      window.setTimeout(() => {
        setThinkingSteps((previous) =>
          previous.length === 0 ? previous : appendThinkingStep(previous, THINKING_STAGE_MESSAGES[4]),
        );
      }, 10_000),
      window.setTimeout(() => {
        setThinkingSteps((previous) =>
          previous.length === 0 ? previous : appendThinkingStep(previous, THINKING_STAGE_MESSAGES[5]),
        );
      }, 15_000),
      window.setTimeout(() => {
        setThinkingSteps((previous) =>
          previous.length === 0 ? previous : appendThinkingStep(previous, THINKING_STAGE_MESSAGES[6]),
        );
      }, 20_000),
      window.setTimeout(() => {
        setThinkingSteps((previous) =>
          previous.length === 0 ? previous : appendThinkingStep(previous, THINKING_STAGE_MESSAGES[7]),
        );
      }, 25_000),
      window.setTimeout(() => {
        setThinkingSteps((previous) =>
          previous.length === 0 ? previous : appendThinkingStep(previous, THINKING_STAGE_MESSAGES[8]),
        );
      }, 35_000),
    ];
  }, [clearThinkingStageTimers]);

  const initialMessages: Message[] = useMemo(
    () =>
      currentSessionId === initialSession?.id
        ? (initialSession?.messages ?? []).map((message) => ({
            id: message.id,
            role: message.role,
            content: message.content,
            createdAt: message.createdAt,
            answerTrace: message.answerTrace,
            attachments: message.attachments,
          }))
        : [],
    [initialSession, currentSessionId],
  );
  const availableSubjects = useMemo(() => {
    const all = [...Object.keys(tenantSubjectsByName), ...normalizedProfileSubjects, stripSubjectChapter(subjectContext)]
      .map((item) => (item ? normalizeSubjectLabel(item) : ""))
      .filter(Boolean) as string[];
    return Array.from(new Set(all)).sort((left, right) =>
      left.localeCompare(right, undefined, { sensitivity: "base", numeric: true }),
    );
  }, [normalizedProfileSubjects, subjectContext, tenantSubjectsByName]);
  const subjectActionOptions = useMemo(
    () => availableSubjects.map((subject) => ({ label: subject, value: subject })),
    [availableSubjects],
  );
  const selectedTenantSubject = useMemo(() => {
    const normalizedSubjectContext = normalizeSubjectLabel(stripSubjectChapter(subjectContext) ?? "");
    if (!normalizedSubjectContext) return null;
    return tenantSubjectsByName[normalizedSubjectContext] ?? null;
  }, [subjectContext, tenantSubjectsByName]);

  useEffect(() => {
    let active = true;

    const hydrateTenantSubjectMetadata = async () => {
      try {
        const payload = await loadTenantSubjectMetadata();
        if (!active) return;

        const nextSubjectsByName: Record<string, TenantChatSubject> = {};

        for (const subject of payload.subjects ?? []) {
          const normalizedName = normalizeSubjectLabel(subject.name);
          if (!normalizedName) continue;
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
  }, []);

  useEffect(() => {
    currentSessionIdRef.current = currentSessionId;
  }, [currentSessionId]);

  useEffect(() => {
    setMatchedScope(null);
  }, [currentSessionId]);

  useEffect(() => {
    const handleNewChat = () => {
      clearThinkingStageTimers();
      sessionSwitchAbortRef.current?.abort();
      sessionSwitchAbortRef.current = null;
      setSwitchingSessionId(null);
      loadingOlderMessagesRef.current = false;
      shouldStickToBottomRef.current = true;
      setLoadingOlderMessages(false);
      setHasMoreMessages(false);
      setCurrentSessionId(null);
      currentSessionIdRef.current = null;
      setSessionDetail(null);
      setMessages([]);
      setSubjectContext(null);
      setInput("");
      setPendingAttachments([]);
      setAttachmentError("");
      setQuotedText("");
      setChatError("");
      setMatchedScope(null);
      setLatestThinkingTrace(null);
      setShowThinkingTrace(false);
      stopChatRef.current?.();
      if (requestWatchdogRef.current) {
        window.clearTimeout(requestWatchdogRef.current);
        requestWatchdogRef.current = null;
      }
      setThinkingSteps([]);
      window.history.replaceState(null, "", "/app/chat");
    };
    window.addEventListener("app:new-chat", handleNewChat);
    return () => window.removeEventListener("app:new-chat", handleNewChat);
  }, [clearThinkingStageTimers]);

  useEffect(() => {
    return () => {
      clearThinkingStageTimers();
      sessionSwitchAbortRef.current?.abort();
      if (requestWatchdogRef.current) {
        window.clearTimeout(requestWatchdogRef.current);
        requestWatchdogRef.current = null;
      }
    };
  }, [clearThinkingStageTimers]);

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
      const detail = (event as CustomEvent<ChatSwitchSessionDetail>).detail;
      const sessionId = detail?.sessionId;
      if (!sessionId || sessionId === currentSessionIdRef.current) return;

      sessionSwitchAbortRef.current?.abort();
      const controller = new AbortController();
      sessionSwitchAbortRef.current = controller;

      // Switch the visible shell immediately; conversation data hydrates underneath it.
      currentSessionIdRef.current = sessionId;
      stopChatRef.current?.();
      clearThinkingStageTimers();
      if (requestWatchdogRef.current) {
        window.clearTimeout(requestWatchdogRef.current);
        requestWatchdogRef.current = null;
      }
      setThinkingSteps([]);
      setCurrentSessionId(sessionId);
      setSwitchingSessionId(sessionId);
      setSessionDetail(null);
      setMessages([]);
      loadingOlderMessagesRef.current = false;
      shouldStickToBottomRef.current = true;
      setLoadingOlderMessages(false);
      setHasMoreMessages(false);
      setChatError("");
      setMatchedScope(null);
      setLatestThinkingTrace(null);

      const nextSubjectContext = stripSubjectChapter(detail.subjectContext);
      if (nextSubjectContext) {
        setSubjectContext(nextSubjectContext);
      }

      if (detail.title) {
        setSessions((previous) =>
          previous.map((session) =>
            session.id === sessionId ? { ...session, title: detail.title! } : session,
          ),
        );
      }

      try {
        const response = await fetch(
          `/api/chat/session?session=${sessionId}&limit=${CHAT_MESSAGE_PAGE_SIZE}`,
          {
            cache: "no-store",
            signal: controller.signal,
          },
        );
        if (!response.ok) {
          throw new Error("Failed to load this conversation.");
        }

        const session = (await response.json()) as ChatSessionDetail;
        if (controller.signal.aborted || currentSessionIdRef.current !== sessionId) return;

        setSessionDetail(session);
        setHasMoreMessages(Boolean(session.hasMoreMessages));
        setSubjectContext(stripSubjectChapter(session.subjectContext) || defaultSubjectContext);
        setMessages(
          session.messages.map((message) => ({
            id: message.id,
            role: message.role,
            content: message.content,
            createdAt: message.createdAt,
            answerTrace: message.answerTrace,
            attachments: message.attachments,
          })),
        );
        setSessions((previous) =>
          previous
            .map((item) =>
              item.id === sessionId
                ? {
                    ...item,
                    title: session.title,
                    updatedAt: session.updatedAt,
                    subjectTags: session.subjectTags,
                    subjectContext: session.subjectContext,
                  }
                : item,
            )
            .sort(
              (left, right) =>
                new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime(),
            ),
        );
        window.requestAnimationFrame(() => scrollMessagesToBottom("auto"));
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
        if (currentSessionIdRef.current === sessionId) {
          setChatError("This conversation could not be loaded. Please try again.");
        }
      } finally {
        if (sessionSwitchAbortRef.current === controller) {
          sessionSwitchAbortRef.current = null;
        }
        if (currentSessionIdRef.current === sessionId) {
          setSwitchingSessionId(null);
        }
      }
    };
    window.addEventListener("chat-switch-session", handleSwitch);
    return () => window.removeEventListener("chat-switch-session", handleSwitch);
  }, [clearThinkingStageTimers, defaultSubjectContext]);

  async function refreshCredits() {
    const response = await fetch("/api/billing/credits", { cache: "no-store" });
    if (!response.ok) return;
    const payload = (await response.json()) as { balance: number };
    setCreditBalance(payload.balance);
  }

  async function refreshSession(
    sessionId: string,
    options: { syncMessages?: boolean } = {},
  ) {
    const { syncMessages = true } = options;
    const response = await fetch(`/api/chat/session?session=${sessionId}&limit=${CHAT_MESSAGE_PAGE_SIZE}`, {
      cache: "no-store",
    });

    if (!response.ok) return;
    const detail = (await response.json()) as ChatSessionDetail;
    setSessionDetail(detail);
    setHasMoreMessages(Boolean(detail.hasMoreMessages));
    if (syncMessages) {
      // Only overwrite local messages if DB has at least as many messages.
      // After an edit, the backend after() may not have persisted yet,
      // so DB can temporarily have fewer messages than local state.
      setMessages((currentMessages) => {
        if (detail.messages.length >= currentMessages.length) {
          return keepLocalAttachmentsOnRefresh(detail.messages, currentMessages);
        }
        return currentMessages;
      });
    }
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

  const [messages, setMessages] = useState<Message[]>(initialMessages);
  const [hasMoreMessages, setHasMoreMessages] = useState(Boolean(initialSession?.hasMoreMessages));
  const [loadingOlderMessages, setLoadingOlderMessages] = useState(false);
  const [input, setInput] = useState("");

  useEffect(() => {
    if (composerRef.current) {
      composerRef.current.style.height = "auto";
      const newHeight = Math.min(composerRef.current.scrollHeight, 200); // cap max height
      composerRef.current.style.height = `${newHeight}px`;
    }
  }, [input]);
  const [isLoading, setIsLoading] = useState(false);
  const [editingMessageIndex, setEditingMessageIndex] = useState<number | null>(null);
  const [editingText, setEditingText] = useState("");

  function handleInputChange(event: ChangeEvent<HTMLTextAreaElement>) {
    setInput(event.target.value);
  }

  function scrollMessagesToBottom(behavior: ScrollBehavior = "smooth") {
    messagesEndRef.current?.scrollIntoView({ behavior });
  }

  function isMessagesViewportNearBottom() {
    const element = messagesScrollRef.current;
    if (!element) return true;
    return element.scrollHeight - element.scrollTop - element.clientHeight < BOTTOM_STICK_THRESHOLD_PX;
  }

  const loadOlderMessages = useCallback(async () => {
    const sessionId = currentSessionIdRef.current;
    const oldestMessage = messages[0];
    const container = messagesScrollRef.current;
    if (
      !sessionId ||
      !oldestMessage?.createdAt ||
      !container ||
      !hasMoreMessages ||
      loadingOlderMessagesRef.current
    ) {
      return;
    }

    loadingOlderMessagesRef.current = true;
    setLoadingOlderMessages(true);
    const previousScrollHeight = container.scrollHeight;
    const previousScrollTop = container.scrollTop;

    try {
      const response = await fetch(
        `/api/chat/session?session=${sessionId}&limit=${CHAT_MESSAGE_PAGE_SIZE}&before=${encodeURIComponent(
          oldestMessage.createdAt,
        )}`,
        { cache: "no-store" },
      );
      if (!response.ok) return;

      const detail = (await response.json()) as ChatSessionDetail;
      const olderMessages = detail.messages.map((message) => ({
        id: message.id,
        role: message.role,
        content: message.content,
        createdAt: message.createdAt,
        answerTrace: message.answerTrace,
        attachments: message.attachments,
      }));

      if (currentSessionIdRef.current !== sessionId || olderMessages.length === 0) {
        setHasMoreMessages(Boolean(detail.hasMoreMessages));
        return;
      }

      const existingIds = new Set(messages.map((message) => message.id));
      const uniqueOlderMessages = olderMessages.filter((message) => !existingIds.has(message.id));
      if (uniqueOlderMessages.length === 0) {
        setHasMoreMessages(Boolean(detail.hasMoreMessages));
        return;
      }

      shouldStickToBottomRef.current = false;
      setMessages((currentMessages) => [...uniqueOlderMessages, ...currentMessages]);
      setSessionDetail((currentDetail) =>
        currentDetail
          ? {
              ...currentDetail,
              messages: [
                ...detail.messages.filter(
                  (message) => !currentDetail.messages.some((item) => item.id === message.id),
                ),
                ...currentDetail.messages,
              ],
              hasMoreMessages: detail.hasMoreMessages,
            }
          : detail,
      );
      setHasMoreMessages(Boolean(detail.hasMoreMessages));

      window.requestAnimationFrame(() => {
        const updatedContainer = messagesScrollRef.current;
        if (!updatedContainer) return;
        updatedContainer.scrollTop =
          updatedContainer.scrollHeight - previousScrollHeight + previousScrollTop;
      });
    } finally {
      loadingOlderMessagesRef.current = false;
      setLoadingOlderMessages(false);
    }
  }, [hasMoreMessages, messages]);

  const handleMessagesScroll = useCallback(() => {
    const element = messagesScrollRef.current;
    if (!element) return;
    shouldStickToBottomRef.current = isMessagesViewportNearBottom();
    if (element.scrollTop < OLDER_MESSAGE_LOAD_THRESHOLD_PX) {
      void loadOlderMessages();
    }
  }, [loadOlderMessages]);

  useEffect(() => {
    if (loadingOlderMessagesRef.current) return;
    if (shouldStickToBottomRef.current) {
      scrollMessagesToBottom(isLoading ? "smooth" : "auto");
    }
  }, [messages, isLoading]);

  useEffect(() => {
    let timeoutId: number;
    
    const handleSelectionChange = () => {
      window.clearTimeout(timeoutId);
      
      timeoutId = window.setTimeout(() => {
        const selection = window.getSelection();
        if (!selection || selection.isCollapsed) {
          setSelectionPopover(null);
          return;
        }
        const text = selection.toString().trim();
        if (!text) {
          setSelectionPopover(null);
          return;
        }

        const range = selection.getRangeAt(0);
        const container = range.commonAncestorContainer;
        const element = container.nodeType === 3 ? container.parentElement : (container as HTMLElement);
        
        // Don't show popover if user is selecting text inside the input box
        const isInsideInput = element?.closest("form") || element?.closest("textarea") || element?.closest("input");
        
        if (isInsideInput) {
          setSelectionPopover(null);
          return;
        }

        const rects = range.getClientRects();
        if (rects.length === 0) return;
        const firstRect = rects[0];

        setSelectionPopover({
          top: firstRect.top - 45,
          left: firstRect.left + firstRect.width / 2,
          text,
        });
      }, 150); // 150ms debounce
    };

    document.addEventListener("selectionchange", handleSelectionChange);
    return () => {
      document.removeEventListener("selectionchange", handleSelectionChange);
      window.clearTimeout(timeoutId);
    };
  }, []);

  const stop = useCallback(() => {
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;
    clearThinkingStageTimers();
    setIsLoading(false);
  }, [clearThinkingStageTimers]);

  function handleChatResponseHeaders(response: Response) {
    if (requestWatchdogRef.current) {
      window.clearTimeout(requestWatchdogRef.current);
      requestWatchdogRef.current = window.setTimeout(() => {
        setThinkingSteps(["This question is taking longer than expected..."]);
        setChatError(
          "Answer generation is taking too long right now. We stopped this try so you are not stuck; please retry once.",
        );
        stop();
      }, 90_000);
    }

    const returnedSessionId = response.headers.get("x-session-id");
    const responseMatchedScope = response.headers.get("x-matched-scope")?.trim() || null;
    const citationCount = Number(response.headers.get("x-tenant-citations") || "0");
    const grounded = response.headers.get("x-tenant-grounded") === "1";
    const responseRetrievalModeHeader = response.headers.get("x-retrieval-mode");
    const responseRetrievalMode =
      responseRetrievalModeHeader === "web"
        ? responseRetrievalModeHeader
        : "default";
    const responseSubjectContext = response.headers.get("x-subject-context")?.trim() || null;
    const answerModeHeader = response.headers.get("x-answer-mode");
    const answerMode =
      answerModeHeader === "tenant_prompt" || answerModeHeader === "tenant_chat_stream"
        ? answerModeHeader
        : null;
    const answerModeReason = response.headers.get("x-answer-mode-reason")?.trim() || null;
    const answerModel = response.headers.get("x-answer-model")?.trim() || null;
    const routePath = response.headers.get("x-route-path")?.trim() || null;
    const routeScopeDebug = response.headers.get("x-route-scope-debug")?.trim() || null;
    const lookupMsRaw = Number(response.headers.get("x-tenant-lookup-ms") || "");
    const generationMsRaw = Number(response.headers.get("x-generation-ms") || "");
    const rewriteMsRaw = Number(response.headers.get("x-rewrite-ms") || "");
    const totalMsRaw = Number(response.headers.get("x-total-ms") || "");

    setLatestThinkingTrace({
      grounded,
      citationCount,
      retrievalMode: responseRetrievalMode,
      subjectContext: responseSubjectContext,
      answerMode,
      answerModeReason,
      answerModel,
      routePath,
      routeScopeDebug,
      matchedScope: responseMatchedScope,
      lookupMs: Number.isFinite(lookupMsRaw) ? lookupMsRaw : null,
      generationMs: Number.isFinite(generationMsRaw) ? generationMsRaw : null,
      rewriteMs: Number.isFinite(rewriteMsRaw) ? rewriteMsRaw : null,
      totalMs: Number.isFinite(totalMsRaw) ? totalMsRaw : null,
    });

    if (responseMatchedScope) setMatchedScope(responseMatchedScope);
    setThinkingSteps((previous) =>
      previous.length > 0 ? previous : [THINKING_STAGE_MESSAGES[1]],
    );

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
  }

  async function finishChatResponse(options: { syncMessages?: boolean } = {}) {
    clearThinkingStageTimers();
    setThinkingSteps([]);
    if (requestWatchdogRef.current) {
      window.clearTimeout(requestWatchdogRef.current);
      requestWatchdogRef.current = null;
    }
    setIsLoading(false);
    setChatError("");
    const resolvedSessionId = currentSessionIdRef.current;
    if (resolvedSessionId) {
      await Promise.all([refreshSession(resolvedSessionId, options), refreshCredits()]);
    }
  }

  function handleChatError(error: unknown) {
    clearThinkingStageTimers();
    if (requestWatchdogRef.current) {
      window.clearTimeout(requestWatchdogRef.current);
      requestWatchdogRef.current = null;
    }
    setThinkingSteps([]);
    const rawMessage = error instanceof Error ? error.message : String(error || "");
    let parsedError = "";
    let parsedCode = "";

    try {
      const parsed = JSON.parse(rawMessage);
      if (parsed && typeof parsed.error === "string") parsedError = parsed.error;
      if (parsed && typeof parsed.code === "string") parsedCode = parsed.code;
    } catch {}

    if (parsedCode === "TENANT_PROMPT_TIMEOUT" || rawMessage.includes("TENANT_PROMPT_TIMEOUT")) {
      setChatError(parsedError || "Tenant answer API timed out. Please retry once.");
      return;
    }

    if (parsedCode === "TENANT_SUBJECT_NOT_MATCHED" || rawMessage.includes("TENANT_SUBJECT_NOT_MATCHED")) {
      setChatError(parsedError || "Selected subject could not be matched to the tenant subject list.");
      return;
    }

    setChatError(parsedError || rawMessage || "Something went wrong while generating a response.");
  }

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
  const lockedSubjectContext = useMemo(() => {
    if (!currentSessionId) return null;
    return stripSubjectChapter(
      activeSessionSummary?.subjectContext ??
        sessionDetail?.subjectContext ??
        subjectContext,
    );
  }, [activeSessionSummary?.subjectContext, currentSessionId, sessionDetail?.subjectContext, subjectContext]);
  const isSubjectLocked = Boolean(
    (currentSessionId || messages.length > 0 || isLoading) &&
      (lockedSubjectContext || stripSubjectChapter(subjectContext)),
  );
  const displayedLockedSubjectContext =
    lockedSubjectContext ?? stripSubjectChapter(subjectContext) ?? "Selected subject";

  const addImageFiles = useCallback(
    async (files: FileList | File[]) => {
      const imageFiles = Array.from(files).filter(isAllowedImageFile);

      if (imageFiles.length === 0) {
        setAttachmentError("Only image files are supported here.");
        return;
      }

      const remainingSlots = MAX_IMAGE_ATTACHMENTS - pendingAttachments.length;
      if (remainingSlots <= 0) {
        setAttachmentError(`You can attach up to ${MAX_IMAGE_ATTACHMENTS} images at once.`);
        return;
      }

      const selectedFiles = imageFiles.slice(0, remainingSlots);

      try {
        const attachments = await Promise.all(selectedFiles.map(createImageAttachment));
        setPendingAttachments((current) => [...current, ...attachments].slice(0, MAX_IMAGE_ATTACHMENTS));
        setAttachmentError(
          imageFiles.length > remainingSlots
            ? `Added ${remainingSlots} image${remainingSlots === 1 ? "" : "s"}. Limit is ${MAX_IMAGE_ATTACHMENTS}.`
            : "",
        );
      } catch (error) {
        setAttachmentError(error instanceof Error ? error.message : "Could not attach this image.");
      }
    },
    [pendingAttachments.length],
  );

  const handleImageInputChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      if (event.target.files?.length) {
        void addImageFiles(event.target.files);
      }
      event.target.value = "";
    },
    [addImageFiles],
  );

  const handleComposerPaste = useCallback(
    (event: ClipboardEvent<HTMLTextAreaElement>) => {
      const imageFiles = Array.from(event.clipboardData.files).filter(isAllowedImageFile);
      if (imageFiles.length === 0) return;

      event.preventDefault();
      void addImageFiles(imageFiles);
    },
    [addImageFiles],
  );

  async function sendCurrentMessage(overrideText?: string, overrideMessages?: Message[], truncateFromId?: string) {
    const trimmed = (overrideText ?? input).trim();
    const attachmentsForMessage = overrideText ? [] : pendingAttachments;
    if ((!trimmed && attachmentsForMessage.length === 0) || isLoading) return;
    if (creditBalance <= 0) {
      setChatError("No messages left. Buy a plan to continue chatting.");
      return;
    }

    const sessionSubjectContext = currentSessionIdRef.current
      ? stripSubjectChapter(
          sessions.find((session) => session.id === currentSessionIdRef.current)?.subjectContext ??
            sessionDetail?.subjectContext ??
            subjectContext,
        )
      : stripSubjectChapter(subjectContext);
    const resolvedSubjectContext = sessionSubjectContext ?? stripSubjectChapter(subjectContext);
    const resolvedTenantSubject = resolvedSubjectContext
      ? tenantSubjectsByName[normalizeSubjectLabel(resolvedSubjectContext)] ?? selectedTenantSubject
      : null;

    if (!resolvedSubjectContext) {
      // If only one subject is available, auto-select it and proceed
      if (availableSubjects.length === 1) {
        setSubjectContext(availableSubjects[0]);
        // Small delay to let the state update, then re-send
        setTimeout(() => {
          void sendCurrentMessage(trimmed, overrideMessages);
        }, 50);
        return;
      }

      setChatError("");
      clearThinkingStageTimers();
      setThinkingSteps([]);
      setShowThinkingTrace(false);
      setInput("");
      if (!overrideText) {
        setPendingAttachments([]);
        setAttachmentError("");
      }
      setMessages((previousMessages) => [
        ...(overrideMessages ?? previousMessages),
        { ...createLocalMessage("user", trimmed), attachments: attachmentsForMessage },
        createLocalMessage("assistant", buildMissingSubjectMessage(availableSubjects)),
      ]);
      return;
    }

    if (requestWatchdogRef.current) {
      window.clearTimeout(requestWatchdogRef.current);
      requestWatchdogRef.current = null;
    }

    pendingTitleRef.current = deriveSessionTitle(trimmed || "Image attachment", resolvedSubjectContext);
    setChatError("");
    setShowThinkingTrace(false);
    setIsLoading(true);
    startThinkingStages();
    setInput("");
    if (!overrideText) {
      setPendingAttachments([]);
      setAttachmentError("");
    }
    requestWatchdogRef.current = window.setTimeout(() => {
      clearThinkingStageTimers();
      setThinkingSteps(["This question is taking longer than expected..."]);
      setChatError(
        "Answer generation is taking too long right now. We stopped this try so you are not stuck; please retry once.",
      );
      stop();
    }, 90_000);

    let finalMessageText = quotedText ? `> **${quotedText}**\n\n${trimmed}` : trimmed;
    if (referenceNote) {
      finalMessageText = `<referenced_note title="${referenceNote.title.replace(/"/g, '&quot;')}">\nQuestion: ${referenceNote.questionContent}\nAnswer: ${referenceNote.answerContent}\n</referenced_note>\n\n${finalMessageText}`;
      setReferenceNote(null);
    }
    const isImageOnlyMessage = !finalMessageText.trim() && attachmentsForMessage.length > 0;
    const userMessage = { ...createLocalMessage("user", finalMessageText), attachments: attachmentsForMessage };
    const nextMessages = [...(overrideMessages ?? messages), userMessage];
    setMessages(nextMessages);
    setQuotedText("");

    const controller = new AbortController();
    abortControllerRef.current = controller;
    sendStartTimeRef.current = Date.now();
    const requestSessionId = currentSessionIdRef.current;

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        signal: controller.signal,
        body: JSON.stringify({
          sessionId: requestSessionId,
          language: chatLanguage,
          messageLanguage: composerLanguage,
          subjectContext: resolvedSubjectContext,
          tenantSubject: resolvedTenantSubject,
          retrievalMode,
          truncateFromId,
          messages: nextMessages.map((message) => ({
            role: message.role,
            content: message.content,
            createdAt: message.createdAt,
            attachments: message.attachments ?? [],
          })),
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(errorText || `Chat request failed with ${response.status}`);
      }

      handleChatResponseHeaders(response);
      if (!response.body) {
        throw new Error("Chat stream did not return a response body.");
      }

      if (isImageOnlyMessage) {
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        let streamFinished = false;

        while (true) {
          const { value, done } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const parts = buffer.split(/\r?\n\r?\n/);
          buffer = parts.pop() ?? "";

          for (const part of parts) {
            const event = parseSseBlock(part);
            if (!event) continue;

            if (event.type === "error") {
              throw new Error(JSON.stringify({ error: event.message, code: event.code }));
            }

            if (event.type === "done") {
              streamFinished = true;
              if (event.sessionId && !currentSessionIdRef.current) {
                setCurrentSessionId(event.sessionId);
                currentSessionIdRef.current = event.sessionId;
                window.history.replaceState(null, "", `/app/chat?session=${event.sessionId}`);
              }
            }
          }
        }

        if (buffer.trim()) {
          const event = parseSseBlock(buffer);
          if (event?.type === "error") {
            throw new Error(JSON.stringify({ error: event.message, code: event.code }));
          }
          if (event?.type === "done") {
            streamFinished = true;
          }
        }

        if (!streamFinished) {
          throw new Error("Image upload ended before completion.");
        }

        await finishChatResponse();
        return;
      }

      const assistantMessage = createLocalMessage("assistant", "");
      setMessages((previousMessages) => [...previousMessages, assistantMessage]);

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let streamFinished = false;
      let receivedToken = false;

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split(/\r?\n\r?\n/);
        buffer = parts.pop() ?? "";

        for (const part of parts) {
          const event = parseSseBlock(part);
          if (!event) continue;

          if (event.type === "status") {
            if (receivedToken) continue;
            clearThinkingStageTimers();
            const mappedMessage = mapTenantStatusMessage(event.message);
            setThinkingSteps((previous) => appendThinkingStep(previous, mappedMessage));
            continue;
          }

          if (event.type === "token") {
            receivedToken = true;
            clearThinkingStageTimers();
            if (requestWatchdogRef.current) {
              window.clearTimeout(requestWatchdogRef.current);
              requestWatchdogRef.current = null;
            }
            setThinkingSteps([]);
            setMessages((previousMessages) =>
              previousMessages.map((message) =>
                message.id === assistantMessage.id
                  ? { ...message, content: `${message.content}${event.text}` }
                  : message,
              ),
            );
            continue;
          }

          if (event.type === "sources") {
            setLatestThinkingTrace((previous) =>
              previous
                ? {
                    ...previous,
                    citationCount: event.citationCount ?? previous.citationCount,
                    grounded: (event.citationCount ?? previous.citationCount) > 0,
                  }
                : previous,
            );
            continue;
          }

          if (event.type === "error") {
            if (requestWatchdogRef.current) {
              window.clearTimeout(requestWatchdogRef.current);
              requestWatchdogRef.current = null;
            }
            throw new Error(JSON.stringify({ error: event.message, code: event.code }));
          }

          if (event.type === "done") {
            clearThinkingStageTimers();
            setThinkingSteps([]);
            if (requestWatchdogRef.current) {
              window.clearTimeout(requestWatchdogRef.current);
              requestWatchdogRef.current = null;
            }
            streamFinished = true;
            const elapsedSeconds = Math.max(1, Math.round((Date.now() - sendStartTimeRef.current) / 1000));
            const activeSessionId = event.sessionId || currentSessionIdRef.current || currentSessionId;
            setResponseTimes((prev) => ({ ...prev, [`${activeSessionId}_${nextMessages.length}`]: elapsedSeconds }));
            if (event.sessionId && !currentSessionIdRef.current) {
              setCurrentSessionId(event.sessionId);
              currentSessionIdRef.current = event.sessionId;
              window.history.replaceState(null, "", `/app/chat?session=${event.sessionId}`);
            }
          }
        }
      }

      if (buffer.trim()) {
        const event = parseSseBlock(buffer);
        if (event?.type === "error") {
          throw new Error(JSON.stringify({ error: event.message, code: event.code }));
        }
      }

      if (!streamFinished) {
        throw new Error("Chat stream ended before completion.");
      }

      await finishChatResponse({ syncMessages: false });
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      handleChatError(error);
    } finally {
      clearThinkingStageTimers();
      setThinkingSteps([]);
      if (abortControllerRef.current === controller) {
        abortControllerRef.current = null;
      }
      setIsLoading(false);
    }
  }

  function handleRetryMessage(index: number) {
    const message = messages[index];
    if (!message || message.role !== "user" || isLoading) return;
    const previousMessages = messages.slice(0, index);
    void sendCurrentMessage(message.content, previousMessages);
  }

  function handleEditMessage(index: number) {
    const message = messages[index];
    if (!message || message.role !== "user" || isLoading) return;
    setEditingMessageIndex(index);
    setEditingText(message.content);
  }

  function handleCancelEdit() {
    setEditingMessageIndex(null);
    setEditingText("");
  }

  function handleSaveEdit(index: number) {
    const trimmed = editingText.trim();
    if (!trimmed || isLoading) return;
    const truncateFromId = messages[index].id;
    setEditingMessageIndex(null);
    setEditingText("");
    const previousMessages = messages.slice(0, index);
    void sendCurrentMessage(trimmed, previousMessages, truncateFromId);
  }

  async function submitMessage(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await sendCurrentMessage();
  }

  const renameCurrentSession = useCallback(async (title: string) => {
    const targetSession = renameState ?? activeSessionSummary;
    const targetSessionId = targetSession?.id ?? currentSessionIdRef.current;
    const nextTitle = title.trim();
    if (!targetSessionId || !nextTitle) return;

    const response = await fetch(`/api/chat/sessions/${targetSessionId}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ title: nextTitle }),
    });

    if (!response.ok) {
      const payload = (await response.json()) as { error?: string };
      setChatError(payload.error || "Failed to rename chat.");
      return;
    }

    const updated = (await response.json()) as ChatSessionSummary;
    setSessions((prev) =>
      prev.map((s) =>
        s.id === targetSessionId
          ? { ...s, title: updated.title, updatedAt: updated.updatedAt }
          : s,
      ),
    );
    window.dispatchEvent(new CustomEvent("chat-session-updated"));
    setSessionDetail((prev) =>
      prev && prev.id === targetSessionId
        ? { ...prev, title: updated.title, updatedAt: updated.updatedAt }
        : prev,
    );
    setRenameState(null);
  }, [activeSessionSummary, renameState]);

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
      loadingOlderMessagesRef.current = false;
      shouldStickToBottomRef.current = true;
      setLoadingOlderMessages(false);
      setHasMoreMessages(false);
      setCurrentSessionId(null);
      currentSessionIdRef.current = null;
      setSessionDetail(null);
      setSubjectContext(null);
      setMessages([]);
      window.history.replaceState(null, "", "/app/chat");
    }
  }

  const updateSessionSubjectContext = useCallback(async (nextSubjectContext: string | null) => {
    if (currentSessionIdRef.current || messages.length > 0 || isLoading) return;

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
  }, [activeSessionSummary, isLoading, messages.length, subjectContext]);

  async function copyAssistantMessage(message: { id: string; content: string }) {
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

  async function updateAssistantFeedback(message: ChatMessageRecord, feedback: MessageFeedback | null) {
    const previousFeedback = message.feedback;
    setFeedbackSavingMessageId(message.id);
    setSessionDetail((previous) =>
      previous
        ? {
            ...previous,
            messages: previous.messages.map((item) =>
              item.id === message.id ? { ...item, feedback } : item,
            ),
          }
        : previous,
    );

    try {
      const response = await fetch(`/api/chat/messages/${encodeURIComponent(message.id)}/feedback`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ feedback }),
      });
      const payload = await readJsonResponse<{ error?: string; feedback?: MessageFeedback | null }>(response);

      if (!response.ok) {
        throw new Error(payload?.error || `Failed to save feedback. (${response.status})`);
      }

      if (!payload || !("feedback" in payload)) {
        throw new Error("Feedback API returned an unexpected response.");
      }

      setSessionDetail((previous) =>
        previous
          ? {
              ...previous,
              messages: previous.messages.map((item) =>
                item.id === message.id ? { ...item, feedback: payload.feedback ?? null } : item,
              ),
            }
          : previous,
      );
      setUiFeedback(payload.feedback === "down" ? "Marked as not satisfied." : "Feedback cleared.");
    } catch (error) {
      setSessionDetail((previous) =>
        previous
          ? {
              ...previous,
              messages: previous.messages.map((item) =>
                item.id === message.id ? { ...item, feedback: previousFeedback } : item,
              ),
            }
          : previous,
      );
      setChatError(error instanceof Error ? error.message : "Failed to save feedback.");
    } finally {
      setFeedbackSavingMessageId(null);
    }
  }

  async function saveAssistantNote(message: ChatMessageRecord, question: string) {
    if (message.savedNoteId || noteSavingMessageId === message.id) {
      return;
    }

    setNoteSavingMessageId(message.id);
    setChatError("");

    try {
      const title = (question || message.content.slice(0, 80) || "Saved answer").trim();
      const response = await fetch("/api/notes", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          sessionId: message.sessionId,
          messageId: message.id,
          title,
          subjectTag: message.citations[0]?.subject || subjectContext || "General",
          chapterTag: message.citations[0]?.chapter || message.citations[0]?.topic || "",
          annotation: "",
          colorLabel: "yellow",
        }),
      });
      const payload = await readJsonResponse<{ id?: string; error?: string }>(response);

      if (!response.ok || !payload?.id) {
        throw new Error(payload?.error || `Failed to save note. (${response.status})`);
      }

      setSessionDetail((previous) =>
        previous
          ? {
              ...previous,
              messages: previous.messages.map((item) =>
                item.id === message.id ? { ...item, savedNoteId: payload.id ?? item.savedNoteId } : item,
              ),
            }
          : previous,
      );
      setUiFeedback("Note saved.");

      const resolvedSessionId = currentSessionIdRef.current;
      if (resolvedSessionId) {
        void refreshSession(resolvedSessionId);
      }
    } catch (error) {
      setChatError(error instanceof Error ? error.message : "Failed to save note.");
    } finally {
      setNoteSavingMessageId(null);
    }
  }

  const shareCurrentSession = useCallback(async () => {
    const sessionId = currentSessionIdRef.current;
    if (!sessionId || shareLoading) return;

    setShareLoading(true);
    setChatError("");

    try {
      const response = await fetch(`/api/chat/sessions/${encodeURIComponent(sessionId)}/share`, {
        method: "POST",
      });
      const payload = await readJsonResponse<{ error?: string; url?: string; token?: string }>(response);

      if (!response.ok || !payload?.url) {
        throw new Error(payload?.error || "Failed to create share link.");
      }

      let copied = false;
      try {
        await navigator.clipboard.writeText(payload.url);
        copied = true;
      } catch {
        copied = false;
      }

      setShareState({ url: payload.url, copied });
      setUiFeedback(copied ? "Share link copied." : "Share link created.");
    } catch (error) {
      setChatError(error instanceof Error ? error.message : "Failed to create share link.");
    } finally {
      setShareLoading(false);
    }
  }, [shareLoading]);

  function applySuggestedPrompt(prompt: string) {
    setInput(prompt);
    composerRef.current?.focus();
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
        onSaveTitle={renameCurrentSession}
        onShare={() => void shareCurrentSession()}
        shareLoading={shareLoading}
      />
    );
    return () => shell.setTitle(null);
  }, [activeSessionTitle, currentSessionId, shell, shareLoading, shareCurrentSession, renameCurrentSession]);

  useEffect(() => {
    shell.setActions(
      <div className="flex items-center gap-2">
        {currentSessionId ? (
          <Button
            type="button"
            size="sm"
            className="rounded-full h-8 px-4 text-xs font-medium bg-black text-white dark:bg-white dark:text-black hover:opacity-80 transition"
            onClick={() => void shareCurrentSession()}
            disabled={shareLoading}
          >
            {shareLoading ? "Sharing..." : "Share"}
          </Button>
        ) : null}
        <Badge variant={creditBalance > 0 ? "success" : "warning"} className="hidden sm:inline-flex">
          {creditBalance} MESSAGES
        </Badge>
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
  }, [shell, composerLanguage, setComposerLanguage, creditBalance, currentSessionId, shareCurrentSession, shareLoading]);

  useEffect(() => {
    stopChatRef.current = stop;
  }, [stop]);




  const hasMessages = messages.length > 0;
  const latestMessage = messages[messages.length - 1];
  const showLoadingIndicator =
    isLoading && !(latestMessage?.role === "assistant" && latestMessage.content.length > 0);
  
  const firstName = user?.fullName?.split(" ")[0] || "Student";
  const capitalizedFirstName = firstName.charAt(0).toUpperCase() + firstName.slice(1);

  const renderInputForm = () => (
    <form onSubmit={submitMessage} className="flex w-full flex-col justify-between rounded-[16px] border border-black/5 bg-bg-secondary p-2.5 px-3 shadow-[0_4px_24px_rgba(0,0,0,0.15)] dark:border-white/5 sm:px-3.5">
      <input
        ref={imageInputRef}
        type="file"
        accept="image/png,image/jpeg,image/jpg,image/webp,image/gif"
        multiple
        className="sr-only"
        onChange={handleImageInputChange}
        aria-label="Upload images"
      />
      {quotedText && (
        <div className="flex items-center justify-between bg-black/5 dark:bg-white/5 rounded-xl px-3 py-2.5 mb-3 border border-black/10 dark:border-white/10">
          <div className="flex items-center gap-2.5 overflow-hidden">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-text-muted shrink-0">
              <polyline points="15 10 20 15 15 20"/>
              <path d="M4 4v7a4 4 0 0 0 4 4h12"/>
            </svg>
            <span className="text-[14px] text-text-secondary truncate">{`"${quotedText}"`}</span>
          </div>
          <button type="button" onClick={() => setQuotedText("")} className="text-text-muted hover:text-text-primary shrink-0 ml-3 p-1 rounded-full hover:bg-black/5 dark:hover:bg-white/5 transition">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
          </button>
        </div>
      )}
      {referenceNote && (
        <div className="group relative h-[160px] w-[225px] mb-3 overflow-hidden rounded-[16px] border border-black/10 dark:border-white/10 bg-black/5 dark:bg-[#1a1a1c] flex flex-col p-3.5 shadow-sm transition hover:bg-black/10 dark:hover:bg-[#232325]">
          <div className="flex-1 overflow-hidden">
            <p className="text-[13px] font-semibold leading-[18px] text-text-primary line-clamp-2 mb-1.5">
              {referenceNote.title || "Note"}
            </p>
            <p className="text-[12px] leading-[17px] text-text-muted line-clamp-3">
              {referenceNote.answerContent.slice(0, 150)}
            </p>
          </div>
          <div className="mt-2 flex items-center">
            <span className="rounded-md border border-black/20 dark:border-white/20 px-2 py-[3px] text-[11px] font-medium tracking-wide text-text-muted uppercase">
              Pasted
            </span>
          </div>
          <button
            type="button"
            onClick={() => setReferenceNote(null)}
            className="absolute right-1.5 top-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-black/40 text-white opacity-0 backdrop-blur-md transition group-hover:opacity-100 hover:bg-black/60"
            aria-label="Remove pasted note"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
          </button>
        </div>
      )}
      {pendingAttachments.length > 0 && (
        <div className="mb-3 flex flex-wrap gap-2">
          {pendingAttachments.map((attachment) => (
            <div
              key={attachment.id}
              className="group relative h-20 w-20 overflow-hidden rounded-2xl border border-white/10 bg-bg-tertiary shadow-sm"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={attachment.dataUrl}
                alt={attachment.name}
                className="h-full w-full object-cover"
              />
              <button
                type="button"
                onClick={() =>
                  setPendingAttachments((current) => current.filter((item) => item.id !== attachment.id))
                }
                className="absolute right-1 top-1 flex h-6 w-6 items-center justify-center rounded-full bg-black/75 text-white opacity-100 transition hover:bg-black sm:opacity-0 sm:group-hover:opacity-100"
                aria-label={`Remove ${attachment.name}`}
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M18 6 6 18" />
                  <path d="m6 6 12 12" />
                </svg>
              </button>
              <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent px-1.5 pb-1 pt-5">
                <p className="truncate text-[10px] font-medium text-white">{formatAttachmentSize(attachment.size)}</p>
              </div>
            </div>
          ))}
        </div>
      )}
      {attachmentError && (
        <p className="mb-2 px-2 text-[12px] font-medium text-red-400">{attachmentError}</p>
      )}
      <textarea
        ref={composerRef}
        value={input}
        onChange={(event: ChangeEvent<HTMLTextAreaElement>) => handleInputChange(event)}
        onPaste={handleComposerPaste}
        onKeyDown={(event: KeyboardEvent<HTMLTextAreaElement>) => {
          if (event.key === "Enter" && !event.shiftKey) {
            event.preventDefault();
            void sendCurrentMessage();
          }
        }}
        rows={1}
        placeholder="How can I help you today?"
        className="min-h-[44px] w-full resize-none overflow-y-auto bg-transparent px-2 py-1.5 text-[15px] leading-7 text-text-primary outline-none placeholder:text-text-muted"
      />
      <div className="flex min-w-0 items-center justify-between gap-2 sm:gap-3">
        <div className="flex min-w-0 flex-1 items-center gap-1 md:gap-3">
          <button
            type="button"
            onClick={() => imageInputRef.current?.click()}
            className="ml-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-text-muted transition hover:bg-bg-tertiary hover:text-text-primary"
            aria-label="Upload image"
            title="Upload image"
          >
             <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14M5 12h14"/></svg>
          </button>
          {isSubjectLocked ? (
            <button
              type="button"
              disabled
              className="flex h-8 max-w-[46vw] cursor-default items-center rounded-full bg-bg-tertiary px-3 py-1 text-[12px] font-medium text-text-primary sm:h-7 sm:max-w-[220px]"
              title={`This chat is locked to ${displayedLockedSubjectContext}`}
            >
              <span className="truncate">{displayedLockedSubjectContext}</span>
            </button>
          ) : (
            <CompactSelect
              value={stripSubjectChapter(subjectContext) ?? ""}
              onChange={(value) => void updateSessionSubjectContext(value || null)}
              options={subjectActionOptions}
              placeholder="Subjects"
              direction="up"
            />
          )}
          <CompactSelect
            value={retrievalMode}
            onChange={(value) => setRetrievalMode(value as RetrievalMode)}
            options={(Object.keys(RETRIEVAL_MODE_LABELS) as RetrievalMode[]).map((mode) => ({
              label: RETRIEVAL_MODE_LABELS[mode],
              value: mode,
            }))}
            direction="up"
          />
        </div>
        {isLoading ? (
          <button
            type="button"
            onClick={stop}
            className="h-10 w-10 rounded-full flex items-center justify-center bg-black dark:bg-white text-white dark:text-black hover:opacity-80 transition shadow-sm"
            title="Stop generating"
          >
            <div className="w-3.5 h-3.5 bg-current rounded-[3px]"></div>
          </button>
        ) : (
          <Button
            type="submit"
            disabled={(!input.trim() && pendingAttachments.length === 0) || creditBalance <= 0}
            className="h-10 min-w-[78px] shrink-0 rounded-full bg-black px-4 text-[15px] font-medium text-white transition hover:opacity-80 disabled:opacity-50 dark:bg-white dark:text-black sm:min-w-[90px]"
          >
            Send →
          </Button>
        )}
      </div>
    </form>
  );

  return (
    <div className="flex h-full min-h-0 flex-col bg-bg-primary">
      <section className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        {/* matchedScope banner hidden temporarily */}


        <div
          ref={messagesScrollRef}
          onScroll={handleMessagesScroll}
          className="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain"
        >
          <div className="mx-auto flex min-h-full w-full max-w-5xl flex-1 flex-col px-3 pb-24 pt-4 sm:px-4 sm:pt-5 md:px-5 xl:px-6">
            {switchingSessionId ? (
              <ChatSessionLoadingSkeleton />
            ) : messages.length === 0 ? (
              <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col items-center justify-center text-center">
                <div className="flex flex-row items-center justify-center gap-4 sm:gap-5 text-text-primary mb-8 text-center">
                  <h1 className="font-display text-3xl sm:text-[40px] leading-tight font-normal tracking-tight">
                    <svg width="42" height="42" viewBox="0 0 24 24" fill="none" stroke="url(#premium-blue)" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round" className="mr-2 inline-block h-8 w-8 align-text-bottom drop-shadow-[0_0_10px_rgba(96,165,250,0.65)] sm:mr-4 sm:h-[42px] sm:w-[42px]">
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
                {loadingOlderMessages ? (
                  <div className="flex justify-center py-2">
                    <span className="rounded-full border border-border bg-bg-secondary px-3 py-1 text-[12px] font-medium text-text-muted">
                      Loading earlier messages...
                    </span>
                  </div>
                ) : null}
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

                  let responseTimeText = "";
                  if (message.role === "assistant") {
                    const storedSeconds = responseTimes[`${currentSessionId}_${index}`];
                    const traceMs = message.answerTrace?.totalMs;
                    if (storedSeconds) {
                      responseTimeText = `${storedSeconds}s`;
                    } else if (typeof traceMs === "number" && traceMs > 0) {
                      const diffInSeconds = Math.max(1, Math.round(traceMs / 1000));
                      responseTimeText = `${diffInSeconds}s`;
                    }
                  }

                  let displayQuote = "";
                  let displayNoteTitle = "";
                  let displayContent = message.content;
                  if (message.role === "user") {
                    const noteMatch = displayContent.match(/<referenced_note title="([^"]+)">[\s\S]*?<\/referenced_note>\n*/);
                    if (noteMatch) {
                      displayNoteTitle = noteMatch[1];
                      displayContent = displayContent.replace(noteMatch[0], "");
                    }

                    if (displayContent.startsWith("> **")) {
                      const quoteEndIdx = displayContent.indexOf("**\n\n");
                      if (quoteEndIdx !== -1) {
                        displayQuote = displayContent.substring(4, quoteEndIdx);
                        displayContent = displayContent.substring(quoteEndIdx + 4);
                      }
                    }
                  }

                  return (
                    <article
                      key={message.id}
                      className={cn(
                        "animate-fade-in flex flex-col group relative",
                        message.role === "user" 
                          ? cn("ml-auto max-w-[88%] sm:max-w-[min(900px,92%)]", editingMessageIndex === index ? "w-full" : "w-fit")
                          : "mr-auto w-full max-w-[1020px]",
                      )}
                    >
                      {displayQuote && (
                        <div className="flex items-center justify-end gap-2 mb-1.5 opacity-60 px-2 text-text-secondary">
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="shrink-0"><polyline points="15 10 20 15 15 20"/><path d="M4 4v7a4 4 0 0 0 4 4h12"/></svg>
                          <span className="text-[13px] font-medium truncate max-w-[300px] sm:max-w-sm">{displayQuote}</span>
                        </div>
                      )}
                      <div
                        className={cn(
                          message.role === "user"
                            ? "rounded-[22px] bg-bg-tertiary px-3.5 py-2.5 text-text-primary shadow-sm sm:rounded-[24px] sm:px-4"
                            : "text-text-primary w-full",
                        )}
                      >
                        {message.role === "user" && editingMessageIndex !== index && (
                          <div className="absolute -left-2 -translate-x-full top-1/2 -translate-y-1/2 flex items-center gap-1 opacity-0 group-hover:opacity-100 pointer-events-none group-hover:pointer-events-auto transition-all">
                            <button
                              onClick={() => handleEditMessage(index)}
                              className="flex items-center justify-center w-8 h-8 rounded-full bg-bg-secondary/80 hover:bg-bg-tertiary text-text-primary shadow-sm transition-all"
                              title="Edit message"
                            >
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/></svg>
                            </button>
                            <button
                              onClick={() => handleRetryMessage(index)}
                              className="flex items-center justify-center w-8 h-8 rounded-full bg-bg-secondary/80 hover:bg-bg-tertiary text-text-primary shadow-sm transition-all"
                              title="Retry message"
                            >
                              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/></svg>
                            </button>
                          </div>
                        )}
                        {message.role === "assistant" ? (
                          <>
                            {displayContent ? (
                              <div className="rounded-[22px] bg-black/[0.04] dark:bg-[#202020] px-4 py-4 text-text-primary shadow-sm sm:rounded-[24px] sm:px-5 w-full">
                                <Markdown text={displayContent} className="text-[15px] leading-[26px] font-medium sm:text-[16px] sm:leading-[28px]" />
                              </div>
                            ) : null}

                          </>
                        ) : editingMessageIndex === index ? (
                          <div className="flex flex-col gap-2 w-full">
                            <textarea
                              autoFocus
                              value={editingText}
                              onChange={(e) => setEditingText(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter" && !e.shiftKey) {
                                  e.preventDefault();
                                  handleSaveEdit(index);
                                }
                                if (e.key === "Escape") {
                                  handleCancelEdit();
                                }
                              }}
                              className="w-full max-h-[200px] resize-none rounded-xl bg-bg-primary/60 border border-border px-3 py-2 text-[16px] leading-[24px] text-text-primary font-medium focus:outline-none focus:ring-2 focus:ring-border-strong/40"
                              rows={Math.max(1, Math.min(editingText.split("\n").length, 6))}
                            />
                            <div className="flex justify-end gap-2">
                              <button
                                onClick={handleCancelEdit}
                                className="px-3 py-1 rounded-lg text-[13px] font-medium text-text-secondary hover:bg-bg-secondary transition"
                              >
                                Cancel
                              </button>
                              <button
                                onClick={() => handleSaveEdit(index)}
                                disabled={!editingText.trim()}
                                className="px-3 py-1 rounded-lg text-[13px] font-medium bg-text-primary text-text-inverse hover:opacity-90 transition disabled:opacity-40"
                              >
                                Send
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className="min-w-0 space-y-2">
                            {(message.attachments?.length ?? 0) > 0 && (
                              <div
                                className={cn(
                                  "grid gap-2",
                                  (message.attachments?.length ?? 0) > 1 ? "grid-cols-2" : "grid-cols-1",
                                )}
                              >
                                {message.attachments?.map((attachment) => (
                                  // eslint-disable-next-line @next/next/no-img-element
                                  <img
                                    key={attachment.id}
                                    src={attachment.dataUrl}
                                    alt={attachment.name}
                                    className="max-h-64 w-full rounded-2xl border border-white/10 object-cover shadow-sm"
                                  />
                                ))}
                              </div>
                            )}
                            <div className="flex items-end justify-between gap-3">
                              <div>
                                {displayNoteTitle && (
                                  <div className="flex items-center gap-1.5 bg-black/5 dark:bg-white/5 rounded-lg px-2 py-1 mb-2 w-fit border border-black/5 dark:border-white/5">
                                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-text-muted shrink-0"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>
                                    <span className="text-[12px] font-medium text-text-secondary truncate max-w-[200px]">{displayNoteTitle}</span>
                                  </div>
                                )}
                                <div className="whitespace-pre-wrap break-words text-[15px] leading-[23px] font-medium text-text-primary sm:text-[16px] sm:leading-[24px]">
                                  {displayContent}
                                </div>
                              </div>
                              {message.createdAt && (
                                <span className="mb-[2px] shrink-0 text-[11px] font-medium text-text-muted">
                                  {new Date(message.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })}
                                </span>
                              )}
                            </div>
                          </div>
                        )}



                        {message.role === "assistant" && !isLoading ? (
                          <div className="mt-1.5 flex items-center gap-1 text-text-muted">

                            <div className="relative group/btn flex items-center justify-center">
                              <button
                                type="button"
                                onClick={() => void copyAssistantMessage(message)}
                                disabled={copyingMessageId === message.id}
                                className="flex h-8 w-8 items-center justify-center rounded-md hover:bg-bg-tertiary hover:text-text-primary transition-colors"
                                aria-label="Copy"
                              >
                                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>
                              </button>
                              <div className="pointer-events-none absolute -top-8 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-md bg-[#2D2D2D] dark:bg-[#3D3D3D] px-2.5 py-1 text-[12px] font-medium text-[#E3E3E3] dark:text-white opacity-0 transition-opacity group-hover/btn:opacity-100 shadow-sm z-10">
                                {copyingMessageId === message.id ? "Copying..." : "Copy"}
                              </div>
                            </div>

                            <div className="relative group/btn flex items-center justify-center">
                              <button
                                type="button"
                                onClick={() => persistedAssistant && void saveAssistantNote(persistedAssistant, question)}
                                disabled={!persistedAssistant || noteSavingMessageId === persistedAssistant.id || Boolean(persistedAssistant.savedNoteId)}
                                className={cn(
                                  "flex h-8 w-8 items-center justify-center rounded-md hover:bg-bg-tertiary transition-colors disabled:opacity-50",
                                  persistedAssistant?.savedNoteId ? "text-text-primary" : "hover:text-text-primary"
                                )}
                                aria-label={persistedAssistant?.savedNoteId ? "Saved as note" : "Save as note"}
                              >
                                <svg width="15" height="15" viewBox="0 0 24 24" fill={persistedAssistant?.savedNoteId ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16z"/></svg>
                              </button>
                              <div className="pointer-events-none absolute -top-8 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-md bg-[#2D2D2D] dark:bg-[#3D3D3D] px-2.5 py-1 text-[12px] font-medium text-[#E3E3E3] dark:text-white opacity-0 transition-opacity group-hover/btn:opacity-100 shadow-sm z-10">
                                {persistedAssistant?.savedNoteId ? "Saved as note" : "Save as note"}
                              </div>
                            </div>

                            <div className="relative group/btn flex items-center justify-center">
                              <button
                                type="button"
                                onClick={() => persistedAssistant && void updateAssistantFeedback(persistedAssistant, persistedAssistant.feedback === "up" ? null : "up")}
                                disabled={!persistedAssistant || feedbackSavingMessageId === persistedAssistant.id}
                                className={cn(
                                  "flex h-8 w-8 items-center justify-center rounded-md hover:bg-bg-tertiary transition-colors disabled:opacity-50",
                                  persistedAssistant?.feedback === "up" ? "text-green-500" : "hover:text-green-400"
                                )}
                                aria-label="Helpful"
                              >
                                <svg width="15" height="15" viewBox="0 0 24 24" fill={persistedAssistant?.feedback === "up" ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M7 10v12"/><path d="M15 5.88 14 10h5.83a2 2 0 0 1 1.92 2.56l-2.33 8A2 2 0 0 1 17.5 22H4a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h2.76a2 2 0 0 0 1.79-1.11L12 2h0a3.13 3.13 0 0 1 3 3.88Z"/></svg>
                              </button>
                              <div className="pointer-events-none absolute -top-8 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-md bg-[#2D2D2D] dark:bg-[#3D3D3D] px-2.5 py-1 text-[12px] font-medium text-[#E3E3E3] dark:text-white opacity-0 transition-opacity group-hover/btn:opacity-100 shadow-sm z-10">
                                Helpful
                              </div>
                            </div>

                            <div className="relative group/btn flex items-center justify-center">
                              <button
                                type="button"
                                onClick={() => persistedAssistant && void updateAssistantFeedback(persistedAssistant, persistedAssistant.feedback === "down" ? null : "down")}
                                disabled={!persistedAssistant || feedbackSavingMessageId === persistedAssistant.id}
                                className={cn(
                                  "flex h-8 w-8 items-center justify-center rounded-md hover:bg-bg-tertiary transition-colors disabled:opacity-50",
                                  persistedAssistant?.feedback === "down" ? "text-red-500" : "hover:text-red-400"
                                )}
                                aria-label="Not helpful"
                              >
                                <svg width="15" height="15" viewBox="0 0 24 24" fill={persistedAssistant?.feedback === "down" ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 14V2"/><path d="M9 18.12 10 14H4.17a2 2 0 0 1-1.92-2.56l2.33-8A2 2 0 0 1 6.5 2H20a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-2.76a2 2 0 0 0-1.79 1.11L12 22h0a3.13 3.13 0 0 1-3-3.88Z"/></svg>
                              </button>
                              <div className="pointer-events-none absolute -top-8 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-md bg-[#2D2D2D] dark:bg-[#3D3D3D] px-2.5 py-1 text-[12px] font-medium text-[#E3E3E3] dark:text-white opacity-0 transition-opacity group-hover/btn:opacity-100 shadow-sm z-10">
                                Not helpful
                              </div>
                            </div>
                            {responseTimeText && (
                              <span className="ml-1 text-[12px] font-medium text-text-muted">
                                {responseTimeText}
                              </span>
                            )}
                          </div>
                        ) : null}
                      </div>
                    </article>
                  );
                })}

                {showLoadingIndicator ? (
                  <div className="flex flex-col gap-6 w-full animate-fade-in">
                    <ThinkingSteps steps={thinkingSteps.length > 0 ? thinkingSteps : ["Generating..."]} />
                    <div className="flex justify-center w-full">
                      <button
                        onClick={stop}
                        className="flex items-center gap-2.5 bg-[#FFEFEF] dark:bg-red-950/30 text-[#E03131] dark:text-red-400 px-4 py-2 rounded-full font-medium text-[14px] hover:bg-[#FFD8D8] dark:hover:bg-red-900/40 transition shadow-sm"
                      >
                        <div className="w-3 h-3 bg-current rounded-[2px]"></div>
                        Stop generating
                      </button>
                    </div>
                  </div>
                ) : null}
                <div ref={messagesEndRef} className="h-px w-full" />
              </div>
            )}
          </div>
        </div>

        {messages.length > 0 || switchingSessionId ? (
          <div className="bg-bg-primary px-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] pt-3 sm:px-4 md:px-5 xl:px-6">
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
                className="whitespace-nowrap"
              >
                {deletingSessionId ? "Deleting..." : "Delete chat"}
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      {shareState ? (
        <ShareChatModal
          url={shareState.url}
          onClose={() => setShareState(null)}
          onCopy={async () => {
            await navigator.clipboard.writeText(shareState.url);
            setShareState({ url: shareState.url, copied: true });
            setUiFeedback("Share link copied.");
          }}
        />
      ) : null}

      {selectionPopover ? (
        <div 
          className="fixed z-50 animate-in fade-in zoom-in-95 duration-150 flex items-center bg-[#2F2F2F] shadow-[0_4px_24px_rgba(0,0,0,0.4)] border border-white/10 rounded-full overflow-hidden"
          style={{ top: selectionPopover.top, left: selectionPopover.left, transform: 'translateX(-50%)' }}
          onMouseDown={(e) => e.preventDefault()}
        >
          <button
            onClick={() => {
              setQuotedText(selectionPopover.text);
              setSelectionPopover(null);
              window.getSelection()?.removeAllRanges();
              composerRef.current?.focus();
            }}
            className="px-4 py-2 text-[14px] font-medium text-white/90 hover:bg-white/10 transition-colors border-r border-white/10"
          >
            Ask the question
          </button>
          <button
            onClick={() => {
              const text = selectionPopover.text;
              setSelectionPopover(null);
              window.getSelection()?.removeAllRanges();
              void sendCurrentMessage(text);
            }}
            className="px-4 py-2 text-[14px] font-medium text-white/90 hover:bg-white/10 transition-colors"
          >
            Answer this
          </button>
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

function ShareChatModal({
  url,
  onClose,
  onCopy,
}: {
  url: string;
  onClose: () => void;
  onCopy: () => void | Promise<void>;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-3 backdrop-blur-sm sm:items-center sm:p-4"
      onClick={onClose}
    >
      <div
        onClick={(event) => event.stopPropagation()}
        className="max-h-[calc(100dvh-1.5rem)] w-full max-w-lg overflow-y-auto rounded-3xl border border-border bg-bg-primary p-5 shadow-2xl animate-slide-up sm:rounded-xl sm:p-6"
      >
        <h3 className="font-display text-2xl text-text-primary">Share chat</h3>
        <p className="mt-2 text-sm text-text-secondary">
          Anyone with this link can read this chat without logging in.
        </p>
        <label className="mt-5 block">
          <span className="mb-2 block text-[10px] font-mono-ui uppercase tracking-[0.18em] text-text-muted">
            Public link
          </span>
          <input
            readOnly
            value={url}
            className="w-full rounded-xl border border-border bg-bg-secondary px-3 py-3 text-xs text-text-primary outline-none sm:text-sm"
            onFocus={(event) => event.currentTarget.select()}
          />
        </label>
        <div className="mt-6 grid grid-cols-1 gap-2 sm:flex sm:flex-wrap sm:justify-end">
          <Button variant="ghost" onClick={onClose}>
            Close
          </Button>
          <a href={url} target="_blank" rel="noreferrer">
            <Button variant="outline" className="w-full sm:w-auto">Open link</Button>
          </a>
          <Button onClick={() => void onCopy()} className="w-full sm:w-auto">Copy</Button>
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
