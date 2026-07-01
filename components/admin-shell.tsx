"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import { ADMIN_SURFACES } from "@/lib/admin-registry";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { cn } from "@/lib/utils";

export function AdminShell({
  title,
  subtitle,
  children,
}: {
  title: ReactNode;
  subtitle?: string;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();

  const crumbs = pathname
    .split("/")
    .filter(Boolean)
    .slice(0)
    .map((segment, index, array) => {
      const href = `/${array.slice(0, index + 1).join("/")}`;
      return {
        href,
        label:
          segment === "admin"
            ? "Admin"
            : segment
                .replace(/-/g, " ")
                .replace(/\b\w/g, (letter) => letter.toUpperCase()),
      };
    });

  function isActive(href: string) {
    if (href === "/admin") return pathname === "/admin";
    return pathname.startsWith(href);
  }

  async function handleLogout() {
    const supabase = createSupabaseBrowserClient();
    await supabase.auth.signOut();
    router.replace("/login");
    router.refresh();
  }

  return (
    <div className="min-h-screen bg-bg-primary text-text-primary">
      <div className="border-b border-border bg-bg-secondary text-text-primary">
        <div className="mx-auto flex max-w-[1600px] items-center justify-between px-5 py-4 md:px-8">
          <div className="flex items-center gap-4">
            <p className="font-display text-4xl leading-none">Nano Syllabus administration</p>
            <span className="hidden text-sm text-text-secondary lg:inline">Manage students, billing, and answer quality</span>
          </div>
          <div className="flex items-center gap-3 text-sm text-text-secondary">
            <span className="hidden md:inline">Welcome, admin</span>
            <Link href="/app/chat" className="hover:text-text-primary">
              View site
            </Link>
            <ThemeToggle />
            <Button variant="outline" size="sm" onClick={handleLogout}>
              Log out
            </Button>
          </div>
        </div>
      </div>

      <div className="mx-auto flex min-h-[calc(100vh-73px)] max-w-[1600px]">
        <aside className="hidden w-[280px] border-r border-border bg-bg-primary md:flex md:flex-col">
          <div className="border-b border-border px-5 py-4">
            <input
              readOnly
              value=""
              placeholder="Start typing to filter..."
              className="h-10 w-full rounded-none border border-border bg-bg-secondary px-3 text-sm text-text-primary placeholder:text-text-muted"
            />
          </div>
          <div className="border-b border-border bg-bg-tertiary px-5 py-2">
            <p className="text-[11px] font-mono-ui uppercase tracking-[0.18em] text-text-secondary">Admin sections</p>
          </div>
          <nav className="flex flex-col">
          {ADMIN_SURFACES.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex min-h-11 items-center gap-3 border-b border-border px-5 py-3 text-sm transition-colors",
                isActive(item.href)
                  ? "bg-bg-tertiary text-text-primary"
                  : "text-text-secondary hover:bg-bg-primary hover:text-text-primary",
              )}
            >
              <span className="w-5 text-center text-base opacity-80">{item.icon}</span>
              <span>{item.navLabel}</span>
            </Link>
          ))}
          </nav>
          <div className="mt-auto border-t border-border px-5 py-4">
            <Link href="/app/chat" className="text-sm text-text-secondary hover:text-text-primary">
              ← Back to student app
            </Link>
          </div>
        </aside>

        <main className="flex min-w-0 flex-1 flex-col bg-bg-primary">
          <div className="border-b border-border bg-bg-secondary px-5 py-3 md:px-8">
            <div className="flex flex-wrap items-center gap-2 text-sm text-text-secondary">
              {crumbs.map((crumb, index) => (
                <div key={crumb.href} className="flex items-center gap-2">
                  {index > 0 ? <span className="text-text-muted">›</span> : null}
                  <Link href={crumb.href} className={cn(index === crumbs.length - 1 ? "text-text-primary" : "hover:text-text-primary")}>
                    {crumb.label}
                  </Link>
                </div>
              ))}
            </div>
          </div>
          <header className="border-b border-border bg-bg-primary px-5 py-5 md:px-8">
            <h1 className="font-display text-4xl">{title}</h1>
            {subtitle ? <p className="mt-2 max-w-4xl text-sm text-text-secondary">{subtitle}</p> : null}
          </header>
          <div className="flex-1">{children}</div>
        </main>
      </div>
    </div>
  );
}
