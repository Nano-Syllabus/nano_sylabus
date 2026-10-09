"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import {
  ArrowLeft,
  CreditCard,
  Globe,
  GraduationCap,
  LayoutDashboard,
  PanelLeftClose,
  PanelLeftOpen,
  Trophy,
  Users,
} from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";
import { AdminToaster } from "@/components/admin/admin-toaster";

export type AdminSection = "overview" | "users" | "faculties" | "billing" | "cash-prize" | "sites";

/** Cookie the server reads (admin-billing-frame) so a collapsed sidebar paints collapsed. */
const ADMIN_NAV_COOKIE = "admin_nav";

const sections: Array<{ id: AdminSection; href: string; label: string; icon: typeof Users }> = [
  { id: "overview", href: "/admin", label: "Overview", icon: LayoutDashboard },
  { id: "users", href: "/admin/users", label: "Users", icon: Users },
  { id: "faculties", href: "/admin/faculties", label: "Faculties", icon: GraduationCap },
  { id: "billing", href: "/admin/billing", label: "Payments", icon: CreditCard },
  { id: "cash-prize", href: "/admin/cash-prize", label: "Prize draw", icon: Trophy },
  { id: "sites", href: "/admin/sites", label: "Websites", icon: Globe },
];

/**
 * The admin workspace: a sidebar that collapses to icons (remembered per
 * browser), the page, and the toast corner every admin action reports to.
 */
export function AdminFrameShell({
  children,
  active,
  wide,
  initialCollapsed,
}: {
  children: ReactNode;
  active: AdminSection;
  wide: boolean;
  initialCollapsed: boolean;
}) {
  const [collapsed, setCollapsed] = useState(initialCollapsed);

  useEffect(() => {
    document.cookie = `${ADMIN_NAV_COOKIE}=${collapsed ? "collapsed" : "open"}; path=/; max-age=31536000; samesite=lax`;
  }, [collapsed]);

  // Ctrl/⌘ + \ toggles the sidebar, as in most editors.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key === "\\") {
        event.preventDefault();
        setCollapsed((value) => !value);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <a
        href="#admin-workspace-content"
        className="sr-only z-50 rounded-md bg-card p-3 focus:not-sr-only focus:fixed focus:left-3 focus:top-3"
      >
        Skip to admin content
      </a>

      <aside
        className={`fixed inset-y-0 left-0 z-30 hidden flex-col border-r border-border bg-card transition-[width] duration-200 motion-reduce:transition-none lg:flex ${
          collapsed ? "w-[68px]" : "w-60"
        }`}
      >
        <div className={`flex h-16 items-center ${collapsed ? "justify-center" : "justify-between gap-2 pl-5 pr-3"}`}>
          <Link href="/admin" className="flex min-w-0 items-center gap-2.5" title="Admin overview">
            <Image src="/nanologo.png" alt="" width={28} height={28} className="h-7 w-7 shrink-0 object-contain" />
            {collapsed ? null : (
              <span className="truncate font-display text-base font-semibold tracking-tight">Admin</span>
            )}
          </Link>
          {collapsed ? null : (
            <button
              type="button"
              onClick={() => setCollapsed(true)}
              aria-label="Collapse sidebar"
              title="Collapse sidebar (Ctrl + \)"
              className="grid size-8 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <PanelLeftClose size={17} />
            </button>
          )}
        </div>

        <nav aria-label="Admin navigation" className={`mt-1 space-y-1 ${collapsed ? "px-2.5" : "px-3"}`}>
          {sections.map(({ id, href, label, icon: Icon }) => {
            const current = active === id;
            return (
              <Link
                key={id}
                href={href}
                aria-current={current ? "page" : undefined}
                aria-label={collapsed ? label : undefined}
                className={`group relative flex min-h-10 items-center gap-3 rounded-lg text-sm font-medium transition-colors ${
                  collapsed ? "justify-center px-0" : "px-3"
                } ${
                  current
                    ? "bg-blue-600/10 text-blue-700 dark:text-blue-300"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                }`}
              >
                {current && !collapsed ? (
                  <span className="absolute inset-y-2 left-0 w-0.5 rounded-full bg-blue-600" aria-hidden="true" />
                ) : null}
                <Icon size={18} strokeWidth={1.8} aria-hidden="true" className="shrink-0" />
                {collapsed ? (
                  // Hover label, since the text is hidden.
                  <span
                    role="tooltip"
                    className="pointer-events-none absolute left-full z-40 ml-3 hidden whitespace-nowrap rounded-md bg-foreground px-2 py-1 text-xs font-medium text-background shadow-md group-hover:block group-focus-visible:block"
                  >
                    {label}
                  </span>
                ) : (
                  <span className="truncate">{label}</span>
                )}
              </Link>
            );
          })}
        </nav>

        <div className={`mt-auto border-t border-border p-3 ${collapsed ? "flex flex-col items-center gap-2" : "space-y-1"}`}>
          {collapsed ? (
            <button
              type="button"
              onClick={() => setCollapsed(false)}
              aria-label="Expand sidebar"
              title="Expand sidebar (Ctrl + \)"
              className="grid size-10 place-items-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <PanelLeftOpen size={18} />
            </button>
          ) : null}
          <div className={collapsed ? "flex flex-col items-center gap-2" : "flex items-center justify-between gap-2"}>
            <Link
              href="/app/today"
              title="Back to app"
              aria-label={collapsed ? "Back to app" : undefined}
              className={`flex min-h-10 items-center gap-2 rounded-lg text-sm text-muted-foreground hover:bg-muted hover:text-foreground ${
                collapsed ? "w-10 justify-center" : "px-3"
              }`}
            >
              <ArrowLeft size={16} />
              {collapsed ? null : "Back to app"}
            </Link>
            <ThemeToggle className="rounded-md bg-card" />
          </div>
        </div>
      </aside>

      <div
        className={`min-w-0 transition-[padding] duration-200 motion-reduce:transition-none ${
          collapsed ? "lg:pl-[68px]" : "lg:pl-60"
        }`}
      >
        <header className="border-b border-border bg-card lg:hidden">
          <div className="flex h-14 items-center justify-between gap-3 px-4">
            <Link href="/admin" className="flex items-center gap-2">
              <Image src="/nanologo.png" alt="" width={24} height={24} className="h-6 w-6 object-contain" />
              <span className="font-display text-sm font-semibold">Admin</span>
            </Link>
            <div className="flex items-center gap-1">
              <Link
                href="/app/today"
                aria-label="Back to app"
                className="flex h-10 w-10 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted"
              >
                <ArrowLeft size={17} />
              </Link>
              <ThemeToggle className="rounded-md bg-card" />
            </div>
          </div>
          <nav aria-label="Mobile admin navigation" className="flex gap-1 overflow-x-auto px-3 pb-2">
            {sections.map(({ id, href, label, icon: Icon }) => (
              <Link
                key={id}
                href={href}
                aria-current={active === id ? "page" : undefined}
                className={`flex min-h-9 shrink-0 items-center gap-2 rounded-lg px-3 text-xs font-medium ${
                  active === id
                    ? "bg-blue-600/10 text-blue-700 dark:text-blue-300"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                }`}
              >
                <Icon size={15} aria-hidden="true" />
                {label}
              </Link>
            ))}
          </nav>
        </header>
        <main
          id="admin-workspace-content"
          className={
            wide
              ? "px-3 py-3 sm:px-4 lg:px-5 lg:py-4"
              : "mx-auto max-w-[1600px] px-4 py-6 sm:px-6 lg:px-8 lg:py-8"
          }
        >
          {children}
        </main>
      </div>
      <AdminToaster />
    </div>
  );
}
