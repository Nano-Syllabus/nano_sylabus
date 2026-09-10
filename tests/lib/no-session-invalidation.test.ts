import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { QueryClient } from "@tanstack/react-query";
import { upsertSession } from "@/lib/query/chat-sessions";
import { keys } from "@/lib/query/keys";
import type { ChatSessionSummary } from "@/lib/types";

/**
 * The app-wide rule, stated by the user: cached data lives until the page is
 * reloaded. Nothing refetches on its own during a session; every write patches
 * the cache instead.
 *
 * This file guards the rule two ways. The first test is a grep — invalidation
 * is one line to add and reads as harmless at review time, so the boundary has
 * to be mechanical rather than remembered. The rest check that the patches
 * doing the work in its place are actually correct, because once nothing
 * refetches, a wrong patch is wrong until the student reloads.
 */

const ROOT = join(__dirname, "..", "..");
const SEARCHED = ["lib", "components", "app"];

/**
 * The two invalidations that are allowed to exist, and why:
 *
 * - `query-boot-reconcile.tsx` IS the rule. One invalidation per page load,
 *   under content already painted from the persisted cache.
 * - `dashboard.ts` exports `invalidateDashboard` as an unused escape hatch for
 *   a future event that genuinely needs one (an admin edit, say). It is a
 *   declaration, not a call.
 */
const ALLOWED = new Set(["components/query-boot-reconcile.tsx", "lib/query/dashboard.ts"]);

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(join(ROOT, dir))) {
    if (entry === "node_modules" || entry.startsWith(".")) continue;
    const rel = `${dir}/${entry}`;
    if (statSync(join(ROOT, rel)).isDirectory()) out.push(...sourceFiles(rel));
    else if (/\.tsx?$/.test(entry)) out.push(rel);
  }
  return out;
}

describe("no session-time refetching", () => {
  it("has no invalidateQueries or refetchQueries outside the two allowed places", () => {
    const offenders = SEARCHED.flatMap(sourceFiles)
      .filter((file) => !ALLOWED.has(file))
      .filter((file) => /\b(invalidateQueries|refetchQueries)\s*\(/.test(readFileSync(join(ROOT, file), "utf8")));

    expect(offenders).toEqual([]);
  });
});

function session(overrides: Partial<ChatSessionSummary> = {}): ChatSessionSummary {
  return {
    id: "s1",
    userId: "u1",
    title: "Newton's laws",
    createdAt: "2026-09-10T04:00:00.000Z",
    updatedAt: "2026-09-10T04:00:00.000Z",
    subjectTags: [],
    subjectContext: null,
    isPinned: false,
    ...overrides,
  } as ChatSessionSummary;
}

function seed(client: QueryClient, params: { q?: string; limit?: number }, sessions: ChatSessionSummary[]) {
  client.setQueryData(keys.chat.sessions.list(params), {
    pages: [{ sessions, hasMore: false }],
    pageParams: [0],
  });
}

describe("upsertSession", () => {
  it("prepends a new session to the unfiltered list", () => {
    const client = new QueryClient();
    seed(client, { limit: 12 }, [session({ id: "old" })]);

    upsertSession(client, session({ id: "new" }));

    const data = client.getQueryData(keys.chat.sessions.list({ limit: 12 })) as {
      pages: { sessions: ChatSessionSummary[] }[];
    };
    expect(data.pages[0].sessions.map((s) => s.id)).toEqual(["new", "old"]);
  });

  it("replaces an existing session in place rather than reordering it", () => {
    const client = new QueryClient();
    seed(client, { limit: 12 }, [session({ id: "a" }), session({ id: "b", title: "Old title" })]);

    upsertSession(client, session({ id: "b", title: "Renamed" }));

    const data = client.getQueryData(keys.chat.sessions.list({ limit: 12 })) as {
      pages: { sessions: ChatSessionSummary[] }[];
    };
    // Order untouched: a rename must not make the row jump under the reader.
    expect(data.pages[0].sessions.map((s) => s.id)).toEqual(["a", "b"]);
    expect(data.pages[0].sessions[1].title).toBe("Renamed");
  });

  it("does not push a new session into a search-filtered list", () => {
    const client = new QueryClient();
    seed(client, { q: "physics", limit: 12 }, [session({ id: "match", title: "physics revision" })]);

    upsertSession(client, session({ id: "new", title: "New chat" }));

    const data = client.getQueryData(keys.chat.sessions.list({ q: "physics", limit: 12 })) as {
      pages: { sessions: ChatSessionSummary[] }[];
    };
    // "New chat" does not match "physics"; showing it would contradict the
    // filter the student typed.
    expect(data.pages[0].sessions.map((s) => s.id)).toEqual(["match"]);
  });

  it("still updates a renamed session inside a search-filtered list", () => {
    const client = new QueryClient();
    seed(client, { q: "physics", limit: 12 }, [session({ id: "m", title: "physics revision" })]);

    upsertSession(client, session({ id: "m", title: "physics revision (final)" }));

    const data = client.getQueryData(keys.chat.sessions.list({ q: "physics", limit: 12 })) as {
      pages: { sessions: ChatSessionSummary[] }[];
    };
    expect(data.pages[0].sessions[0].title).toBe("physics revision (final)");
  });

  it("writes into every cached list, not just the first one it finds", () => {
    const client = new QueryClient();
    seed(client, { limit: 12 }, [session({ id: "x", title: "Before" })]);
    seed(client, { q: "newton", limit: 12 }, [session({ id: "x", title: "Before" })]);

    upsertSession(client, session({ id: "x", title: "After" }));

    for (const params of [{ limit: 12 }, { q: "newton", limit: 12 }]) {
      const data = client.getQueryData(keys.chat.sessions.list(params)) as {
        pages: { sessions: ChatSessionSummary[] }[];
      };
      expect(data.pages[0].sessions[0].title).toBe("After");
    }
  });
});
