"use client";

import Image from "next/image";
import { useEffect, useState, type FormEvent } from "react";
import { CheckCircle2, FileImage, LoaderCircle, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/field";

type LinkState =
  | { kind: "loading" }
  | { kind: "ready"; invoiceCode: string; alreadyUploaded: boolean }
  | { kind: "error"; message: string }
  | { kind: "success"; fileName: string };

export function MobileReceiptUpload({ token }: { token: string }) {
  const [state, setState] = useState<LinkState>({ kind: "loading" });
  const [receipt, setReceipt] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");

  useEffect(() => {
    let cancelled = false;
    async function loadLink() {
      const response = await fetch(`/api/billing/receipt-upload/${encodeURIComponent(token)}`, {
        cache: "no-store",
        headers: { Accept: "application/json" },
      });
      const payload = (await response.json().catch(() => ({}))) as {
        status?: string;
        invoiceCode?: string;
        error?: string;
      };
      if (cancelled) return;
      if (!response.ok || !payload.invoiceCode) {
        setState({ kind: "error", message: payload.error || "This upload link is unavailable." });
        return;
      }
      setState({ kind: "ready", invoiceCode: payload.invoiceCode, alreadyUploaded: payload.status === "uploaded" });
    }
    void loadLink();
    return () => { cancelled = true; };
  }, [token]);

  async function uploadReceipt(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!receipt || state.kind !== "ready") return;
    setSubmitting(true);
    setSubmitError("");
    const formData = new FormData();
    formData.set("receipt", receipt);

    try {
      const response = await fetch(`/api/billing/receipt-upload/${encodeURIComponent(token)}`, {
        method: "POST",
        body: formData,
      });
      const payload = (await response.json().catch(() => ({}))) as { error?: string; fileName?: string };
      if (!response.ok) throw new Error(payload.error || "Receipt upload failed.");
      setState({ kind: "success", fileName: payload.fileName || receipt.name });
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : "Receipt upload failed.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="flex min-h-dvh items-center justify-center bg-bg-secondary px-4 py-8 text-text-primary">
      <section className="w-full max-w-md rounded-3xl border border-border bg-bg-primary p-6 shadow-xl sm:p-8">
        <div className="flex items-center gap-3 border-b border-border pb-5">
          <Image src="/nano_logo.png" alt="Nano Syllabus" width={42} height={42} className="size-10 object-contain" />
          <div>
            <p className="font-display text-lg font-semibold">Nano Syllabus</p>
            <p className="text-xs text-text-muted">Secure receipt handoff</p>
          </div>
        </div>

        {state.kind === "loading" ? (
          <div className="flex min-h-72 flex-col items-center justify-center text-center" role="status">
            <LoaderCircle className="size-8 animate-spin text-text-muted motion-reduce:animate-none" aria-hidden="true" />
            <p className="mt-4 text-sm text-text-secondary">Checking your upload link…</p>
          </div>
        ) : state.kind === "error" ? (
          <div className="flex min-h-72 flex-col items-center justify-center text-center">
            <span className="flex size-14 items-center justify-center rounded-full bg-destructive/10 text-destructive">
              <FileImage className="size-7" aria-hidden="true" />
            </span>
            <h1 className="mt-5 text-xl font-semibold">Upload link unavailable</h1>
            <p className="mt-2 max-w-xs text-sm leading-6 text-text-secondary">{state.message}</p>
            <p className="mt-4 text-xs text-text-muted">Return to your desktop and create a new QR.</p>
          </div>
        ) : state.kind === "success" ? (
          <div className="flex min-h-72 flex-col items-center justify-center text-center" role="status">
            <span className="flex size-16 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
              <CheckCircle2 className="size-8" aria-hidden="true" />
            </span>
            <h1 className="mt-5 text-2xl font-semibold">Receipt sent</h1>
            <p className="mt-2 max-w-xs text-sm leading-6 text-text-secondary">Your desktop will show the receipt automatically. You can close this page and finish the payment form there.</p>
            <p className="mt-4 max-w-full truncate rounded-lg bg-bg-secondary px-3 py-2 text-xs text-text-muted" title={state.fileName}>{state.fileName}</p>
          </div>
        ) : (
          <form onSubmit={uploadReceipt} className="pt-6">
            <div className="flex items-center gap-2 text-emerald-700">
              <ShieldCheck className="size-4" aria-hidden="true" />
              <p className="text-xs font-semibold">Linked to invoice {state.invoiceCode}</p>
            </div>
            <h1 className="mt-4 text-2xl font-semibold">Upload payment receipt</h1>
            <p className="mt-2 text-sm leading-6 text-text-secondary">Take a photo or choose the receipt already saved on this phone.</p>

            <label htmlFor="phone-payment-receipt" className="mt-6 block text-xs font-medium uppercase tracking-wider text-text-secondary">Payment receipt *</label>
            <Input
              id="phone-payment-receipt"
              type="file"
              accept="image/jpeg,image/png,image/webp,application/pdf"
              required
              onChange={(event) => {
                setReceipt(event.target.files?.[0] ?? null);
                setSubmitError("");
              }}
              className="mt-2 h-auto min-h-12 py-2 file:mr-3 file:rounded-md file:border-0 file:bg-bg-tertiary file:px-3 file:py-2 file:text-sm file:font-semibold file:text-text-primary"
              aria-describedby="phone-receipt-hint phone-receipt-error"
              aria-invalid={submitError ? "true" : undefined}
            />
            <p id="phone-receipt-hint" className="mt-2 text-xs text-text-muted">JPG, PNG, WebP, or PDF · maximum 5 MB</p>
            {state.alreadyUploaded ? <p className="mt-2 text-xs text-amber-700">Uploading again will replace the previous phone receipt.</p> : null}
            {submitError ? <p id="phone-receipt-error" role="alert" className="mt-3 text-sm text-destructive">{submitError}</p> : null}

            <Button type="submit" size="lg" className="mt-6 min-h-12 w-full rounded-xl" disabled={!receipt || submitting} aria-busy={submitting}>
              {submitting ? "Sending to desktop…" : "Send receipt to desktop"}
            </Button>
          </form>
        )}
      </section>
    </main>
  );
}
