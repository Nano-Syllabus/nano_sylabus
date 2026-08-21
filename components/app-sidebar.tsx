"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import type { AppUser, ChatSessionSummary } from "@/lib/types";
import { cn, compactSessionTitle, groupDateLabel } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";

const NAV = [
  { href: "/app/exams", label: "Mock Exam", icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 3h9l3 3v15H6z"/><path d="M15 3v4h4"/><path d="M9 12h6"/><path d="M9 16h4"/></svg> },
  { href: "/app/explore", label: "My Subjects", icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M4 4.5A2.5 2.5 0 0 1 6.5 2H20v15H6.5A2.5 2.5 0 0 0 4 19.5z"/><path d="M8 6h8"/><path d="M8 10h6"/></svg> },
  { href: "/app/notes", label: "My Notes", icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/><line x1="16" x2="8" y1="13" y2="13"/><line x1="16" x2="8" y1="17" y2="17"/><line x1="10" x2="8" y1="9" y2="9"/></svg> },
] as const;

function routeLoadingVariant(href: string) {
  if (href.startsWith("/app/exams")) return "exams";
  if (href.startsWith("/app/courses")) return "subjects";
  if (href.startsWith("/app/explore")) return "subjects";
  if (href.startsWith("/app/notes")) return "notes";
  if (href.startsWith("/app/billing")) return "billing";
  if (href.startsWith("/app/settings")) return "settings";
  return "chat";
}

async function readActionError(response: Response, fallback: string) {
  try {
    const payload = (await response.json()) as { error?: string };
    return payload.error || fallback;
  } catch {
    return fallback;
  }
}

export function AppSidebar({
  user,
  isCollapsed = false,
  onToggleCollapse,
  onCloseMobile,
}: {
  user: AppUser;
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
  onCloseMobile?: () => void;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const currentSessionId = searchParams.get("session");
  const [pendingSessionId, setPendingSessionId] = useState<string | null>(null);
  const activeSessionId = pendingSessionId ?? currentSessionId;
  const [pendingRouteHref, setPendingRouteHref] = useState<string | null>(null);

  const [sessions, setSessions] = useState<ChatSessionSummary[]>([]);
  const [hasMoreSessions, setHasMoreSessions] = useState(false);
  const [historySearch, setHistorySearch] = useState("");
  const [historyLoading, setHistoryLoading] = useState(true);
  const [historyError, setHistoryError] = useState("");
  const [isProfileMenuOpen, setIsProfileMenuOpen] = useState(false);
  const [contextMenuId, setContextMenuId] = useState<string | null>(null);
  const [renameSession, setRenameSession] = useState<ChatSessionSummary | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [deleteSessionId, setDeleteSessionId] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (pendingSessionId && pendingSessionId === currentSessionId) {
      setPendingSessionId(null);
    }
  }, [currentSessionId, pendingSessionId]);

  useEffect(() => {
    if (!pendingRouteHref) return;
    if (pathname.startsWith(pendingRouteHref)) {
      setPendingRouteHref(null);
    }
  }, [pathname, pendingRouteHref]);


  const handleTogglePin = async (session: ChatSessionSummary) => {
    const nextPinned = !session.isPinned;
    setHistoryError("");
    setContextMenuId(null);
    setSessions((prev) =>
      prev.map((s) => (s.id === session.id ? { ...s, isPinned: nextPinned } : s))
    );
    try {
      const response = await fetch(`/api/chat/sessions/${session.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isPinned: nextPinned }),
      });
      if (!response.ok) {
        setSessions((prev) =>
          prev.map((s) => (s.id === session.id ? { ...s, isPinned: session.isPinned } : s))
        );
        setHistoryError(await readActionError(response, "Failed to update pinned chat."));
        return;
      }
      const updated = (await response.json()) as ChatSessionSummary;
      setSessions((prev) => prev.map((s) => (s.id === updated.id ? updated : s)));
      window.dispatchEvent(new Event("chat-session-updated"));
    } catch (e) {
      setSessions((prev) =>
        prev.map((s) => (s.id === session.id ? { ...s, isPinned: session.isPinned } : s))
      );
      setHistoryError("Failed to update pinned chat.");
    }
  };

  const searchDebounceRef = useRef<number | null>(null);
  const hasLoadedHistoryRef = useRef(false);
  const profileMenuRef = useRef<HTMLDivElement>(null);
  const historyScrollRef = useRef<HTMLDivElement>(null);

  const fetchSessions = useCallback(async function fetchSessions({
    reset,
    offset,
  }: {
    reset: boolean;
    offset?: number;
  }) {
    setHistoryLoading(true);
    setHistoryError("");
    const query = new URLSearchParams();
    query.set("limit", "12");
    query.set("offset", String(offset ?? 0));
    if (historySearch.trim()) {
      query.set("q", historySearch.trim());
    }

    try {
      const response = await fetch(`/api/chat/sessions?${query.toString()}`, {
        cache: "no-store",
      });

      if (!response.ok) {
        const payload = (await response.json()) as { error?: string };
        setHistoryError(payload.error || "Failed to load chat history.");
        return;
      }

      const payload = (await response.json()) as {
        sessions: ChatSessionSummary[];
        hasMore: boolean;
      };

      setHasMoreSessions(payload.hasMore);
      setSessions((prev) => {
        if (reset) return payload.sessions;
        const existingIds = new Set(prev.map((session) => session.id));
        return [...prev, ...payload.sessions.filter((session) => !existingIds.has(session.id))];
      });
    } catch (e) {
      setHistoryError("Failed to load chat history.");
    } finally {
      setHistoryLoading(false);
    }
  }, [historySearch]);

  const handleHistoryScroll = useCallback(() => {
    const element = historyScrollRef.current;
    if (!element || historyLoading || !hasMoreSessions) return;

    const distanceFromBottom = element.scrollHeight - element.scrollTop - element.clientHeight;
    if (distanceFromBottom > 96) return;

    void fetchSessions({ reset: false, offset: sessions.length });
  }, [fetchSessions, hasMoreSessions, historyLoading, sessions.length]);

  useEffect(() => {
    const element = historyScrollRef.current;
    if (!element || historyLoading || !hasMoreSessions || sessions.length === 0) return;
    if (element.scrollHeight > element.clientHeight + 96) return;

    void fetchSessions({ reset: false, offset: sessions.length });
  }, [fetchSessions, hasMoreSessions, historyLoading, sessions.length]);

  const handleRenameSession = async (title: string) => {
    if (!renameSession || !title.trim()) return;
    setActionLoading(true);
    setHistoryError("");
    try {
      const response = await fetch(`/api/chat/sessions/${renameSession.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: title.trim() }),
      });
      if (!response.ok) {
        setHistoryError(await readActionError(response, "Failed to rename chat."));
        return;
      }
      const updated = (await response.json()) as ChatSessionSummary;
      setSessions((prev) => prev.map((s) => (s.id === updated.id ? updated : s)));
      setRenameSession(null);
      window.dispatchEvent(new Event("chat-session-updated"));
    } catch (e) {
      setHistoryError("Failed to rename chat.");
    } finally {
      setActionLoading(false);
    }
  };

  const handleDeleteSession = async () => {
    if (!deleteSessionId) return;
    setActionLoading(true);
    setHistoryError("");
    try {
      const response = await fetch(`/api/chat/sessions/${deleteSessionId}`, {
        method: "DELETE",
      });
      if (!response.ok) {
        setHistoryError(await readActionError(response, "Failed to delete chat."));
        return;
      }
      setSessions((prev) => prev.filter((s) => s.id !== deleteSessionId));
      setDeleteSessionId(null);
      window.dispatchEvent(new Event("chat-session-updated"));
      if (currentSessionId === deleteSessionId) {
        router.push("/app/chat");
      }
    } catch (e) {
      setHistoryError("Failed to delete chat.");
    } finally {
      setActionLoading(false);
    }
  };

  useEffect(() => {
    if (searchDebounceRef.current) {
      window.clearTimeout(searchDebounceRef.current);
    }

    // The debounce exists to throttle typing in the search box. On first paint
    // there is nothing to throttle, and waiting on it left the chat history
    // blank for a quarter second every time the app loaded.
    if (!hasLoadedHistoryRef.current) {
      hasLoadedHistoryRef.current = true;
      void fetchSessions({ reset: true });
      return;
    }

    searchDebounceRef.current = window.setTimeout(() => {
      void fetchSessions({ reset: true });
    }, 250);
    return () => {
      if (searchDebounceRef.current) {
        window.clearTimeout(searchDebounceRef.current);
      }
    };
  }, [historySearch, fetchSessions]);

  useEffect(() => {
    const handleRefresh = () => {
      void fetchSessions({ reset: true });
    };
    window.addEventListener("chat-session-updated", handleRefresh);
    return () => {
      window.removeEventListener("chat-session-updated", handleRefresh);
    };
  }, [fetchSessions]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (profileMenuRef.current && !profileMenuRef.current.contains(event.target as Node)) {
        setIsProfileMenuOpen(false);
      }
    }
    if (isProfileMenuOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isProfileMenuOpen]);

  useEffect(() => {
    function handleContextMenuOutside(event: MouseEvent) {
      const target = event.target as HTMLElement | null;
      if (target?.closest("[data-chat-context-menu]")) return;
      setContextMenuId(null);
    }
    if (contextMenuId) {
      document.addEventListener("mousedown", handleContextMenuOutside);
    }
    return () => document.removeEventListener("mousedown", handleContextMenuOutside);
  }, [contextMenuId]);

  const groupedSessions = useMemo(() => {
    const pinned = sessions.filter((s) => s.isPinned);
    const unpinned = sessions.filter((s) => !s.isPinned);

    const groups: { group: string; items: ChatSessionSummary[] }[] = [];
    
    if (pinned.length > 0) {
      groups.push({ group: "Pinned", items: pinned });
    }

    if (unpinned.length > 0) {
      groups.push({ group: "Recents", items: unpinned });
    }
    return groups;
  }, [sessions]);

  async function handleLogout() {
    const supabase = createSupabaseBrowserClient();
    await supabase.auth.signOut();
    router.replace("/login");
    router.refresh();
  }

  return (
    <div className="font-sidebar-ui flex h-full w-full flex-col bg-bg-primary text-text-primary">
      {/* ── Brand ── */}
      <div className={cn("flex items-center pt-3.5 pb-2", isCollapsed ? "justify-center px-0" : "justify-between px-3")}>
        <Link
          href="/"
          onClick={() => onCloseMobile?.()}
          className="flex items-center gap-2 font-display text-lg font-semibold tracking-tight transition hover:text-text-secondary no-underline"
          aria-label="Go to Nano Syllabus site"
        >
          <Image
            src="/nano_logo.png"
            alt="Nano Syllabus"
            width={24}
            height={24}
            className="h-6 w-6 rounded-md object-contain shrink-0"
          />
          {!isCollapsed && <span>Nano Syllabus</span>}
        </Link>
        <div className="flex items-center gap-1">
          {/* Mobile close button */}
          <button
            type="button"
            onClick={onCloseMobile}
            className="md:hidden rounded-md p-1.5 text-text-muted transition hover:bg-bg-secondary hover:text-text-primary"
            aria-label="Close sidebar"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
          </button>
          
          {/* Desktop toggle button */}
          <button
            type="button"
            onClick={onToggleCollapse}
            className="hidden md:block rounded-md p-1.5 text-text-primary transition hover:bg-bg-secondary"
            aria-label="Toggle sidebar"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect width="18" height="18" x="3" y="3" rx="4" ry="4"/><path d="M9 3v18"/></svg>
          </button>
        </div>
      </div>

      {/* ── Nav Links ── */}
      <nav className={cn("mt-3 space-y-1", isCollapsed ? "px-2" : "px-3")}>
        <Link
          href="/app/today"
          onClick={() => onCloseMobile?.()}
          className={cn(
            "flex items-center text-[14px] leading-5 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-strong/70 [&_svg]:h-5 [&_svg]:w-5 [&_svg]:shrink-0",
            isCollapsed
              ? "mx-auto h-10 w-10 justify-center rounded-xl p-2.5"
              : "text-sidebar-crisp gap-3 rounded-xl px-2 py-2.5",
            pathname.startsWith("/app/today")
              ? "bg-text-primary text-text-inverse"
              : "hover:bg-bg-secondary hover:text-text-primary",
          )}
          title={isCollapsed ? "Challenges" : undefined}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="m12 3-9 9 9 9 9-9z" />
            <path d="m12 8-4 4 4 4 4-4z" />
          </svg>
          {!isCollapsed && "Challenges"}
        </Link>

        <Link
          href="/app/chat"
          onClick={(e) => {
            if (window.location.pathname === "/app/chat") {
              e.preventDefault();
              window.dispatchEvent(new Event("app:new-chat"));
            }
          }}
          className={cn(
            "flex items-center text-[14px] leading-5 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-strong/70 [&_svg]:h-5 [&_svg]:w-5 [&_svg]:shrink-0",
            isCollapsed
              ? "mx-auto h-10 w-10 justify-center rounded-xl p-2.5"
              : "text-sidebar-crisp gap-3 rounded-xl px-2 py-2.5",
            pathname.startsWith("/app/chat")
              ? "bg-bg-secondary text-text-primary"
              : "hover:bg-bg-secondary hover:text-text-primary",
          )}
          title={isCollapsed ? "Study Space" : undefined}
        >
          {isCollapsed ? (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1-2.5-2.5Z" />
              <path d="M8 7h8" />
              <path d="M8 11h6" />
            </svg>
          ) : (
            <>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1-2.5-2.5Z" />
                <path d="M8 7h8" />
                <path d="M8 11h6" />
              </svg>
              Study Space
            </>
          )}
        </Link>
        
        {NAV.map((item) => {
          const isPending = pendingRouteHref === item.href;
          const isActive = isPending || pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={(event) => {
                event.preventDefault();
                setPendingRouteHref(item.href);
                setPendingSessionId(null);
                window.dispatchEvent(
                  new CustomEvent("app:navigation-start", {
                    detail: {
                      href: item.href,
                      variant: routeLoadingVariant(item.href),
                    },
                  }),
                );
                router.push(item.href, { scroll: false });
                onCloseMobile?.();
              }}
              onPointerEnter={() => router.prefetch(item.href)}
              onFocus={() => router.prefetch(item.href)}
              className={cn(
                "flex items-center text-[14px] leading-5 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-strong/70 [&_svg]:h-5 [&_svg]:w-5 [&_svg]:shrink-0",
                isCollapsed
                  ? "mx-auto h-10 w-10 justify-center rounded-xl p-2.5"
                  : "text-sidebar-crisp gap-3 rounded-xl px-2 py-2.5",
                isActive
                  ? "bg-bg-secondary text-text-primary"
                  : "hover:bg-bg-secondary hover:text-text-primary",
              )}
              title={isCollapsed ? item.label : undefined}
            >
              {item.icon}
              {!isCollapsed && item.label}
            </Link>
          );
        })}

      </nav>

      {/* ── Chat History ── */}
      {pathname.startsWith("/app/chat") ? <div className={cn("mt-6 flex flex-col flex-1 min-h-0", isCollapsed && "hidden")}>
        <div className="hidden items-center justify-between px-4 py-1.5 shrink-0">
          <div className="relative">
            <input
              id="sidebar-search"
              type="text"
              value={historySearch}
              onChange={(event) => setHistorySearch(event.target.value)}
              placeholder="Search..."
              className="h-6 w-0 rounded-md border-0 bg-transparent text-xs text-text-primary outline-none transition-all duration-200 focus:w-24 focus:border focus:border-border focus:bg-bg-secondary focus:px-2"
            />
          </div>
        </div>

        {/* ── Recent Chats ── */}
        <div
          ref={historyScrollRef}
          onScroll={handleHistoryScroll}
          className="min-h-0 flex-1 overflow-y-auto px-3 pb-2 mt-1"
        >
          <div className="space-y-0.5">
            {groupedSessions.map(({ group, items }) =>
              items.length ? (
                <div key={group} className="mb-6 last:mb-0">
                  <button
                    onClick={() =>
                      setCollapsedGroups((prev) => ({ ...prev, [group]: !prev[group] }))
                    }
                    className="flex w-full items-center mb-1 mt-2 px-2 text-[14px] font-semibold text-text-primary first:mt-0 hover:text-text-primary/80 transition group/header"
                  >
                    <span>{group}</span>
                    <svg
                      width="12"
                      height="12"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="3"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className={cn(
                        "ml-1.5 text-text-muted transition-all duration-200",
                        collapsedGroups[group]
                          ? "-rotate-90 opacity-100 group-hover/header:text-text-secondary"
                          : "rotate-0 opacity-0 group-hover/header:opacity-100 group-hover/header:text-text-secondary"
                      )}
                    >
                      <path d="m6 9 6 6 6-6" />
                    </svg>
                  </button>
                  {!collapsedGroups[group] && (
                    <ul className="space-y-0.5">
                      {items.map((session) => {
                      const displayTitle = compactSessionTitle(session.title);

                      return (
                      <li key={session.id} className="relative group">
                        <div className="flex items-center">
	                          <button
	                            type="button"
	                            onPointerEnter={() => {
	                              router.prefetch(`/app/chat?session=${session.id}`);
	                            }}
	                            onClick={() => {
	                              if (activeSessionId === session.id) {
	                                onCloseMobile?.();
	                                return;
	                              }

	                              setPendingSessionId(session.id);
	                              window.dispatchEvent(
	                                new CustomEvent("chat-switch-session", {
	                                  detail: {
	                                    sessionId: session.id,
	                                    title: session.title,
	                                    subjectContext: session.subjectContext,
	                                  },
	                                }),
	                              );
	                              router.push(`/app/chat?session=${session.id}`, { scroll: false });
	                              onCloseMobile?.();
	                            }}
                            className={cn(
                              "group flex items-center gap-2.5 w-full rounded-xl px-2 py-2 text-left text-[14px] leading-5 transition",
                              activeSessionId === session.id
                                ? "bg-bg-secondary font-semibold text-text-primary"
                                : "font-medium text-text-primary hover:bg-bg-secondary hover:text-text-primary",
                            )}
                          >
                            {session.isPinned && (
                              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-text-muted">
                                <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/>
                              </svg>
                            )}
                            <span className="min-w-0 flex-1 truncate">{displayTitle}</span>
	                          </button>
	                          <button
	                            type="button"
	                            aria-label={`Open actions for ${displayTitle}`}
	                            data-chat-context-menu
	                            onMouseDown={(e) => e.stopPropagation()}
	                            onClick={(e) => {
	                              e.preventDefault();
	                              e.stopPropagation();
	                              setContextMenuId(contextMenuId === session.id ? null : session.id);
	                            }}
	                            className={cn(
	                              "absolute right-1 z-10 p-1 rounded-md text-text-muted hover:text-text-primary hover:bg-bg-tertiary transition",
	                              contextMenuId === session.id ? "opacity-100" : "opacity-0 group-hover:opacity-100"
	                            )}
                          >
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="1"/><circle cx="12" cy="5" r="1"/><circle cx="12" cy="19" r="1"/></svg>
                          </button>
                        </div>
                        {contextMenuId === session.id && (
	                          <div 
	                            data-chat-context-menu
	                            className="absolute right-0 top-8 z-[80] flex w-40 flex-col rounded-xl border border-border bg-bg-primary p-1.5 shadow-xl animate-in fade-in zoom-in-95 duration-100"
	                            onMouseDown={(e) => e.stopPropagation()}
	                            onClick={(e) => e.stopPropagation()}
	                          >
	                            <button
	                              type="button"
	                              onClick={(e) => {
	                                e.preventDefault();
	                                e.stopPropagation();
	                                void handleTogglePin(session);
	                              }}
	                              className="flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-[13px] font-medium text-text-secondary hover:bg-bg-secondary hover:text-text-primary transition"
	                            >
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                {session.isPinned ? (
                                  <>
                                    <path d="m3 3 18 18" />
                                    <path d="M15 9.34V5a2 2 0 0 0-2-2h-2a2 2 0 0 0-2 2v2.34l-.82 1.23M19 14.5l-2.12 1.41L12 11l-3-3L6.88 6.59 5 5m14 9.5L14 9v0l-2 2m5 3.5-3.32-2.21M12 17v5l-2-2v-3" />
                                  </>
                                ) : (
                                  <>
                                    <path d="M12 17v5" />
                                    <path d="M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V7a1 1 0 0 1 1-1 2 2 0 0 0 0-4H8a2 2 0 0 0 0 4 1 1 0 0 1 1 1z" />
                                  </>
                                )}
                              </svg>
                              {session.isPinned ? "Unpin chat" : "Pin chat"}
	                            </button>
	                            <button
	                              type="button"
	                              onClick={(e) => {
	                                e.preventDefault();
	                                e.stopPropagation();
	                                setRenameSession(session);
	                                setRenameValue(session.title);
	                                setContextMenuId(null);
                              }}
                              className="flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-[13px] font-medium text-text-secondary hover:bg-bg-secondary hover:text-text-primary transition"
                            >
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/></svg>
                              Rename
	                            </button>
	                            <button
	                              type="button"
	                              onClick={(e) => {
	                                e.preventDefault();
	                                e.stopPropagation();
	                                setDeleteSessionId(session.id);
	                                setContextMenuId(null);
	                              }}
                              className="flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-[13px] font-medium text-destructive hover:bg-destructive/10 transition"
                            >
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>
                              Delete
                            </button>
                          </div>
                        )}
                      </li>
                      );
                    })}
                  </ul>
                  )}
                </div>
              ) : null,
            )}
            {sessions.length === 0 && historyLoading ? (
              <p className="px-2.5 py-4 text-[12px] text-text-muted">
                Loading chats...
              </p>
            ) : null}
            {sessions.length === 0 && !historyLoading ? (
              <p className="px-2.5 py-4 text-[12px] text-text-muted">
                No chat history yet.
              </p>
            ) : null}
            {historyError ? <p className="px-2.5 text-xs text-destructive">{historyError}</p> : null}
            {hasMoreSessions && historyLoading && sessions.length > 0 ? (
              <p className="px-2.5 py-2 text-[12px] text-text-muted">
                Loading older chats...
              </p>
            ) : null}
          </div>
        </div>
      </div> : null}
      
      {/* Spacer for collapsed state */}
      {isCollapsed && <div className="flex-1" />}

      {/* ── Discord Study Room Button ── */}
      <div className={cn("mt-auto shrink-0", isCollapsed ? "p-2 pb-1" : "px-3 pb-1.5 pt-1")}>
        {isCollapsed ? (
          <a
            href="https://discord.gg/6BZGRReVn"
            target="_blank"
            rel="noopener noreferrer"
            className="flex h-10 w-10 mx-auto items-center justify-center rounded-xl bg-[#5865F2]/10 text-[#5865F2] hover:bg-[#5865F2] hover:text-white transition"
            title="Discord Study Room"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
              <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.929 1.793 8.18 1.793 12.061 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.893.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.028zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z" />
            </svg>
          </a>
        ) : (
          <a
            href="https://discord.gg/6BZGRReVn"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-between rounded-xl border border-border bg-card px-2.5 py-2 shadow-xs hover:border-[#5865F2]/40 hover:bg-bg-secondary transition group no-underline"
          >
            <div className="flex items-center gap-2.5">
              <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-[#5865F2] text-white shadow-xs">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.929 1.793 8.18 1.793 12.061 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.893.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.028zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z" />
                </svg>
              </div>
              <span className="text-[13px] font-medium text-text-primary tracking-tight">
                Discord Study Room
              </span>
            </div>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-text-muted group-hover:translate-x-0.5 transition">
              <path d="m9 18 6-6-6-6" />
            </svg>
          </a>
        )}
      </div>

      {/* ── User Profile ── */}
      <div className={cn("border-t border-border shrink-0 relative", isCollapsed ? "p-2" : "p-3")} ref={profileMenuRef}>
        {isProfileMenuOpen && (
          <div className="absolute bottom-[calc(100%+4px)] left-2 w-[240px] rounded-xl border border-border bg-bg-primary shadow-xl z-50 flex flex-col p-1.5 overflow-hidden origin-bottom-left animate-in fade-in zoom-in-95 duration-100">
            <div className="px-2.5 py-2 flex items-center justify-between hover:bg-bg-secondary rounded-lg transition cursor-pointer mb-1">
              <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-border bg-bg-primary text-[13px] font-semibold text-text-primary shadow-sm">
                  {(user.fullName?.trim() || user.email?.trim() || "U").charAt(0).toUpperCase()}
                </div>
                <div className="min-w-0 flex-1 text-left pl-1">
                  <p className="truncate text-[15px] font-medium leading-[22px] text-text-primary capitalize">
                    {user.fullName || user.email?.split("@")[0] || "User"}
                  </p>
                  <p className="truncate text-[13px] text-text-muted mt-0.5">
                    Free plan
                  </p>
                </div>
              </div>
            </div>

            <Link
              href="/teachers"
              onClick={() => setIsProfileMenuOpen(false)}
              className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] font-medium text-text-secondary hover:bg-bg-secondary hover:text-text-primary transition"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                <circle cx="9" cy="7" r="4" />
                <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                <path d="M16 3.13a4 4 0 0 1 0 7.75" />
              </svg>
              Admin panel
            </Link>

            <Link
              href="/app/settings"
              onClick={() => setIsProfileMenuOpen(false)}
              className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] font-medium text-text-secondary hover:bg-bg-secondary hover:text-text-primary transition"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/></svg>
              Settings
            </Link>

            <div className="mx-1 my-1 border-t border-border" />

            <button
              onClick={handleLogout}
              className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] font-medium text-text-secondary hover:bg-bg-secondary hover:text-text-primary transition"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" x2="9" y1="12" y2="12"/></svg>
              Log out
            </button>
          </div>
        )}
        
        <button 
          onClick={() => setIsProfileMenuOpen(!isProfileMenuOpen)}
          className={cn(
            "flex items-center transition hover:bg-bg-secondary relative group",
            isProfileMenuOpen && "bg-bg-secondary",
            isCollapsed 
              ? "justify-center rounded-full mx-auto w-10 h-10" 
              : "w-full gap-2.5 rounded-xl px-2 py-2"
          )}
        >
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-border bg-bg-primary text-[13px] font-semibold text-text-primary shadow-sm">
            {(user.fullName?.trim() || user.email?.trim() || "U").charAt(0).toUpperCase()}
          </div>
          {!isCollapsed && (
            <>
              <div className="min-w-0 flex-1 text-left pl-1">
                <p className="truncate text-[15px] font-medium leading-[22px] text-text-primary capitalize">
                  {user.fullName || user.email?.split("@")[0] || "User"}
                </p>
                <p className="truncate text-[13px] text-text-muted mt-0.5">
                  Free plan
                </p>
              </div>
              <div className="flex items-center pr-1 text-text-muted">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6-6-6"/></svg>
              </div>
            </>
          )}
        </button>
      </div>
      
      {/* Rename Modal */}
      {renameSession && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm" onClick={() => !actionLoading && setRenameSession(null)}>
          <div onClick={(e) => e.stopPropagation()} className="w-full max-w-md rounded-xl border border-border bg-bg-primary p-6 animate-in slide-in-from-bottom-4 duration-200">
            <h3 className="font-display text-xl mb-4">Rename chat</h3>
            <Field label="Title">
              <Input 
                value={renameValue} 
                onChange={(e) => setRenameValue(e.target.value)} 
                autoFocus 
                onKeyDown={(e) => e.key === "Enter" && handleRenameSession(renameValue)}
              />
            </Field>
            <div className="mt-6 flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setRenameSession(null)} disabled={actionLoading}>Cancel</Button>
              <Button onClick={() => handleRenameSession(renameValue)} disabled={!renameValue.trim() || actionLoading}>
                {actionLoading ? "Saving..." : "Save"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Modal */}
      {deleteSessionId && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm" onClick={() => !actionLoading && setDeleteSessionId(null)}>
          <div onClick={(e) => e.stopPropagation()} className="w-full max-w-md rounded-xl border border-border bg-bg-primary p-6 animate-in slide-in-from-bottom-4 duration-200">
            <h3 className="font-display text-xl mb-2 text-text-primary">Delete chat?</h3>
            <p className="text-sm text-text-secondary mb-6">This action cannot be undone. All messages in this chat will be permanently removed.</p>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setDeleteSessionId(null)} disabled={actionLoading}>Cancel</Button>
              <Button variant="danger" onClick={handleDeleteSession} disabled={actionLoading} className="whitespace-nowrap">
                {actionLoading ? "Deleting..." : "Delete chat"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
