"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { CheckCircle2, LoaderCircle, RefreshCw, Smartphone } from "lucide-react";
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
  className,
}: {
  invoiceId: string;
  onReady: (sessionId: string, fileName: string) => void;
  className?: string;
}) {
  const [session, setSession] = useState<UploadSession | null>(null);
  const [status, setStatus] = useState<"loading" | "pending" | "uploaded" | "expired" | "error">("loading");
  const [fileName, setFileName] = useState("");
  const [error, setError] = useState("");
  const onReadyRef = useRef(onReady);
  onReadyRef.current = onReady;

  const createSession = useCallback(async () => {
    setStatus("loading");
    setError("");
    setFileName("");
    try {
      const response = await fetch("/api/billing/receipt-upload-sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ invoiceId }),
      });
      const payload = (await response.json().catch(() => ({}))) as UploadSession & { error?: string };
      if (!response.ok || !payload.sessionId || !payload.uploadUrl) {
        throw new Error(payload.error || "Could not create a phone upload link.");
      }
      setSession(payload);
      setStatus("pending");
    } catch (sessionError) {
      setSession(null);
      setStatus("error");
      setError(sessionError instanceof Error ? sessionError.message : "Could not create a phone upload link.");
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
          error?: string;
        };
        if (cancelled) return;
        if (!response.ok) throw new Error(payload.error || "Could not check the phone upload.");
        if (payload.status === "uploaded" && payload.fileName) {
          setFileName(payload.fileName);
          setStatus("uploaded");
          onReadyRef.current(session.sessionId, payload.fileName);
        } else if (payload.status === "expired") {
          setStatus("expired");
        }
      } catch (pollError) {
        if (!cancelled) {
          setStatus("error");
          setError(pollError instanceof Error ? pollError.message : "Could not check the phone upload.");
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

  return (
    <section className={cn("rounded-xl border border-border bg-bg-secondary p-3", className)} aria-label="Upload receipt using phone">
      <div className="flex items-start gap-3">
        <div className="flex size-[92px] shrink-0 items-center justify-center rounded-lg border border-border bg-white p-1.5">
          {session && (status === "pending" || status === "uploaded") ? (
            <QRCodeSVG value={session.uploadUrl} size={78} level="M" marginSize={0} title="Phone receipt upload QR code" />
          ) : status === "loading" ? (
            <LoaderCircle className="size-6 animate-spin text-text-muted motion-reduce:animate-none" aria-label="Creating upload QR" />
          ) : (
            <Smartphone className="size-7 text-text-muted" aria-hidden="true" />
          )}
        </div>

        <div className="min-w-0 flex-1 py-0.5">
          <div className="flex items-center gap-2">
            {status === "uploaded" ? <CheckCircle2 className="size-4 shrink-0 text-emerald-600" aria-hidden="true" /> : <Smartphone className="size-4 shrink-0 text-text-secondary" aria-hidden="true" />}
            <h4 className="text-sm font-semibold text-text-primary">Upload using phone</h4>
          </div>

          {status === "uploaded" ? (
            <div className="mt-1.5" role="status">
              <p className="text-xs font-semibold text-emerald-700">Received from phone</p>
              <p className="mt-0.5 truncate text-xs text-text-muted" title={fileName}>{fileName}</p>
            </div>
          ) : status === "pending" ? (
            <>
              <p className="mt-1.5 text-xs leading-5 text-text-secondary">Scan, then choose the receipt photo. It will appear here automatically.</p>
              <p className="mt-1 text-[11px] font-medium text-text-muted">Secure link · expires in 15 minutes</p>
            </>
          ) : status === "loading" ? (
            <p className="mt-1.5 text-xs text-text-muted">Creating secure QR…</p>
          ) : (
            <>
              <p role="alert" className="mt-1.5 text-xs leading-5 text-destructive">{status === "expired" ? "QR expired. Create a new one." : error}</p>
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
