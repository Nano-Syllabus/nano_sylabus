import type {
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from "react";
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
  const { className, invalid, children, ...rest } = props;
  return (
    <select
      {...rest}
      data-invalid={invalid ? "true" : "false"}
      className={cn(
        "admin-input block h-11 w-full rounded-md border bg-bg-primary px-3 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-border-strong/40",
        invalid ? "border-destructive" : "border-border",
        className,
      )}
    >
      {children}
    </select>
  );
}
