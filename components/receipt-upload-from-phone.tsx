"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { CheckCircle2, FileText, LoaderCircle, RefreshCw, Smartphone } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { cn } from "@/lib/utils";

type UploadSession = {
  sessionId: string;
  uploadUrl: string;
  expiresAt: string;
};

export function ReceiptUploadFromPhone({
  invoiceId,
  onReady,
  onCleared,
  className,
}: {
  invoiceId: string;
  onReady: (sessionId: string, fileName: string) => void;
  onCleared?: () => void;
  className?: string;
}) {
  const [session, setSession] = useState<UploadSession | null>(null);
  const [status, setStatus] = useState<"loading" | "pending" | "uploaded" | "expired" | "error">(
    "loading",
  );
  const [fileName, setFileName] = useState("");
  const [previewUrl, setPreviewUrl] = useState("");
  const [error, setError] = useState("");
  const [removing, setRemoving] = useState(false);
  const onReadyRef = useRef(onReady);
  onReadyRef.current = onReady;

  const createSession = useCallback(async () => {
    setStatus("loading");
    setError("");
    setFileName("");
    setPreviewUrl("");
    setRemoving(false);
    try {
      const response = await fetch("/api/billing/receipt-upload-sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ invoiceId }),
      });
      const payload = (await response.json().catch(() => ({}))) as UploadSession & {
        error?: string;
      };
      if (!response.ok || !payload.sessionId || !payload.uploadUrl) {
        throw new Error(payload.error || "Could not create a phone upload link.");
      }
      setSession(payload);
      setStatus("pending");
    } catch (sessionError) {
      setSession(null);
      setStatus("error");
      setError(
        sessionError instanceof Error
          ? sessionError.message
          : "Could not create a phone upload link.",
      );
    }
  }, [invoiceId]);

  useEffect(() => {
    void createSession();
  }, [createSession]);

  useEffect(() => {
    if (!session || status !== "pending") return;
    let cancelled = false;

    const checkUpload = async () => {
      try {
        const response = await fetch(`/api/billing/receipt-upload-sessions/${session.sessionId}`, {
          cache: "no-store",
          headers: { Accept: "application/json" },
        });
        const payload = (await response.json().catch(() => ({}))) as {
          status?: string;
          fileName?: string | null;
          previewUrl?: string | null;
          error?: string;
        };
        if (cancelled) return;
        if (!response.ok) throw new Error(payload.error || "Could not check the phone upload.");
        if (payload.status === "uploaded" && payload.fileName) {
          setFileName(payload.fileName);
          setPreviewUrl(payload.previewUrl ?? "");
          setStatus("uploaded");
          onReadyRef.current(session.sessionId, payload.fileName);
        } else if (payload.status === "expired") {
          setStatus("expired");
        }
      } catch (pollError) {
        if (!cancelled) {
          setStatus("error");
          setError(
            pollError instanceof Error ? pollError.message : "Could not check the phone upload.",
          );
        }
      }
    };

    void checkUpload();
    const interval = window.setInterval(() => void checkUpload(), 2_000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [session, status]);

  async function removeUploadedReceipt() {
    if (!session || status !== "uploaded" || removing) return;
    setRemoving(true);
    setError("");
    try {
      const response = await fetch(`/api/billing/receipt-upload-sessions/${session.sessionId}`, {
        method: "DELETE",
        headers: { Accept: "application/json" },
      });
      const payload = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) throw new Error(payload.error || "Could not remove this receipt.");
      setFileName("");
      setPreviewUrl("");
      setStatus("pending");
      onCleared?.();
    } catch (removeError) {
      setError(
        removeError instanceof Error ? removeError.message : "Could not remove this receipt.",
      );
    } finally {
      setRemoving(false);
    }
  }

  return (
    <section
      className={cn("rounded-xl border border-border bg-bg-secondary p-3", className)}
      aria-label="Upload receipt using phone"
    >
      <div className="flex items-start gap-3">
        <div className="flex size-[92px] shrink-0 items-center justify-center overflow-hidden rounded-lg border border-border bg-white p-1.5">
          {status === "uploaded" && previewUrl ? (
            // The URL is short-lived and owner-scoped, so the browser renders it directly without image optimization.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={previewUrl}
              alt={`Receipt received from phone: ${fileName}`}
              className="size-full rounded-md object-contain"
            />
          ) : status === "uploaded" ? (
            <FileText
              className="size-7 text-emerald-600"
              aria-label="Receipt received from phone"
            />
          ) : session && status === "pending" ? (
            <QRCodeSVG
              value={session.uploadUrl}
              size={78}
              level="M"
              marginSize={0}
              title="Phone receipt upload QR code"
            />
          ) : status === "loading" ? (
            <LoaderCircle
              className="size-6 animate-spin text-text-muted motion-reduce:animate-none"
              aria-label="Creating upload QR"
            />
          ) : (
            <Smartphone className="size-7 text-text-muted" aria-hidden="true" />
          )}
        </div>

        <div className="min-w-0 flex-1 py-0.5">
          <div className="flex items-center gap-2">
            {status === "uploaded" ? (
              <CheckCircle2 className="size-4 shrink-0 text-emerald-600" aria-hidden="true" />
            ) : (
              <Smartphone className="size-4 shrink-0 text-text-secondary" aria-hidden="true" />
            )}
            <h4 className="text-sm font-semibold text-text-primary">Upload using phone</h4>
          </div>

          {status === "uploaded" ? (
            <div className="mt-1.5" role="status">
              <p className="text-xs font-semibold text-emerald-700">Received from phone</p>
              <p className="mt-0.5 truncate text-xs text-text-muted" title={fileName}>
                {fileName}
              </p>
              {error ? (
                <p role="alert" className="mt-1 text-xs text-destructive">
                  {error}
                </p>
              ) : null}
              <button
                type="button"
                onClick={() => void removeUploadedReceipt()}
                disabled={removing}
                aria-busy={removing}
                className="mt-2 inline-flex min-h-10 items-center gap-1.5 rounded-lg px-2 text-xs font-semibold text-text-secondary hover:bg-bg-tertiary hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-strong disabled:cursor-not-allowed disabled:opacity-60"
              >
                <RefreshCw
                  className={cn("size-3.5", removing && "animate-spin motion-reduce:animate-none")}
                  aria-hidden="true"
                />
                {removing ? "Removing…" : "Remove & upload again"}
              </button>
            </div>
          ) : status === "pending" ? (
            <>
              <p className="mt-1.5 text-xs leading-5 text-text-secondary">
                Scan, then choose the receipt photo. It will appear here automatically.
              </p>
              <p className="mt-1 text-[11px] font-medium text-text-muted">
                Secure link · expires in 15 minutes
              </p>
            </>
          ) : status === "loading" ? (
            <p className="mt-1.5 text-xs text-text-muted">Creating secure QR…</p>
          ) : (
            <>
              <p role="alert" className="mt-1.5 text-xs leading-5 text-destructive">
                {status === "expired" ? "QR expired. Create a new one." : error}
              </p>
              <button
                type="button"
                onClick={() => void createSession()}
                className="mt-2 inline-flex min-h-10 items-center gap-1.5 rounded-lg px-2 text-xs font-semibold text-text-primary hover:bg-bg-tertiary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-strong"
              >
                <RefreshCw className="size-3.5" aria-hidden="true" />
                New QR
              </button>
            </>
          )}
        </div>
      </div>
    </section>
  );
}
