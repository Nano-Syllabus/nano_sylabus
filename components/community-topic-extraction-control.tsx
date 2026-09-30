"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Globe2, Loader2, RefreshCw } from "lucide-react";
import type { CommunitySubject } from "@/lib/communities";

type ExtractionSubject = Pick<
  CommunitySubject,
  "id" | "name" | "publicationStatus" | "topicSyncStatus"
>;
const focusRing =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-strong focus-visible:ring-offset-2 focus-visible:ring-offset-bg-primary";

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
  const [publicationResult, setPublicationResult] = useState<"published" | null>(null);
  const status = result ?? subject.topicSyncStatus;
  const published = publicationResult === "published" || subject.publicationStatus === "published";

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
      const payload = (await response.json().catch(() => ({}))) as {
        error?: string;
        topics?: unknown[];
        topicSyncStatus?: string;
        publicationStatus?: string;
      };
      if (!response.ok) throw new Error(payload.error || "Could not publish subject. Try again.");
      if (
        !Array.isArray(payload.topics) ||
        payload.topicSyncStatus !== "ready" ||
        payload.publicationStatus !== "published"
      ) {
        throw new Error("Could not confirm publication. Please try again.");
      }
      setResult("ready");
      setPublicationResult("published");
      setNotice(
        `${subject.name} is published with ${payload.topics.length} challenge topic${payload.topics.length === 1 ? "" : "s"}.`,
      );
      try {
        if (onExtracted) await onExtracted();
        else router.refresh();
      } catch {
        setNotice(
          "Extraction finished, but this view could not refresh. Reload to see the latest status.",
        );
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not publish subject. Try again.");
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  // Just the button: the words around it explained what publishing does, and a
  // creator asked for the button alone (2026-09-28).
  return (
    // `contents`: the button is one more item in the subject row, and a notice
    // wraps onto its own full-width line beneath the row instead of pushing the
    // button out of it.
    <div className="contents">
      <button
        type="button"
        onClick={() => void extract()}
        disabled={busy}
        aria-busy={busy}
        aria-label={`${published ? "Refresh published" : "Publish"} subject ${subject.name}`}
        // Publish is the row's primary action, in the app's blue; Refresh on an
        // already published subject is secondary, outlined like Open.
        className={`inline-flex min-h-10 items-center justify-center gap-2 rounded-lg px-4 text-sm font-semibold disabled:cursor-wait disabled:opacity-60 ${
          published
            ? "border border-border bg-bg-primary text-text-primary hover:bg-bg-secondary"
            : "bg-blue-600 text-white hover:bg-blue-700"
        } ${focusRing}`}
      >
        {busy ? (
          <Loader2 className="size-4 motion-safe:animate-spin" aria-hidden="true" />
        ) : published ? (
          <RefreshCw className="size-4" aria-hidden="true" />
        ) : (
          <Globe2 className="size-4" aria-hidden="true" />
        )}
        {busy
          ? published
            ? "Refreshing…"
            : "Publishing…"
          : error
            ? "Retry publish"
            : published
              ? "Refresh"
              : "Publish"}
      </button>
      {notice ? (
        <p role="status" className="basis-full pl-[52px] text-sm text-text-secondary">
          {notice}
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="basis-full pl-[52px] text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}
