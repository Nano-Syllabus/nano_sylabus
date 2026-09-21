"use client";

import { useEffect, useRef, useState, ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { TEACHER_UPLOAD_MAX_LABEL, teacherUploadSizeError } from "@/lib/teacher-upload";
import { SubjectCommunity } from "@/lib/teacher-subject-access";
import { CommunityDetail } from "@/lib/communities";
import { CommunitySubjectWorkspace } from "@/lib/data/community-subjects";
import { cn } from "@/lib/utils";

export type ApiRecord = Record<string, unknown>;

export type WorkspaceState = "loading" | "ready" | "error";

export type DashboardState = "loading" | "ready" | "error";

export type SubjectTab =
  | "overview"
  | "syllabus"
  | "material"
  | "bank"
  | "source-search"
  | "test-chat"
  | "config";

export type Shelf = "Syllabus" | "Notes" | "Question Bank";

export type TeacherSubject = {
  slug: string;
  name: string;
  folderPath: string;
  code: string;
  university: string;
  programme: string;
  visibility: "public" | "private";
  communities: SubjectCommunity[];
};

export type TeacherDocument = {
  id: string;
  name: string;
  path: string;
  shelf: Shelf | "Other";
  sizeBytes: number;
  /**
   * `unindexed` is the state this list used to be unable to say.
   *
   * A file the portal uploaded but never got indexed has no row in the
   * collection index at all, so the tenant API reports it as `indexed: false`,
   * `chunk_count: 0`, `status: ""` — exactly what a file whose indexing job is
   * still queued reports. Flattening the two into "Indexing" told a creator to
   * wait for something that was never going to happen, and the wait had no end
   * and no button.
   */
  status: "ready" | "processing" | "unindexed" | "error";
  chunks: number;
  previewAvailable: boolean;
};

export type Workspace = {
  teacher: {
    handle: string;
    email: string;
    fullName: string;
    language: "EN" | "RN";
    answerStyle: "concise" | "exam_focused";
    publicProfile: {
      headline: string;
      bio: string;
      institution: string;
      location: string;
      expertise: string[];
      yearsExperience: number;
      website: string;
      avatarUrl: string;
      complete: boolean;
    };
  };
  collection: ApiRecord;
  subjects: TeacherSubject[];
  documents: TeacherDocument[];
  sourceTree: ApiRecord;
  /** The creator service could not be reached and the server answered from the
   *  last read that succeeded. Everything on screen is real, just not current. */
  stale: boolean;
};

export type TeacherDashboard = {
  summary: {
    classroomCount: number;
    studentCount: number;
    paperCount: number;
    submissionCount: number;
    actionRequiredCount: number;
    needsAttentionCount: number;
  };
  classrooms: {
    id: string;
    subjectSlug: string;
    subjectName: string;
    name: string;
    joinCode: string;
    memberCount: number;
    assignmentCount: number;
    submissionCount: number;
    actionRequiredCount: number;
    createdAt: string;
    termKey: string;
    meetingSchedule: string;
    notice: string;
  }[];
  needsAttention: {
    studentId: string | null;
    name: string;
    averagePercent: number;
    submissionCount: number;
    latestAt: string;
  }[];
  managedCommunities: {
    id: string;
    slug: string;
    name: string;
    university: string;
    faculty: string;
    totalYears: number;
    totalSemesters: number;
    memberCount: number;
    subjectCount: number;
    createdAt: string;
  }[];
  communityWorkspace: CommunityDetail | null;
  communitySubjectWorkspace: CommunitySubjectWorkspace | null;
  communityAdmin: {
    id: string;
    slug: string;
    name: string;
    university: string;
    faculty: string;
    totalYears: number;
    totalSemesters: number;
    contributionThreshold: number;
    memberCount: number;
    subjectCount: number;
    filledSemesterCount: number;
    pendingResourceCount: number;
    mergedResourceCount: number;
    discussionCount: number;
    recentMembers: {
      userId: string;
      name: string;
      role: string;
      joinedAt: string;
    }[];
  } | null;
};

export type SyllabusUnit = { title: string; topics: { name: string }[] };

export type SyllabusState = {
  state: "idle" | "loading" | "ready" | "error";
  structure: SyllabusUnit[];
  updatedAt: string | null;
  error: string;
};

export type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  sources?: { name: string; where: string }[];
};

export const interactive =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-strong focus-visible:ring-offset-2 focus-visible:ring-offset-bg-primary";

export function asRecord(value: unknown): ApiRecord {
  return value && typeof value === "object" ? (value as ApiRecord) : {};
}

export function text(value: unknown) {
  return typeof value === "string" ? value : "";
}

export function numberValue(value: unknown) {
  return typeof value === "number" ? value : Number(value) || 0;
}

export function list(value: unknown): ApiRecord[] {
  return Array.isArray(value) ? value.map(asRecord) : [];
}

export class ResponseError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string,
  ) {
    super(message);
    this.name = "ResponseError";
  }
}

export async function responsePayload(response: Response) {
  const raw = await response.text();
  let payload: ApiRecord = {};
  const contentType = response.headers.get("content-type") || "";
  try {
    payload = raw && contentType.includes("application/json") ? (JSON.parse(raw) as ApiRecord) : {};
  } catch {
    payload = {};
  }
  if (!response.ok) {
    const plainError = raw.trim();
    const isHtmlError =
      contentType.includes("text/html") ||
      /^<!doctype html/i.test(plainError) ||
      /<html[\s>]/i.test(plainError);
    const fallback =
      response.status === 413
        ? `This file is too large. Upload a file up to ${TEACHER_UPLOAD_MAX_LABEL}.`
        : isHtmlError
          ? `The request could not be completed (${response.status}).`
          : plainError || `The request could not be completed (${response.status}).`;
    throw new ResponseError(text(payload.error) || fallback, response.status, text(payload.code));
  }
  return payload;
}

export type DriveQueueItem = {
  id: string;
  fileName: string;
  shelf: string;
  destinationPath: string;
  /** The link this file was pasted from. Carried to the browser so a failed row
   *  can offer the creator the way back to it, not only the retry button. */
  sourceLink: string;
  status: "queued" | "importing" | "done" | "failed";
  error: string;
  warning: string;
};

export function toQueueItem(value: unknown): DriveQueueItem {
  const record = asRecord(value);
  const status = text(record.status);
  return {
    id: text(record.id),
    fileName: text(record.fileName) || "Drive file",
    shelf: text(record.shelf),
    destinationPath: text(record.destinationPath),
    sourceLink: text(record.sourceLink),
    status: (["queued", "importing", "done", "failed"].includes(status)
      ? status
      : "queued") as DriveQueueItem["status"],
    error: text(record.error),
    warning: text(record.warning),
  };
}

/** Read the queue. Also nudges a drain when there is work and nothing running —
 *  a serverless drain can be cut short, and polling is when we find out. */
export async function readDriveQueue() {
  const payload = await responsePayload(
    await fetch("/api/teacher/drive-queue", {
      headers: { Accept: "application/json" },
      cache: "no-store",
    }),
  );
  const items = Array.isArray(payload.items) ? payload.items.map(toQueueItem) : [];
  return { items, unavailable: payload.unavailable === true };
}

/**
 * Put failed imports back on the queue and return the queue as it now stands.
 *
 * Takes row ids, not files: the row already holds the link, the Drive file id
 * and the destination, so a retry asks the server to run the same instruction
 * again rather than rebuilding it here. That is what lets the button work on the
 * Activity page, where the dialog that queued the file is long gone.
 */
export async function retryDriveImports(ids: string[]) {
  const payload = await responsePayload(
    await fetch("/api/teacher/drive-queue", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ action: "retry", ids }),
    }),
  );
  return Array.isArray(payload.items) ? payload.items.map(toQueueItem) : [];
}

export function nudgeDriveQueue() {
  void fetch("/api/teacher/drive-queue", {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ action: "drain" }),
  }).catch(() => {});
}

export function DriveImportQueue({
  onSettled,
  emptyMessage,
}: {
  onSettled?: () => void;
  /** Given only where an empty queue still needs to say something — the Activity
   *  page. Inside the upload dialog a queue with no rows renders nothing. */
  emptyMessage?: string;
}) {
  const [items, setItems] = useState<DriveQueueItem[]>([]);
  const [unavailable, setUnavailable] = useState(false);
  /**
   * Whether the first poll has come back yet.
   *
   * Without it, "no rows" and "not asked yet" are the same state, and the panel
   * asserts that nothing has been imported before it has any grounds to — so a
   * creator whose files ARE there is told they are not, for as long as the round
   * trip takes, and then contradicted. An import queue is the one panel where
   * that flash reads as data loss.
   */
  const [loaded, setLoaded] = useState(false);
  /** The rows whose retry is in flight, so each button can say so for itself
   *  rather than the whole panel going busy. */
  const [retrying, setRetrying] = useState<string[]>([]);
  const [retryError, setRetryError] = useState("");
  const settledRef = useRef(0);
  /**
   * Poll now, instead of waiting out the current timer.
   *
   * A retry moves rows back to `queued`, and the loop is on its idle 10-second
   * beat when it happens — so without this the row a creator just retried sits
   * there reading "Failed" for up to ten seconds after they pressed the button,
   * which reads as the button having done nothing.
   */
  const pollNowRef = useRef<() => void>(() => {});
  /**
   * The callback is read through a ref rather than depended on.
   *
   * Both call sites pass an inline arrow, so its identity changes on every
   * render of the workspace — and as an effect dependency that would tear down
   * and restart the polling loop each time, which is both a leak of timers and a
   * queue that never settles into its 3-second rhythm.
   */
  const onSettledRef = useRef(onSettled);
  onSettledRef.current = onSettled;

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let idleRounds = 0;

    async function tick() {
      try {
        const { items: next, unavailable: missing } = await readDriveQueue();
        if (cancelled) return;
        setItems(next);
        setUnavailable(missing);
        setLoaded(true);
        if (missing) return; // Nothing to poll for on a deployment without the table.

        const pending = next.filter(
          (item) => item.status === "queued" || item.status === "importing",
        ).length;
        const settled = next.length - pending;
        // Refresh the shelf only when something new actually landed, rather than
        // on every poll — the document list is a real request.
        if (settled > settledRef.current) onSettledRef.current?.();
        settledRef.current = settled;

        if (pending) {
          // Two quiet rounds with work still queued means no drain is running —
          // its function was cut short, or the enqueue's never started. Start one.
          idleRounds = next.some((item) => item.status === "importing") ? 0 : idleRounds + 1;
          if (idleRounds >= 2) {
            nudgeDriveQueue();
            idleRounds = 0;
          }
        }
        // Keeps polling when idle, slowly: this dialog is where a creator queues
        // the NEXT folder, and a loop that stopped at zero would show that one
        // nothing at all.
        timer = setTimeout(tick, pending ? 3_000 : 10_000);
      } catch {
        // A failed poll is not worth showing: the queue is durable and the next
        // tick reads it again.
        if (!cancelled) timer = setTimeout(tick, 10_000);
      }
    }

    pollNowRef.current = () => {
      if (cancelled) return;
      if (timer) clearTimeout(timer);
      void tick();
    };

    void tick();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, []);

  async function runRetry(ids: string[]) {
    if (!ids.length || retrying.length) return;
    setRetrying(ids);
    setRetryError("");
    try {
      setItems(await retryDriveImports(ids));
      pollNowRef.current();
    } catch (caught) {
      setRetryError(
        caught instanceof Error
          ? caught.message
          : ids.length === 1
            ? "That import could not be retried."
            : "Those imports could not be retried.",
      );
    } finally {
      setRetrying([]);
    }
  }

  if (unavailable) {
    return (
      <p className="mt-4 rounded-lg border border-warning/40 bg-warning/10 p-3 text-sm">
        The import queue is not available on this deployment. Run the latest database migration.
      </p>
    );
  }
  // Only the rows are unknown, so only the rows are placeheld — the panel frame
  // and its heading are known and are drawn for real. `bg-border`, never
  // `bg-bg-secondary`: on this panel the secondary surface IS the background.
  if (!loaded && emptyMessage) {
    return (
      <section
        className="mt-4 rounded-lg border border-border bg-bg-secondary p-3"
        aria-busy="true"
        aria-label="Loading the import queue"
      >
        <div className="flex items-center justify-between px-1 pb-2">
          <span className="font-display text-sm font-semibold">Import queue</span>
          <span className="h-3 w-24 animate-pulse rounded bg-border" />
        </div>
        <div className="space-y-2">
          {[0, 1].map((row) => (
            <div
              key={row}
              className="flex items-center gap-3 rounded-lg border border-border bg-bg-primary px-3 py-3"
            >
              <span className="size-6 shrink-0 animate-pulse rounded-full bg-border" />
              <span className="h-3.5 flex-1 animate-pulse rounded bg-border" style={{ maxWidth: row ? "14rem" : "9rem" }} />
              <span className="h-3 w-16 shrink-0 animate-pulse rounded bg-border" />
            </div>
          ))}
        </div>
      </section>
    );
  }
  if (!items.length) {
    return emptyMessage ? (
      <p className="mt-4 rounded-lg border border-border bg-bg-secondary p-4 text-sm text-text-muted">
        {emptyMessage}
      </p>
    ) : null;
  }

  const pending = items.filter(
    (item) => item.status === "queued" || item.status === "importing",
  ).length;
  const failedIds = items.filter((item) => item.status === "failed").map((item) => item.id);
  const failed = failedIds.length;

  return (
    <section
      className="mt-4 rounded-lg border border-border bg-bg-secondary p-3"
      aria-live="polite"
    >
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-medium">
          {pending ? `Importing in the background · ${pending} left` : "Import queue"}
        </p>
        <p className="text-xs text-text-muted">
          {items.length - pending} of {items.length} finished
          {failed ? ` · ${failed} failed` : ""}
        </p>
      </div>
      <ul className="mt-3 divide-y divide-border overflow-hidden rounded-lg border border-border">
        {items.map((item) => (
          <li key={item.id} className="bg-bg-primary px-3 py-2">
            <div className="flex min-h-9 items-center gap-3">
              <span
                aria-hidden="true"
                className={cn(
                  "flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs",
                  item.status === "done"
                    ? "bg-success/15 text-success"
                    : item.status === "failed"
                      ? "bg-destructive/15 text-destructive"
                      : "bg-border text-text-muted",
                )}
              >
                {item.status === "done" ? "✓" : item.status === "failed" ? "!" : "·"}
              </span>
              <span className="min-w-0 flex-1 truncate text-sm">{item.fileName}</span>
              <span className="shrink-0 text-xs text-text-muted">
                {item.status === "queued"
                  ? "Queued"
                  : item.status === "importing"
                    ? "Importing…"
                    : item.status === "done"
                      ? "Indexed"
                      : "Failed"}
              </span>
              {/* A timeout and a half-finished index say nothing about the file,
                  only about the run — so the row that reports one also offers
                  another go, rather than sending the creator back to the link. */}
              {item.status === "failed" ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="shrink-0"
                  disabled={retrying.length > 0}
                  onClick={() => void runRetry([item.id])}
                >
                  {retrying.includes(item.id) ? "Retrying…" : "Retry"}
                </Button>
              ) : null}
            </div>
            {item.error ? <p className="mt-1 pl-9 text-xs text-destructive">{item.error}</p> : null}
            {item.status === "failed" && item.sourceLink ? (
              <p className="mt-1 pl-9 text-xs text-text-muted">
                <a
                  href={item.sourceLink}
                  target="_blank"
                  rel="noreferrer"
                  className="underline underline-offset-2 hover:text-text-primary"
                >
                  Open the Drive link
                </a>{" "}
                — Retry re-reads it, and pasting it above again works too.
              </p>
            ) : null}
            {item.warning ? (
              <p className="mt-1 pl-9 text-xs text-text-muted">{item.warning}</p>
            ) : null}
          </li>
        ))}
      </ul>
      {retryError ? <p className="mt-2 text-xs text-destructive">{retryError}</p> : null}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {/* Offered while other files are still importing too: the retried rows
            simply join the queue behind them. */}
        {failed > 1 ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={retrying.length > 0}
            onClick={() => void runRetry(failedIds)}
          >
            {retrying.length > 1 ? "Retrying…" : `Retry all ${failed} failed`}
          </Button>
        ) : null}
        {pending ? (
          <p className="text-xs text-text-muted">
            You can close this dialog — importing continues without it.
          </p>
        ) : (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              void fetch("/api/teacher/drive-queue", {
                method: "POST",
                headers: { "Content-Type": "application/json", Accept: "application/json" },
                body: JSON.stringify({ action: "clear", failed: true }),
              })
                .then(() => setItems([]))
                .catch(() => {});
            }}
          >
            Clear finished
          </Button>
        )}
      </div>
    </section>
  );
}

export function SkeletonBlock({ className }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        "animate-pulse-soft rounded-lg bg-bg-tertiary motion-reduce:animate-none",
        className,
      )}
    />
  );
}

export function SkeletonCard({ lines = 3, className }: { lines?: number; className?: string }) {
  return (
    <div className={cn("rounded-lg border border-border p-5", className)} aria-hidden="true">
      <div className="flex items-start gap-3">
        <SkeletonBlock className="h-10 w-10 shrink-0 rounded-full" />
        <div className="min-w-0 flex-1 space-y-3">
          <SkeletonBlock className="h-3 w-28" />
          <SkeletonBlock className="h-5 w-3/4" />
        </div>
      </div>
      <div className="mt-5 space-y-2">
        {Array.from({ length: lines }).map((_, index) => (
          <SkeletonBlock
            key={index}
            className={cn("h-3", index === lines - 1 ? "w-2/3" : "w-full")}
          />
        ))}
      </div>
    </div>
  );
}

export function DashboardSkeleton() {
  return (
    <div role="status" aria-label="Loading dashboard">
      <div className="space-y-3">
        <SkeletonBlock className="h-3 w-24" />
        <SkeletonBlock className="h-10 w-72 max-w-full" />
        <SkeletonBlock className="h-4 w-56 max-w-full" />
      </div>
      <SkeletonBlock className="mt-8 h-36 rounded-xl" />
      <div className="mt-10 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 3 }).map((_, index) => (
          <SkeletonCard key={index} lines={3} className="h-48" />
        ))}
      </div>
    </div>
  );
}

export function ExamWorkspaceSkeleton() {
  return (
    <div role="status" aria-label="Loading exams">
      <div className="space-y-3">
        <SkeletonBlock className="h-3 w-44" />
        <SkeletonBlock className="h-10 w-80 max-w-full" />
        <SkeletonBlock className="h-4 w-[30rem] max-w-full" />
      </div>
      <div className="mt-8 grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(280px,360px)]">
        <div className="space-y-5">
          <SkeletonBlock className="h-52 rounded-xl" />
          <SkeletonBlock className="h-80 rounded-xl" />
        </div>
        <div className="space-y-4">
          {Array.from({ length: 3 }).map((_, index) => (
            <SkeletonCard key={index} lines={2} />
          ))}
        </div>
      </div>
    </div>
  );
}

export function DashboardError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <section className="rounded-lg border border-destructive/30 p-6">
      <h1 className="font-display text-2xl font-semibold">Couldn&apos;t load the dashboard</h1>
      <p className="mt-2 text-sm text-text-secondary">{message}</p>
      <Button className="mt-5" variant="outline" onClick={onRetry}>
        Try again
      </Button>
    </section>
  );
}

export function initials(name: string) {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join("") || "S"
  );
}

export function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Recently joined";
  return new Intl.DateTimeFormat("en", { month: "short", day: "numeric" }).format(date);
}

