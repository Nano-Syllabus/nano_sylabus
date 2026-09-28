"use client";

import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { createPortal } from "react-dom";
import { Trash2, TriangleAlert, X } from "lucide-react";

const focus =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-strong focus-visible:ring-offset-2 focus-visible:ring-offset-bg-primary";

/** Mirrors COMMUNITY_DELETE_MEMBER_LIMIT in lib/data/communities.ts, which the API enforces. */
const MEMBER_LIMIT = 2;

function sameName(typed: string, name: string) {
  const clean = (value: string) => value.trim().replace(/\s+/g, " ");
  return clean(typed) !== "" && clean(typed) === clean(name);
}

/**
 * Delete a faculty, confirmed the way GitHub confirms deleting a repository:
 * a dialog that says what is lost and asks for the faculty's name typed out.
 * A faculty with more than MEMBER_LIMIT members cannot be deleted at all.
 */
export function CommunityDeleteControl({
  slug,
  name,
  memberCount,
  onDeleted,
}: {
  slug: string;
  name: string;
  /** Active members, creator included. Unknown (undefined) leaves the check to the server. */
  memberCount?: number;
  onDeleted: () => void | Promise<unknown>;
}) {
  const [open, setOpen] = useState(false);
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [deleted, setDeleted] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const inFlight = useRef(false);
  const id = useId();
  const blocked = memberCount !== undefined && memberCount > MEMBER_LIMIT;
  const matches = sameName(confirmation, name);

  useEffect(() => {
    if (!open) return;
    input.current?.focus();
    const previousOverflow = document.body.style.overflow;
    const previousPadding = document.body.style.paddingRight;
    const scrollbar = window.innerWidth - document.documentElement.clientWidth;
    if (scrollbar > 0) document.body.style.paddingRight = `${scrollbar}px`;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
      document.body.style.paddingRight = previousPadding;
    };
  }, [open]);

  function close() {
    if (inFlight.current) return;
    setOpen(false);
    setConfirmation("");
    setError("");
    trigger.current?.focus();
  }

  async function remove(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (inFlight.current || !matches || blocked) return;
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
      setOpen(false);
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
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">Delete this community</p>
          <p className="mt-1 text-sm text-text-secondary">
            {blocked
              ? `It has ${memberCount} members. A community can only be deleted while it has ${MEMBER_LIMIT} or fewer.`
              : "Once deleted, members lose access and it cannot be restored."}
          </p>
        </div>
        <button
          ref={trigger}
          type="button"
          aria-haspopup="dialog"
          onClick={() => setOpen(true)}
          disabled={blocked}
          className={`inline-flex min-h-10 shrink-0 items-center justify-center gap-2 rounded-lg border border-destructive/40 bg-bg-primary px-4 text-sm font-medium text-destructive transition hover:bg-destructive hover:text-white disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-bg-primary disabled:hover:text-destructive ${focus}`}
        >
          <Trash2 className="size-4" aria-hidden="true" /> Delete community
        </button>
      </div>

      {open
        ? createPortal(
            <div
              className="fixed inset-0 z-[70] grid place-items-center bg-black/45 p-4"
              onMouseDown={(event) => {
                if (event.target === event.currentTarget) close();
              }}
            >
              <form
                role="dialog"
                aria-modal="true"
                aria-labelledby={`${id}-title`}
                aria-describedby={`${id}-help`}
                onSubmit={remove}
                onKeyDown={(event) => {
                  if (event.key === "Escape") {
                    event.preventDefault();
                    close();
                  }
                }}
                // Solid panel that rises in; no opacity fade (see teacher modal flicker).
                className="w-full max-w-md overflow-hidden rounded-xl border border-border bg-bg-primary shadow-xl animate-in zoom-in-[0.98] slide-in-from-bottom-2 duration-200 motion-reduce:animate-none"
              >
                <header className="flex items-center gap-3 border-b border-border px-5 py-4">
                  <h2 id={`${id}-title`} className="min-w-0 flex-1 truncate font-display text-base font-semibold">
                    Delete {name}
                  </h2>
                  <button
                    type="button"
                    onClick={close}
                    disabled={busy}
                    aria-label="Close"
                    className={`grid size-8 place-items-center rounded-md text-text-secondary hover:bg-bg-secondary ${focus}`}
                  >
                    <X className="size-4" aria-hidden="true" />
                  </button>
                </header>

                <div className="flex items-start gap-2.5 border-b border-destructive/20 bg-destructive/10 px-5 py-3 text-sm text-destructive">
                  <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                  <p>This cannot be undone. Please be certain.</p>
                </div>

                <div className="space-y-4 px-5 py-5">
                  <p id={`${id}-help`} className="text-sm leading-6 text-text-secondary">
                    This removes <strong className="text-text-primary">{name}</strong> from Browse
                    and ends every member&apos;s and invite&apos;s access. Your subjects, uploaded
                    files and past results are kept.
                  </p>
                  <label htmlFor={id} className="block text-sm">
                    To confirm, type{" "}
                    <span className="break-all rounded bg-bg-secondary px-1.5 py-0.5 font-mono font-semibold text-text-primary">
                      {name}
                    </span>{" "}
                    in the box below
                  </label>
                  <input
                    ref={input}
                    id={id}
                    type="text"
                    autoComplete="off"
                    spellCheck={false}
                    value={confirmation}
                    onChange={(event) => {
                      setConfirmation(event.target.value);
                      setError("");
                    }}
                    disabled={busy}
                    aria-invalid={error ? true : undefined}
                    aria-errormessage={error ? `${id}-error` : undefined}
                    className={`min-h-11 w-full rounded-lg border border-border bg-bg-primary px-3 text-sm ${focus}`}
                  />
                  {error ? (
                    <p id={`${id}-error`} role="alert" className="text-sm text-destructive">
                      {error}
                    </p>
                  ) : null}
                  <button
                    type="submit"
                    disabled={busy || !matches}
                    aria-busy={busy}
                    className={`inline-flex min-h-11 w-full items-center justify-center rounded-lg bg-destructive px-4 text-sm font-semibold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40 ${focus}`}
                  >
                    {busy ? "Deleting…" : "Delete this community"}
                  </button>
                </div>
              </form>
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
