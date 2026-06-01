"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { AppNav } from "@/components/app-nav";
import { Logo } from "@/components/marketing-nav";
import { ThemeToggle } from "@/components/theme-toggle";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import type { AppUser } from "@/lib/types";

export function AppShell({
  user,
  title,
  actions,
  children,
}: {
  user: AppUser;
  title: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const router = useRouter();

  useEffect(() => {
    const onResize = () => {
      if (window.innerWidth >= 768) setOpen(false);
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  async function handleLogout() {
    const supabase = createSupabaseBrowserClient();
    await supabase.auth.signOut();
    router.replace("/login");
    router.refresh();
  }

  return (
    <div className="flex h-screen overflow-hidden bg-bg-primary text-text-primary">
      <aside
        className={
          "fixed inset-y-0 left-0 z-30 flex w-[136px] flex-col border-r border-border bg-bg-primary transition-transform md:static md:translate-x-0 xl:w-[144px] " +
          (open ? "translate-x-0" : "-translate-x-full")
        }
      >
        <div className="flex items-center justify-between px-3.5 py-3.5">
          <Logo />
          <button
            type="button"
            className="text-text-muted md:hidden"
            onClick={() => setOpen(false)}
          >
            ✕
          </button>
        </div>
        <div className="flex-1 overflow-y-auto">
          <AppNav user={user} />
        </div>
      </aside>

      {open ? (
        <button
          aria-label="Close sidebar"
          onClick={() => setOpen(false)}
          className="fixed inset-0 z-20 bg-black/40 md:hidden"
        />
      ) : null}

      <main className="flex flex-1 flex-col overflow-hidden">
        <header className="flex items-center justify-between gap-3 border-b border-border px-4 py-2.5 md:px-5 xl:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <button
              type="button"
              className="text-text-muted md:hidden"
              onClick={() => setOpen(true)}
            >
              ☰
            </button>
            <div className="min-w-0 truncate font-display text-xl md:text-[26px]">{title}</div>
          </div>
          <div className="flex items-center gap-1.5 md:gap-2">
            <Badge variant={user.creditBalance > 0 ? "success" : "warning"}>
              {user.creditBalance} credits
            </Badge>
            {actions}
            <Button variant="outline" size="sm" onClick={handleLogout} className="hidden md:inline-flex">
              Log out
            </Button>
            <ThemeToggle />
          </div>
        </header>
        <div className="flex-1 overflow-y-auto">{children}</div>
      </main>
    </div>
  );
}
