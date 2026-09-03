"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";
import type { CommunitySummary } from "@/lib/communities";
import { titleCase } from "@/lib/utils";

const focusRing =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-strong focus-visible:ring-offset-2 focus-visible:ring-offset-bg-primary";

export function CommunityLeaveControl({
  community,
}: {
  community: Pick<CommunitySummary, "slug" | "name" | "membership">;
}) {
  const router = useRouter();
  const id = useId();
  const dialog = useRef<HTMLDialogElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const cancelButton = useRef<HTMLButtonElement>(null);
  const inFlight = useRef(false);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [left, setLeft] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (confirming && !dialog.current?.open) {
      dialog.current?.showModal();
      cancelButton.current?.focus();
    } else if (!confirming && dialog.current?.open) {
      dialog.current.close();
    }
  }, [confirming]);

  function cancel() {
    if (inFlight.current) return;
    setConfirming(false);
    setError("");
  }

  async function leave() {
    if (inFlight.current || left) return;
    inFlight.current = true;
    setBusy(true);
    setError("");
    try {
      const response = await fetch(
        `/api/communities/${encodeURIComponent(community.slug)}/membership`,
        { method: "DELETE", headers: { Accept: "application/json" } },
      );
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload.left !== true) {
        throw new Error(payload.error || "Could not confirm that you left. Please try again.");
      }
      setLeft(true);
      setConfirming(false);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Could not leave. Please try again.");
      return;
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
    // Navigation failure must not turn a successful leave into a retryable mutation.
    try {
      router.replace("/communities");
      router.refresh();
    } catch {
      // The success message and browse link remain available.
    }
  }

  if (community.membership?.status !== "active" || community.membership.role !== "member") {
    return null;
  }
  if (left) {
    return (
      <div className="text-sm text-text-secondary">
        <p role="status">You left {titleCase(community.name)}. Your past results are kept.</p>
        <Link
          href="/communities"
          className={`inline-flex min-h-11 items-center underline ${focusRing}`}
        >
          Browse communities
        </Link>
      </div>
    );
  }

  return (
    <>
      <button
        ref={trigger}
        type="button"
        onClick={() => setConfirming(true)}
        aria-haspopup="dialog"
        aria-label={`Leave ${titleCase(community.name)} community`}
        className={`inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-full border border-border bg-bg-primary px-4 text-sm font-medium text-text-primary hover:border-destructive hover:text-destructive ${focusRing}`}
      >
        <LogOut className="size-4" aria-hidden="true" /> Leave community
      </button>
      <dialog
        ref={dialog}
        aria-labelledby={`${id}-title`}
        aria-describedby={`${id}-description`}
        onCancel={(event) => {
          event.preventDefault();
          cancel();
        }}
        onClose={() => {
          setConfirming(false);
          trigger.current?.focus();
        }}
        className="m-auto max-h-[90dvh] w-[calc(100%_-_2rem)] max-w-lg overflow-y-auto rounded-2xl border border-border bg-bg-primary p-6 text-text-primary shadow-xl backdrop:bg-black/45"
      >
        <h2 id={`${id}-title`} className="font-display text-xl font-semibold">
          Leave {titleCase(community.name)}?
        </h2>
        <p id={`${id}-description`} className="mt-3 text-sm leading-6 text-text-secondary">
          You will lose member access to this community&apos;s subjects, materials, and new
          challenges. Your past answers, results, and progress will not be deleted. This does not
          delete the community.
        </p>
        <p className="mt-2 text-sm leading-6 text-text-secondary">
          You can join another community afterward. Rejoining this one follows its current access
          rules.
        </p>
        {error ? (
          <p role="alert" className="mt-4 text-sm text-destructive">
            {error}
          </p>
        ) : null}
        <div className="mt-6 flex flex-wrap justify-end gap-3">
          <button
            ref={cancelButton}
            type="button"
            onClick={cancel}
            disabled={busy}
            className={`min-h-11 rounded-full border border-border px-5 text-sm font-medium hover:bg-bg-secondary disabled:opacity-60 ${focusRing}`}
          >
            Stay in community
          </button>
          <button
            type="button"
            onClick={() => void leave()}
            disabled={busy}
            aria-busy={busy}
            className={`min-h-11 rounded-full border border-destructive px-5 text-sm font-semibold text-destructive hover:bg-destructive/10 disabled:cursor-wait disabled:opacity-60 ${focusRing}`}
          >
            {busy ? "Leaving…" : error ? "Retry leaving" : "Confirm leave"}
          </button>
        </div>
      </dialog>
    </>
  );
}
