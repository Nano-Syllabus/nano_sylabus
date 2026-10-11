import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Only unknown values animate; their surrounding layout stays still. */
export function Skeleton({ className, ...props }: ComponentProps<"div">) {
  return (
    <div {...props} aria-hidden="true" className={cn("loading-skeleton rounded-md", className)} />
  );
}

export function LoadingStatus({
  label = "Loading",
  className,
}: {
  label?: ReactNode;
  className?: string;
}) {
  return (
    <span
      role="status"
      className={cn("inline-flex items-center gap-2.5 text-xs text-text-muted", className)}
    >
      <span className="loading-dots" aria-hidden="true">
        <i />
        <i />
        <i />
      </span>
      <span>{label}</span>
    </span>
  );
}
