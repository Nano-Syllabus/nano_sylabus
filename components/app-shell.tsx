"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { AppSidebar } from "@/components/app-sidebar";
import { ThemeToggle } from "@/components/theme-toggle";
import { Badge } from "@/components/ui/badge";
import type { AppUser } from "@/lib/types";
import { AppShellContext } from "@/components/app-shell-context";
import { AppRouteLoading } from "@/components/app-route-loading";

type PendingNavigation = {
  href: string;
  variant: "chat" | "subjects" | "notes" | "billing" | "settings";
};

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
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [dynamicTitle, setDynamicTitle] = useState<ReactNode>(null);
  const [dynamicActions, setDynamicActions] = useState<ReactNode>(null);
  const [pendingNavigation, setPendingNavigation] = useState<PendingNavigation | null>(null);


  useEffect(() => {
    const onResize = () => {
      if (window.innerWidth >= 768) setOpen(false);
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  useEffect(() => {
    function handleNavigationStart(event: Event) {
      const detail = (event as CustomEvent<PendingNavigation>).detail;
      if (!detail?.href || !detail.variant) return;
      setDynamicActions(null);
      setPendingNavigation(detail);
    }

    window.addEventListener("app:navigation-start", handleNavigationStart);
    return () => {
      window.removeEventListener("app:navigation-start", handleNavigationStart);
    };
  }, []);

  useEffect(() => {
    if (!pendingNavigation) return;
    if (pathname.startsWith(pendingNavigation.href)) {
      setPendingNavigation(null);
    }
  }, [pathname, pendingNavigation]);

  const shellContextValue = useMemo(
    () => ({ setTitle: setDynamicTitle, setActions: setDynamicActions }),
    [],
  );

  return (
    <AppShellContext.Provider value={shellContextValue}>
      <div className="flex h-[100dvh] overflow-hidden bg-bg-primary text-text-primary">
        <aside
          className={
            "fixed inset-y-0 left-0 z-30 flex flex-col border-r border-border transition-all duration-300 md:static md:translate-x-0 " +
            (open ? "translate-x-0 " : "-translate-x-full ") +
            (isCollapsed ? "w-[68px]" : "w-[min(86vw,320px)] md:w-[260px]")
          }
        >
          <AppSidebar 
            user={user} 
            isCollapsed={isCollapsed} 
            onToggleCollapse={() => setIsCollapsed(!isCollapsed)} 
            onCloseMobile={() => setOpen(false)}
          />
        </aside>

        {open ? (
          <button
            aria-label="Close sidebar"
            onClick={() => setOpen(false)}
            className="fixed inset-0 z-20 bg-black/40 md:hidden"
          />
        ) : null}

        <main className="flex min-w-0 flex-1 flex-col overflow-hidden">
          <header className="flex min-h-12 items-center justify-between gap-2 px-3 sm:gap-3 sm:px-4 md:px-8">
            <div className="flex min-w-0 flex-1 items-center gap-2 sm:gap-3">
              <button
                type="button"
                className="-ml-1 inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-text-muted transition hover:bg-bg-secondary hover:text-text-primary md:hidden"
                onClick={() => setOpen(true)}
                aria-label="Open sidebar"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="4" x2="20" y1="12" y2="12"/><line x1="4" x2="20" y1="6" y2="6"/><line x1="4" x2="20" y1="18" y2="18"/></svg>
              </button>
              <div className="min-w-0 flex-1 truncate font-sans text-[14px] font-semibold text-text-primary sm:text-[15px]">
                {dynamicTitle ?? title}
              </div>
            </div>
            <div className="flex min-w-0 shrink-0 items-center gap-1.5 md:gap-2">
              {!dynamicActions && (
                <Badge variant={user.creditBalance > 0 ? "success" : "warning"} className="hidden sm:inline-flex">
                  {user.creditBalance} messages
                </Badge>
              )}
              {dynamicActions ?? actions}
              <ThemeToggle />
            </div>
          </header>
          <div className="flex-1 overflow-y-auto">
            {pendingNavigation ? <AppRouteLoading variant={pendingNavigation.variant} /> : children}
          </div>
        </main>
      </div>
    </AppShellContext.Provider>
  );
}
