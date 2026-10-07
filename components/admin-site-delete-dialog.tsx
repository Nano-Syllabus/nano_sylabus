"use client";

import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { createPortal } from "react-dom";
import { Trash2, TriangleAlert, X } from "lucide-react";

/**
 * Delete a subdomain website, confirmed in a dialog (not a browser prompt) the
 * way the faculty delete is: say what happens, ask for the subdomain typed out.
 */
export function AdminSiteDeleteDialog({
  slug,
  domain,
  rootDomain,
  studentCount,
  disabled,
  onDeleted,
}: {
  slug: string;
  domain: string;
  rootDomain: string;
  /** Students who picked a faculty on this site; they stay in it, unlocked. */
  studentCount: number;
  disabled?: boolean;
  onDeleted: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const inFlight = useRef(false);
  const id = useId();
  const matches = confirmation.trim().toLowerCase() === slug;

  useEffect(() => {
    if (!open) return;
    input.current?.focus();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
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
    if (inFlight.current || !matches) return;
    inFlight.current = true;
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`/api/admin/sites/${encodeURIComponent(slug)}`, {
        method: "DELETE",
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "Couldn’t delete the site. Try again.");
      onDeleted();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Couldn’t delete the site. Try again.");
      inFlight.current = false;
      setBusy(false);
    }
  }

  return (
    <>
      <button
        ref={trigger}
        type="button"
        aria-haspopup="dialog"
        onClick={() => setOpen(true)}
        disabled={disabled}
        className="mt-3 inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-red-500/40 px-3 text-sm font-medium text-red-600 hover:bg-red-500/10 disabled:opacity-50"
      >
        <Trash2 size={14} aria-hidden="true" />
        Delete website
      </button>

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
                className="w-full max-w-md overflow-hidden rounded-xl border border-border bg-card text-foreground shadow-xl animate-in zoom-in-[0.98] slide-in-from-bottom-2 duration-200 motion-reduce:animate-none"
              >
                <header className="flex items-center gap-3 border-b border-border px-5 py-4">
                  <h2 id={`${id}-title`} className="min-w-0 flex-1 truncate text-base font-semibold">
                    Delete {domain}
                  </h2>
                  <button
                    type="button"
                    onClick={close}
                    disabled={busy}
                    aria-label="Close"
                    className="grid size-8 place-items-center rounded-md text-muted-foreground hover:bg-muted"
                  >
                    <X className="size-4" aria-hidden="true" />
                  </button>
                </header>

                <div className="flex items-start gap-2.5 border-b border-red-500/20 bg-red-500/10 px-5 py-3 text-sm text-red-600 dark:text-red-400">
                  <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                  <p>This cannot be undone.</p>
                </div>

                <div className="space-y-4 px-5 py-5">
                  <div id={`${id}-help`} className="space-y-2 text-sm leading-6 text-muted-foreground">
                    <p>
                      <strong className="text-foreground">{domain}</strong> will send visitors to{" "}
                      {rootDomain}. Its text and faculty list can’t be recovered.
                    </p>
                    {studentCount > 0 ? (
                      <p>
                        {studentCount === 1 ? "1 student" : `${studentCount} students`} picked a
                        faculty here. They stay in that faculty but are no longer locked to it.
                        Their payments are kept.
                      </p>
                    ) : null}
                  </div>
                  <label htmlFor={id} className="block text-sm">
                    To confirm, type{" "}
                    <span className="break-all rounded bg-muted px-1.5 py-0.5 font-mono font-semibold">
                      {slug}
                    </span>{" "}
                    below
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
                    className="min-h-11 w-full rounded-lg border border-border bg-background px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-red-500/40"
                  />
                  {error ? (
                    <p id={`${id}-error`} role="alert" className="text-sm text-red-600 dark:text-red-400">
                      {error}
                    </p>
                  ) : null}
                  <button
                    type="submit"
                    disabled={busy || !matches}
                    aria-busy={busy}
                    className="inline-flex min-h-11 w-full items-center justify-center rounded-lg bg-red-600 px-4 text-sm font-semibold text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {busy ? "Deleting…" : "Delete this website"}
                  </button>
                </div>
              </form>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
