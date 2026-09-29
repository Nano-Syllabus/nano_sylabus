"use client";

import { CheckCircle2, FileUp, LoaderCircle, X, XCircle } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { TEACHER_UPLOAD_MAX_LABEL, teacherUploadSizeError } from "@/lib/teacher-upload";
import { cn } from "@/lib/utils";

export type ContributedMaterial = {
  name: string;
  shelf: string;
  path: string;
  indexed: boolean;
  documentId: string;
  sizeBytes: number;
  mimeType: string;
  previewAvailable: boolean;
  addedAt?: string;
};

type Verdict = {
  status: "accepted" | "rejected";
  reason: string;
  matchedTopics: string[];
  pagesChecked: number[];
  pageCount: number;
  material?: ContributedMaterial;
};

type Phase =
  | { kind: "idle" }
  | { kind: "uploading" }
  | { kind: "checking" }
  | { kind: "done"; verdict: Verdict }
  | { kind: "error"; message: string };

const focusRing =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-text-primary focus-visible:ring-offset-2 focus-visible:ring-offset-bg-primary";

async function readJson(response: Response) {
  const payload = (await response.json().catch(() => null)) as Record<string, unknown> | null;
  if (!response.ok) throw new Error(String(payload?.error || "The upload couldn't be finished."));
  return payload ?? {};
}

/**
 * Add a PDF to a subject's Learning Resources.
 *
 * Nothing is indexed on upload: three of its pages (20%, 50% and 80% through)
 * are checked against the subject's micro-topics first, and only a file that
 * belongs to the subject joins the library. The dialog cannot be dismissed while
 * the file is being checked — closing would not stop it, and a student who then
 * uploads again gets two copies.
 */
export function LibraryContributeDialog({
  subjectName,
  subject,
  courseId,
  onAccepted,
  onPendingSettled,
  onClose,
}: {
  subjectName: string;
  subject: string;
  courseId?: string | null;
  onAccepted: (material: ContributedMaterial) => void;
  /** A file checked by an EARLIER upload (closed tab, other device) finished. */
  onPendingSettled?: () => void;
  onClose: () => void;
}) {
  const titleId = useId();
  const inputId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  const busy = phase.kind === "uploading" || phase.kind === "checking";
  const busyRef = useRef(busy);
  busyRef.current = busy;

  // Files already being checked from an earlier upload. Polled while any are
  // left; when one finishes the list behind the dialog is reloaded.
  const [pending, setPending] = useState<Array<{ name: string; startedAt: string }>>([]);
  const settledRef = useRef(onPendingSettled);
  settledRef.current = onPendingSettled;
  useEffect(() => {
    let cancelled = false;
    let timer: number | undefined;
    let previous = -1;
    const query = new URLSearchParams({ subject, ...(courseId ? { courseId } : {}) });
    const poll = async () => {
      try {
        const response = await fetch(`/api/student/materials/contribute?${query}`, {
          headers: { Accept: "application/json" },
          cache: "no-store",
        });
        const payload = (await response.json().catch(() => ({}))) as {
          pending?: Array<{ name: string; startedAt: string }>;
        };
        if (cancelled) return;
        const next = Array.isArray(payload.pending) ? payload.pending : [];
        if (previous > next.length) settledRef.current?.();
        previous = next.length;
        setPending(next);
        if (next.length) timer = window.setTimeout(poll, 5000);
      } catch {
        // No list is better than a broken dialog; the upload still works.
      }
    };
    void poll();
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [subject, courseId]);

  useEffect(() => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    panelRef.current?.querySelector<HTMLElement>("input, button")?.focus();
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !busyRef.current) {
        event.preventDefault();
        onClose();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = overflow;
      opener?.focus();
    };
  }, [onClose]);

  async function submit() {
    if (!file || busy) return;
    const sizeError = teacherUploadSizeError(file.size);
    if (sizeError) {
      setPhase({ kind: "error", message: sizeError });
      return;
    }
    const scope = { subject, ...(courseId ? { courseId } : {}) };
    try {
      setPhase({ kind: "uploading" });
      const prepared = await readJson(
        await fetch("/api/student/materials/contribute", {
          method: "POST",
          headers: { "Content-Type": "application/json", Accept: "application/json" },
          body: JSON.stringify({ action: "prepare", ...scope, fileName: file.name, sizeBytes: file.size }),
        }),
      );
      const storagePath = String(prepared.storagePath || "");
      const { error } = await createSupabaseBrowserClient()
        .storage.from(String(prepared.bucket || ""))
        .uploadToSignedUrl(storagePath, String(prepared.token || ""), file, {
          contentType: "application/pdf",
        });
      if (error) throw new Error(`The file could not be uploaded: ${error.message}`);

      setPhase({ kind: "checking" });
      const verdict = (await readJson(
        await fetch("/api/student/materials/contribute", {
          method: "POST",
          headers: { "Content-Type": "application/json", Accept: "application/json" },
          body: JSON.stringify({ action: "complete", ...scope, fileName: file.name, storagePath }),
        }),
      )) as unknown as Verdict;
      setPhase({ kind: "done", verdict });
      if (verdict.status === "accepted" && verdict.material) onAccepted(verdict.material);
    } catch (error) {
      setPhase({
        kind: "error",
        message: error instanceof Error ? error.message : "The upload couldn't be finished.",
      });
    }
  }

  const verdict = phase.kind === "done" ? phase.verdict : null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4">
      <div
        className="absolute inset-0"
        aria-hidden="true"
        onClick={() => {
          if (!busy) onClose();
        }}
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="relative w-full max-w-md rounded-t-3xl border border-border bg-bg-primary p-5 shadow-xl sm:rounded-3xl sm:p-6"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 id={titleId} className="text-lg font-semibold text-text-primary">
              Add a resource
            </h2>
            <p className="mt-1 text-sm text-text-secondary">{subjectName}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            aria-label="Close"
            className={cn(
              "grid size-9 shrink-0 place-items-center rounded-full text-text-secondary hover:bg-bg-secondary disabled:opacity-40",
              focusRing,
            )}
          >
            <X className="size-4" aria-hidden="true" />
          </button>
        </div>

        {pending.length && !busy ? (
          <div role="status" className="mt-5 rounded-2xl border border-border bg-bg-secondary p-4">
            <p className="text-sm font-semibold text-text-primary">Still being checked</p>
            <ul className="mt-2 space-y-1.5">
              {pending.map((item) => (
                <li key={`${item.name}:${item.startedAt}`} className="flex items-center gap-2 text-sm text-text-secondary">
                  <LoaderCircle className="size-4 shrink-0 animate-spin motion-reduce:animate-none" aria-hidden="true" />
                  <span className="min-w-0 truncate">{item.name}</span>
                </li>
              ))}
            </ul>
            <p className="mt-2 text-xs text-text-muted">
              It joins Learning Resources by itself if it belongs to this subject. No need to upload it again.
            </p>
          </div>
        ) : null}

        {verdict ? (
          <div
            role="status"
            className={cn(
              "mt-5 rounded-2xl border p-4",
              verdict.status === "accepted"
                ? "border-emerald-500/30 bg-emerald-500/10"
                : "border-destructive/30 bg-destructive/10",
            )}
          >
            <div className="flex items-start gap-3">
              {verdict.status === "accepted" ? (
                <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
              ) : (
                <XCircle className="mt-0.5 size-5 shrink-0 text-destructive" aria-hidden="true" />
              )}
              <div className="min-w-0">
                <p className="text-sm font-semibold text-text-primary">
                  {verdict.status === "accepted"
                    ? "Added to Learning Resources"
                    : "Not added: this doesn't look like material for this subject"}
                </p>
                {verdict.reason ? (
                  <p className="mt-1 text-sm text-text-secondary">{verdict.reason}</p>
                ) : null}
                {verdict.status === "accepted" && verdict.matchedTopics.length ? (
                  <p className="mt-2 text-xs text-text-secondary">
                    Covers: {verdict.matchedTopics.slice(0, 4).join(", ")}
                  </p>
                ) : null}
                {verdict.pagesChecked.length ? (
                  <p className="mt-2 text-xs text-text-muted">
                    Checked page{verdict.pagesChecked.length === 1 ? "" : "s"}{" "}
                    {verdict.pagesChecked.join(", ")} of {verdict.pageCount}
                  </p>
                ) : null}
              </div>
            </div>
          </div>
        ) : (
          <>
            <label
              htmlFor={inputId}
              className={cn(
                "mt-5 flex cursor-pointer flex-col items-center gap-2 rounded-2xl border border-dashed border-border bg-bg-secondary px-4 py-7 text-center",
                busy && "pointer-events-none opacity-60",
              )}
            >
              <FileUp className="size-6 text-text-secondary" aria-hidden="true" />
              <span className="max-w-full truncate text-sm font-semibold text-text-primary">
                {file ? file.name : "Choose a PDF"}
              </span>
              <span className="text-xs text-text-muted">
                Notes, question banks or past papers · up to {TEACHER_UPLOAD_MAX_LABEL}
              </span>
            </label>
            <input
              id={inputId}
              type="file"
              accept="application/pdf,.pdf"
              className="sr-only"
              disabled={busy}
              onChange={(event) => {
                setFile(event.target.files?.[0] ?? null);
                setPhase({ kind: "idle" });
              }}
            />
            <p className="mt-3 text-xs leading-5 text-text-secondary">
              We check a few pages against this subject&apos;s topics before adding it. Files that
              belong here are shared with everyone in the community.
            </p>
            {phase.kind === "error" ? (
              <p role="alert" className="mt-3 text-sm font-medium text-destructive">
                {phase.message}
              </p>
            ) : null}
          </>
        )}

        <div className="mt-5 flex justify-end gap-2">
          {verdict ? (
            <>
              <button
                type="button"
                onClick={() => {
                  setFile(null);
                  setPhase({ kind: "idle" });
                }}
                className={cn("min-h-11 rounded-full px-4 text-sm font-semibold text-text-primary hover:bg-bg-secondary", focusRing)}
              >
                Upload another
              </button>
              <button
                type="button"
                onClick={onClose}
                className={cn("min-h-11 rounded-full bg-text-primary px-5 text-sm font-semibold text-text-inverse", focusRing)}
              >
                Done
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={() => void submit()}
              disabled={!file || busy}
              aria-busy={busy}
              className={cn(
                "inline-flex min-h-11 items-center gap-2 rounded-full bg-text-primary px-5 text-sm font-semibold text-text-inverse disabled:cursor-not-allowed disabled:opacity-50",
                focusRing,
              )}
            >
              {busy ? <LoaderCircle className="size-4 animate-spin" aria-hidden="true" /> : null}
              {phase.kind === "uploading"
                ? "Uploading…"
                : phase.kind === "checking"
                  ? "Checking pages…"
                  : "Upload"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
