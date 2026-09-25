"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { LoaderCircle, RefreshCw, Smartphone, Upload } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { AnswerSheetPages } from "@/components/answer-sheet-pages";
import { addFilesToSheet, removeSheetPages } from "@/lib/answer-sheet-client";
import type { AnswerSheetState } from "@/lib/data/challenge-answer-sheet";

type Opened = AnswerSheetState & { token: string; uploadUrl: string };

/** While the phone is in use, a new page shows up here within this. */
const POLL_MS = 3_000;

/**
 * The answer sheet on the upload screen: pages from this computer, or from a
 * phone that scans the QR — several photos or one PDF — shown as they arrive.
 * `onChange` hands the parent the sheet to submit (its session and page count).
 */
export function AnswerSheetUploader({
  challengeId,
  disabled,
  onChange,
}: {
  challengeId: string;
  disabled?: boolean;
  onChange: (sheet: { sessionId: string; pageCount: number } | null) => void;
}) {
  const [sheet, setSheet] = useState<Opened | null>(null);
  const [opening, setOpening] = useState(true);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const open = useCallback(async () => {
    setOpening(true);
    setError("");
    try {
      const response = await fetch(`/api/student/challenges/${encodeURIComponent(challengeId)}/answer-sheet`, {
        method: "POST",
      });
      const payload = (await response.json().catch(() => ({}))) as Opened & { error?: string };
      if (!response.ok || !payload.token) throw new Error(payload.error || "Could not prepare the upload.");
      setSheet(payload);
    } catch (cause) {
      setSheet(null);
      setError(cause instanceof Error ? cause.message : "Could not prepare the upload.");
    } finally {
      setOpening(false);
    }
  }, [challengeId]);

  useEffect(() => {
    void open();
  }, [open]);

  // Always available: a failed open (a deploy, a blip) retries by itself, with
  // "New QR" as the manual way. Backs off so a real outage is not hammered.
  const retries = useRef(0);
  useEffect(() => {
    if (opening || sheet || !error || retries.current >= 6) return;
    const timer = window.setTimeout(() => {
      retries.current += 1;
      void open();
    }, 4_000 * 2 ** retries.current);
    return () => window.clearTimeout(timer);
  }, [opening, sheet, error, open]);
  useEffect(() => {
    if (sheet) retries.current = 0;
  }, [sheet]);

  const refresh = useCallback(async () => {
    if (!sheet) return;
    const response = await fetch(
      `/api/student/challenges/${encodeURIComponent(challengeId)}/answer-sheet?sessionId=${sheet.sessionId}`,
      { cache: "no-store" },
    ).catch(() => null);
    if (!response?.ok) return;
    const state = (await response.json().catch(() => null)) as AnswerSheetState | null;
    if (!state) return;
    setSheet((current) => {
      if (!current || current.sessionId !== state.sessionId) return current;
      // Keep a thumbnail's first signed URL: a new one each poll would reload the image.
      const kept = new Map(current.pages.map((page) => [page.id, page.previewUrl]));
      return {
        ...current,
        ...state,
        pages: state.pages.map((page) => ({ ...page, previewUrl: kept.get(page.id) ?? page.previewUrl })),
      };
    });
  }, [challengeId, sheet]);

  // Watch for pages from the phone while this screen is on show.
  useEffect(() => {
    if (!sheet || sheet.status !== "open") return;
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void refresh();
    }, POLL_MS);
    return () => window.clearInterval(timer);
  }, [sheet, refresh]);

  const pageCount = sheet?.pages.length ?? 0;
  const sessionId = sheet?.sessionId ?? "";
  useEffect(() => {
    onChangeRef.current(sessionId && pageCount ? { sessionId, pageCount } : null);
  }, [sessionId, pageCount]);

  const add = async (files: File[]) => {
    if (!sheet || !files.length) return;
    setError("");
    try {
      await addFilesToSheet({ challengeId, token: sheet.token }, files, "desktop", (done, total) =>
        setBusy(total > 1 ? `Uploading ${Math.min(done + 1, total)} of ${total}…` : "Uploading…"),
      );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Upload failed.");
    } finally {
      setBusy("");
      await refresh();
    }
  };

  const remove = async (pageId: string | "all") => {
    if (!sheet) return;
    setError("");
    setBusy("Removing…");
    try {
      await removeSheetPages({ challengeId, token: sheet.token }, pageId);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not remove that page.");
    } finally {
      setBusy("");
      await refresh();
    }
  };

  const locked = disabled || opening || Boolean(busy);
  const expired = sheet?.status === "expired";

  return (
    <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_15rem]">
      <div className="rounded-xl border-2 border-dashed border-blue-500 bg-blue-500/10 p-5 sm:p-6">
        <div className="text-center">
          <Upload className="mx-auto size-8 text-blue-600 dark:text-blue-400" aria-hidden="true" />
          <p className="mt-3 text-sm font-semibold">Your complete handwritten answer sheet</p>
          <p className="mt-1 text-xs text-text-muted">
            Photos of every page (up to {sheet?.maxPages ?? 20}), or one PDF. Photos are compressed before upload.
          </p>
        </div>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept="image/*,application/pdf"
          className="sr-only"
          tabIndex={-1}
          onChange={(event) => {
            const files = Array.from(event.target.files ?? []);
            event.currentTarget.value = "";
            void add(files);
          }}
        />
        {sheet?.pages.length ? (
          <div className="mt-5">
            <AnswerSheetPages pages={sheet.pages} disabled={locked} onRemove={(id) => void remove(id)} />
          </div>
        ) : null}
        <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
          <button
            type="button"
            disabled={locked || !sheet || expired || sheet.kind === "pdf"}
            onClick={() => inputRef.current?.click()}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-border bg-card px-4 text-sm font-semibold text-text-primary hover:bg-bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:opacity-50"
          >
            <Upload className="size-4" aria-hidden="true" />
            {sheet?.kind === "photos" ? "Add more photos" : "Choose photos or PDF"}
          </button>
          {sheet && sheet.pages.length > 1 ? (
            <button
              type="button"
              disabled={locked}
              onClick={() => void remove("all")}
              className="inline-flex min-h-11 items-center justify-center rounded-lg px-3 text-sm font-medium text-text-secondary hover:bg-bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:opacity-50"
            >
              Remove all
            </button>
          ) : null}
        </div>
        {busy ? (
          <p className="mt-3 flex items-center justify-center gap-2 text-sm text-text-secondary" role="status">
            <LoaderCircle className="size-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />
            {busy}
          </p>
        ) : sheet?.pages.length ? (
          <p className="mt-3 text-center text-sm text-text-secondary" role="status">
            {sheet.kind === "pdf" ? "PDF ready to submit." : `${sheet.pages.length} page${sheet.pages.length === 1 ? "" : "s"} ready to submit.`}
          </p>
        ) : null}
        {error ? (
          <p className="mt-3 text-center text-sm text-destructive" role="alert">
            {error}
          </p>
        ) : null}
      </div>

      <aside className="flex flex-col items-center rounded-xl border border-border bg-card p-4 text-center">
        <p className="flex items-center gap-1.5 text-sm font-semibold">
          <Smartphone className="size-4 text-blue-600 dark:text-blue-400" aria-hidden="true" />
          Upload from your phone
        </p>
        <p className="mt-1 text-xs leading-5 text-text-muted">
          Scan to photograph each page. Pages appear here as they upload.
        </p>
        <div className="mt-3 flex size-44 items-center justify-center rounded-lg bg-white p-2">
          {opening ? (
            <LoaderCircle className="size-6 animate-spin text-neutral-500 motion-reduce:animate-none" aria-label="Preparing QR" />
          ) : sheet && !expired ? (
            <QRCodeSVG value={sheet.uploadUrl} size={160} level="M" marginSize={0} />
          ) : (
            <p className="px-2 text-xs text-neutral-600">{expired ? "This QR expired." : "QR unavailable."}</p>
          )}
        </div>
        <button
          type="button"
          disabled={opening}
          onClick={() => void open()}
          className="mt-3 inline-flex min-h-10 items-center gap-1.5 rounded-lg px-3 text-xs font-medium text-text-secondary hover:bg-bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:opacity-50"
        >
          <RefreshCw className="size-3.5" aria-hidden="true" />
          New QR
        </button>
      </aside>
    </div>
  );
}
