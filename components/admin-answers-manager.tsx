"use client";

import { useEffect, useState } from "react";
import { useCallback } from "react";
import { AdminEntityListPanel } from "@/components/admin/entity-list-panel";
import { CitationCard } from "@/components/citation-card";
import { Markdown } from "@/components/markdown";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/field";
import { ANSWER_COLLECTION } from "@/lib/admin-resource-definitions";
import type { AdminAnswerDetail, AdminAnswerFilter, AdminAnswerState, AdminAnswerSummary, AdminListPage } from "@/lib/types";
import { formatDate, formatTimestamp } from "@/lib/utils";

export function AdminAnswersManager({
  initialAnswers,
  initialDetail,
  initialPage,
}: {
  initialAnswers: AdminAnswerSummary[];
  initialDetail: AdminAnswerDetail | null;
  initialPage: AdminListPage<AdminAnswerSummary>;
}) {
  const [answers, setAnswers] = useState(initialAnswers);
  const [selectedId, setSelectedId] = useState<string>(initialDetail?.messageId ?? initialAnswers[0]?.messageId ?? "");
  const [detail, setDetail] = useState<AdminAnswerDetail | null>(initialDetail);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<AdminAnswerFilter>("flagged");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [page, setPage] = useState(initialPage.page);
  const [pageSize, setPageSize] = useState(initialPage.pageSize);
  const [total, setTotal] = useState(initialPage.total);
  const [totalPages, setTotalPages] = useState(initialPage.totalPages);
  const [listLoading, setListLoading] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [busy, setBusy] = useState<"idle" | "loading" | "saving-note" | "marking-reviewed" | "marking-open">("idle");
  const [reviewNote, setReviewNote] = useState(initialDetail?.adminReviewNote ?? "");

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

  const refreshAnswers = useCallback(async (nextSelectedId?: string, requestedPage?: number) => {
    const targetPage = requestedPage ?? page;
    const params = new URLSearchParams();
    params.set("status", filter);
    params.set("page", String(targetPage));
    params.set("pageSize", String(pageSize));
    if (query.trim()) {
      params.set("q", query.trim());
    }

    setListLoading(true);
    const response = await fetch(`/api/admin/answers?${params.toString()}`);
    const payload = await response.json();
    setListLoading(false);
    if (!response.ok) {
      throw new Error(payload.error || "Failed to refresh AI answers.");
    }

    setAnswers(payload.items);
    setTotal(payload.total);
    setPage(payload.page);
    setPageSize(payload.pageSize);
    setTotalPages(payload.totalPages);

    setSelectedId((currentSelectedId) => {
      if (nextSelectedId) return nextSelectedId;
      return payload.items.some((answer: AdminAnswerSummary) => answer.messageId === currentSelectedId)
        ? currentSelectedId
        : (payload.items[0]?.messageId ?? "");
    });
  }, [filter, page, pageSize, query]);

  useEffect(() => {
    const timer = setTimeout(() => {
      void refreshAnswers(undefined, 1);
    }, 250);

    return () => clearTimeout(timer);
  }, [filter, query, refreshAnswers]);

  useEffect(() => {
    setSelectedIds((current) =>
      current.filter((messageId) => answers.some((answer) => answer.messageId === messageId)),
    );
  }, [answers]);

  async function runBulkAction(action: "mark_reviewed" | "mark_open") {
    if (!selectedIds.length) {
      setFeedback("Select at least one answer first.");
      return;
    }

    setBusy(action === "mark_reviewed" ? "marking-reviewed" : "marking-open");
    setFeedback(null);
    try {
      const response = await fetch("/api/admin/answers/actions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          messageIds: selectedIds,
        }),
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error || "Failed to run bulk action.");
      }

      await refreshAnswers(selectedId, page);
      setSelectedIds([]);
      setFeedback(
        action === "mark_reviewed"
          ? `${payload.updatedCount} answers marked reviewed.`
          : `${payload.updatedCount} answers moved back to open.`,
      );
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "Failed to run bulk action.");
    } finally {
      setBusy("idle");
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

  return (
    <div className="mx-auto max-w-[1600px] px-5 py-6 md:px-8">
      {feedback ? (
        <div className="mb-6 border border-border bg-bg-secondary px-4 py-3 text-sm text-text-secondary">
          {feedback}
        </div>
      ) : null}

      <div className="mb-6 grid gap-0 overflow-hidden rounded-none border border-border bg-bg-primary sm:grid-cols-2 xl:grid-cols-4">
        <SummaryCard label="Results" value={total} />
        <SummaryCard label="Page" value={page} />
        <SummaryCard label="Page size" value={pageSize} />
        <SummaryCard label="Selected" value={selectedId ? 1 : 0} />
      </div>

      <div className="grid gap-6 xl:grid-cols-[340px_minmax(0,1fr)]">
        <aside className="space-y-4">
          <AdminEntityListPanel
            title={ANSWER_COLLECTION.label}
            subtitle={ANSWER_COLLECTION.subtitle}
            searchPlaceholder={ANSWER_COLLECTION.searchPlaceholder}
            emptyMessage={ANSWER_COLLECTION.emptyMessage}
            query={query}
            onQueryChange={setQuery}
            listLoading={listLoading}
            items={answers}
            getId={(answer) => answer.messageId}
            getItemView={(answer) => ({
              title: answer.studentName,
              badges: (
                <>
                  <StatusBadge status={answer.status} />
                  {answer.feedback === "down" ? <Badge variant="danger">thumbs down</Badge> : null}
                </>
              ),
              subtitle: `${answer.board || "No board"} · ${answer.grade || "No grade"} · ${answer.subjectContext || "General"}`,
              meta: `${answer.sessionTitle} · ${formatDate(answer.createdAt)}`,
            })}
            selectedId={selectedId}
            onSelect={setSelectedId}
            selectedIds={selectedIds}
            onSelectedIdsChange={setSelectedIds}
            page={page}
            totalPages={totalPages}
            total={total}
            pageSize={pageSize}
            onPrevPage={() => void refreshAnswers(undefined, Math.max(1, page - 1))}
            onNextPage={() => void refreshAnswers(undefined, Math.min(totalPages, page + 1))}
            disabled={busy !== "idle"}
            maxListHeightClassName="xl:max-h-[26rem]"
            secondaryControls={
              <Field label="Filter">
                <select
                  value={filter}
                  onChange={(event) => setFilter(event.target.value as AdminAnswerFilter)}
                  className="block h-11 w-full rounded-md border border-border bg-bg-primary px-3 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-border-strong/40"
                >
                  {ANSWER_COLLECTION.filters?.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </Field>
            }
            bulkActions={[
              {
                key: "mark-reviewed",
                label: "Bulk reviewed",
                onRun: () => runBulkAction("mark_reviewed"),
                disabled: busy !== "idle",
              },
              {
                key: "mark-open",
                label: "Bulk open",
                variant: "outline",
                onRun: () => runBulkAction("mark_open"),
                disabled: busy !== "idle",
              },
            ]}
          />
          {detail ? (
            <div className="overflow-hidden rounded-none border border-border bg-bg-primary">
              <div className="border-b border-border px-4 py-3">
              <p className="text-[11px] font-mono-ui uppercase tracking-wider text-text-muted">Conversation</p>
              </div>
              <div className="space-y-3 px-4 py-4 xl:max-h-[44rem] xl:overflow-y-auto">
                {detail.conversation.map((message) => (
                  <div
                    key={message.id}
                    className={`border px-4 py-3 ${
                      message.role === "assistant" ? "border-border bg-bg-secondary" : "border-border bg-bg-primary"
                    }`}
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant={message.role === "assistant" ? "default" : "outline"}>{message.role}</Badge>
                      <span className="text-[11px] text-text-muted">{formatTimestamp(message.createdAt)}</span>
                      {message.feedback === "down" ? <Badge variant="danger">thumbs down</Badge> : null}
                      {message.feedback === "up" ? <Badge variant="success">thumbs up</Badge> : null}
                    </div>
                    <div className="mt-3">
                      <Markdown text={message.content} className="text-sm leading-7" />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </aside>

        <section className="space-y-6">
          <div className="overflow-hidden rounded-none border border-border bg-bg-primary">
            {detail ? (
              <>
                <div className="flex flex-wrap items-start justify-between gap-4 border-b border-border px-5 py-4">
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

                <div className="grid gap-0 border-b border-border md:grid-cols-2 xl:grid-cols-4">
                  <MetricBlock label="College" value={detail.college || "—"} />
                  <MetricBlock label="Subjects" value={detail.subjects.length ? detail.subjects.join(", ") : "—"} />
                  <MetricBlock label="Target" value={detail.targetGrade || "—"} />
                  <MetricBlock label="Language" value={detail.languagePref} />
                </div>

                <div className="border-b border-border bg-bg-secondary px-5 py-4">
                  <p className="text-[11px] font-mono-ui uppercase tracking-wider text-text-muted">Assistant answer</p>
                  <div className="mt-3">
                    <Markdown text={detail.content} className="text-sm leading-7" />
                  </div>
                </div>

                <div className="grid gap-6 px-5 py-5 xl:grid-cols-[minmax(0,1fr)_360px]">
                  <div className="overflow-hidden rounded-none border border-border bg-bg-primary">
                    <div className="border-b border-border px-4 py-3">
                    <p className="text-[11px] font-mono-ui uppercase tracking-wider text-text-muted">Source audit</p>
                    </div>
                    <div className="space-y-3 px-4 py-4">
                      {detail.citations.length ? (
                        detail.citations.map((citation) => (
                          <CitationCard key={`${detail.messageId}-${citation.chunkId}`} citation={citation} />
                        ))
                      ) : (
                        <div className="px-4 py-8 text-center text-sm text-text-secondary">
                          No citations stored for this answer.
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="space-y-4 xl:sticky xl:top-24">
                    <div className="overflow-hidden rounded-none border border-border bg-bg-primary">
                      <div className="border-b border-border px-4 py-3">
                        <p className="text-[11px] font-mono-ui uppercase tracking-wider text-text-muted">Review action</p>
                      </div>
                      <div className="px-4 py-4">
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
                </div>
              </>
            ) : (
              <div className="px-4 py-12 text-center text-sm text-text-secondary">
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
    <div className="border-r border-border px-4 py-4 last:border-r-0">
      <p className="text-[11px] font-mono-ui uppercase text-text-muted">{label}</p>
      <p className="mt-2 font-display text-4xl">{value}</p>
    </div>
  );
}

function MetricBlock({ label, value }: { label: string; value: string }) {
  return (
    <div className="border-r border-border bg-bg-secondary px-4 py-4 last:border-r-0">
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
