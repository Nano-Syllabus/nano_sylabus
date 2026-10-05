"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { X, ZoomIn } from "lucide-react";

/**
 * Wraps a small payment QR so a tap opens it full screen, large enough to scan
 * from another device. It uses a native modal dialog, which sits above any
 * other modal the QR is already inside, closes on Esc and on a tap outside it.
 */
export function QrZoom({
  src,
  alt,
  children,
  className = "",
}: {
  src: string;
  alt: string;
  /** The thumbnail shown in place. */
  children: ReactNode;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const element = dialog.current;
    if (!element) return;
    if (open && !element.open) element.showModal();
    if (!open && element.open) element.close();
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={`Open ${alt} full screen`}
        className={`group relative block cursor-zoom-in focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 ${className}`}
      >
        {children}
        <span
          aria-hidden="true"
          className="absolute bottom-2 right-2 inline-flex size-7 items-center justify-center rounded-full bg-black/60 text-white opacity-90 transition group-hover:opacity-100"
        >
          <ZoomIn size={14} />
        </span>
      </button>
      <dialog
        ref={dialog}
        onClose={() => setOpen(false)}
        onClick={(event) => event.target === dialog.current && setOpen(false)}
        aria-label={alt}
        className="m-0 h-dvh max-h-none w-screen max-w-none bg-transparent p-0 backdrop:bg-black/90"
      >
        {open ? (
          <div className="flex h-full w-full items-center justify-center p-4 sm:p-8">
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close"
              className="absolute right-4 top-4 inline-flex size-11 items-center justify-center rounded-full bg-white/15 text-white backdrop-blur transition hover:bg-white/25"
            >
              <X size={22} />
            </button>
            {/* The QR may be hosted on any HTTPS origin the billing admin set. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={src}
              alt={alt}
              className="max-h-full max-w-full rounded-2xl bg-white object-contain p-3 shadow-2xl sm:p-5"
            />
          </div>
        ) : null}
      </dialog>
    </>
  );
}
