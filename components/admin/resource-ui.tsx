import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function AdminBox({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return <div className={cn("overflow-hidden rounded-none border border-border bg-bg-primary", className)}>{children}</div>;
}

export function AdminBoxHeader({
  title,
  subtitle,
  action,
  className,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-wrap items-start justify-between gap-4 border-b border-border px-4 py-3", className)}>
      <div>
        <div className="text-sm font-semibold">{title}</div>
        {subtitle ? <div className="mt-1 text-xs text-text-secondary">{subtitle}</div> : null}
      </div>
      {action}
    </div>
  );
}

export function AdminBoxBody({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return <div className={cn("px-4 py-4", className)}>{children}</div>;
}

export function AdminStatGrid({
  children,
  columns = "xl:grid-cols-4",
}: {
  children: ReactNode;
  columns?: string;
}) {
  return <div className={cn("grid gap-0 overflow-hidden rounded-none border border-border bg-bg-primary sm:grid-cols-2", columns)}>{children}</div>;
}

export function AdminStatCell({
  label,
  value,
  note,
}: {
  label: string;
  value: ReactNode;
  note?: ReactNode;
}) {
  return (
    <div className="border-r border-border px-4 py-4 last:border-r-0">
      <p className="text-[11px] font-mono-ui uppercase tracking-[0.16em] text-text-muted">{label}</p>
      <p className="mt-2 font-display text-4xl">{value}</p>
      {note ? <p className="mt-2 text-sm text-text-secondary">{note}</p> : null}
    </div>
  );
}

export function AdminListItemButton({
  active,
  onClick,
  title,
  subtitle,
  meta,
}: {
  active?: boolean;
  onClick: () => void;
  title: ReactNode;
  subtitle?: ReactNode;
  meta?: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "w-full border-b border-border px-4 py-3 text-left transition last:border-b-0",
        active ? "bg-[#f7f0b4] text-slate-950" : "bg-bg-primary hover:bg-bg-secondary",
      )}
    >
      <div className="text-sm font-medium">{title}</div>
      {subtitle ? (
        <div className={cn("mt-1 text-xs", active ? "text-slate-700" : "text-text-secondary")}>{subtitle}</div>
      ) : null}
      {meta ? (
        <div className={cn("mt-1 text-[11px]", active ? "text-slate-600" : "text-text-muted")}>{meta}</div>
      ) : null}
    </button>
  );
}

export function AdminListItemLink({
  href,
  title,
  subtitle,
  meta,
}: {
  href: string;
  title: ReactNode;
  subtitle?: ReactNode;
  meta?: ReactNode;
}) {
  return (
    <Link href={href} className="block border-b border-border px-4 py-3 transition last:border-b-0 hover:bg-bg-secondary">
      <div className="text-sm font-medium">{title}</div>
      {subtitle ? <div className="mt-1 text-xs text-text-secondary">{subtitle}</div> : null}
      {meta ? <div className="mt-1 text-[11px] text-text-muted">{meta}</div> : null}
    </Link>
  );
}

export function AdminEmpty({
  children,
}: {
  children: ReactNode;
}) {
  return <div className="px-4 py-8 text-center text-sm text-text-secondary">{children}</div>;
}

export function AdminDataTable({
  columns,
  rows,
  empty,
}: {
  columns: string[];
  rows: ReactNode[][];
  empty: ReactNode;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-left text-sm">
        <thead className="bg-bg-secondary text-text-secondary">
          <tr>
            {columns.map((column) => (
              <th key={column} className="border-b border-border px-4 py-2 font-mono-ui text-[11px] uppercase tracking-[0.14em]">
                {column}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length ? (
            rows.map((row, rowIndex) => (
              <tr key={rowIndex} className="border-b border-border last:border-b-0">
                {row.map((cell, cellIndex) => (
                  <td key={cellIndex} className="px-4 py-3 align-top text-text-primary">
                    {cell}
                  </td>
                ))}
              </tr>
            ))
          ) : (
            <tr>
              <td colSpan={columns.length} className="px-4 py-8 text-center text-text-secondary">
                {empty}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
