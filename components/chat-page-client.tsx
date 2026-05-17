"use client";

import Link from "next/link";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type KeyboardEvent,
} from "react";
import { useChat, type Message } from "ai/react";
import { CitationCard } from "@/components/citation-card";
import { Markdown } from "@/components/markdown";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/field";
import { getCreditWarning } from "@/lib/billing";
import { normalizeSubjectLabel } from "@/lib/profile-normalization";
import type {
  AppUser,
  ChatMessageRecord,
  ChatSessionDetail,
  ChatSessionSummary,
  Language,
  MessageFeedback,
  NoteColor,
} from "@/lib/types";
import { cn, deriveSessionTitle, formatDate, groupDateLabel } from "@/lib/utils";

const COLOR_LABEL: Record<NoteColor, string> = {
  red: "Must revise",
  yellow: "Review later",
  green: "Got it",
};

export function ChatPageClient({
  user,
  defaultLanguage,
  profileSubjects,
  initialSessions,
  initialHasMore,
  initialSession,
  initialSubjectContext,
  initialPrompt,
}: {
  user: AppUser;
  defaultLanguage: Language;
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
  const [language, setLanguage] = useState<Language>(defaultLanguage);
  const [composerLanguage, setComposerLanguage] = useState<Language>(defaultLanguage);
  const [chatError, setChatError] = useState("");
  const [creditBalance, setCreditBalance] = useState(user.creditBalance);
  const [sessionDetail, setSessionDetail] = useState<ChatSessionDetail | null>(initialSession);
  const [subjectContext, setSubjectContext] = useState<string | null>(
    initialSession?.subjectContext ??
      (initialSubjectContext ? normalizeSubjectLabel(initialSubjectContext) : null),
  );
  const [saveState, setSaveState] = useState<{
    message: ChatMessageRecord;
    question: string;
  } | null>(null);
  const [uiFeedback, setUiFeedback] = useState("");
  const [renameState, setRenameState] = useState<ChatSessionSummary | null>(null);
  const [deletingSessionId, setDeletingSessionId] = useState<string | null>(null);
  const [copyingMessageId, setCopyingMessageId] = useState<string | null>(null);
  const [feedbackMessageId, setFeedbackMessageId] = useState<string | null>(null);
  const [thinkingStatus, setThinkingStatus] = useState<string | null>(null);
  const [thinkingEnabled, setThinkingEnabled] = useState(true);
  const [answerMode, setAnswerMode] = useState<"quick" | "deep" | null>(null);
  const pendingTitleRef = useRef<string | null>(null);
  const currentSessionIdRef = useRef<string | null>(initialSession?.id ?? null);
  const searchDebounceRef = useRef<number | null>(null);
  const composerRef = useRef<HTMLTextAreaElement | null>(null);

  const initialMessages: Message[] = useMemo(
    () =>
      (initialSession?.messages ?? []).map((message) => ({
        id: message.id,
        role: message.role,
        content: message.content,
      })),
    [initialSession],
  );

  useEffect(() => {
    currentSessionIdRef.current = currentSessionId;
  }, [currentSessionId]);

  useEffect(() => {
    setComposerLanguage(language);
  }, [language]);

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
    setSubjectContext(detail.subjectContext);
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
    isLoading,
    setInput,
    setMessages,
  } = useChat({
    api: "/api/chat",
    id: currentSessionId ?? "draft",
    initialMessages,
    body: {
      sessionId: currentSessionId,
      subjectContext,
    },
    onResponse(response) {
      const returnedSessionId = response.headers.get("x-session-id");
      const ragChunksHeader = response.headers.get("x-rag-chunks");
      const ragGrounded = response.headers.get("x-rag-grounded") === "1";
      const responseSubject = response.headers.get("x-subject-context")?.trim() || null;
      const responseThinkingEnabled = response.headers.get("x-thinking-enabled") === "1";
      const responseAnswerMode = response.headers.get("x-answer-mode");
      const ragChunks = Number(ragChunksHeader || "0");

      setThinkingEnabled(responseThinkingEnabled);
      if (responseAnswerMode === "quick" || responseAnswerMode === "deep") {
        setAnswerMode(responseAnswerMode);
      } else {
        setAnswerMode(null);
      }
      if (ragGrounded && ragChunks > 0) {
        setThinkingStatus(
          responseSubject
            ? `Thinking with ${ragChunks} syllabus chunks (${responseSubject})...`
            : `Thinking with ${ragChunks} syllabus chunks...`,
        );
      } else {
        setThinkingStatus("Thinking and generating answer...");
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
        },
        ...prev,
      ]);
    },
    async onFinish() {
      setThinkingStatus("Finalizing response...");
      setChatError("");
      const resolvedSessionId = currentSessionIdRef.current;
      if (!resolvedSessionId) return;
      await refreshSession(resolvedSessionId);
      await refreshCredits();
      setThinkingStatus(null);
    },
    onError(error) {
      setThinkingStatus(null);
      const rawMessage = error.message || "";
      if (rawMessage.includes("RAG_NO_GROUNDED_CONTEXT")) {
        setChatError(
          "This question is outside the currently indexed textbook context. Please ask by unit/chapter, or switch to the correct subject.",
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
      setChatError(rawMessage || "Something went wrong while generating a response.");
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

  const activeSessionSummary =
    sessions.find((session) => session.id === currentSessionId) ??
    (sessionDetail
      ? {
          id: sessionDetail.id,
          userId: sessionDetail.userId,
          title: sessionDetail.title,
          createdAt: sessionDetail.createdAt,
          updatedAt: sessionDetail.updatedAt,
          subjectTags: sessionDetail.subjectTags,
          subjectContext: sessionDetail.subjectContext,
        }
      : null);

  function patchMessage(messageId: string, patch: Partial<ChatMessageRecord>) {
    setSessionDetail((prev) =>
      prev
        ? {
            ...prev,
            messages: prev.messages.map((message) =>
              message.id === messageId ? { ...message, ...patch } : message,
            ),
          }
        : prev,
    );
  }

  async function sendCurrentMessage() {
    const trimmed = input.trim();
    if (!trimmed || isLoading) return;
    if (creditBalance <= 0) {
      setChatError("No credits left. Buy a plan to continue chatting.");
      return;
    }

    pendingTitleRef.current = deriveSessionTitle(trimmed);
    setChatError("");
    setAnswerMode(null);
    setThinkingStatus("Retrieving syllabus context...");
    setInput("");

    await append(
      {
        role: "user",
        content: trimmed,
      },
      {
        body: {
          sessionId: currentSessionId,
          language,
          messageLanguage: composerLanguage,
          subjectContext,
        },
      },
    );
  }

  async function submitMessage(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await sendCurrentMessage();
  }

  async function renameCurrentSession(title: string) {
    if (!activeSessionSummary) return;

    const response = await fetch(`/api/chat/sessions/${activeSessionSummary.id}`, {
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
      prev.map((session) => (session.id === updated.id ? updated : session)),
    );
    setSessionDetail((prev) => (prev ? { ...prev, title: updated.title, updatedAt: updated.updatedAt } : prev));
    setRenameState(null);
  }

  async function deleteCurrentSession() {
    if (!activeSessionSummary) return;
    setDeletingSessionId(activeSessionSummary.id);
    setChatError("");

    const response = await fetch(`/api/chat/sessions/${activeSessionSummary.id}`, {
      method: "DELETE",
    });

    setDeletingSessionId(null);

    if (!response.ok) {
      const payload = (await response.json()) as { error?: string };
      setChatError(payload.error || "Failed to delete chat.");
      return;
    }

    setSessions((prev) => prev.filter((session) => session.id !== activeSessionSummary.id));
    setCurrentSessionId(null);
    currentSessionIdRef.current = null;
    setSessionDetail(null);
    setSubjectContext(null);
    setMessages([]);
    window.history.replaceState(null, "", "/app/chat");
  }

  async function updateSessionSubjectContext(nextSubjectContext: string | null) {
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
  }

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

  async function sendFeedback(message: ChatMessageRecord, feedback: MessageFeedback) {
    setFeedbackMessageId(message.id);
    setChatError("");
    const response = await fetch(`/api/chat/messages/${message.id}/feedback`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ feedback }),
    });

    setFeedbackMessageId(null);

    if (!response.ok) {
      const payload = (await response.json()) as { error?: string };
      setChatError(payload.error || "Failed to save feedback.");
      return;
    }

    patchMessage(message.id, { feedback });
    setUiFeedback(feedback === "up" ? "Marked as helpful." : "Marked for review.");
  }

  function applySuggestedPrompt(prompt: string) {
    setInput(prompt);
    composerRef.current?.focus();
    setUiFeedback("Suggested follow-up added to the composer.");
  }

  const creditWarning = getCreditWarning(creditBalance);

  useEffect(() => {
    if (!initialPrompt?.trim()) return;
    setInput(initialPrompt.trim());
    composerRef.current?.focus();
  }, [initialPrompt, setInput]);

  return (
    <div className="flex h-full overflow-hidden">
      <aside className="hidden w-[300px] border-r border-border bg-bg-primary lg:flex lg:flex-col">
        <div className="border-b border-border p-3">
          <Link href="/app/chat">
            <Button variant="outline" className="w-full">
              + New chat
            </Button>
          </Link>
          <div className="mt-3">
            <Input
              value={historySearch}
              onChange={(event) => setHistorySearch(event.target.value)}
              placeholder="Search chat titles..."
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-3 py-4">
          <div className="space-y-4">
            {groupedSessions.map(({ group, items }) =>
              items.length ? (
                <div key={group}>
                  <p className="mb-1 px-1 text-[10px] font-mono-ui uppercase text-text-muted">
                    {group}
                  </p>
                  <ul className="space-y-0.5">
                    {items.map((session) => (
                      <li key={session.id}>
                        <Link
                          href={`/app/chat?session=${session.id}`}
                          className={cn(
                            "block rounded-md border-l-2 px-2 py-2 text-left text-xs transition",
                            currentSessionId === session.id
                              ? "border-text-primary bg-bg-secondary"
                              : "border-transparent hover:bg-bg-secondary",
                          )}
                        >
                          <div className="truncate">{session.title}</div>
                          <div className="mt-0.5 text-[10px] text-text-muted">
                            {formatDate(session.updatedAt)}
                          </div>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null,
            )}
            {sessions.length === 0 ? (
              <p className="text-xs text-text-muted">No chat history yet.</p>
            ) : null}
            {historyError ? <p className="text-xs text-destructive">{historyError}</p> : null}
            {hasMoreSessions ? (
              <Button
                variant="ghost"
                size="sm"
                className="w-full"
                onClick={() => void fetchSessions({ reset: false, offset: sessions.length })}
                disabled={historyLoading}
              >
                {historyLoading ? "Loading..." : "Load more"}
              </Button>
            ) : null}
          </div>
        </div>
      </aside>

      <section className="flex min-w-0 flex-1 flex-col">
        <div className="border-b border-border bg-bg-secondary px-4 py-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs font-mono-ui uppercase text-text-muted">Grounded chat</p>
              <h2 className="font-display text-2xl">{activeSessionTitle}</h2>
              <p className="mt-1 text-xs text-text-muted">{creditBalance} credits available</p>
              {subjectContext ? (
                <p className="mt-1 text-xs text-text-secondary">Subject focus: {subjectContext}</p>
              ) : null}
              <div className="mt-2 inline-flex items-center gap-2">
                <label htmlFor="subject-context" className="text-[11px] text-text-muted">
                  Subject
                </label>
                <select
                  id="subject-context"
                  value={subjectContext ?? ""}
                  onChange={(event) =>
                    void updateSessionSubjectContext(event.target.value.trim() || null)
                  }
                  className="h-8 rounded-md border border-border bg-bg-primary px-2 text-xs text-text-primary focus:outline-none"
                >
                  <option value="">General</option>
                  {Array.from(new Set(profileSubjects.filter(Boolean))).map((subject) => (
                    <option key={subject} value={subject}>
                      {subject}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="inline-flex rounded-full border border-border p-0.5">
              {(["EN", "RN"] as const).map((item) => (
                <button
                  key={item}
                  type="button"
                  onClick={() => setLanguage(item)}
                  className={
                    "rounded-full px-4 py-1.5 text-xs font-mono-ui transition " +
                    (language === item ? "bg-text-primary text-text-inverse" : "text-text-secondary")
                  }
                >
                  {item === "EN" ? "English" : "Roman Nepali"}
                </button>
              ))}
            </div>
            {activeSessionSummary ? (
              <div className="flex gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => setRenameState(activeSessionSummary)}
                >
                  Rename
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => void deleteCurrentSession()}
                  disabled={deletingSessionId === activeSessionSummary.id}
                >
                  {deletingSessionId === activeSessionSummary.id ? "Deleting..." : "Delete"}
                </Button>
              </div>
            ) : null}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-6 md:px-6">
          {messages.length === 0 ? (
            <div className="mx-auto max-w-3xl rounded-xl border border-dashed border-border p-10 text-center">
              <p className="font-display text-4xl">Let&apos;s begin.</p>
              <p className="mt-3 text-sm text-text-secondary">
                Ask your first question in English or Roman Nepali. Grounded answers will cite syllabus context when relevant.
              </p>
              {subjectContext ? (
                <p className="mt-3 text-xs text-text-muted">
                  This chat will start with a {subjectContext} focus.
                </p>
              ) : null}
            </div>
          ) : (
            <div className="mx-auto max-w-3xl space-y-4">
              {messages.map((message, index) => {
                const assistantOrdinal =
                  message.role === "assistant"
                    ? messages.slice(0, index + 1).filter((item) => item.role === "assistant").length - 1
                    : -1;
                const persistedAssistant =
                  assistantOrdinal >= 0 ? persistedAssistantMessages[assistantOrdinal] ?? null : null;
                const question = assistantOrdinal >= 0 ? assistantQuestions[assistantOrdinal] ?? activeSessionTitle : "";

                return (
                  <article
                    key={message.id}
                    className={cn(
                      "rounded-2xl border p-4 shadow-sm animate-fade-in",
                      message.role === "user"
                        ? "ml-auto max-w-[80%] border-border-strong bg-bg-primary"
                        : "mr-auto max-w-[88%] border-border bg-bg-secondary",
                    )}
                  >
                    <div className="mb-2 flex items-center gap-2">
                      <Badge variant={message.role === "user" ? "mono" : "outline"}>
                        {message.role === "user" ? "You" : "AI"}
                      </Badge>
                      {persistedAssistant?.grounded ? (
                        <Badge variant="success">Grounded</Badge>
                      ) : message.role === "assistant" && persistedAssistant ? (
                        <Badge variant="warning">No source context</Badge>
                      ) : null}
                    </div>
                    {message.role === "assistant" ? (
                      <Markdown text={message.content} className="text-sm leading-7" />
                    ) : (
                      <div className="whitespace-pre-wrap text-sm leading-7 text-text-primary">
                        {message.content}
                      </div>
                    )}

                    {persistedAssistant?.citations?.length ? (
                      <div className="mt-4">
                        <p className="mb-2 text-[10px] font-mono-ui uppercase text-text-muted">
                          Textbook source
                        </p>
                        <div className="flex flex-wrap gap-2">
                          {persistedAssistant.citations.map((citation) => (
                            <CitationCard
                              key={`${persistedAssistant.id}-${citation.chunkId}`}
                              citation={citation}
                            />
                          ))}
                        </div>
                      </div>
                    ) : null}

                    {persistedAssistant ? (
                      <div className="mt-4 space-y-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            onClick={() => void copyAssistantMessage(persistedAssistant)}
                            disabled={copyingMessageId === persistedAssistant.id}
                            data-testid={`copy-message-${persistedAssistant.id}`}
                          >
                            {copyingMessageId === persistedAssistant.id ? "Copying..." : "Copy"}
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant={persistedAssistant.feedback === "up" ? "outline" : "ghost"}
                            onClick={() => void sendFeedback(persistedAssistant, "up")}
                            disabled={feedbackMessageId === persistedAssistant.id}
                            data-testid={`feedback-up-${persistedAssistant.id}`}
                          >
                            👍 Helpful
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant={persistedAssistant.feedback === "down" ? "outline" : "ghost"}
                            onClick={() => void sendFeedback(persistedAssistant, "down")}
                            disabled={feedbackMessageId === persistedAssistant.id}
                            data-testid={`feedback-down-${persistedAssistant.id}`}
                          >
                            👎 Needs work
                          </Button>
                        </div>

                        {persistedAssistant.followUpSuggestions.length ? (
                          <div>
                            <p className="mb-2 text-[10px] font-mono-ui uppercase text-text-muted">
                              Suggested follow-ups
                            </p>
                            <div className="flex flex-wrap gap-2">
                              {persistedAssistant.followUpSuggestions.map((suggestion) => (
                                <button
                                  key={`${persistedAssistant.id}-${suggestion}`}
                                  type="button"
                                  onClick={() => applySuggestedPrompt(suggestion)}
                                  data-testid={`followup-chip-${persistedAssistant.id}`}
                                  className="rounded-full border border-border px-3 py-1.5 text-left text-xs text-text-secondary transition hover:bg-bg-primary hover:text-text-primary"
                                >
                                  {suggestion}
                                </button>
                              ))}
                            </div>
                          </div>
                        ) : null}

                        <div className="flex items-center gap-2">
                        <Button
                          type="button"
                          size="sm"
                          variant={persistedAssistant.savedNoteId ? "outline" : "filled"}
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
                            <Button size="sm" variant="ghost">
                              Open note →
                            </Button>
                          </Link>
                        ) : null}
                        </div>
                      </div>
                    ) : null}
                  </article>
                );
              })}

              {isLoading ? (
                <div className="mr-auto max-w-[88%] rounded-2xl border border-border bg-bg-secondary p-4">
                  <div className="mb-2 flex items-center gap-2">
                    <Badge variant="outline">AI</Badge>
                    <Badge variant={thinkingEnabled ? "success" : "warning"}>
                      {thinkingEnabled ? "Thinking ON" : "Thinking OFF"}
                    </Badge>
                    {answerMode ? (
                      <Badge variant="outline">
                        Auto mode: {answerMode === "deep" ? "Deep" : "Quick"}
                      </Badge>
                    ) : null}
                    <span className="text-[11px] text-text-muted">{thinkingStatus || "Generating..."}</span>
                  </div>
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

        <div className="border-t border-border bg-bg-primary px-4 py-4 md:px-6">
          <div className="mx-auto max-w-3xl">
            {chatError ? (
              <p className="mb-3 rounded-md border border-destructive/40 bg-[color:var(--note-red)] px-3 py-2 text-sm text-destructive">
                {chatError}
              </p>
            ) : null}
            {!chatError && creditWarning ? (
              <p className="mb-3 rounded-md border border-border bg-bg-secondary px-3 py-2 text-sm text-text-secondary">
                {creditWarning}
              </p>
            ) : null}
            {uiFeedback ? (
              <p className="mb-3 rounded-md border border-border bg-bg-secondary px-3 py-2 text-sm text-text-secondary">
                {uiFeedback}
              </p>
            ) : null}
            <form onSubmit={submitMessage} className="rounded-2xl border border-border bg-bg-secondary p-3">
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
                rows={3}
                placeholder="Ask a question about your studies..."
                className="w-full resize-none bg-transparent px-1 py-1 text-sm text-text-primary outline-none placeholder:text-text-muted"
              />
              <div className="mt-3 flex items-center justify-between gap-3">
                <div className="inline-flex rounded-full border border-border p-0.5">
                  {(["EN", "RN"] as const).map((item) => (
                    <button
                      key={item}
                      type="button"
                      onClick={() => setComposerLanguage(item)}
                      className={
                        "rounded-full px-3 py-1 text-[11px] font-mono-ui transition " +
                        (composerLanguage === item ? "bg-text-primary text-text-inverse" : "text-text-secondary")
                      }
                    >
                      {item === "EN" ? "English" : "Roman Nepali"}
                    </button>
                  ))}
                </div>
                <Button type="submit" disabled={isLoading || !input.trim() || creditBalance <= 0}>
                  {isLoading ? "Sending..." : "Send →"}
                </Button>
              </div>
            </form>
          </div>
        </div>
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
