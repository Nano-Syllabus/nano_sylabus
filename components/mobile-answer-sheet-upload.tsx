"use client";

import Image from "next/image";
import { useCallback, useEffect, useRef, useState } from "react";
import { Camera, CheckCircle2, FileImage, ImagePlus, LoaderCircle } from "lucide-react";
import { AnswerSheetPages } from "@/components/answer-sheet-pages";
import { addFilesToSheet, removeSheetPages, reorderSheetPages } from "@/lib/answer-sheet-client";
import type { AnswerSheetState } from "@/lib/data/challenge-answer-sheet";

type Loaded = AnswerSheetState & { topicTitle: string; subjectName: string };

/** Picks up the desktop removing a page, or submitting, while the phone is open. */
const POLL_MS = 5_000;

/**
 * What a phone opens from the upload screen's QR. No sign-in: the link is the
 * permission, it lasts about as long as the exam, and a new QR replaces it.
 */
export function MobileAnswerSheetUpload({ challengeId, token }: { challengeId: string; token: string }) {
  const [sheet, setSheet] = useState<Loaded | null>(null);
  const [fatal, setFatal] = useState("");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const cameraRef = useRef<HTMLInputElement>(null);
  const pickerRef = useRef<HTMLInputElement>(null);

  /** Page-order saves in flight: a poll landing meanwhile would show the old order. */
  const arranging = useRef(0);
  const load = useCallback(async () => {
    if (arranging.current) return;
    const response = await fetch(`/api/answer-sheet/${encodeURIComponent(challengeId)}/${encodeURIComponent(token)}`, { cache: "no-store" }).catch(
      () => null,
    );
    if (!response) return;
    const payload = (await response.json().catch(() => ({}))) as Loaded & { error?: string };
    if (arranging.current) return;
    if (!response.ok) {
      setFatal(payload.error || "This upload link is unavailable.");
      return;
    }
    setSheet((current) => {
      const kept = new Map(current?.pages.map((page) => [page.id, page.previewUrl]) ?? []);
      return { ...payload, pages: payload.pages.map((page) => ({ ...page, previewUrl: kept.get(page.id) ?? page.previewUrl })) };
    });
  }, [challengeId, token]);

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void load();
    }, POLL_MS);
    return () => window.clearInterval(timer);
  }, [load]);

  const add = async (files: File[]) => {
    if (!files.length) return;
    setError("");
    try {
      await addFilesToSheet({ challengeId, token }, files, "phone", (done, total) =>
        setBusy(total > 1 ? `Compressing and uploading ${Math.min(done + 1, total)} of ${total}…` : "Compressing and uploading…"),
      );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Upload failed.");
    } finally {
      setBusy("");
      await load();
    }
  };

  /** Shown in the new order at once; polls wait until it is saved, so they cannot undo it. */
  const reorder = async (order: string[]) => {
    
    setError("");
    arranging.current += 1;
    setSheet((current) => {
      if (!current) return current;
      const byId = new Map(current.pages.map((page) => [page.id, page]));
      return { ...current, pages: order.flatMap((id) => byId.get(id) ?? []) };
    });
    try {
      await reorderSheetPages({ challengeId, token }, order);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not save the page order.");
    } finally {
      arranging.current -= 1;
    }
  };

  const remove = async (pageId: string) => {
    setError("");
    setBusy("Removing…");
    try {
      await removeSheetPages({ challengeId, token }, pageId);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not remove that page.");
    } finally {
      setBusy("");
      await load();
    }
  };

  const isPdf = sheet?.kind === "pdf";
  const full = Boolean(sheet && sheet.pages.length >= sheet.maxPages);
  const locked = Boolean(busy);

  return (
    <main className="min-h-dvh bg-bg-secondary px-4 py-6 text-text-primary">
      <section className="mx-auto w-full max-w-md rounded-3xl border border-border bg-bg-primary p-5 shadow-xl">
        <div className="flex items-center gap-3 border-b border-border pb-4">
          <Image src="/nanologo.png" alt="Nano Syllabus" width={40} height={40} className="size-10 object-contain" />
          <div className="min-w-0">
            <p className="font-display text-lg font-semibold">Nano Syllabus</p>
            <p className="truncate text-xs text-text-muted">
              {sheet ? `Answer sheet · ${sheet.topicTitle || sheet.subjectName}` : "Answer sheet upload"}
            </p>
          </div>
        </div>

        {fatal ? (
          <div className="flex min-h-64 flex-col items-center justify-center text-center">
            <span className="flex size-14 items-center justify-center rounded-full bg-destructive/10 text-destructive">
              <FileImage className="size-7" aria-hidden="true" />
            </span>
            <h1 className="mt-5 text-xl font-semibold">Upload link unavailable</h1>
            <p className="mt-2 max-w-xs text-sm leading-6 text-text-secondary">{fatal}</p>
          </div>
        ) : !sheet ? (
          <div className="flex min-h-64 flex-col items-center justify-center text-center" role="status">
            <LoaderCircle className="size-8 animate-spin text-text-muted motion-reduce:animate-none" aria-hidden="true" />
            <p className="mt-4 text-sm text-text-secondary">Opening your answer sheet…</p>
          </div>
        ) : (
          <div className="pt-4">
            <h1 className="text-lg font-semibold">Photograph each page</h1>
            <p className="mt-1 text-sm leading-6 text-text-secondary">
              Take one photo per page, in order, or upload one PDF. Photos are compressed on your phone first, so they
              upload quickly.
            </p>

            {/* One photo a tap from the camera, so each page is framed on its own. */}
            <input
              ref={cameraRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="sr-only"
              tabIndex={-1}
              onChange={(event) => {
                const files = Array.from(event.target.files ?? []);
                event.currentTarget.value = "";
                void add(files);
              }}
            />
            <input
              ref={pickerRef}
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
            <div className="mt-4 grid grid-cols-2 gap-2">
              <button
                type="button"
                disabled={locked || isPdf || full}
                onClick={() => cameraRef.current?.click()}
                className="inline-flex min-h-14 flex-col items-center justify-center gap-1 rounded-xl bg-blue-600 px-3 text-sm font-semibold text-white hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:opacity-50"
              >
                <Camera className="size-5" aria-hidden="true" />
                {sheet.pages.length ? "Next page" : "Take photo"}
              </button>
              <button
                type="button"
                disabled={locked || isPdf || full}
                onClick={() => pickerRef.current?.click()}
                className="inline-flex min-h-14 flex-col items-center justify-center gap-1 rounded-xl border border-border bg-card px-3 text-sm font-semibold hover:bg-bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:opacity-50"
              >
                <ImagePlus className="size-5" aria-hidden="true" />
                Photos or PDF
              </button>
            </div>

            {busy ? (
              <p className="mt-3 flex items-center gap-2 text-sm text-text-secondary" role="status">
                <LoaderCircle className="size-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />
                {busy}
              </p>
            ) : null}
            {error ? (
              <p className="mt-3 text-sm text-destructive" role="alert">
                {error}
              </p>
            ) : null}

            {sheet.pages.length ? (
              <div className="mt-5">
                <AnswerSheetPages
                  pages={sheet.pages}
                  disabled={locked}
                  onRemove={(id) => void remove(id)}
                  onReorder={(order) => void reorder(order)}
                />
                <div className="mt-4 flex items-start gap-2 rounded-xl border border-success/40 bg-success/10 p-3 text-sm">
                  <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" aria-hidden="true" />
                  <p>
                    {isPdf ? "Your PDF is" : `${sheet.pages.length} page${sheet.pages.length === 1 ? " is" : "s are"}`} on your
                    computer&apos;s screen. When every page is there, press <strong>Submit answer sheet</strong> on the
                    computer.
                  </p>
                </div>
              </div>
            ) : null}
          </div>
        )}
      </section>
    </main>
  );
}
