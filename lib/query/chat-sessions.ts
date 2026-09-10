"use client";

import { useEffect, useMemo } from "react";
import {
  useInfiniteQuery,
  useMutation,
  useQueryClient,
  type InfiniteData,
  type QueryClient,
} from "@tanstack/react-query";
import { apiFetch, queryString } from "@/lib/query/api";
import { keys } from "@/lib/query/keys";
import { STALE } from "@/lib/query/client";
import type { ChatSessionSummary } from "@/lib/types";

export type ChatSessionsPage = {
  sessions: ChatSessionSummary[];
  hasMore: boolean;
};

type SessionsData = InfiniteData<ChatSessionsPage, number>;

/** How many titles a page of history is. Matches what the sidebar always asked for. */
const PAGE_SIZE = 12;

/**
 * The sidebar's chat history: paged, searchable, and cached per search term.
 *
 * WHY `useInfiniteQuery` AND NOT A `useState` ARRAY
 * -------------------------------------------------
 * The hand-rolled version held the accumulated list in component state, which
 * meant the whole thing was rebuilt from scratch on every remount — and the
 * sidebar remounts on every navigation out of and back into `/app`. So moving
 * Today -> Chat -> Today refetched twelve titles twice, and the list flashed
 * empty each time while it did.
 *
 * Pages live in the query cache here, keyed by search term. Scrolled four
 * pages deep, navigated away and come back: all four pages are still there and
 * paint immediately. Typed a search, cleared it, typed it again: the cached
 * result answers with no request at all.
 *
 * `staleTime: LIVE` is deliberate and is not a contradiction of the above. A
 * cached page is still SHOWN instantly on mount; `LIVE` only means a
 * revalidation starts behind it. Chat titles are renamed by the chat page
 * itself while the sidebar is mounted, so the list has to catch up — but the
 * user should never watch it do so.
 */
export function useChatSessions(search: string, enabled = true) {
  const trimmed = search.trim();

  const query = useInfiniteQuery({
    queryKey: keys.chat.sessions.list({ q: trimmed || undefined, limit: PAGE_SIZE }),
    queryFn: ({ pageParam, signal }) =>
      apiFetch<ChatSessionsPage>(
        `/api/chat/sessions${queryString({ limit: PAGE_SIZE, offset: pageParam, q: trimmed })}`,
        { signal },
      ),
    initialPageParam: 0,
    getNextPageParam: (lastPage, allPages) =>
      lastPage.hasMore ? allPages.reduce((total, page) => total + page.sessions.length, 0) : undefined,
    /**
     * DO NOT FETCH A LIST NOBODY IS LOOKING AT.
     *
     * The sidebar is mounted on every /app page, but it only RENDERS the chat
     * history on /app/chat. Fetching it unconditionally meant Today, Community
     * Hub, Challenge Hub and Notes each paid for a page of chat titles that was
     * never drawn — and the cost is not the titles. `/api/chat/sessions`
     * authenticates with `getVerifiedUser`, which is a round trip to Supabase
     * over the public internet, and those queue against the Supabase calls the
     * page's own server render needs. That is what turned every navigation into
     * a multi-second wait: not the work, the contention.
     */
    enabled,
    /**
     * SESSION, not LIVE, and not SHORT either.
     *
     * LIVE meant "refetch on every mount", which for a component mounted on
     * every page was a request per navigation, forever.
     *
     * The window is safe to make generous because correctness here does not
     * rest on it. EVERY path that changes this list invalidates the key
     * directly: pin, rename and delete through their mutations below, and the
     * chat page's `chat-session-updated` event through `useChatSessionEvents`
     * (which covers a session being created or auto-titled). The window only
     * decides how long a passive revisit is free — and on the chat screen it is
     * free regardless, because `app/app/chat/page.tsx` now seeds this exact
     * entry from its own server read.
     *
     * What a five-minute window cannot catch is a session created in ANOTHER
     * tab. That corrects itself on the next invalidation, on reconnect, or on
     * the next mount past the window — an acceptable lag for a list of titles.
     */
    staleTime: STALE.SESSION,
    /**
     * Keeps the previous term's results on screen while a new search runs, so
     * typing does not blank the list between keystrokes. With the 250ms
     * debounce the sidebar already applies, this is the difference between a
     * list that filters and a list that flickers.
     */
    placeholderData: (previous) => previous,
  });

  /**
   * The pages flattened, with duplicates removed.
   *
   * The dedupe is not defensive tidying — it is load-bearing. Offsets are
   * computed from what has already been fetched, so a session created (or
   * renamed to the top) between page 1 and page 2 shifts every later row down
   * by one and the same id comes back on both pages. The old code deduped for
   * the same reason; this keeps it, and keeps first-seen order so a row does
   * not jump.
   */
  const sessions = useMemo(() => {
    const seen = new Set<string>();
    const flat: ChatSessionSummary[] = [];
    for (const page of query.data?.pages ?? []) {
      for (const session of page.sessions) {
        if (seen.has(session.id)) continue;
        seen.add(session.id);
        flat.push(session);
      }
    }
    return flat;
  }, [query.data]);

  return { ...query, sessions };
}

/**
 * Rewrites one session everywhere it is cached, across every search term.
 *
 * A pin or a rename has to be visible in the list the user is looking at, and
 * that list may be any of several cached pages under any of several search
 * keys. Walking `["chat","sessions","list"]` as a prefix catches all of them
 * without knowing which; `setQueriesData` is a no-op for keys that hold no
 * matching row, so this is cheap even with a dozen cached searches.
 */
function patchSessionEverywhere(
  client: QueryClient,
  sessionId: string,
  patch: (session: ChatSessionSummary) => ChatSessionSummary,
) {
  client.setQueriesData<SessionsData>({ queryKey: keys.chat.sessions.all() }, (data) => {
    if (!data) return data;
    return {
      ...data,
      pages: data.pages.map((page) => ({
        ...page,
        sessions: page.sessions.map((session) =>
          session.id === sessionId ? patch(session) : session,
        ),
      })),
    };
  });
}

function removeSessionEverywhere(client: QueryClient, sessionId: string) {
  client.setQueriesData<SessionsData>({ queryKey: keys.chat.sessions.all() }, (data) => {
    if (!data) return data;
    return {
      ...data,
      pages: data.pages.map((page) => ({
        ...page,
        sessions: page.sessions.filter((session) => session.id !== sessionId),
      })),
    };
  });
}

/**
 * Pin or unpin, optimistically.
 *
 * The star has to move on the click, not on the round trip — it is the most
 * common action in the sidebar and the round trip is to a VPS. `onMutate`
 * flips it and returns the previous value; `onError` puts it back. That
 * rollback is the part hand-written optimistic updates usually skip, and it is
 * why the old code carried the same `setSessions` revert three times over.
 */
export function useToggleSessionPin() {
  const client = useQueryClient();

  return useMutation({
    mutationFn: ({ session }: { session: ChatSessionSummary }) =>
      apiFetch<ChatSessionSummary>(`/api/chat/sessions/${session.id}`, {
        method: "PATCH",
        body: { isPinned: !session.isPinned },
      }),
    onMutate: async ({ session }) => {
      // Any refetch in flight would land AFTER this optimistic write and undo
      // it with the server's pre-mutation answer.
      await client.cancelQueries({ queryKey: keys.chat.sessions.all() });
      const previous = client.getQueriesData<SessionsData>({ queryKey: keys.chat.sessions.all() });
      patchSessionEverywhere(client, session.id, (row) => ({ ...row, isPinned: !row.isPinned }));
      return { previous };
    },
    onError: (_error, _variables, context) => {
      for (const [key, data] of context?.previous ?? []) client.setQueryData(key, data);
    },
    onSuccess: (updated) => {
      // The server's row replaces the optimistic one. No invalidation follows:
      // this IS the fresh value, so refetching it would spend a round trip to
      // be told what the client just wrote.
      patchSessionEverywhere(client, updated.id, () => updated);
    },
  });
}

export function useRenameSession() {
  const client = useQueryClient();

  return useMutation({
    mutationFn: ({ sessionId, title }: { sessionId: string; title: string }) =>
      apiFetch<ChatSessionSummary>(`/api/chat/sessions/${sessionId}`, {
        method: "PATCH",
        body: { title },
      }),
    onSuccess: (updated) => {
      patchSessionEverywhere(client, updated.id, () => updated);
    },
  });
}

export function useDeleteSession() {
  const client = useQueryClient();

  return useMutation({
    mutationFn: ({ sessionId }: { sessionId: string }) =>
      apiFetch<void>(`/api/chat/sessions/${sessionId}`, { method: "DELETE" }),
    onMutate: async ({ sessionId }) => {
      await client.cancelQueries({ queryKey: keys.chat.sessions.all() });
      const previous = client.getQueriesData<SessionsData>({ queryKey: keys.chat.sessions.all() });
      removeSessionEverywhere(client, sessionId);
      return { previous };
    },
    onError: (_error, _variables, context) => {
      for (const [key, data] of context?.previous ?? []) client.setQueryData(key, data);
    },
    // No `onSettled` invalidation: the row is gone from the cache and gone from
    // the database. There is nothing a refetch could correct.
  });
}

/**
 * Bridges the `chat-session-updated` window event into cache invalidation.
 *
 * The chat page dispatches that event when it creates a session or the model
 * titles one, and it has no reference to the sidebar to tell it directly. The
 * event stays — it is the decoupling that makes those two components
 * independent — but what it now triggers is an INVALIDATION rather than an
 * imperative refetch, which means: if the sidebar is not mounted, nothing
 * happens now and the list is refetched when it next mounts; if it is mounted,
 * the refetch happens under the list already on screen instead of blanking it.
 */
export function useChatSessionEvents() {
  const client = useQueryClient();

  useEffect(() => {
    const onUpdated = (event: Event) => {
      const session = (event as CustomEvent<ChatSessionSummary | undefined>).detail;
      // The chat page builds the full row before dispatching, so the sidebar
      // can write it straight in. It used to invalidate here instead, which
      // refetched a whole page of titles to learn one the sender already had.
      if (session?.id) upsertSession(client, session);
    };
    window.addEventListener("chat-session-updated", onUpdated);
    return () => window.removeEventListener("chat-session-updated", onUpdated);
  }, [client]);
}

/**
 * Write one session into the sidebar's cached lists.
 *
 * A row that is already cached is replaced in place, everywhere it appears —
 * that covers renames and pins, and it deliberately does not reorder anything
 * under a reader who is looking at the list.
 *
 * A row that is *new* is prepended, but only to the unfiltered list. The search
 * term lives in the query key, so the caches keyed by `q` hold "sessions
 * matching that word"; pushing a brand-new "New chat" into one of them would
 * put a row on screen that does not match the filter the student typed. Those
 * lists simply do not learn about the new session until they are next fetched,
 * which is correct — an unmatched row is worse than a missing one.
 *
 * Front of the first page is where the server would put it too: the list is
 * ordered pinned-first then by `updated_at`, and a session created a moment ago
 * is the most recently updated one.
 */
export function upsertSession(client: QueryClient, session: ChatSessionSummary) {
  const entries = client.getQueriesData<SessionsData>({ queryKey: keys.chat.sessions.all() });

  for (const [key, data] of entries) {
    if (!data?.pages) continue;

    const exists = data.pages.some((page) => page.sessions.some((s) => s.id === session.id));
    if (exists) {
      client.setQueryData<SessionsData>(key, {
        ...data,
        pages: data.pages.map((page) => ({
          ...page,
          sessions: page.sessions.map((s) => (s.id === session.id ? { ...s, ...session } : s)),
        })),
      });
      continue;
    }

    // `["chat","sessions","list",{ q, limit }]` — anything with a search term is
    // a filtered view and must not gain an unmatched row.
    const params = key[3] as { q?: string } | undefined;
    if (params?.q) continue;

    client.setQueryData<SessionsData>(key, {
      ...data,
      pages: data.pages.map((page, index) =>
        index === 0 ? { ...page, sessions: [session, ...page.sessions] } : page,
      ),
    });
  }
}
