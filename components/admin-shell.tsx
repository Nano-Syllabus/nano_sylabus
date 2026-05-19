"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { ThemeToggle } from "@/components/theme-toggle";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/admin", label: "Home", icon: "🏠" },
  { href: "/admin/knowledge", label: "Content", icon: "📚" },
  { href: "/admin/answers", label: "Answers", icon: "🤖" },
  { href: "/admin/users", label: "Students", icon: "👥" },
  { href: "/admin/billing", label: "Payments", icon: "🧾" },
  { href: "/admin/prompts", label: "AI Settings", icon: "✍️" },
];

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
    <div className="flex min-h-screen bg-bg-primary text-text-primary">
      <aside className="hidden w-[280px] border-r border-border bg-bg-secondary/50 md:flex md:flex-col">
        <div className="px-4 py-4">
          <div className="rounded-[24px] border border-border bg-bg-primary p-4">
            <p className="font-display text-3xl">Nano Ops</p>
            <p className="mt-1 text-xs text-text-muted">Simple control for content, students, payments, and answer quality</p>
          </div>
        </div>
        <nav className="flex flex-col gap-1 px-3 py-2">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex min-h-11 items-center gap-3 rounded-2xl px-4 py-3 text-sm transition-colors",
                isActive(item.href)
                  ? "border border-border bg-bg-primary text-text-primary font-medium shadow-[0_10px_30px_rgba(0,0,0,0.08)]"
                  : "text-text-secondary hover:bg-bg-primary hover:text-text-primary",
              )}
            >
              <span className="w-5 text-center text-base">{item.icon}</span>
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="mt-auto border-t border-border p-4">
          <div className="rounded-[24px] border border-border bg-bg-primary p-4">
            <p className="text-[11px] font-mono-ui uppercase tracking-[0.24em] text-text-muted">Return</p>
            <Link href="/app/chat" className="mt-4 inline-flex text-sm font-medium text-text-primary">
              ← Back to student app
            </Link>
          </div>
        </div>
      </aside>

      <main className="flex flex-1 flex-col bg-bg-primary">
        <header className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-border/80 bg-bg-primary/92 px-5 py-4 backdrop-blur md:px-8">
          <div>
            <div className="flex items-center gap-2">
              <Badge variant="danger">Admin</Badge>
              <div className="font-display text-3xl">{title}</div>
            </div>
            {subtitle ? <p className="mt-2 text-sm text-text-secondary">{subtitle}</p> : null}
          </div>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <Button variant="outline" size="sm" onClick={handleLogout}>
              Log out
            </Button>
          </div>
        </header>
        <div className="flex-1">{children}</div>
      </main>
    </div>
  );
}
