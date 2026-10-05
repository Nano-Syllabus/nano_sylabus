"use client";

import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import type { SubscriptionPlan } from "@/lib/types";

type PlanDraft = { price: string; features: string };
type QrConfig = {
  displayName: string;
  bankName: string;
  accountName: string;
  accountNumber: string;
  qrImageUrl: string;
  instructions: string;
};

const EMPTY_QR: QrConfig = {
  displayName: "Bank transfer",
  bankName: "",
  accountName: "",
  accountNumber: "",
  qrImageUrl: "",
  instructions: "",
};
const inputClass =
  "min-h-10 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm";
const primaryButton =
  "inline-flex min-h-10 items-center justify-center rounded-lg bg-blue-600 px-4 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50";

async function readJson(response: Response) {
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || "Something went wrong. Please retry.");
  return result;
}

/** Plan prices, plan features and the payment QR, edited without leaving the exam setup. */
export function AdminExamBillingDialog({ onClose }: { onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [plans, setPlans] = useState<SubscriptionPlan[] | null>(null);
  const [drafts, setDrafts] = useState<Record<string, PlanDraft>>({});
  const [qr, setQr] = useState<QrConfig>(EMPTY_QR);
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    return () => element?.close();
  }, []);
  useEffect(() => {
    let cancelled = false;
    Promise.all([
      fetch("/api/admin/subscriptions/plans").then(readJson),
      fetch("/api/admin/payment-config").then(readJson),
    ])
      .then(([planResult, configResult]) => {
        if (cancelled) return;
        const loaded: SubscriptionPlan[] = planResult.plans;
        setPlans(loaded);
        setDrafts(
          Object.fromEntries(
            loaded.map((plan) => [
              plan.id,
              { price: String(plan.price), features: plan.features.join("\n") },
            ]),
          ),
        );
        const config = configResult.config;
        if (config)
          setQr({
            displayName: config.displayName,
            bankName: config.bankName ?? "",
            accountName: config.accountName,
            accountNumber: config.accountNumber ?? "",
            qrImageUrl: config.qrImageUrl,
            instructions: config.instructions ?? "",
          });
      })
      .catch((cause) => !cancelled && setError((cause as Error).message));
    return () => {
      cancelled = true;
    };
  }, []);

  async function savePlan(plan: SubscriptionPlan) {
    const draft = drafts[plan.id];
    const price = Number(draft.price);
    if (!Number.isInteger(price) || price < 0) {
      setError("Price must be a whole number, 0 or higher.");
      return;
    }
    setBusy(plan.id);
    setError("");
    setMessage("");
    try {
      await fetch(`/api/admin/subscriptions/plans/${plan.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: plan.name,
          slug: plan.slug,
          credits: plan.credits,
          price,
          currency: plan.currency,
          billingType: plan.billingType,
          isActive: plan.isActive,
          features: draft.features
            .split("\n")
            .map((line) => line.trim())
            .filter(Boolean),
        }),
      }).then(readJson);
      setMessage(`${plan.name} saved.`);
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setBusy("");
    }
  }

  async function uploadQr(file: File) {
    setBusy("upload");
    setError("");
    try {
      const form = new FormData();
      form.set("file", file);
      const result = await fetch("/api/admin/payment-config/qr", {
        method: "POST",
        body: form,
      }).then(readJson);
      setQr((current) => ({ ...current, qrImageUrl: result.url }));
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setBusy("");
    }
  }

  async function saveQr() {
    setBusy("qr");
    setError("");
    setMessage("");
    try {
      await fetch("/api/admin/payment-config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(qr),
      }).then(readJson);
      setMessage("Payment QR saved. Students see it on their next checkout.");
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setBusy("");
    }
  }

  const field = (label: string, key: keyof QrConfig, required = false) => (
    <label className="block text-sm font-medium">
      {label}
      <input
        required={required}
        value={qr[key]}
        onChange={(e) => setQr({ ...qr, [key]: e.target.value })}
        className={`${inputClass} mt-1 font-normal`}
      />
    </label>
  );

  return (
    <dialog
      ref={dialog}
      onClose={onClose}
      onClick={(e) => e.target === dialog.current && onClose()}
      aria-labelledby="exam-billing-title"
      className="m-auto w-[min(44rem,calc(100vw-2rem))] max-h-[calc(100dvh-2rem)] overflow-auto rounded-2xl border border-border bg-card p-0 text-foreground backdrop:bg-black/50"
    >
      <div className="flex items-start justify-between gap-4 border-b border-border p-5">
        <div>
          <h2 id="exam-billing-title" className="text-lg font-semibold">
            Prices, plan features & payment QR
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            These apply to every exam that uses these plans.
          </p>
        </div>
        <button type="button" aria-label="Close" onClick={onClose} className="p-2">
          <X size={18} />
        </button>
      </div>
      <div className="space-y-8 p-5">
        <section>
          <h3 className="mb-3 text-sm font-semibold">Plans</h3>
          {!plans && !error ? <p className="text-sm text-muted-foreground">Loading…</p> : null}
          <div className="space-y-4">
            {plans?.map((plan) => (
              <div key={plan.id} className="rounded-xl border border-border p-4">
                <div className="grid gap-3 sm:grid-cols-[1fr_9rem]">
                  <p className="self-center font-medium">
                    {plan.name}
                    {!plan.isActive ? (
                      <span className="ml-2 text-xs text-muted-foreground">(inactive)</span>
                    ) : null}
                  </p>
                  <label className="block text-xs text-muted-foreground">
                    Price / month ({plan.currency})
                    <input
                      inputMode="numeric"
                      value={drafts[plan.id]?.price ?? ""}
                      onChange={(e) =>
                        setDrafts({
                          ...drafts,
                          [plan.id]: { ...drafts[plan.id], price: e.target.value },
                        })
                      }
                      className={`${inputClass} mt-1`}
                    />
                  </label>
                </div>
                <label className="mt-3 block text-xs text-muted-foreground">
                  Features (one per line)
                  <textarea
                    rows={4}
                    value={drafts[plan.id]?.features ?? ""}
                    onChange={(e) =>
                      setDrafts({
                        ...drafts,
                        [plan.id]: { ...drafts[plan.id], features: e.target.value },
                      })
                    }
                    className={`${inputClass} mt-1`}
                  />
                </label>
                <button
                  type="button"
                  disabled={Boolean(busy)}
                  onClick={() => void savePlan(plan)}
                  className={`${primaryButton} mt-3`}
                >
                  {busy === plan.id ? "Saving…" : `Save ${plan.name}`}
                </button>
              </div>
            ))}
          </div>
        </section>
        <section>
          <h3 className="mb-3 text-sm font-semibold">Payment QR</h3>
          <div className="grid gap-3 sm:grid-cols-2">
            {field("Display name", "displayName", true)}
            {field("Account name", "accountName", true)}
            {field("Bank name", "bankName")}
            {field("Account number", "accountNumber")}
          </div>
          <label className="mt-3 block text-sm font-medium">
            Instructions for students
            <textarea
              rows={3}
              value={qr.instructions}
              onChange={(e) => setQr({ ...qr, instructions: e.target.value })}
              className={`${inputClass} mt-1 font-normal`}
            />
          </label>
          <div className="mt-3 flex flex-wrap items-center gap-4">
            {qr.qrImageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={qr.qrImageUrl}
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
                onChange={(e) => e.target.files?.[0] && void uploadQr(e.target.files[0])}
                className="mt-1 block text-sm font-normal"
              />
            </label>
          </div>
          <button
            type="button"
            disabled={
              Boolean(busy) || !qr.qrImageUrl || !qr.accountName.trim() || !qr.displayName.trim()
            }
            onClick={() => void saveQr()}
            className={`${primaryButton} mt-4`}
          >
            {busy === "qr" ? "Saving…" : busy === "upload" ? "Uploading…" : "Save payment QR"}
          </button>
        </section>
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
      </div>
    </dialog>
  );
}
