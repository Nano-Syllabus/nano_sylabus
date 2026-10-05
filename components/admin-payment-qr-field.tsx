"use client";

import { useEffect, useState } from "react";

type QrConfig = {
  displayName: string;
  bankName: string;
  accountName: string;
  accountNumber: string;
  qrImageUrl: string;
  instructions: string;
};

const EMPTY: QrConfig = {
  displayName: "Bank transfer",
  bankName: "",
  accountName: "",
  accountNumber: "",
  qrImageUrl: "",
  instructions: "",
};
const inputClass =
  "min-h-10 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm font-normal";

async function readJson(response: Response) {
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || "Something went wrong. Please retry.");
  return result;
}

/** The payment QR students scan at checkout: the image, who it pays, and what to tell them. */
export function AdminPaymentQrField() {
  const [qr, setQr] = useState<QrConfig>(EMPTY);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState<"" | "upload" | "save">("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [analyzed, setAnalyzed] = useState(false);
  const [previewUrl, setPreviewUrl] = useState("");
  const missingFields = analyzed
    ? [
        !qr.accountName.trim() && "account name",
        !qr.bankName.trim() && "bank name",
        !qr.accountNumber.trim() && "account number",
      ].filter((field): field is string => Boolean(field))
    : [];

  useEffect(
    () => () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    },
    [previewUrl],
  );

  useEffect(() => {
    let cancelled = false;
    fetch("/api/admin/payment-config")
      .then(readJson)
      .then(({ config }) => {
        if (cancelled) return;
        if (config)
          setQr({
            displayName: config.displayName,
            bankName: config.bankName ?? "",
            accountName: config.accountName,
            accountNumber: config.accountNumber ?? "",
            qrImageUrl: config.qrImageUrl,
            instructions: config.instructions ?? "",
          });
        setLoaded(true);
      })
      .catch((cause) => {
        if (cancelled) return;
        setError((cause as Error).message);
        setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function upload(file: File) {
    setBusy("upload");
    setError("");
    setMessage("");
    try {
      const form = new FormData();
      form.set("file", file);
      const result = await fetch("/api/admin/payment-config/qr", {
        method: "POST",
        body: form,
      }).then(readJson);
      const details = result.details ?? {};
      const missing = [
        !details.accountName && "account name",
        !details.bankName && "bank name",
        !details.accountNumber && "account number",
      ].filter((field): field is string => Boolean(field));
      setQr((current) => ({
        ...current,
        qrImageUrl: result.url,
        accountName: details.accountName ?? "",
        bankName: details.bankName ?? "",
        accountNumber: details.accountNumber ?? "",
        displayName: details.accountName ?? "Bank transfer",
        instructions:
          current.instructions ||
          "Scan the QR, complete the payment, then submit the transaction reference and receipt for verification.",
      }));
      setPreviewUrl(URL.createObjectURL(file));
      setAnalyzed(true);
      setMessage(
        missing.length
          ? "QR uploaded. Available payment details were filled automatically."
          : "Account name, bank and account number filled from the QR.",
      );
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setBusy("");
    }
  }

  async function save() {
    setBusy("save");
    setError("");
    setMessage("");
    try {
      await fetch("/api/admin/payment-config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(qr),
      }).then(readJson);
      setMessage("Payment QR saved. Students see it at their next checkout.");
      setAnalyzed(false);
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setBusy("");
    }
  }

  const text = (label: string, key: keyof QrConfig) => (
    <label className="block text-sm font-medium">
      {label}
      <input
        value={qr[key]}
        disabled={Boolean(busy)}
        onChange={(e) => setQr((current) => ({ ...current, [key]: e.target.value }))}
        className={`${inputClass} mt-1`}
      />
    </label>
  );

  return (
    <fieldset className="space-y-3">
      <legend className="mb-1 text-sm font-semibold">Payment QR</legend>
      <p className="text-xs text-muted-foreground">
        Shown to students after they sign in and choose a plan. It is shared by every exam.
      </p>
      {!loaded ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-4">
            {qr.qrImageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={previewUrl || qr.qrImageUrl}
                alt="Payment QR"
                className="size-28 rounded-lg border border-border object-contain"
              />
            ) : null}
            <label className="text-sm font-medium">
              {qr.qrImageUrl ? "Replace QR image" : "Upload QR image"}
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp"
                disabled={Boolean(busy)}
                onChange={(e) => e.target.files?.[0] && void upload(e.target.files[0])}
                className="mt-1 block text-sm font-normal"
              />
              <span className="block text-xs font-normal text-muted-foreground">
                PNG, JPEG or WebP, up to 1 MB. Payment details are read automatically.
              </span>
            </label>
          </div>
          {missingFields.length ? (
            <p role="status" className="text-sm text-muted-foreground">
              Not found in this QR: {missingFields.join(", ")}. Please enter those details below.
            </p>
          ) : null}
          <div className="grid gap-3 sm:grid-cols-2">
            {text("Account name", "accountName")}
            {text("Bank name", "bankName")}
            {text("Account number", "accountNumber")}
            {text("Display name", "displayName")}
          </div>
          <label className="block text-sm font-medium">
            Instructions for students
            <textarea
              rows={2}
              value={qr.instructions}
              disabled={Boolean(busy)}
              onChange={(e) => setQr({ ...qr, instructions: e.target.value })}
              className={`${inputClass} mt-1`}
            />
          </label>
          <button
            type="button"
            disabled={
              Boolean(busy) || !qr.qrImageUrl || !qr.accountName.trim() || !qr.displayName.trim()
            }
            onClick={() => void save()}
            className="inline-flex min-h-10 items-center justify-center rounded-lg bg-blue-600 px-4 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {busy === "save" ? "Saving…" : busy === "upload" ? "Reading QR…" : "Save payment QR"}
          </button>
        </>
      )}
      {message ? (
        <p role="status" className="text-sm text-emerald-700 dark:text-emerald-300">
          {message}
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </fieldset>
  );
}
