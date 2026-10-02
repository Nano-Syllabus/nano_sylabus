"use client";

import { Check, Loader2, Pencil, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { CommunityLevel } from "@/lib/communities";

type Details = { name: string; level: CommunityLevel; university: string; faculty: string };
type EditableField = "name" | "faculty";

const focusRing =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60 focus-visible:ring-offset-2 focus-visible:ring-offset-transparent";
const fieldClass =
  "min-h-10 w-full rounded-lg border border-white/30 bg-white/10 px-3 text-sm text-white outline-none placeholder:text-white/50 focus:border-white/60 disabled:opacity-60";

/**
 * The faculty banner on the creator's admin page: the name and the short name
 * are editable in place from one pencil. Level and university are fixed once
 * the faculty exists (user, 2026-10-02) — shown, never edited; the server
 * refuses them too.
 */
export function CommunityHeaderEditor({
  slug,
  details,
  structureText,
  onSaved,
}: {
  slug: string;
  details: Details;
  /** "One list of subjects", "4 years · 8 semesters"… — follows the layout, not editable here. */
  structureText: string;
  onSaved?: () => Promise<unknown>;
}) {
  const [shown, setShown] = useState(details);
  const [draft, setDraft] = useState(details);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const formRef = useRef<HTMLFormElement>(null);
  /** Which field the click came from, so the editor opens with the cursor there. */
  const [focusField, setFocusField] = useState<EditableField>("name");

  const detailsKey = JSON.stringify(details);
  useEffect(() => {
    const next = JSON.parse(detailsKey) as Details;
    setShown(next);
    setDraft(next);
  }, [detailsKey]);

  useEffect(() => {
    if (!editing) return;
    const field = formRef.current?.querySelector<HTMLInputElement>(`[name="${focusField}"]`);
    field?.focus();
    field?.select();
  }, [editing, focusField]);

  function edit(field: EditableField) {
    setDraft(shown);
    setError("");
    setFocusField(field);
    setEditing(true);
  }

  /** A piece of the banner that opens the editor on its own field. */
  const editable = (field: EditableField, label: string, children: React.ReactNode, className = "") => (
    <button
      type="button"
      onClick={() => edit(field)}
      title={`Edit ${label}`}
      aria-label={`Edit ${label}`}
      className={`cursor-text rounded-md decoration-white/40 decoration-dashed underline-offset-4 hover:bg-white/10 hover:underline ${focusRing} ${className}`}
    >
      {children}
    </button>
  );

  function cancel() {
    if (busy) return;
    setDraft(shown);
    setError("");
    setEditing(false);
  }

  async function save() {
    if (busy) return;
    const next = { name: draft.name.trim(), faculty: draft.faculty.trim() };
    const changed = Object.fromEntries(
      Object.entries(next).filter(([key, value]) => value !== shown[key as EditableField].trim()),
    );
    if (!Object.keys(changed).length) {
      setEditing(false);
      return;
    }
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`/api/communities/${encodeURIComponent(slug)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(changed),
      });
      const payload = (await response.json().catch(() => ({}))) as {
        community?: { name?: string; level?: CommunityLevel | null; university?: string; faculty?: string };
        error?: string;
      };
      if (!response.ok || !payload.community) {
        throw new Error(payload.error || "Could not save the faculty details. Try again.");
      }
      const saved: Details = {
        ...shown,
        name: payload.community.name ?? next.name,
        faculty: payload.community.faculty ?? next.faculty,
      };
      setShown(saved);
      setDraft(saved);
      setEditing(false);
      try {
        await onSaved?.();
      } catch {
        // Saved; a failed refresh of the surrounding page isn't a failed save.
      }
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Could not save the faculty details. Try again.");
    } finally {
      setBusy(false);
    }
  }

  if (!editing) {
    return (
      <div className="min-w-0">
        <p className="-mx-1 flex flex-wrap items-center text-[11px] font-medium uppercase tracking-[0.16em] text-white/60">
          <span className="px-1">{shown.level}</span>
          <span aria-hidden="true">·</span>
          <span className="px-1">{shown.university}</span>
        </p>
        <div className="flex min-w-0 items-center gap-2">
          <h1 className="-mx-1 mt-2 min-w-0 truncate font-display text-3xl font-semibold tracking-[-0.04em]">
            {editable("name", "name", shown.name, "max-w-full truncate px-1 text-left")}
          </h1>
          <button
            type="button"
            onClick={() => edit("name")}
            aria-label="Edit faculty details"
            title="Edit name and short name"
            className={`mt-2 inline-flex size-9 shrink-0 items-center justify-center rounded-lg border border-white/25 text-white/75 transition hover:bg-white/10 hover:text-white ${focusRing}`}
          >
            <Pencil className="size-4" aria-hidden="true" />
          </button>
        </div>
        <p className="-mx-1 mt-2 flex flex-wrap items-center text-sm text-white/65">
          {editable("faculty", "short name", shown.faculty, "px-1")}
          <span aria-hidden="true">·</span>
          <span className="px-1">{structureText}</span>
        </p>
      </div>
    );
  }

  return (
    <form
      ref={formRef}
      className="min-w-0 max-w-2xl"
      onSubmit={(event) => {
        event.preventDefault();
        void save();
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          cancel();
        }
      }}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="grid gap-1 text-xs font-medium text-white/70 sm:col-span-2">
          Name
          <input
            name="name"
            value={draft.name}
            onChange={(event) => setDraft({ ...draft, name: event.target.value })}
            disabled={busy}
            maxLength={120}
            required
            className={`${fieldClass} text-base font-semibold`}
          />
        </label>
        <label className="grid gap-1 text-xs font-medium text-white/70 sm:col-span-2">
          Short name (e.g. BEI, BCT)
          <input
            name="faculty"
            value={draft.faculty}
            onChange={(event) => setDraft({ ...draft, faculty: event.target.value })}
            disabled={busy}
            maxLength={160}
            required
            className={fieldClass}
          />
        </label>
      </div>
      <p className="mt-2 text-xs text-white/55">
        {shown.level} · {shown.university} · {structureText}. Level and university can&apos;t be changed.
      </p>
      {error ? (
        <p role="alert" className="mt-2 text-xs text-red-200">
          {error}
        </p>
      ) : null}
      <div className="mt-3 flex gap-2">
        <button
          type="submit"
          disabled={busy || !draft.name.trim() || !draft.faculty.trim()}
          className={`inline-flex min-h-10 items-center gap-2 rounded-lg bg-white px-4 text-sm font-semibold text-[#0b2859] transition hover:bg-white/90 disabled:cursor-not-allowed disabled:opacity-60 ${focusRing}`}
        >
          {busy ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <Check className="size-4" aria-hidden="true" />}
          Save
        </button>
        <button
          type="button"
          onClick={cancel}
          disabled={busy}
          className={`inline-flex min-h-10 items-center gap-2 rounded-lg border border-white/30 px-4 text-sm font-medium text-white transition hover:bg-white/10 disabled:opacity-60 ${focusRing}`}
        >
          <X className="size-4" aria-hidden="true" />
          Cancel
        </button>
      </div>
    </form>
  );
}
