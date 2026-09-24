"use client";

import { Check, Loader2, Pencil, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

type CommunityNameEditorProps = {
  slug: string;
  name: string;
  onSaved?: () => Promise<unknown>;
  as?: "h1" | "h2";
  id?: string;
};

const focusRing =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-strong focus-visible:ring-offset-2 focus-visible:ring-offset-bg-primary";

export function CommunityNameEditor({
  slug,
  name,
  onSaved,
  as = "h1",
  id,
}: CommunityNameEditorProps) {
  const [displayName, setDisplayName] = useState(name);
  const [draft, setDraft] = useState(name);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const Heading = as;

  useEffect(() => {
    setDisplayName(name);
    setDraft(name);
  }, [name]);

  useEffect(() => {
    if (editing) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [editing]);

  function startEditing() {
    setDraft(displayName);
    setError("");
    setEditing(true);
  }

  function cancelEditing() {
    if (busy) return;
    setDraft(displayName);
    setError("");
    setEditing(false);
  }

  async function save() {
    const nextName = draft.trim();
    if (busy) return;
    if (nextName === displayName.trim()) {
      setEditing(false);
      return;
    }

    setBusy(true);
    setError("");
    try {
      const response = await fetch(`/api/communities/${encodeURIComponent(slug)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ name: nextName }),
      });
      const payload = (await response.json().catch(() => ({}))) as {
        community?: { name?: string };
        error?: string;
      };
      if (!response.ok || !payload.community?.name) {
        throw new Error(payload.error || "Could not update the community name. Try again.");
      }
      setDisplayName(payload.community.name);
      setDraft(payload.community.name);
      setEditing(false);
      // The local title updates immediately; the refresh keeps every dashboard surface in sync.
      try {
        await onSaved?.();
      } catch {
        // A successful rename should not be reported as a failed rename if refresh is unavailable.
      }
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : "Could not update the community name. Try again.",
      );
    } finally {
      setBusy(false);
    }
  }

  if (editing) {
    return (
      <div className="min-w-0">
        <div className="flex min-w-0 items-center gap-2">
          <input
            ref={inputRef}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                event.preventDefault();
                cancelEditing();
              }
              if (event.key === "Enter") {
                event.preventDefault();
                void save();
              }
            }}
            disabled={busy}
            maxLength={120}
            aria-label="Community name"
            aria-invalid={error ? true : undefined}
            className={`min-h-11 min-w-0 flex-1 rounded-lg border border-white/30 bg-white/10 px-3 text-inherit outline-none placeholder:text-white/50 ${focusRing}`}
          />
          <button
            type="button"
            onClick={() => void save()}
            disabled={busy || !draft.trim()}
            aria-label="Save community name"
            title="Save community name"
            className={`inline-flex size-10 shrink-0 items-center justify-center rounded-lg bg-white text-[#0b2859] transition hover:bg-white/90 disabled:cursor-not-allowed disabled:opacity-60 ${focusRing}`}
          >
            {busy ? (
              <Loader2 className="size-4 animate-spin" aria-hidden="true" />
            ) : (
              <Check className="size-4" aria-hidden="true" />
            )}
          </button>
          <button
            type="button"
            onClick={cancelEditing}
            disabled={busy}
            aria-label="Cancel editing community name"
            title="Cancel"
            className={`inline-flex size-10 shrink-0 items-center justify-center rounded-lg border border-white/30 text-white transition hover:bg-white/10 disabled:opacity-60 ${focusRing}`}
          >
            <X className="size-4" aria-hidden="true" />
          </button>
        </div>
        {error ? (
          <p role="alert" className="mt-2 text-xs text-red-200">
            {error}
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <div className="flex min-w-0 items-center gap-2">
      <Heading
        id={id}
        className={`min-w-0 truncate font-display font-semibold tracking-[-0.04em] ${
          as === "h1" ? "mt-2 text-3xl" : "mt-1 text-2xl tracking-[-0.03em]"
        }`}
      >
        {displayName}
      </Heading>
      <button
        type="button"
        onClick={startEditing}
        aria-label="Edit community name"
        title="Edit community name"
        className={`inline-flex size-9 shrink-0 items-center justify-center rounded-lg border border-white/25 text-white/75 transition hover:bg-white/10 hover:text-white ${as === "h1" ? "mt-2" : "mt-1"} ${focusRing}`}
      >
        <Pencil className="size-4" aria-hidden="true" />
      </button>
    </div>
  );
}
