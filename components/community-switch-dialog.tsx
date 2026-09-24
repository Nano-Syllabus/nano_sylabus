"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, LazyMotion, domAnimation, m } from "motion/react";
import { Loader2, X } from "lucide-react";
import { titleCase } from "@/lib/utils";

export type SwitchCommunity = { slug: string; name: string; university?: string };

/**
 * A student can be a member of one faculty they do not own. Joining a second
 * one used to fail with that rule as an error; this asks instead, naming both
 * sides, and on confirm leaves the old faculty and joins the new one.
 *
 * Portalled to <body>: the cards it opens from lift with a transform on hover,
 * and a transformed ancestor would pin a `position: fixed` overlay to the card.
 */
export function CommunitySwitchDialog({
  open,
  from,
  to,
  onClose,
  onSwitched,
}: {
  open: boolean;
  from: SwitchCommunity | null;
  to: SwitchCommunity;
  onClose: () => void;
  onSwitched: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [left, setLeft] = useState(false);
  const stayButton = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    setError("");
    setLeft(false);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const focusTimer = window.setTimeout(() => stayButton.current?.focus(), 80);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.clearTimeout(focusTimer);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && !busy) onClose();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, busy, onClose]);

  async function confirmSwitch() {
    if (!from || busy) return;
    setBusy(true);
    setError("");
    try {
      // A retry after a failed join must not try to leave a second time.
      if (!left) {
        const leaving = await fetch(`/api/communities/${encodeURIComponent(from.slug)}/membership`, {
          method: "DELETE",
          headers: { Accept: "application/json" },
        });
        const leftPayload = (await leaving.json().catch(() => ({}))) as { left?: boolean; error?: string };
        if (!leaving.ok || leftPayload.left !== true) {
          throw new Error(leftPayload.error || `Could not leave ${titleCase(from.name)}. Nothing was changed.`);
        }
        setLeft(true);
      }
      const joining = await fetch(`/api/communities/${encodeURIComponent(to.slug)}/join`, {
        method: "POST",
        headers: { Accept: "application/json" },
      });
      const joinPayload = (await joining.json().catch(() => ({}))) as { error?: string };
      if (!joining.ok) {
        throw new Error(
          `You left ${titleCase(from.name)}, but joining ${titleCase(to.name)} failed: ${
            joinPayload.error || "try again."
          }`,
        );
      }
      onSwitched();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Could not switch. Try again.");
    } finally {
      setBusy(false);
    }
  }

  if (typeof document === "undefined") return null;

  return createPortal(
    <LazyMotion features={domAnimation} strict>
      <AnimatePresence>
        {open && from ? (
          <m.div
            key="switch-overlay"
            className="ns-cf-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18, ease: "easeOut" }}
            onClick={(event) => {
              if (event.target === event.currentTarget && !busy) onClose();
            }}
          >
            <m.section
              className="ns-sw"
              role="alertdialog"
              aria-modal="true"
              aria-labelledby="ns-switch-title"
              aria-describedby="ns-switch-note"
              initial={{ opacity: 0, y: 16, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 8, scale: 0.98 }}
              transition={{ type: "spring", stiffness: 400, damping: 32, mass: 0.7 }}
            >
              <header className="ns-sw-head">
                <div>
                  <h2 id="ns-switch-title">Switch faculty?</h2>
                  <p>You can be a member of one faculty at a time.</p>
                </div>
                <button type="button" className="ns-cf-close" onClick={onClose} disabled={busy} aria-label="Close">
                  <X aria-hidden="true" />
                </button>
              </header>

              <div className="ns-sw-route">
                <div className="ns-sw-side ns-sw-side--from">
                  <span className="ns-sw-tag">From</span>
                  <strong>{titleCase(from.name)}</strong>
                  <span>{left ? "Left" : "You will leave this faculty"}</span>
                </div>
                <span className="ns-sw-arrow" aria-hidden="true">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M4 12h15m-6-6 6 6-6 6" />
                  </svg>
                </span>
                <div className="ns-sw-side ns-sw-side--to">
                  <span className="ns-sw-tag">To</span>
                  <strong>{titleCase(to.name)}</strong>
                  <span>{to.university || "You will join this faculty"}</span>
                </div>
              </div>

              <p id="ns-switch-note" className="ns-sw-note">
                Your past answers, results and progress stay saved. Faculties you create yourself don&apos;t
                count toward this limit.
              </p>

              {error ? (
                <p className="ns-sw-error" role="alert">
                  {error}
                </p>
              ) : null}

              <footer className="ns-sw-foot">
                <button ref={stayButton} type="button" className="ns-cf-cancel" onClick={onClose} disabled={busy}>
                  {left ? "Close" : `Stay in ${titleCase(from.name)}`}
                </button>
                <button
                  type="button"
                  className="ns-cf-submit"
                  onClick={() => void confirmSwitch()}
                  disabled={busy}
                  aria-busy={busy}
                >
                  {busy ? (
                    <>
                      <Loader2 className="animate-spin" aria-hidden="true" /> Switching…
                    </>
                  ) : error ? (
                    "Try again"
                  ) : (
                    `Switch to ${titleCase(to.name)}`
                  )}
                </button>
              </footer>
            </m.section>
          </m.div>
        ) : null}
      </AnimatePresence>
    </LazyMotion>,
    document.body,
  );
}
