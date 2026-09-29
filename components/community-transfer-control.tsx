"use client";

import { useEffect, useId, useMemo, useRef, useState, type FormEvent } from "react";
import { createPortal } from "react-dom";
import { ArrowRightLeft, Mail, Search, TriangleAlert, X } from "lucide-react";

const focus =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-strong focus-visible:ring-offset-2 focus-visible:ring-offset-bg-primary";

type Candidate = { userId: string; name: string };
type Pending = { toUserId: string; toName: string; toEmail: string; expiresAt: string };

function sameName(typed: string, name: string) {
  const clean = (value: string) => value.trim().replace(/\s+/g, " ");
  return clean(typed) !== "" && clean(typed) === clean(name);
}

function initials(name: string) {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join("") || "?"
  );
}

function formatExpiry(value: string) {
  return new Intl.DateTimeFormat("en", { month: "short", day: "numeric" }).format(new Date(value));
}

/**
 * Hand a faculty to one of its members. The creator picks a member and types
 * the faculty's name; the member is emailed a link and ownership moves only
 * once they accept it (lib/data/community-ownership-transfer.ts).
 */
export function CommunityTransferControl({ slug, name }: { slug: string; name: string }) {
  const [loaded, setLoaded] = useState(false);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [pending, setPending] = useState<Pending | null>(null);
  const [loadError, setLoadError] = useState("");
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [devLink, setDevLink] = useState("");
  const trigger = useRef<HTMLButtonElement>(null);
  const search = useRef<HTMLInputElement>(null);
  const inFlight = useRef(false);
  const id = useId();

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/communities/${encodeURIComponent(slug)}/ownership-transfer`, {
      headers: { Accept: "application/json" },
    })
      .then(async (response) => {
        const payload = await response.json().catch(() => ({}));
        if (cancelled) return;
        if (!response.ok) throw new Error(payload.error || "Could not load members.");
        setCandidates(Array.isArray(payload.candidates) ? payload.candidates : []);
        setPending(payload.pending || null);
      })
      .catch((failure) => {
        if (!cancelled) setLoadError(failure instanceof Error ? failure.message : "Could not load members.");
      })
      .finally(() => {
        if (!cancelled) setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, [slug]);

  useEffect(() => {
    if (!open) return;
    search.current?.focus();
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

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return needle
      ? candidates.filter((candidate) => candidate.name.toLowerCase().includes(needle))
      : candidates;
  }, [candidates, query]);
  const chosen = candidates.find((candidate) => candidate.userId === selected);
  const matches = sameName(confirmation, name);

  function close() {
    if (inFlight.current) return;
    setOpen(false);
    setQuery("");
    setSelected("");
    setConfirmation("");
    setError("");
    trigger.current?.focus();
  }

  async function send(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (inFlight.current || !chosen || !matches) return;
    inFlight.current = true;
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`/api/communities/${encodeURIComponent(slug)}/ownership-transfer`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ toUserId: chosen.userId, confirmation }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.pending) {
        throw new Error(payload.error || "Could not send the transfer. Try again.");
      }
      setPending(payload.pending);
      setDevLink(typeof payload.devLink === "string" ? payload.devLink : "");
      inFlight.current = false;
      close();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Could not send the transfer. Try again.");
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  async function cancel() {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setLoadError("");
    try {
      const response = await fetch(`/api/communities/${encodeURIComponent(slug)}/ownership-transfer`, {
        method: "DELETE",
        headers: { Accept: "application/json" },
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "Could not cancel the transfer.");
      setPending(null);
      setDevLink("");
    } catch (failure) {
      setLoadError(failure instanceof Error ? failure.message : "Could not cancel the transfer.");
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  const noMembers = loaded && !loadError && candidates.length === 0;

  return (
    <div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">Transfer ownership</p>
          <p className="mt-1 text-sm text-text-secondary">
            {pending ? (
              <>
                Waiting for <strong className="text-text-primary">{pending.toName}</strong>
                {pending.toEmail ? ` (${pending.toEmail})` : ""} to accept. The link expires{" "}
                {formatExpiry(pending.expiresAt)}.
              </>
            ) : noMembers ? (
              "Only a member can take over. Nobody else has joined yet."
            ) : (
              "Make one of its members the creator. They get an email and must accept."
            )}
          </p>
          {loadError ? (
            <p role="alert" className="mt-1 text-sm text-destructive">
              {loadError}
            </p>
          ) : null}
          {devLink ? (
            <p className="mt-2 break-all rounded-md bg-bg-secondary px-2 py-1.5 font-mono text-xs text-text-secondary">
              Email is not configured here. Accept link: {devLink}
            </p>
          ) : null}
        </div>
        <div className="flex shrink-0 gap-2">
          {pending ? (
            <button
              type="button"
              onClick={cancel}
              disabled={busy}
              className={`inline-flex min-h-10 items-center justify-center rounded-lg border border-border bg-bg-primary px-4 text-sm font-medium transition hover:bg-bg-secondary disabled:opacity-50 ${focus}`}
            >
              Cancel transfer
            </button>
          ) : null}
          <button
            ref={trigger}
            type="button"
            aria-haspopup="dialog"
            onClick={() => setOpen(true)}
            disabled={!loaded || Boolean(loadError) || noMembers || busy}
            className={`inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-destructive/40 bg-bg-primary px-4 text-sm font-medium text-destructive transition hover:bg-destructive hover:text-white disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-bg-primary disabled:hover:text-destructive ${focus}`}
          >
            <ArrowRightLeft className="size-4" aria-hidden="true" />
            {pending ? "Send to someone else" : "Transfer ownership"}
          </button>
        </div>
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
                onSubmit={send}
                onKeyDown={(event) => {
                  if (event.key === "Escape") {
                    event.preventDefault();
                    close();
                  }
                }}
                // Solid panel that rises in; no opacity fade (see teacher modal flicker).
                className="flex max-h-[calc(100dvh-2rem)] w-full max-w-md flex-col overflow-hidden rounded-xl border border-border bg-bg-primary shadow-xl animate-in zoom-in-[0.98] slide-in-from-bottom-2 duration-200 motion-reduce:animate-none"
              >
                <header className="flex items-center gap-3 border-b border-border px-5 py-4">
                  <h2 id={`${id}-title`} className="min-w-0 flex-1 truncate font-display text-base font-semibold">
                    Transfer {name}
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
                  <p>Once they accept, you become a member and lose creator access.</p>
                </div>

                <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-5">
                  {pending ? (
                    <p className="text-sm text-text-secondary">
                      Sending a new transfer withdraws the one waiting for {pending.toName}.
                    </p>
                  ) : null}
                  <fieldset>
                    <legend className="mb-2 text-sm font-medium">New creator</legend>
                    <div className="relative">
                      <Search
                        className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-text-muted"
                        aria-hidden="true"
                      />
                      <input
                        ref={search}
                        type="search"
                        value={query}
                        onChange={(event) => setQuery(event.target.value)}
                        placeholder="Search members"
                        aria-label="Search members"
                        disabled={busy}
                        className={`min-h-10 w-full rounded-lg border border-border bg-bg-primary pl-9 pr-3 text-sm ${focus}`}
                      />
                    </div>
                    <div className="mt-2 max-h-52 overflow-y-auto rounded-lg border border-border">
                      {visible.length ? (
                        visible.map((candidate) => (
                          <label
                            key={candidate.userId}
                            className="flex min-h-12 cursor-pointer items-center gap-3 border-b border-border px-3 last:border-b-0 hover:bg-bg-secondary has-[:checked]:bg-bg-secondary"
                          >
                            <input
                              type="radio"
                              name={`${id}-member`}
                              value={candidate.userId}
                              checked={selected === candidate.userId}
                              onChange={() => {
                                setSelected(candidate.userId);
                                setError("");
                              }}
                              disabled={busy}
                              className="size-4 accent-text-primary"
                            />
                            <span className="grid size-8 shrink-0 place-items-center rounded-full bg-bg-secondary text-xs font-semibold">
                              {initials(candidate.name)}
                            </span>
                            <span className="min-w-0 flex-1 truncate text-sm">{candidate.name}</span>
                          </label>
                        ))
                      ) : (
                        <p className="px-3 py-6 text-center text-sm text-text-secondary">
                          No member matches &ldquo;{query}&rdquo;.
                        </p>
                      )}
                    </div>
                  </fieldset>

                  <label htmlFor={id} className="block text-sm">
                    To confirm, type{" "}
                    <span className="break-all rounded bg-bg-secondary px-1.5 py-0.5 font-mono font-semibold text-text-primary">
                      {name}
                    </span>{" "}
                    in the box below
                  </label>
                  <input
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
                    disabled={busy || !chosen || !matches}
                    aria-busy={busy}
                    className={`inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-destructive px-4 text-sm font-semibold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40 ${focus}`}
                  >
                    <Mail className="size-4" aria-hidden="true" />
                    {busy
                      ? "Sending…"
                      : chosen
                        ? `Email ${chosen.name} to accept`
                        : "Choose a member"}
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
