"use client";

import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { Trash2 } from "lucide-react";

const focus =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-strong focus-visible:ring-offset-2 focus-visible:ring-offset-bg-primary";

export function CommunityDeleteControl({
  slug,
  name,
  onDeleted,
}: {
  slug: string;
  name: string;
  onDeleted: () => void | Promise<unknown>;
}) {
  const [confirming, setConfirming] = useState(false);
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [deleted, setDeleted] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const inFlight = useRef(false);
  const id = useId();

  useEffect(() => {
    if (confirming) input.current?.focus();
  }, [confirming]);

  function cancel() {
    if (inFlight.current) return;
    setConfirming(false);
    setConfirmation("");
    setError("");
    trigger.current?.focus();
  }

  async function remove(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (inFlight.current || confirmation !== slug) return;
    inFlight.current = true;
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`/api/communities/${encodeURIComponent(slug)}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ confirmation }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload.deleted !== true) {
        throw new Error(payload.error || "Could not delete the community. Try again.");
      }
      setDeleted(true);
    } catch (failure) {
      setError(
        failure instanceof Error ? failure.message : "Could not delete the community. Try again.",
      );
      return;
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
    // A refresh failure must not imply that deletion failed or allow a second submission.
    try {
      await onDeleted();
    } catch {
      /* The success message remains visible. */
    }
  }

  if (deleted)
    return (
      <p role="status" className="text-sm text-text-secondary">
        Community deleted. Your source subjects and files were kept.
      </p>
    );

  return (
    <div>
      <button
        ref={trigger}
        type="button"
        aria-expanded={confirming}
        aria-controls={confirming ? `${id}-form` : undefined}
        onClick={() => setConfirming(true)}
        className={`inline-flex min-h-11 items-center gap-2 rounded-lg border border-destructive/40 px-4 text-sm font-medium text-destructive ${focus}`}
      >
        <Trash2 className="size-4" aria-hidden="true" /> Delete community
      </button>
      {confirming ? (
        <form
          id={`${id}-form`}
          onSubmit={remove}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.preventDefault();
              cancel();
            }
          }}
          className="mt-4 max-w-xl space-y-4 rounded-lg border border-destructive/30 bg-bg-primary p-4"
        >
          <p className="text-sm font-medium">Delete {name}?</p>
          <p id={`${id}-help`} className="text-sm leading-6 text-text-secondary">
            This removes the community from listings and ends all member and invite access.
            Subjects, uploaded files, and past results are kept in storage. There is no restore
            button.
          </p>
          <label htmlFor={id} className="block text-sm">
            Type <span className="break-all font-mono font-semibold">{slug}</span> to confirm.
          </label>
          <input
            ref={input}
            id={id}
            type="text"
            autoComplete="off"
            spellCheck={false}
            value={confirmation}
            onChange={(event) => setConfirmation(event.target.value)}
            disabled={busy}
            aria-describedby={`${id}-help ${id}-error`}
            aria-invalid={error ? true : undefined}
            className={`min-h-11 w-full rounded-lg border border-border bg-bg-primary px-3 text-sm ${focus}`}
          />
          <p
            id={`${id}-error`}
            role={error ? "alert" : undefined}
            className="text-sm text-destructive"
          >
            {error}
          </p>
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={cancel}
              disabled={busy}
              className={`min-h-11 rounded-lg border border-border px-4 text-sm disabled:opacity-50 ${focus}`}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={busy || confirmation !== slug}
              aria-busy={busy}
              className={`min-h-11 rounded-lg border border-destructive px-4 text-sm font-medium text-destructive disabled:opacity-50 ${focus}`}
            >
              {busy ? "Deleting…" : "Confirm deletion"}
            </button>
          </div>
        </form>
      ) : null}
    </div>
  );
}
