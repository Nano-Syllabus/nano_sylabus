"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import type { AppUser, ChatSessionSummary } from "@/lib/types";
import { cn, groupDateLabel } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";

const NAV = [
  { href: "/app/chat", label: "Chats", icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg> },
  { href: "/app/explore", label: "Explore", icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76"/></svg> },
  { href: "/app/notes", label: "My Notes", icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/><line x1="16" x2="8" y1="13" y2="13"/><line x1="16" x2="8" y1="17" y2="17"/><line x1="10" x2="8" y1="9" y2="9"/></svg> },
];

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

  const searchDebounceRef = useRef<number | null>(null);
  const profileMenuRef = useRef<HTMLDivElement>(null);

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

  const handleRenameSession = async (title: string) => {
    if (!renameSession || !title.trim()) return;
    setActionLoading(true);
    try {
      const response = await fetch(`/api/chat/sessions/${renameSession.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: title.trim() }),
      });
      if (response.ok) {
        setSessions((prev) => prev.map((s) => (s.id === renameSession.id ? { ...s, title: title.trim() } : s)));
        setRenameSession(null);
      }
    } catch (e) {
      // ignore
    } finally {
      setActionLoading(false);
    }
  };

  const handleDeleteSession = async () => {
    if (!deleteSessionId) return;
    setActionLoading(true);
    try {
      const response = await fetch(`/api/chat/sessions/${deleteSessionId}`, {
        method: "DELETE",
      });
      if (response.ok) {
        setSessions((prev) => prev.filter((s) => s.id !== deleteSessionId));
        setDeleteSessionId(null);
        if (currentSessionId === deleteSessionId) {
          router.push("/app/chat");
        }
      }
    } catch (e) {
      // ignore
    } finally {
      setActionLoading(false);
    }
  };

  useEffect(() => {
    if (searchDebounceRef.current) {
      window.clearTimeout(searchDebounceRef.current);
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
      document.addEventListener("mousedown", handleClickOutside);
    };
  }, [isProfileMenuOpen]);

  useEffect(() => {
    function handleContextMenuOutside() {
      setContextMenuId(null);
    }
    if (contextMenuId) {
      document.addEventListener("mousedown", handleContextMenuOutside);
    }
    return () => document.removeEventListener("mousedown", handleContextMenuOutside);
  }, [contextMenuId]);

  const groupedSessions = useMemo(() => {
    const groups: { group: string; items: ChatSessionSummary[] }[] = [];
    let currentGroup = "";
    let currentItems: ChatSessionSummary[] = [];

    sessions.forEach((session) => {
      const g = groupDateLabel(session.updatedAt);
      if (g !== currentGroup) {
        if (currentGroup) {
          groups.push({ group: currentGroup, items: currentItems });
        }
        currentGroup = g;
        currentItems = [session];
      } else {
        currentItems.push(session);
      }
    });

    if (currentGroup) {
      groups.push({ group: currentGroup, items: currentItems });
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
    <div className="flex h-full w-full flex-col bg-bg-primary text-text-primary">
      {/* ── Brand ── */}
      <div className={cn("flex items-center pt-3.5 pb-2", isCollapsed ? "justify-center px-0" : "justify-between px-4")}>
        {!isCollapsed && (
          <Link href="/" className="font-display text-lg font-semibold tracking-tight">
            Nano Syllabus
          </Link>
        )}
        <div className="flex items-center gap-1">
          {/* Mobile close button */}
          <button
            type="button"
            onClick={onCloseMobile}
            className="md:hidden rounded-md p-1.5 text-text-muted transition hover:bg-bg-secondary hover:text-text-primary"
            aria-label="Close sidebar"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
          </button>
          
          {/* Desktop toggle button */}
          <button
            type="button"
            onClick={onToggleCollapse}
            className="hidden md:block rounded-md p-1.5 text-text-muted transition hover:bg-bg-secondary hover:text-text-primary"
            aria-label="Toggle sidebar"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="18" height="18" x="3" y="3" rx="2" ry="2"/><path d="M9 3v18"/></svg>
          </button>
        </div>
      </div>

      {/* ── Nav Links ── */}
      <nav className={cn("space-y-0.5 mt-2", isCollapsed ? "px-2" : "px-2.5")}>
        <Link
          href="/app/chat"
          onClick={(e) => {
            if (window.location.pathname === "/app/chat") {
              e.preventDefault();
              window.dispatchEvent(new Event("app:new-chat"));
            }
          }}
          className={cn(
            "flex items-center font-medium transition",
            isCollapsed
              ? "justify-center rounded-full p-2 text-text-primary bg-bg-secondary hover:opacity-80 mx-auto w-10 h-10 mb-3"
              : "gap-2.5 rounded-lg px-2.5 py-2 text-[13px] text-text-secondary hover:bg-bg-secondary hover:text-text-primary"
          )}
        >
          {isCollapsed ? (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14"/><path d="M12 5v14"/></svg>
          ) : (
            <>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14"/><path d="M5 12h14"/></svg>
              New chat
            </>
          )}
        </Link>
        
        {NAV.map((item) => {
          const isActive = item.href === "/app/chat" ? !!currentSessionId : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center font-medium transition",
                isCollapsed
                  ? "justify-center rounded-lg p-2.5 mx-auto w-10 h-10"
                  : "gap-2.5 rounded-lg px-2.5 py-2 text-[13px]",
                isActive
                  ? "bg-bg-secondary text-text-primary"
                  : "text-text-secondary hover:bg-bg-secondary hover:text-text-primary",
              )}
              title={isCollapsed ? item.label : undefined}
            >
              {item.icon}
              {!isCollapsed && item.label}
            </Link>
          );
        })}
        {user.role === "admin" ? (
          <Link
            href="/admin"
            className={cn(
              "flex items-center font-medium transition",
              isCollapsed
                ? "justify-center rounded-lg p-2.5 mx-auto w-10 h-10"
                : "gap-2.5 rounded-lg px-2.5 py-2 text-[13px]",
              pathname.startsWith("/admin")
                ? "bg-bg-secondary text-text-primary"
                : "text-text-secondary hover:bg-bg-secondary hover:text-text-primary",
            )}
            title={isCollapsed ? "Admin" : undefined}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10"/></svg>
            {!isCollapsed && "Admin"}
          </Link>
        ) : null}
      </nav>

      {/* ── Recents Header ── */}
      <div className={cn("mt-4 flex flex-col flex-1 min-h-0", isCollapsed && "hidden")}>
        <div className="flex items-center justify-between px-4 py-1.5 shrink-0">
          <span className="text-xs font-bold uppercase tracking-widest text-text-primary">Recents</span>
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
        <div className="min-h-0 flex-1 overflow-y-auto px-2.5 pb-2 mt-1">
          <div className="space-y-0.5">
            {groupedSessions.map(({ group, items }) =>
              items.length ? (
                <div key={group}>
                  <p className="mb-1 mt-2.5 px-2.5 text-xs font-bold uppercase tracking-widest text-text-primary first:mt-0">
                    {group}
                  </p>
                  <ul className="space-y-0.5">
                    {items.map((session) => (
                      <li key={session.id} className="relative group">
                        <div className="flex items-center">
                          <button
                            type="button"
                            onClick={() => {
                              window.history.replaceState(null, "", `/app/chat?session=${session.id}`);
                              window.dispatchEvent(new CustomEvent("chat-switch-session", { detail: { sessionId: session.id } }));
                              onCloseMobile?.();
                            }}
                            className={cn(
                              "block w-full text-left truncate rounded-lg px-2.5 py-2 text-sm font-medium transition",
                              currentSessionId === session.id
                                ? "bg-bg-secondary font-semibold text-text-primary"
                                : "text-text-secondary hover:bg-bg-secondary hover:text-text-primary",
                            )}
                          >
                            {session.title}
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setContextMenuId(contextMenuId === session.id ? null : session.id);
                            }}
                            className={cn(
                              "absolute right-1 p-1 rounded-md text-text-muted hover:text-text-primary hover:bg-bg-tertiary transition",
                              contextMenuId === session.id ? "opacity-100" : "opacity-0 group-hover:opacity-100"
                            )}
                          >
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="1"/><circle cx="12" cy="5" r="1"/><circle cx="12" cy="19" r="1"/></svg>
                          </button>
                        </div>
                        {contextMenuId === session.id && (
                          <div 
                            className="absolute right-0 top-8 w-40 rounded-xl border border-border bg-bg-primary shadow-xl z-50 flex flex-col p-1.5 animate-in fade-in zoom-in-95 duration-100"
                            onMouseDown={(e) => e.stopPropagation()}
                          >
                            <button
                              onClick={() => {
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
                              onClick={() => {
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
                    ))}
                  </ul>
                </div>
              ) : null,
            )}
            {sessions.length === 0 ? (
              <p className="px-2.5 py-4 text-[12px] text-text-muted">
                No chat history yet.
              </p>
            ) : null}
            {historyError ? <p className="px-2.5 text-xs text-destructive">{historyError}</p> : null}
            {hasMoreSessions ? (
              <button
                type="button"
                className="w-full px-2.5 py-1.5 text-left text-[12px] text-text-muted transition hover:text-text-primary"
                onClick={() => void fetchSessions({ reset: false, offset: sessions.length })}
                disabled={historyLoading}
              >
                {historyLoading ? "Loading..." : "Load more..."}
              </button>
            ) : null}
          </div>
        </div>
      </div>
      
      {/* Spacer for collapsed state */}
      {isCollapsed && <div className="flex-1" />}

      {/* ── User Profile ── */}
      <div className={cn("border-t border-border shrink-0 relative", isCollapsed ? "p-2" : "p-3")} ref={profileMenuRef}>
        {isProfileMenuOpen && (
          <div className="absolute bottom-[calc(100%+4px)] left-2 w-[240px] rounded-xl border border-border bg-bg-primary shadow-xl z-50 flex flex-col p-1.5 overflow-hidden origin-bottom-left animate-in fade-in zoom-in-95 duration-100">
            <div className="px-2.5 py-2.5 flex items-center gap-2">
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-border bg-bg-primary text-[11px] font-semibold text-text-primary shadow-sm">
                {(user.fullName || user.email || "U").charAt(0).toUpperCase()}
              </div>
              <p className="truncate text-sm font-medium text-text-primary">
                {user.email}
              </p>
            </div>
            
            <Link
              href="/app/settings"
              onClick={() => setIsProfileMenuOpen(false)}
              className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] font-medium text-text-secondary hover:bg-bg-secondary hover:text-text-primary transition"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/></svg>
              Settings
            </Link>

            <div className="mx-1 my-1 border-t border-border" />

            <Link
              href="/app/billing"
              onClick={() => setIsProfileMenuOpen(false)}
              className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] font-medium text-text-secondary hover:bg-bg-secondary hover:text-text-primary transition"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="m16 12-4-4-4 4"/><path d="M12 16V8"/></svg>
              Upgrade plan
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
            {(user.fullName || user.email || "U").charAt(0).toUpperCase()}
          </div>
          {!isCollapsed && (
            <>
              <div className="min-w-0 flex-1 text-left">
                <p className="truncate text-[13px] font-medium leading-tight text-text-primary">
                  {user.fullName || user.email?.split("@")[0] || "User"}
                </p>
                <p className="truncate text-[11px] text-text-muted">
                  Free plan
                </p>
              </div>
              <div className="flex items-center gap-2 pr-1">
                {/* Download icon matching Claude */}
                <div className="text-text-muted hover:text-text-primary transition p-1 rounded-md hover:bg-bg-tertiary">
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" x2="12" y1="15" y2="3"/></svg>
                </div>
                {/* Chevrons */}
                <div className="flex flex-col items-center gap-0.5 text-text-muted opacity-80 shrink-0">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="mb-[-3px]"><path d="m18 15-6-6-6 6"/></svg>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="mt-[-3px]"><path d="m6 9 6 6 6-6"/></svg>
                </div>
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
              <Button variant="danger" onClick={handleDeleteSession} disabled={actionLoading}>
                {actionLoading ? "Deleting..." : "Delete chat"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
