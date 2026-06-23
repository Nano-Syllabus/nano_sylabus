"use client";

import type {
  InputHTMLAttributes,
  ReactNode,
  TextareaHTMLAttributes,
} from "react";
import { useState, useRef, useEffect, useCallback } from "react";
import { cn } from "@/lib/utils";

export function Field({
  label,
  error,
  hint,
  children,
}: {
  label?: string;
  error?: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <label className="block" style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
      {label ? (
        <span className="text-xs font-medium uppercase tracking-wider text-text-secondary">
          {label}
        </span>
      ) : null}
      {children}
      {error ? (
        <span className="block text-xs text-destructive">{error}</span>
      ) : hint ? (
        <span className="block text-xs text-text-muted">{hint}</span>
      ) : null}
    </label>
  );
}

export function Input(
  props: InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean },
) {
  const { className, invalid, ...rest } = props;
  return (
    <input
      {...rest}
      data-invalid={invalid ? "true" : "false"}
      className={cn(
        "admin-input block h-11 w-full rounded-md border bg-bg-primary px-3 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-border-strong/40",
        invalid ? "border-destructive" : "border-border",
        className,
      )}
    />
  );
}

export function Textarea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const { className, ...rest } = props;
  return (
    <textarea
      {...rest}
      className={cn(
        "admin-input block w-full rounded-md border border-border bg-bg-primary px-3 py-2.5 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-border-strong/40",
        className,
      )}
    />
  );
}

interface SelectProps {
  value?: string;
  onChange?: (event: { target: { value: string } }) => void;
  disabled?: boolean;
  invalid?: boolean;
  className?: string;
  children?: ReactNode;
}

export function Select({ value, onChange, disabled, invalid, className, children }: SelectProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Extract options from children
  const options: { value: string; label: string }[] = [];
  const extractOptions = (nodes: ReactNode) => {
    if (!nodes) return;
    const arr = Array.isArray(nodes) ? nodes : [nodes];
    arr.forEach((child) => {
      if (!child || typeof child !== "object" || !("props" in child)) return;
      if ((child as any).type === "option") {
        const props = (child as any).props;
        options.push({
          value: props.value ?? String(props.children ?? ""),
          label: String(props.children ?? props.value ?? ""),
        });
      }
    });
  };
  extractOptions(children);

  const selectedOption = options.find((opt) => String(opt.value) === String(value));
  const selectedLabel = selectedOption?.label ?? options[0]?.label ?? "";

  const handleSelect = useCallback(
    (optValue: string) => {
      setOpen(false);
      if (onChange) {
        onChange({ target: { value: optValue } });
      }
    },
    [onChange],
  );

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handleClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [open]);

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        disabled={disabled}
        onClick={() => !disabled && setOpen((v) => !v)}
        className={cn(
          "admin-input flex h-11 w-full items-center justify-between rounded-md border bg-bg-primary px-3 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-border-strong/40",
          invalid ? "border-destructive" : "border-border",
          disabled && "cursor-not-allowed opacity-50",
          className,
        )}
      >
        <span className={!value ? "text-text-muted" : ""}>{selectedLabel}</span>
        <svg
          className={cn("h-4 w-4 shrink-0 text-text-muted transition-transform", open && "rotate-180")}
          viewBox="0 0 16 16"
          fill="none"
        >
          <path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {open && (
        <div className="absolute left-0 top-[calc(100%+4px)] z-50 max-h-72 w-full overflow-y-auto rounded-md border border-border bg-bg-primary py-1.5 shadow-lg">
          {options.map((opt, idx) => (
            <button
              key={`${opt.value}-${idx}`}
              type="button"
              onClick={() => handleSelect(opt.value)}
              className={cn(
                "block w-full px-4 py-2.5 text-left text-sm transition-colors hover:bg-bg-tertiary",
                String(opt.value) === String(value)
                  ? "text-text-primary font-medium bg-bg-secondary"
                  : "text-text-secondary",
              )}
            >
              {opt.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
