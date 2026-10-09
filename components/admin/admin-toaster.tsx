"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { CircleAlert, CircleCheck, Info, LoaderCircle, X } from "lucide-react";

/**
 * Admin notifications. Anything in the admin area calls `toast.success(...)`
 * etc.; one <AdminToaster/> (mounted by the admin frame) shows them in the
 * bottom-right corner, so a result never pushes the page around or hides under
 * the button that caused it.
 */

type Tone = "success" | "error" | "info" | "loading";
type ToastAction = { label: string; href?: string; external?: boolean; onClick?: () => void };
type ToastOptions = { description?: string; action?: ToastAction; duration?: number; id?: string };
type ToastItem = ToastOptions & { id: string; tone: Tone; title: string };

let items: ToastItem[] = [];
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((listener) => listener());
let counter = 0;

function show(tone: Tone, title: string, options: ToastOptions = {}) {
  const id = options.id ?? `t${++counter}`;
  const next: ToastItem = { ...options, id, tone, title };
  // Reusing an id replaces that toast in place ("Publishing…" → "Published").
  items = items.some((item) => item.id === id)
    ? items.map((item) => (item.id === id ? next : item))
    : [...items, next].slice(-4);
  emit();
  return id;
}

export const toast = {
  success: (title: string, options?: ToastOptions) => show("success", title, options),
  error: (title: string, options?: ToastOptions) => show("error", title, options),
  info: (title: string, options?: ToastOptions) => show("info", title, options),
  /** Stays until replaced (same id) or dismissed. */
  loading: (title: string, options?: ToastOptions) => show("loading", title, options),
  dismiss(id: string) {
    items = items.filter((item) => item.id !== id);
    emit();
  },
};

/** Error message from a caught value, with a fallback. */
export function messageOf(cause: unknown, fallback: string) {
  return cause instanceof Error && cause.message ? cause.message : fallback;
}

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};
const snapshot = () => items;
const empty: ToastItem[] = [];

export function AdminToaster() {
  const list = useSyncExternalStore(subscribe, snapshot, () => empty);
  return (
    <div
      aria-live="polite"
      className="pointer-events-none fixed inset-x-4 bottom-4 z-[70] flex flex-col items-end gap-2 sm:inset-x-auto sm:right-5 sm:bottom-5 sm:w-[380px]"
    >
      {list.map((item) => (
        <ToastCard key={item.id} item={item} />
      ))}
    </div>
  );
}

const toneStyle: Record<Tone, { icon: typeof Info; className: string; bar: string }> = {
  success: { icon: CircleCheck, className: "text-emerald-600 dark:text-emerald-400", bar: "bg-emerald-500" },
  error: { icon: CircleAlert, className: "text-red-600 dark:text-red-400", bar: "bg-red-500" },
  info: { icon: Info, className: "text-blue-600 dark:text-blue-400", bar: "bg-blue-500" },
  loading: { icon: LoaderCircle, className: "text-muted-foreground", bar: "bg-muted-foreground/40" },
};

function ToastCard({ item }: { item: ToastItem }) {
  const [paused, setPaused] = useState(false);
  const left = useRef<number | null>(null);
  const duration =
    item.duration ?? (item.tone === "loading" ? Infinity : item.tone === "error" ? 8000 : item.action ? 7000 : 4500);

  // The clock restarts whenever the toast is replaced in place.
  useEffect(() => {
    left.current = duration;
  }, [item, duration]);

  useEffect(() => {
    if (paused || !Number.isFinite(duration)) return;
    const started = Date.now();
    const remaining = left.current ?? duration;
    const timer = window.setTimeout(() => toast.dismiss(item.id), remaining);
    return () => {
      window.clearTimeout(timer);
      left.current = Math.max(800, remaining - (Date.now() - started));
    };
  }, [paused, item, duration]);

  const { icon: Icon, className, bar } = toneStyle[item.tone];
  const actionClass =
    "mt-2 inline-flex min-h-8 items-center rounded-md bg-blue-600 px-3 text-xs font-medium text-white hover:bg-blue-700";

  return (
    <div
      role={item.tone === "error" ? "alert" : "status"}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      className="pointer-events-auto relative flex w-full gap-3 overflow-hidden rounded-xl border border-border bg-card py-3 pl-4 pr-10 text-foreground shadow-lg animate-in fade-in slide-in-from-bottom-2 duration-200 motion-reduce:animate-none"
    >
      <span className={`absolute inset-y-0 left-0 w-1 ${bar}`} aria-hidden="true" />
      <Icon
        size={18}
        aria-hidden="true"
        className={`mt-px shrink-0 ${className} ${item.tone === "loading" ? "animate-spin motion-reduce:animate-none" : ""}`}
      />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium leading-5">{item.title}</p>
        {item.description ? (
          <p className="mt-0.5 text-xs leading-5 text-muted-foreground">{item.description}</p>
        ) : null}
        {item.action ? (
          item.action.href ? (
            item.action.external ? (
              <a href={item.action.href} target="_blank" rel="noopener noreferrer" className={actionClass}>
                {item.action.label}
              </a>
            ) : (
              <Link href={item.action.href} className={actionClass}>
                {item.action.label}
              </Link>
            )
          ) : (
            <button
              type="button"
              className={actionClass}
              onClick={() => {
                item.action?.onClick?.();
                toast.dismiss(item.id);
              }}
            >
              {item.action.label}
            </button>
          )
        ) : null}
      </div>
      {item.tone !== "loading" ? (
        <button
          type="button"
          onClick={() => toast.dismiss(item.id)}
          aria-label="Dismiss"
          className="absolute right-2 top-2 grid size-7 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <X size={14} />
        </button>
      ) : null}
    </div>
  );
}
