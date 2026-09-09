"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import { loadSupabaseBrowserClient } from "@/lib/supabase/browser-lazy";
import type { AppUser, ChatSessionSummary } from "@/lib/types";
import { cn, compactSessionTitle, groupDateLabel } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { isAdminRole } from "@/lib/admin-role";
import { useQueryClient } from "@tanstack/react-query";
import { prefetchDashboard } from "@/lib/query/dashboard";
import {
  useChatSessionEvents,
  useChatSessions,
  useDeleteSession,
  useRenameSession,
  useToggleSessionPin,
} from "@/lib/query/chat-sessions";
import { DISCORD_STUDY_ROOM_URL } from "@/lib/product-links";

// Keep the exam experience available by direct URL while it is temporarily
// removed from primary navigation. Flip this when the product is ready.
const SHOW_MOCK_EXAM_NAV = false;

const NAV = [
  ...(SHOW_MOCK_EXAM_NAV
    ? [
        {
          href: "/app/exams",
          label: "Mock Exam",
          icon: (
            <svg
              key="mock-exam-icon"
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M6 3h9l3 3v15H6z" />
              <path d="M15 3v4h4" />
              <path d="M9 12h6" />
              <path d="M9 16h4" />
            </svg>
          ),
        },
      ]
    : []),
  {
    href: "/app/notes",
    label: "My Notes",
    icon: (
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
        <polyline points="14 2 14 8 20 8" />
        <line x1="16" x2="8" y1="13" y2="13" />
        <line x1="16" x2="8" y1="17" y2="17" />
        <line x1="10" x2="8" y1="9" y2="9" />
      </svg>
    ),
  },
  {
    href: "/app/billing",
    label: "Pricing",
    icon: (
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M12 2v20" />
        <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7H14a3.5 3.5 0 0 1 0 7H6" />
      </svg>
    ),
  },
] as const;


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

  const [historySearch, setHistorySearch] = useState("");
  /**
   * The search term the QUERY is keyed by, updated 250ms behind the input.
   *
   * Two separate values on purpose. `historySearch` drives the text box and
   * must update on every keystroke or typing feels laggy; `debouncedSearch` is
   * what reaches the cache key, and a key that changed per keystroke would be
   * a cache entry per keystroke — each one a request, and each one evicting
   * the last. Debouncing the KEY rather than the request is what makes going
   * back to a term you already typed free.
   */
  const [debouncedSearch, setDebouncedSearch] = useState("");

  /**
   * The chat history is only DRAWN on /app/chat (see the panel further down),
   * so it is only FETCHED there. Every other page was paying a Supabase-backed
   * request for a list it never rendered — see the note on `enabled` in
   * lib/query/chat-sessions.ts for why that was the expensive mistake it looks
   * like.
   */
  const showChatHistory = pathname.startsWith("/app/chat");

  const queryClient = useQueryClient();
  /**
   * Which community the dashboard is scoped to, read from the URL.
   *
   * The prefetch has to use the SAME key the page will read, or it warms an
   * entry nobody looks at. `undefined` here matches the page's own default —
   * the student's saved active community — because the query key treats a
   * missing slug as its own scope rather than as "any".
   */
  const activeCommunitySlug = searchParams.get("community") || undefined;
  const [historyErrorOverride, setHistoryErrorOverride] = useState("");
  const [isProfileMenuOpen, setIsProfileMenuOpen] = useState(false);
  const [contextMenuId, setContextMenuId] = useState<string | null>(null);
  const [renameSession, setRenameSession] = useState<ChatSessionSummary | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [deleteSessionId, setDeleteSessionId] = useState<string | null>(null);
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

  /**
   * Chat history: cached, paged, and shared with every other page in /app.
   *
   * The list, the paging state and the three write paths below all used to be
   * hand-rolled here — an accumulating `useState` array, a manual offset, and
   * three copies of "apply, call, revert on failure". They are in
   * lib/query/chat-sessions.ts now, which is what lets the sidebar keep its
   * scrolled-in pages across a navigation instead of refetching page one and
   * flashing empty every time /app remounts it.
   */
  const {
    sessions,
    isPending: historyPending,
    isFetching: historyFetching,
    isFetchingNextPage,
    hasNextPage,
    fetchNextPage,
    error: historyQueryError,
  } = useChatSessions(debouncedSearch, showChatHistory);

  const togglePin = useToggleSessionPin();
  const renameMutation = useRenameSession();
  const deleteMutation = useDeleteSession();

  // A refetch triggered by the chat page creating or titling a session.
  useChatSessionEvents();

  const actionLoading = renameMutation.isPending || deleteMutation.isPending;
  const hasMoreSessions = Boolean(hasNextPage);
  // `isPending` is "no cached data yet", which is the only state that should
  // show a skeleton. A background revalidation over a list already on screen
  // is `isFetching`, and surfacing that as loading is what made the sidebar
  // appear to reload on every navigation.
  const historyLoading = historyPending || isFetchingNextPage;
  const historyError =
    historyErrorOverride ||
    (historyQueryError ? historyQueryError.message || "Failed to load chat history." : "");

  const handleTogglePin = (session: ChatSessionSummary) => {
    setHistoryErrorOverride("");
    setContextMenuId(null);
    togglePin.mutate(
      { session },
      {
        onError: (error) =>
          setHistoryErrorOverride(error.message || "Failed to update pinned chat."),
        onSuccess: () => window.dispatchEvent(new Event("chat-session-updated")),
      },
    );
  };

  const profileMenuRef = useRef<HTMLDivElement>(null);
  const historyScrollRef = useRef<HTMLDivElement>(null);

  /**
   * Load the next page when the list is nearly scrolled out.
   *
   * `isFetchingNextPage` rather than a general loading flag is what guards
   * this: a background revalidation of page one must not block paging, and
   * without the distinction a slow refetch froze the infinite scroll.
   */
  const handleHistoryScroll = useCallback(() => {
    const element = historyScrollRef.current;
    if (!element || isFetchingNextPage || !hasNextPage) return;

    const distanceFromBottom = element.scrollHeight - element.scrollTop - element.clientHeight;
    if (distanceFromBottom > 96) return;

    void fetchNextPage();
  }, [fetchNextPage, hasNextPage, isFetchingNextPage]);

  // A short history on a tall sidebar never fires a scroll event, so nothing
  // would ask for page two even though there is one. Fill the viewport first.
  useEffect(() => {
    const element = historyScrollRef.current;
    if (!element || isFetchingNextPage || !hasNextPage || sessions.length === 0) return;
    if (element.scrollHeight > element.clientHeight + 96) return;

    void fetchNextPage();
  }, [fetchNextPage, hasNextPage, isFetchingNextPage, sessions.length]);

  const handleRenameSession = (title: string) => {
    if (!renameSession || !title.trim()) return;
    setHistoryErrorOverride("");
    renameMutation.mutate(
      { sessionId: renameSession.id, title: title.trim() },
      {
        onSuccess: () => {
          setRenameSession(null);
          window.dispatchEvent(new Event("chat-session-updated"));
        },
        onError: (error) => setHistoryErrorOverride(error.message || "Failed to rename chat."),
      },
    );
  };

  const handleDeleteSession = () => {
    if (!deleteSessionId) return;
    const sessionId = deleteSessionId;
    setHistoryErrorOverride("");
    deleteMutation.mutate(
      { sessionId },
      {
        onSuccess: () => {
          setDeleteSessionId(null);
          window.dispatchEvent(new Event("chat-session-updated"));
          if (currentSessionId === sessionId) {
            router.push("/app/chat");
          }
        },
        onError: (error) => setHistoryErrorOverride(error.message || "Failed to delete chat."),
      },
    );
  };

  /**
   * Move the typed term onto the query key, 250ms behind the keystroke.
   *
   * The first term is applied immediately: on a cold mount there is nothing to
   * throttle, and waiting the full 250ms left the history blank for a quarter
   * second every time the app opened. That was true of the old debounce too
   * and is kept for the same reason.
   */
  useEffect(() => {
    const next = historySearch.trim();
    if (next === debouncedSearch) return;
    const timer = window.setTimeout(() => setDebouncedSearch(next), next ? 250 : 0);
    return () => window.clearTimeout(timer);
  }, [historySearch, debouncedSearch]);

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
    const supabase = await loadSupabaseBrowserClient();
    await supabase.auth.signOut();
    router.replace("/login");
    router.refresh();
  }

  return (
    <div className="font-figma-library flex h-full w-full flex-col bg-white text-[#475569]">
      {/* ── Brand ── */}
      <div
        className={cn(
          "flex items-center pb-2 pt-6",
          isCollapsed ? "justify-center px-0" : "justify-between px-6",
        )}
      >
        <Link
          href="/"
          onClick={() => onCloseMobile?.()}
          className="flex items-center gap-2.5 text-[18px] font-semibold tracking-tight text-[#1e293b] no-underline transition hover:text-[#475569]"
          aria-label="Go to Nano Syllabus site"
        >
          <Image
            src="/nano_logo.png"
            alt="Nano Syllabus"
            width={28}
            height={28}
            className="h-7 w-7 rounded-md object-contain shrink-0"
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
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M18 6 6 18" />
              <path d="m6 6 12 12" />
            </svg>
          </button>

          {/* Desktop toggle button */}
          <button
            type="button"
            onClick={onToggleCollapse}
            className="hidden md:block rounded-md p-1.5 text-text-primary transition hover:bg-bg-secondary"
            aria-label="Toggle sidebar"
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <rect width="18" height="18" x="3" y="3" rx="4" ry="4" />
              <path d="M9 3v18" />
            </svg>
          </button>
        </div>
      </div>

      {/* ── Nav Links ── */}
      <nav className={cn("mt-4 space-y-1", isCollapsed ? "px-2" : "px-6")}>
        <Link
          href="/app/today"
          onClick={() => onCloseMobile?.()}
          /**
           * Warm the dashboard on intent, not on arrival.
           *
           * `router.prefetch` fetches the ROUTE; `prefetchDashboard` fetches
           * the DATA, which since the page became a shell is the part that
           * actually takes time. Firing both on hover means the click usually
           * lands on a dashboard that is already in the query cache and paints
           * on the first frame.
           *
           * Both are no-ops once warm — `prefetchQuery` returns immediately
           * for a fresh entry — so this costs nothing on repeat hovers.
           */
          onPointerEnter={() => {
            router.prefetch("/app/today");
            void prefetchDashboard(queryClient, activeCommunitySlug);
          }}
          onFocus={() => {
            router.prefetch("/app/today");
            void prefetchDashboard(queryClient, activeCommunitySlug);
          }}
          className={cn(
            "flex items-center text-[15px] leading-5 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-strong/70 [&_svg]:h-[22px] [&_svg]:w-[22px] [&_svg]:shrink-0",
            isCollapsed
              ? "mx-auto h-10 w-10 justify-center rounded-xl p-2.5"
              : "text-sidebar-crisp gap-3 rounded-xl px-2 py-2.5",
            pathname === "/app/today"
              ? "bg-text-primary text-text-inverse"
              : "hover:bg-bg-secondary hover:text-text-primary",
          )}
          title={isCollapsed ? "Daily Dashboard" : undefined}
        >
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M8.5 14.5c0 2 1.5 3.5 3.5 3.5s3.5-1.5 3.5-3.5c0-1.5-.8-2.5-2-3.5.1 1.3-.5 2.1-1.4 2.6.1-2.7-1.4-4.7-3.1-6.1.2 2.2-.7 3.7-1.9 5-.4.5-.6 1.2-.6 2Z" />
            <circle cx="12" cy="12" r="9" />
          </svg>
          {!isCollapsed && "Daily Dashboard"}
        </Link>

        <Link
          href="/app/community"
          onClick={() => onCloseMobile?.()}
          className={cn(
            "flex items-center text-[15px] leading-5 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-strong/70 [&_svg]:h-[22px] [&_svg]:w-[22px] [&_svg]:shrink-0",
            isCollapsed
              ? "mx-auto h-10 w-10 justify-center rounded-xl p-2.5"
              : "text-sidebar-crisp gap-3 rounded-xl px-2 py-2.5",
            pathname.startsWith("/app/community")
              ? "bg-text-primary text-text-inverse"
              : "hover:bg-bg-secondary hover:text-text-primary",
          )}
          title={isCollapsed ? "Community Hub" : undefined}
        >
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M3 21h18" />
            <path d="M6 21V7l6-4 6 4v14" />
            <path d="M9 10h1M14 10h1M9 14h1M14 14h1" />
            <path d="M10 21v-3h4v3" />
          </svg>
          {!isCollapsed && "Community Hub"}
        </Link>

        <Link
          href="/app/challenges"
          onClick={() => onCloseMobile?.()}
          className={cn(
            "flex items-center text-[15px] leading-5 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-strong/70 [&_svg]:h-[22px] [&_svg]:w-[22px] [&_svg]:shrink-0",
            isCollapsed
              ? "mx-auto h-10 w-10 justify-center rounded-xl p-2.5"
              : "text-sidebar-crisp gap-3 rounded-xl px-2 py-2.5",
            pathname.startsWith("/app/challenges")
              ? "bg-text-primary text-text-inverse"
              : "hover:bg-bg-secondary hover:text-text-primary",
          )}
          title={isCollapsed ? "Challenge Hub" : undefined}
        >
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <circle cx="12" cy="12" r="8" />
            <circle cx="12" cy="12" r="3" />
            <path d="M12 2V5M12 19v3M2 12h3M19 12h3" />
          </svg>
          {!isCollapsed && "Challenge Hub"}
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
            "flex items-center text-[15px] leading-5 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-strong/70 [&_svg]:h-[22px] [&_svg]:w-[22px] [&_svg]:shrink-0",
            isCollapsed
              ? "mx-auto h-10 w-10 justify-center rounded-xl p-2.5"
              : "text-sidebar-crisp gap-3 rounded-xl px-2 py-2.5",
            pathname.startsWith("/app/chat")
              ? "bg-bg-secondary text-text-primary"
              : "hover:bg-bg-secondary hover:text-text-primary",
          )}
          title={isCollapsed ? "Library & Nano AI" : undefined}
        >
          {isCollapsed ? (
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1-2.5-2.5Z" />
              <path d="M8 7h8" />
              <path d="M8 11h6" />
            </svg>
          ) : (
            <>
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1-2.5-2.5Z" />
                <path d="M8 7h8" />
                <path d="M8 11h6" />
              </svg>
              Library &amp; Nano AI
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
              /**
               * NO `preventDefault`, NO `router.push`, NO loading event.
               *
               * All three used to be here and together they were why the app
               * halted. `<Link>` navigates inside a React transition; the
               * handler then fired a SYNCHRONOUS `setState` that made AppShell
               * swap the whole page subtree for a skeleton. A sync update
               * outranks a transition, so it interrupted the navigation and
               * restarted it — the first click usually squeaked through and
               * every one after it starved, leaving the URL unchanged and the
               * skeleton up forever. That is the "stuck loading" and the
               * "15 seconds": not slow work, a navigation being cancelled by
               * its own loading indicator on a loop.
               *
               * Next already does this correctly. Every route under /app has a
               * `loading.tsx`, which is a Suspense boundary the router owns and
               * schedules WITH the transition instead of against it.
               *
               * `pendingRouteHref` stays, but only to tint the clicked item
               * immediately. It changes a class name and unmounts nothing, so
               * it cannot interrupt anything.
               */
              onClick={() => {
                setPendingRouteHref(item.href);
                setPendingSessionId(null);
                onCloseMobile?.();
              }}
              onPointerEnter={() => router.prefetch(item.href)}
              onFocus={() => router.prefetch(item.href)}
              className={cn(
                "flex items-center text-[15px] leading-5 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-strong/70 [&_svg]:h-[22px] [&_svg]:w-[22px] [&_svg]:shrink-0",
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
      {pathname.startsWith("/app/chat") ? (
        <div className={cn("mt-6 flex flex-col flex-1 min-h-0", isCollapsed && "hidden")}>
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
                            : "rotate-0 opacity-0 group-hover/header:opacity-100 group-hover/header:text-text-secondary",
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
                                    router.push(`/app/chat?session=${session.id}`, {
                                      scroll: false,
                                    });
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
                                    <svg
                                      width="16"
                                      height="16"
                                      viewBox="0 0 24 24"
                                      fill="none"
                                      stroke="currentColor"
                                      strokeWidth="2"
                                      strokeLinecap="round"
                                      strokeLinejoin="round"
                                      className="shrink-0 text-text-muted"
                                    >
                                      <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
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
                                    setContextMenuId(
                                      contextMenuId === session.id ? null : session.id,
                                    );
                                  }}
                                  className={cn(
                                    "absolute right-1 z-10 p-1 rounded-md text-text-muted hover:text-text-primary hover:bg-bg-tertiary transition",
                                    contextMenuId === session.id
                                      ? "opacity-100"
                                      : "opacity-0 group-hover:opacity-100",
                                  )}
                                >
                                  <svg
                                    width="14"
                                    height="14"
                                    viewBox="0 0 24 24"
                                    fill="none"
                                    stroke="currentColor"
                                    strokeWidth="2"
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                  >
                                    <circle cx="12" cy="12" r="1" />
                                    <circle cx="12" cy="5" r="1" />
                                    <circle cx="12" cy="19" r="1" />
                                  </svg>
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
                                    <svg
                                      width="14"
                                      height="14"
                                      viewBox="0 0 24 24"
                                      fill="none"
                                      stroke="currentColor"
                                      strokeWidth="2"
                                      strokeLinecap="round"
                                      strokeLinejoin="round"
                                    >
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
                                    <svg
                                      width="14"
                                      height="14"
                                      viewBox="0 0 24 24"
                                      fill="none"
                                      stroke="currentColor"
                                      strokeWidth="2"
                                      strokeLinecap="round"
                                      strokeLinejoin="round"
                                    >
                                      <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
                                    </svg>
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
                                    <svg
                                      width="14"
                                      height="14"
                                      viewBox="0 0 24 24"
                                      fill="none"
                                      stroke="currentColor"
                                      strokeWidth="2"
                                      strokeLinecap="round"
                                      strokeLinejoin="round"
                                    >
                                      <path d="M3 6h18" />
                                      <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
                                      <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
                                    </svg>
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
                <p className="px-2.5 py-4 text-[12px] text-text-muted">Loading chats...</p>
              ) : null}
              {sessions.length === 0 && !historyLoading ? (
                <p className="px-2.5 py-4 text-[12px] text-text-muted">No chat history yet.</p>
              ) : null}
              {historyError ? (
                <p className="px-2.5 text-xs text-destructive">{historyError}</p>
              ) : null}
              {hasMoreSessions && historyLoading && sessions.length > 0 ? (
                <p className="px-2.5 py-2 text-[12px] text-text-muted">Loading older chats...</p>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}

      {/* Spacer for collapsed state */}
      {isCollapsed && <div className="flex-1" />}

      {/* ── Discord Study Room Button ── */}
      <div className={cn("mt-auto shrink-0", isCollapsed ? "p-2 pb-1" : "px-3 pb-1.5 pt-1")}>
        {isCollapsed ? (
          <a
            href={DISCORD_STUDY_ROOM_URL}
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
            href={DISCORD_STUDY_ROOM_URL}
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
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="text-text-muted group-hover:translate-x-0.5 transition"
            >
              <path d="m9 18 6-6-6-6" />
            </svg>
          </a>
        )}
      </div>

      {/* ── User Profile ── */}
      <div
        className={cn("border-t border-border shrink-0 relative", isCollapsed ? "p-2" : "p-3")}
        ref={profileMenuRef}
      >
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
                    {user.hasUnlimitedAccess ? "Unlimited plan" : "Free plan"}
                  </p>
                </div>
              </div>
            </div>

            <Link
              href="/app/profile"
              onClick={() => setIsProfileMenuOpen(false)}
              className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] font-medium text-text-secondary hover:bg-bg-secondary hover:text-text-primary transition"
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <circle cx="12" cy="8" r="4" />
                <path d="M4 22a8 8 0 0 1 16 0" />
              </svg>
              Learning profile
            </Link>

            <Link
              href="/teachers"
              onClick={() => setIsProfileMenuOpen(false)}
              className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] font-medium text-text-secondary hover:bg-bg-secondary hover:text-text-primary transition"
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                <circle cx="9" cy="7" r="4" />
                <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                <path d="M16 3.13a4 4 0 0 1 0 7.75" />
              </svg>
              Creator workspace
            </Link>

            {isAdminRole(user.role) && (
              <Link
                href="/admin"
                onClick={() => setIsProfileMenuOpen(false)}
                className="flex min-h-10 items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] font-medium text-text-secondary hover:bg-bg-secondary hover:text-text-primary focus-visible:outline-2 focus-visible:outline-offset-2"
              >
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M3 3v18h18" />
                  <path d="m7 16 4-5 4 3 5-7" />
                </svg>
                Platform analytics
              </Link>
            )}

            <Link
              href="/app/settings"
              onClick={() => setIsProfileMenuOpen(false)}
              className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] font-medium text-text-secondary hover:bg-bg-secondary hover:text-text-primary transition"
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
                <circle cx="12" cy="12" r="3" />
              </svg>
              Settings
            </Link>

            <div className="mx-1 my-1 border-t border-border" />

            <button
              onClick={handleLogout}
              className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] font-medium text-text-secondary hover:bg-bg-secondary hover:text-text-primary transition"
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                <polyline points="16 17 21 12 16 7" />
                <line x1="21" x2="9" y1="12" y2="12" />
              </svg>
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
              : "w-full gap-2.5 rounded-xl px-2 py-2",
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
                  {user.hasUnlimitedAccess ? "Unlimited plan" : "Free plan"}
                </p>
              </div>
              <div className="flex items-center pr-1 text-text-muted">
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="m9 18 6-6-6-6" />
                </svg>
              </div>
            </>
          )}
        </button>
      </div>

      {/* Rename Modal */}
      {renameSession && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm"
          onClick={() => !actionLoading && setRenameSession(null)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md rounded-xl border border-border bg-bg-primary p-6 animate-in slide-in-from-bottom-4 duration-200"
          >
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
              <Button
                variant="ghost"
                onClick={() => setRenameSession(null)}
                disabled={actionLoading}
              >
                Cancel
              </Button>
              <Button
                onClick={() => handleRenameSession(renameValue)}
                disabled={!renameValue.trim() || actionLoading}
              >
                {actionLoading ? "Saving..." : "Save"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Modal */}
      {deleteSessionId && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm"
          onClick={() => !actionLoading && setDeleteSessionId(null)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md rounded-xl border border-border bg-bg-primary p-6 animate-in slide-in-from-bottom-4 duration-200"
          >
            <h3 className="font-display text-xl mb-2 text-text-primary">Delete chat?</h3>
            <p className="text-sm text-text-secondary mb-6">
              This action cannot be undone. All messages in this chat will be permanently removed.
            </p>
            <div className="flex justify-end gap-2">
              <Button
                variant="ghost"
                onClick={() => setDeleteSessionId(null)}
                disabled={actionLoading}
              >
                Cancel
              </Button>
              <Button
                variant="danger"
                onClick={handleDeleteSession}
                disabled={actionLoading}
                className="whitespace-nowrap"
              >
                {actionLoading ? "Deleting..." : "Delete chat"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
