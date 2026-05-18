"use client";

import { useEffect, useMemo, useState } from "react";
import { CitationCard } from "@/components/citation-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/field";
import type { AdminAnswerDetail, AdminAnswerState, AdminAnswerSummary } from "@/lib/types";
import { formatDate, formatTimestamp } from "@/lib/utils";

type FilterMode = "all" | "flagged" | "reviewed" | "liked" | "neutral";

export function AdminAnswersManager({
  initialAnswers,
  initialDetail,
}: {
  initialAnswers: AdminAnswerSummary[];
  initialDetail: AdminAnswerDetail | null;
}) {
  const [answers, setAnswers] = useState(initialAnswers);
  const [selectedId, setSelectedId] = useState<string>(initialDetail?.messageId ?? initialAnswers[0]?.messageId ?? "");
  const [detail, setDetail] = useState<AdminAnswerDetail | null>(initialDetail);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<FilterMode>("flagged");
  const [feedback, setFeedback] = useState<string | null>(null);
  const [busy, setBusy] = useState<"idle" | "loading" | "saving-note" | "marking-reviewed" | "marking-open">("idle");
  const [reviewNote, setReviewNote] = useState(initialDetail?.adminReviewNote ?? "");

  const filteredAnswers = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return answers.filter((answer) => {
      if (filter !== "all" && answer.status !== filter) return false;
      if (!needle) return true;
      return [
        answer.studentName,
        answer.studentEmail,
        answer.sessionTitle,
        answer.subjectContext ?? "",
        answer.answerPreview,
        answer.board,
        answer.grade,
      ]
        .join(" ")
        .toLowerCase()
        .includes(needle);
    });
  }, [answers, filter, query]);

  useEffect(() => {
    let ignore = false;

    async function loadDetail(messageId: string) {
      if (!messageId) {
        setDetail(null);
        return;
      }

      if (initialDetail?.messageId === messageId) {
        setDetail(initialDetail);
        setReviewNote(initialDetail.adminReviewNote ?? "");
        return;
      }

      setBusy("loading");
      setFeedback(null);
      try {
        const response = await fetch(`/api/admin/answers/${messageId}`);
        const payload = await response.json();
        if (!response.ok) {
          throw new Error(payload.error || "Failed to load AI answer detail.");
        }
        if (ignore) return;
        setDetail(payload.answer);
        setReviewNote(payload.answer.adminReviewNote ?? "");
      } catch (error) {
        if (!ignore) {
          setFeedback(error instanceof Error ? error.message : "Failed to load AI answer detail.");
        }
      } finally {
        if (!ignore) setBusy("idle");
      }
    }

    void loadDetail(selectedId);

    return () => {
      ignore = true;
    };
  }, [selectedId, initialDetail]);

  async function refreshAnswers(nextSelectedId?: string) {
    const response = await fetch("/api/admin/answers");
    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload.error || "Failed to refresh AI answers.");
    }

    setAnswers(payload.answers);
    if (nextSelectedId) {
      setSelectedId(nextSelectedId);
    } else if (!payload.answers.some((answer: AdminAnswerSummary) => answer.messageId === selectedId)) {
      setSelectedId(payload.answers[0]?.messageId ?? "");
    }
  }

  async function updateReview(action: "save-note" | "mark-reviewed" | "mark-open") {
    if (!detail) return;

    setBusy(action === "save-note" ? "saving-note" : action === "mark-reviewed" ? "marking-reviewed" : "marking-open");
    setFeedback(null);

    try {
      const response = await fetch(`/api/admin/answers/${detail.messageId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          adminReviewNote: reviewNote,
          reviewed: action === "save-note" ? undefined : action === "mark-reviewed",
        }),
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error || "Failed to update AI answer review.");
      }

      setDetail(payload.answer);
      setReviewNote(payload.answer.adminReviewNote ?? "");
      await refreshAnswers(payload.answer.messageId);
      setFeedback(
        action === "save-note"
          ? "Review note saved."
          : action === "mark-reviewed"
            ? "Answer marked as reviewed."
            : "Answer moved back to open review.",
      );
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "Failed to update AI answer review.");
    } finally {
      setBusy("idle");
    }
  }

  const flaggedCount = answers.filter((answer) => answer.status === "flagged").length;
  const reviewedCount = answers.filter((answer) => answer.status === "reviewed").length;
  const groundedCount = answers.filter((answer) => answer.grounded).length;

  return (
    <div className="mx-auto max-w-7xl px-5 py-8">
      {feedback ? (
        <div className="mb-6 rounded-2xl border border-border bg-bg-secondary px-4 py-3 text-sm text-text-secondary">
          {feedback}
        </div>
      ) : null}

      <div className="mb-6 grid gap-4 md:grid-cols-4">
        <SummaryCard label="Assistant answers" value={answers.length} />
        <SummaryCard label="Flagged" value={flaggedCount} />
        <SummaryCard label="Reviewed" value={reviewedCount} />
        <SummaryCard label="Grounded" value={groundedCount} />
      </div>

      <div className="grid gap-6 xl:grid-cols-[360px_minmax(0,1fr)]">
        <aside className="space-y-4">
          <div className="rounded-3xl border border-border bg-bg-primary p-4">
            <p className="font-display text-2xl">Answer queue</p>
            <p className="mt-1 text-sm text-text-secondary">
              Flagged answers, liked replies, and neutral outputs across the whole app.
            </p>

            <div className="mt-4 grid gap-3">
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search student, board, subject..."
              />
              <Field label="Filter">
                <select
                  value={filter}
                  onChange={(event) => setFilter(event.target.value as FilterMode)}
                  className="block h-11 w-full rounded-md border border-border bg-bg-primary px-3 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-border-strong/40"
                >
                  <option value="flagged">flagged</option>
                  <option value="all">all</option>
                  <option value="reviewed">reviewed</option>
                  <option value="liked">liked</option>
                  <option value="neutral">neutral</option>
                </select>
              </Field>
            </div>

            <div className="mt-4 space-y-2">
              {filteredAnswers.length ? (
                filteredAnswers.map((answer) => (
                  <button
                    key={answer.messageId}
                    type="button"
                    onClick={() => setSelectedId(answer.messageId)}
                    className={`w-full rounded-2xl border px-4 py-3 text-left transition ${
                      selectedId === answer.messageId
                        ? "border-border-strong bg-bg-secondary"
                        : "border-border bg-bg-primary hover:bg-bg-secondary"
                    }`}
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-medium">{answer.studentName}</p>
                      <StatusBadge status={answer.status} />
                      {answer.feedback === "down" ? <Badge variant="danger">thumbs down</Badge> : null}
                    </div>
                    <p className="mt-1 text-xs text-text-secondary">
                      {answer.board || "No board"} · {answer.grade || "No grade"} · {answer.subjectContext || "General"}
                    </p>
                    <p className="mt-2 text-sm text-text-primary">{answer.answerPreview}</p>
                    <p className="mt-2 text-[11px] text-text-muted">
                      {answer.sessionTitle} · {formatDate(answer.createdAt)}
                    </p>
                  </button>
                ))
              ) : (
                <div className="rounded-2xl border border-dashed border-border px-4 py-8 text-center text-sm text-text-secondary">
                  No answers match this filter.
                </div>
              )}
            </div>
          </div>
        </aside>

        <section className="space-y-6">
          <div className="rounded-3xl border border-border bg-bg-primary p-5">
            {detail ? (
              <>
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-display text-3xl">{detail.studentName}</p>
                      <StatusBadge status={detail.status} />
                      {detail.feedback === "down" ? <Badge variant="danger">Flagged by student</Badge> : null}
                      {detail.grounded ? <Badge variant="success">Grounded</Badge> : <Badge variant="warning">Ungrounded</Badge>}
                    </div>
                    <p className="mt-2 text-sm text-text-secondary">
                      {detail.studentEmail || "No email"} · {detail.board || "No board"} · {detail.grade || "No grade"} ·{" "}
                      {detail.subjectContext || "General"}
                    </p>
                    <p className="mt-1 text-xs text-text-muted">
                      Session: {detail.sessionTitle} · Answered {formatDate(detail.createdAt)}
                    </p>
                  </div>
                  <div className="text-right text-sm text-text-secondary">
                    <div>{detail.reviewedAt ? `Reviewed ${formatDate(detail.reviewedAt)}` : "Not reviewed yet"}</div>
                    <div>{detail.citationCount} source {detail.citationCount === 1 ? "match" : "matches"}</div>
                  </div>
                </div>

                <div className="mt-6 grid gap-4 md:grid-cols-4">
                  <MetricBlock label="College" value={detail.college || "—"} />
                  <MetricBlock label="Subjects" value={detail.subjects.length ? detail.subjects.join(", ") : "—"} />
                  <MetricBlock label="Target" value={detail.targetGrade || "—"} />
                  <MetricBlock label="Language" value={detail.languagePref} />
                </div>

                <div className="mt-6 rounded-2xl border border-border bg-bg-secondary p-4">
                  <p className="text-[11px] font-mono-ui uppercase tracking-wider text-text-muted">Assistant answer</p>
                  <p className="mt-3 whitespace-pre-wrap text-sm leading-7 text-text-primary">{detail.content}</p>
                </div>

                <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
                  <div className="rounded-2xl border border-border bg-bg-primary p-4">
                    <p className="text-[11px] font-mono-ui uppercase tracking-wider text-text-muted">Conversation</p>
                    <div className="mt-4 space-y-3">
                      {detail.conversation.map((message) => (
                        <div
                          key={message.id}
                          className={`rounded-2xl border px-4 py-3 ${
                            message.role === "assistant"
                              ? "border-border bg-bg-secondary"
                              : "border-border bg-bg-primary"
                          }`}
                        >
                          <div className="flex flex-wrap items-center gap-2">
                            <Badge variant={message.role === "assistant" ? "default" : "outline"}>
                              {message.role}
                            </Badge>
                            <span className="text-[11px] text-text-muted">{formatTimestamp(message.createdAt)}</span>
                            {message.feedback === "down" ? <Badge variant="danger">thumbs down</Badge> : null}
                            {message.feedback === "up" ? <Badge variant="success">thumbs up</Badge> : null}
                          </div>
                          <p className="mt-3 whitespace-pre-wrap text-sm leading-7 text-text-primary">{message.content}</p>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-4">
                    <div className="rounded-2xl border border-border bg-bg-primary p-4">
                      <p className="text-[11px] font-mono-ui uppercase tracking-wider text-text-muted">Source audit</p>
                      <div className="mt-4 space-y-3">
                        {detail.citations.length ? (
                          detail.citations.map((citation) => (
                            <CitationCard key={`${detail.messageId}-${citation.chunkId}`} citation={citation} />
                          ))
                        ) : (
                          <div className="rounded-2xl border border-dashed border-border px-4 py-8 text-center text-sm text-text-secondary">
                            No citations stored for this answer.
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="rounded-2xl border border-border bg-bg-primary p-4">
                      <Field
                        label="Admin review note"
                        hint="Use this for internal QA notes, source issues, or answer-quality comments."
                      >
                        <Textarea
                          value={reviewNote}
                          onChange={(event) => setReviewNote(event.target.value)}
                          rows={6}
                          placeholder="Example: source looked weak, answer mixed grammar, needs prompt adjustment..."
                        />
                      </Field>
                      <div className="mt-4 grid gap-2">
                        <Button onClick={() => void updateReview("save-note")} disabled={busy !== "idle"}>
                          {busy === "saving-note" ? "Saving..." : "Save note"}
                        </Button>
                        <Button onClick={() => void updateReview("mark-reviewed")} disabled={busy !== "idle"}>
                          {busy === "marking-reviewed" ? "Marking..." : "Mark reviewed"}
                        </Button>
                        <Button variant="outline" onClick={() => void updateReview("mark-open")} disabled={busy !== "idle"}>
                          {busy === "marking-open" ? "Updating..." : "Move back to open"}
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>
              </>
            ) : (
              <div className="rounded-2xl border border-dashed border-border px-4 py-12 text-center text-sm text-text-secondary">
                Choose an assistant answer to inspect the conversation and sources.
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}

function SummaryCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl border border-border bg-bg-primary p-5">
      <p className="text-[11px] font-mono-ui uppercase text-text-muted">{label}</p>
      <p className="mt-2 font-display text-4xl">{value}</p>
    </div>
  );
}

function MetricBlock({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-border bg-bg-secondary p-4">
      <p className="text-[11px] font-mono-ui uppercase tracking-wider text-text-muted">{label}</p>
      <p className="mt-2 text-sm text-text-primary">{value}</p>
    </div>
  );
}

function StatusBadge({ status }: { status: AdminAnswerState }) {
  const config = {
    flagged: { variant: "danger" as const, label: "Flagged" },
    reviewed: { variant: "success" as const, label: "Reviewed" },
    liked: { variant: "default" as const, label: "Liked" },
    neutral: { variant: "outline" as const, label: "Neutral" },
  };

  return <Badge variant={config[status].variant}>{config[status].label}</Badge>;
}
