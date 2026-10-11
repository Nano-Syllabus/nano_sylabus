"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Copy, FileText, LoaderCircle, Smartphone } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { Button } from "@/components/ui/button";
import { cameraPayload, contentCameraApi, receivedCameraPdf } from "@/lib/content-camera-client";
import type { ContentCameraLink, ContentCameraState } from "@/lib/content-camera-types";

type Opened = ContentCameraState & ContentCameraLink & { uploadPath: string };

/** Desktop only: pairing and reviewing a finished PDF. Photos stay on the phone. */
export function ContentCameraUploader({
  path,
  disabled = false,
  onUpload,
  onBusyChange,
}: {
  path: string;
  disabled?: boolean;
  onUpload: (file: File) => Promise<boolean>;
  onBusyChange?: (busy: boolean) => void;
}) {
  const [sheet, setSheet] = useState<ContentCameraState | null>(null);
  const [link, setLink] = useState<ContentCameraLink | null>(null);
  const [uploadUrl, setUploadUrl] = useState("");
  const [opening, setOpening] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [ended, setEnded] = useState(false);
  const [copied, setCopied] = useState(false);
  const [restart, setRestart] = useState(0);
  const uploading = useRef(false);
  const onBusyRef = useRef(onBusyChange);
  onBusyRef.current = onBusyChange;
  useEffect(() => {
    let disposed = false;
    let owned: ContentCameraLink | null = null;
    setOpening(true);
    setEnded(false);
    setError("");
    setSheet(null);
    setLink(null);
    setUploadUrl("");
    void (async () => {
      try {
        const state = await fetch("/api/teacher/content-camera", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ path }),
        }).then(cameraPayload<Opened>);
        owned = { id: state.id, token: state.token };
        if (!disposed) {
          setLink(owned);
          setSheet(state);
          setUploadUrl(new URL(state.uploadPath, window.location.origin).toString());
        } else {
          void fetch(contentCameraApi(owned), { method: "DELETE", keepalive: true }).catch(
            () => undefined,
          );
        }
      } catch (cause) {
        if (!disposed)
          setError(cause instanceof Error ? cause.message : "Could not create your QR link.");
      } finally {
        if (!disposed) setOpening(false);
      }
    })();
    return () => {
      disposed = true;
      if (owned)
        void fetch(contentCameraApi(owned), { method: "DELETE", keepalive: true }).catch(
          () => undefined,
        );
    };
  }, [path, restart]);
  useEffect(() => {
    if (!link || ended) return;
    let disposed = false;
    let fetching = false;
    const refresh = async () => {
      if (fetching || uploading.current || document.visibilityState !== "visible") return;
      fetching = true;
      try {
        const response = await fetch(contentCameraApi(link), { cache: "no-store" });
        if (disposed) return;
        if (response.status === 410 || response.status === 404) {
          setEnded(true);
          return;
        }
        const state = await cameraPayload<ContentCameraState>(response);
        if (!disposed) {
          setSheet(state);
          setError("");
        }
      } catch (cause) {
        if (!disposed)
          setError(
            cause instanceof Error ? cause.message : "Connection interrupted. Reconnecting…",
          );
      } finally {
        fetching = false;
      }
    };
    const timer = window.setInterval(() => void refresh(), 3000);
    window.addEventListener("focus", refresh);
    return () => {
      disposed = true;
      window.clearInterval(timer);
      window.removeEventListener("focus", refresh);
    };
  }, [link, ended]);
  useEffect(() => {
    onBusyRef.current?.(busy);
    return () => onBusyRef.current?.(false);
  }, [busy]);
  const upload = async () => {
    if (!link || !sheet?.pdf || uploading.current || disabled || ended) return;
    uploading.current = true;
    setBusy(true);
    setError("");
    try {
      const file = await receivedCameraPdf(link, sheet.pdf);
      if (await onUpload(file)) {
        await fetch(contentCameraApi(link), { method: "DELETE" }).then(cameraPayload);
        setEnded(true);
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not upload the PDF.");
    } finally {
      uploading.current = false;
      setBusy(false);
    }
  };
  return (
    <div className="space-y-4" aria-busy={opening || busy}>
      {opening ? (
        <div className="flex items-center justify-center gap-3 rounded-2xl border border-border p-10 text-sm">
          <LoaderCircle className="size-5 animate-spin" />
          Creating your phone QR link…
        </div>
      ) : null}
      {uploadUrl && !ended && !sheet?.pdf ? (
        <div className="rounded-2xl border border-border bg-bg-secondary p-5">
          <div className="flex flex-col items-center gap-5 sm:flex-row">
            <div className="shrink-0 rounded-2xl bg-white p-3 shadow-sm">
              <QRCodeSVG
                value={uploadUrl}
                role="img"
                size={180}
                level="M"
                title="Scan to create a PDF on your phone"
              />
            </div>
            <div className="min-w-0 space-y-3">
              <p className="flex items-center gap-2 text-base font-semibold">
                <Smartphone className="size-5" />
                Scan with your phone
              </p>
              <ol className="space-y-2 text-sm text-text-secondary">
                <li>1. Scan this QR with your phone camera.</li>
                <li>2. Take photos or select them from your gallery.</li>
                <li>3. Arrange pages, create the PDF, and send it here.</li>
              </ol>
              <p className="text-xs leading-5 text-text-muted">
                Your phone compresses the photos and creates the PDF. Keep this dialog open; the
                link lasts 2 hours.
              </p>
            </div>
          </div>
          <div className="mt-5 flex flex-wrap items-center gap-3 border-t border-border pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(uploadUrl);
                  setCopied(true);
                } catch {
                  setError("Open the phone link below and copy its address to your phone.");
                }
              }}
            >
              {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
              {copied ? "Link copied" : "Copy phone link"}
            </Button>
            <a
              href={uploadUrl}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Open phone camera link"
              className="text-sm underline underline-offset-4"
            >
              Open phone link
            </a>
            <span className="flex items-center gap-2 text-xs text-text-muted" role="status">
              <LoaderCircle className="size-3.5 animate-spin" />
              Waiting for your PDF
            </span>
          </div>
        </div>
      ) : null}
      {sheet?.pdf && link && !ended ? (
        <div className="space-y-4">
          <div className="flex items-start gap-3 rounded-xl border border-border bg-bg-secondary p-4">
            <FileText className="mt-0.5 size-5 shrink-0" />
            <div className="min-w-0">
              <p className="break-all text-sm font-semibold">{sheet.pdf.name}</p>
              <p className="mt-1 text-xs text-text-muted">
                Received from your phone · {sheet.pdf.pageCount} pages ·{" "}
                {(sheet.pdf.size / 1024 / 1024).toFixed(2)} MB
              </p>
            </div>
            <Check className="ml-auto size-5 shrink-0 text-emerald-600" />
          </div>
          <iframe
            title="Scanned content PDF preview"
            src={`${contentCameraApi(link)}?pdf=${encodeURIComponent(sheet.pdf.id)}`}
            className="h-72 w-full rounded-xl border border-border sm:h-96"
          />
          <div className="flex flex-wrap gap-3">
            <Button type="button" disabled={disabled || busy} onClick={() => void upload()}>
              {busy ? (
                <LoaderCircle className="size-4 animate-spin" />
              ) : (
                <FileText className="size-4" />
              )}
              {busy ? "Uploading and indexing…" : "Upload PDF and index"}
            </Button>
            <a
              href={`${contentCameraApi(link)}?pdf=${encodeURIComponent(sheet.pdf.id)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center text-sm underline underline-offset-4"
            >
              Open PDF
            </a>
          </div>
        </div>
      ) : null}
      {ended ? (
        <p className="rounded-xl border border-border p-4 text-sm">
          This QR link has ended. Start a new scan to send another PDF.
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      ) : null}
      {(!opening && !link) || ended ? (
        <Button
          type="button"
          variant="outline"
          disabled={disabled || busy}
          onClick={() => setRestart((value) => value + 1)}
        >
          Create new QR link
        </Button>
      ) : null}
      <p className="text-xs leading-5 text-text-muted">
        Photos stay on your phone. Only the finished PDF is uploaded to our file server.
      </p>
    </div>
  );
}
