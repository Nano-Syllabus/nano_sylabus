"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Check, LoaderCircle } from "lucide-react";

const focusRing =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-strong focus-visible:ring-offset-2";

export function CommunityInviteAccept({ token }: { token: string }) {
  const router = useRouter();
  const [accepting, setAccepting] = useState(false);
  const [accepted, setAccepted] = useState(false);
  const [error, setError] = useState("");

  async function acceptInvite() {
    setAccepting(true);
    setError("");
    try {
      const response = await fetch(`/api/community-invites/${encodeURIComponent(token)}`, {
        method: "POST",
        headers: { Accept: "application/json" },
      });
      const payload = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        setError(payload.error || "Could not accept this invitation.");
        return;
      }
      setAccepted(true);
      router.push("/app/community");
      router.refresh();
    } catch {
      setError("Could not reach NanoSyllabus. Check your connection and try again.");
    } finally {
      setAccepting(false);
    }
  }

  return (
    <div>
      {error ? (
        <p
          role="alert"
          className="mb-4 rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive"
        >
          {error}
        </p>
      ) : null}
      <button
        type="button"
        onClick={acceptInvite}
        disabled={accepting || accepted}
        aria-busy={accepting}
        className={`inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-text-primary px-5 text-sm font-semibold text-text-inverse transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-65 ${focusRing}`}
      >
        {accepting ? (
          <LoaderCircle
            className="size-4 animate-spin motion-reduce:animate-none"
            aria-hidden="true"
          />
        ) : null}
        {accepted ? <Check className="size-4" aria-hidden="true" /> : null}
        {accepting ? "Joining community…" : accepted ? "Invitation accepted" : "Accept invitation"}
        {!accepting && !accepted ? <ArrowRight className="size-4" aria-hidden="true" /> : null}
      </button>
    </div>
  );
}
