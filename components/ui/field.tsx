"use client";

import type {
  ChangeEvent,
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from "react";
import { Children, isValidElement, useEffect, useMemo, useRef, useState } from "react";
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

export function Select(
  props: SelectHTMLAttributes<HTMLSelectElement> & { invalid?: boolean },
) {
  const {
    className,
    disabled,
    invalid,
    onChange,
    value,
    defaultValue,
    children,
    ...rest
  } = props;
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const [placement, setPlacement] = useState<"top" | "bottom">("bottom");
  const selectedValue = String(value ?? defaultValue ?? "");

  const options = useMemo(() => {
    return Children.toArray(children)
      .filter(isValidElement)
      .filter((child) => child.type === "option")
      .map((child) => {
        const optionProps = child.props as {
          children?: ReactNode;
          disabled?: boolean;
          value?: string | number;
        };
        const label = Children.toArray(optionProps.children).join("");
        const optionValue = optionProps.value ?? label;
        return {
          disabled: Boolean(optionProps.disabled),
          label,
          value: String(optionValue),
        };
      });
  }, [children]);

  const selectedOption = options.find((option) => option.value === selectedValue);
  const selectedLabel = selectedOption?.label || options[0]?.label || "";

  useEffect(() => {
    if (!open) return;

    if (containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      const spaceBelow = window.innerHeight - rect.bottom;
      const spaceAbove = rect.top;
      if (spaceBelow < 250 && spaceAbove > spaceBelow) {
        setPlacement("top");
      } else {
        setPlacement("bottom");
      }
    }

    const closeOnOutsideClick = (event: globalThis.MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };

    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };

    document.addEventListener("mousedown", closeOnOutsideClick);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("mousedown", closeOnOutsideClick);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  function selectValue(nextValue: string) {
    setOpen(false);
    onChange?.({ target: { value: nextValue } } as ChangeEvent<HTMLSelectElement>);
  }

  return (
    <div ref={containerRef} className="relative">
      <select
        {...rest}
        disabled={disabled}
        value={value}
        defaultValue={defaultValue}
        onChange={onChange}
        data-invalid={invalid ? "true" : "false"}
        className="sr-only"
        tabIndex={-1}
      >
        {children}
      </select>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((current) => !current)}
        className={cn(
          "admin-input flex h-11 w-full items-center justify-between rounded-md border bg-bg-primary px-3 text-left text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-border-strong/40",
          invalid ? "border-destructive" : "border-border",
          disabled && "cursor-not-allowed opacity-50",
          className,
        )}
      >
        <span className={!selectedValue ? "text-text-muted" : ""}>{selectedLabel}</span>
        <svg
          aria-hidden="true"
          className={cn("h-4 w-4 shrink-0 text-text-muted transition", open && "rotate-180")}
          viewBox="0 0 16 16"
          fill="none"
        >
          <path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {open ? (
        <div 
          className={cn(
            "absolute left-0 z-50 max-h-56 w-full overflow-y-auto rounded-md border border-border bg-bg-primary p-1 shadow-2xl sm:max-h-64",
            placement === "top" ? "bottom-[calc(100%+4px)]" : "top-[calc(100%+4px)]"
          )}
        >
          {options.map((option) => {
            const selected = option.value === selectedValue;
            return (
              <button
                key={option.value}
                type="button"
                disabled={option.disabled}
                onClick={() => selectValue(option.value)}
                className={cn(
                  "flex w-full items-center gap-2 rounded-sm px-3 py-2 text-left text-sm transition-colors",
                  selected
                    ? "bg-bg-tertiary text-text-primary font-medium"
                    : "text-text-secondary hover:bg-bg-tertiary hover:text-text-primary",
                  option.disabled && "cursor-not-allowed opacity-60",
                )}
              >
                <span className="flex w-4 shrink-0 justify-center">
                  {selected ? (
                    <svg aria-hidden="true" className="h-4 w-4" viewBox="0 0 16 16" fill="none">
                      <path d="M3 8l3 3 7-7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  ) : null}
                </span>
                <span>{option.label}</span>
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
