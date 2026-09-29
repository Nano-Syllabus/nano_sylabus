"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Check, LoaderCircle } from "lucide-react";

const focusRing =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-strong focus-visible:ring-offset-2";

/** Accept / Decline on the ownership-transfer page. */
export function CommunityTransferRespond({ token, slug }: { token: string; slug: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState<"accept" | "decline" | null>(null);
  const [done, setDone] = useState<"accepted" | "declined" | null>(null);
  const [error, setError] = useState("");

  async function respond(action: "accept" | "decline") {
    setBusy(action);
    setError("");
    try {
      const response = await fetch(`/api/community-transfers/${encodeURIComponent(token)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ action }),
      });
      const payload = (await response.json().catch(() => ({}))) as {
        error?: string;
        slug?: string;
      };
      if (!response.ok) {
        setError(payload.error || "Could not answer this transfer. Try again.");
        return;
      }
      if (action === "decline") {
        setDone("declined");
        return;
      }
      setDone("accepted");
      router.push(
        `/teachers?${new URLSearchParams({ view: "communities", community: payload.slug || slug })}`,
      );
    } catch {
      setError("Could not reach NanoSyllabus. Check your connection and try again.");
    } finally {
      setBusy(null);
    }
  }

  if (done === "declined")
    return (
      <p role="status" className="rounded-xl border border-border bg-bg-secondary p-4 text-sm">
        You declined. The community stays with its current creator.
      </p>
    );

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
      <div className="flex flex-col gap-3 sm:flex-row">
        <button
          type="button"
          onClick={() => respond("accept")}
          disabled={busy !== null || done !== null}
          aria-busy={busy === "accept"}
          className={`inline-flex min-h-12 flex-1 items-center justify-center gap-2 rounded-xl bg-text-primary px-5 text-sm font-semibold text-text-inverse transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-65 ${focusRing}`}
        >
          {busy === "accept" ? (
            <LoaderCircle className="size-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />
          ) : null}
          {done === "accepted" ? <Check className="size-4" aria-hidden="true" /> : null}
          {busy === "accept"
            ? "Transferring…"
            : done === "accepted"
              ? "You are now the owner"
              : "Accept ownership"}
          {busy === null && done === null ? <ArrowRight className="size-4" aria-hidden="true" /> : null}
        </button>
        <button
          type="button"
          onClick={() => respond("decline")}
          disabled={busy !== null || done !== null}
          aria-busy={busy === "decline"}
          className={`inline-flex min-h-12 items-center justify-center rounded-xl border border-border px-5 text-sm font-semibold transition hover:bg-bg-secondary disabled:cursor-not-allowed disabled:opacity-65 sm:w-40 ${focusRing}`}
        >
          {busy === "decline" ? "Declining…" : "Decline"}
        </button>
      </div>
    </div>
  );
}
