import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/utils";

type Variant = "filled" | "outline" | "ghost" | "danger";
type Size = "sm" | "md" | "lg";

const variants: Record<Variant, string> = {
  filled: "bg-text-primary text-text-inverse hover:opacity-90 disabled:opacity-50",
  outline:
    "border border-border-strong text-text-primary hover:bg-bg-secondary disabled:opacity-50",
  ghost: "text-text-secondary hover:text-text-primary hover:bg-bg-secondary",
  danger:
    "border border-destructive text-destructive hover:bg-destructive hover:text-white",
};

const sizes: Record<Size, string> = {
  sm: "h-8 px-3 text-xs",
  md: "h-10 px-4 text-sm",
  lg: "h-12 px-6 text-base",
};

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  children: ReactNode;
}

export function Button({
  variant = "filled",
  size = "md",
  className,
  children,
  ...props
}: Props) {
  return (
    <button
      {...props}
      data-size={size}
      data-variant={variant}
      className={cn(
        "admin-btn inline-flex items-center justify-center gap-2 rounded-full font-medium transition",
        variants[variant],
        sizes[size],
        className,
      )}
    >
      {children}
    </button>
  );
}
