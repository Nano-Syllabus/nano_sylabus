"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, RefreshCw, Sparkles } from "lucide-react";
import type { CommunitySubject } from "@/lib/communities";

type ExtractionSubject = Pick<CommunitySubject, "id" | "name" | "topicSyncStatus">;
const focusRing = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-strong focus-visible:ring-offset-2 focus-visible:ring-offset-bg-primary";

export function CommunityTopicExtractionControl({
  communitySlug,
  subject,
  onExtracted,
}: {
  communitySlug: string;
  subject: ExtractionSubject;
  onExtracted?: () => Promise<unknown> | void;
}) {
  const router = useRouter();
  const inFlight = useRef(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [result, setResult] = useState<"ready" | "empty" | null>(null);
  const status = result ?? subject.topicSyncStatus;
  const ready = status === "ready";

  async function extract() {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch(
        `/api/communities/${encodeURIComponent(communitySlug)}/subjects/${encodeURIComponent(subject.id)}/sync-topics`,
        { method: "POST", headers: { Accept: "application/json" } },
      );
      const payload = await response.json().catch(() => ({})) as {
        error?: string; topics?: unknown[]; topicSyncStatus?: string;
      };
      if (!response.ok) throw new Error(payload.error || "Could not extract topics. Try again.");
      if (!Array.isArray(payload.topics) || !["ready", "empty"].includes(payload.topicSyncStatus || "")) {
        throw new Error("Could not confirm extraction. Please try again.");
      }
      if (payload.topicSyncStatus === "ready" && payload.topics.length > 0) {
        setResult("ready");
        setNotice(`${payload.topics.length} topics extracted and saved for member challenges.`);
      } else {
        setResult("empty");
        setError("No topics found. Open the subject, check that its syllabus or notes have finished indexing, then try again.");
      }
      try {
        if (onExtracted) await onExtracted();
        else router.refresh();
      } catch {
        setNotice("Extraction finished, but this view could not refresh. Reload to see the latest status.");
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not extract topics. Try again.");
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  return (
    <div className="w-full rounded-lg border border-border bg-bg-secondary p-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">
            {ready ? "Challenge topics extracted" : status === "error" ? "Topic extraction needs attention" : "Next: extract challenge topics"}
          </p>
          <p className="mt-1 text-xs leading-5 text-text-secondary">
            {ready
              ? "Refresh after adding or changing indexed material."
              : "After files finish indexing, extract their topics so members can practise. Indexing alone does not confirm topics are ready."}
          </p>
        </div>
        <button
          type="button"
          onClick={() => void extract()}
          disabled={busy}
          aria-busy={busy}
          aria-label={`${ready ? "Refresh" : "Extract"} challenge topics for ${subject.name}`}
          className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-text-primary px-4 text-sm font-medium text-text-inverse hover:opacity-90 disabled:cursor-wait disabled:opacity-60 ${focusRing}`}
        >
          {busy ? <Loader2 className="size-4 motion-safe:animate-spin" aria-hidden="true" />
            : ready ? <RefreshCw className="size-4" aria-hidden="true" />
              : <Sparkles className="size-4" aria-hidden="true" />}
          {busy ? "Extracting topics…" : error ? "Retry topic extraction" : ready ? "Refresh challenge topics" : "Extract topics for challenges"}
        </button>
      </div>
      {busy ? <p role="status" className="mt-3 text-xs text-text-secondary">Reading indexed material and saving the community learning map. This may take a minute.</p> : null}
      {notice ? <p role="status" className="mt-3 text-sm text-text-secondary">{notice}</p> : null}
      {error ? <p role="alert" className="mt-3 text-sm text-destructive">{error}</p> : null}
    </div>
  );
}
