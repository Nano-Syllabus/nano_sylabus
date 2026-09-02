"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { ArrowRight, Check, LoaderCircle } from "lucide-react";

const focusRing =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-strong focus-visible:ring-offset-2";

export function BillingReferralClaim({ code }: { code: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [claimed, setClaimed] = useState(false);
  const [error, setError] = useState("");

  async function claim() {
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/billing/referrals/claim", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ code }),
      });
      const payload = (await response.json().catch(() => ({}))) as { claim?: { status?: string }; error?: string };
      if (!response.ok || !payload.claim) {
        setError(payload.error || "Could not claim this referral.");
        return;
      }
      setClaimed(true);
      router.refresh();
    } catch {
      setError("Could not reach NanoSyllabus. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      {error ? (
        <p role="alert" className="mb-4 rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
          {error}
        </p>
      ) : null}
      <button
        type="button"
        onClick={claim}
        disabled={busy || claimed}
        aria-busy={busy}
        className={`inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-text-primary px-5 text-sm font-semibold text-text-inverse transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-65 ${focusRing}`}
      >
        {busy ? <LoaderCircle className="size-4 animate-spin motion-reduce:animate-none" aria-hidden="true" /> : null}
        {claimed ? <Check className="size-4" aria-hidden="true" /> : null}
        {busy ? "Saving referral…" : claimed ? "Referral saved" : "Claim this referral"}
        {!busy && !claimed ? <ArrowRight className="size-4" aria-hidden="true" /> : null}
      </button>
      {claimed ? (
        <p className="mt-3 text-center text-sm leading-6 text-text-secondary">
          Your reward is issued automatically after your first paid Pro subscription is approved.
        </p>
      ) : null}
    </div>
  );
}
