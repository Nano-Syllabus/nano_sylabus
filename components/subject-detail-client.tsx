"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/field";
import type { SubjectExplorerSessionSummary } from "@/lib/types";
import { formatDate } from "@/lib/utils";

export function SubjectDetailClient({
  subject,
  sessions,
}: {
  subject: string;
  sessions: SubjectExplorerSessionSummary[];
}) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const lowered = query.trim().toLowerCase();
    if (!lowered) return sessions;
    return sessions.filter((session) => session.title.toLowerCase().includes(lowered));
  }, [query, sessions]);

  return (
    <div className="mx-auto max-w-5xl px-5 py-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-[10px] font-mono-ui uppercase text-text-muted">Subject Explorer</p>
          <h1 className="mt-2 font-display text-4xl">{subject}</h1>
          <p className="mt-2 text-sm text-text-secondary">
            Browse your previous sessions in this subject or start a focused new chat.
          </p>
        </div>
        <Link href={`/app/chat?subject=${encodeURIComponent(subject)}`}>
          <Button>Start new chat</Button>
        </Link>
      </div>

      <div className="mt-6 max-w-md">
        <Input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={`Search ${subject} chats...`}
        />
      </div>

      <div className="mt-8 space-y-3">
        {filtered.length ? (
          filtered.map((session) => (
            <article key={session.id} className="rounded-2xl border border-border bg-bg-primary p-5">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <h2 className="font-medium">{session.title}</h2>
                  <p className="mt-1 text-sm text-text-secondary">
                    {session.turnCount} turns · Last activity {formatDate(session.updatedAt)}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="outline">{session.language === "RN" ? "Roman Nepali" : "English"}</Badge>
                  <Link href={`/app/chat?session=${session.id}`}>
                    <Button size="sm" variant="outline">
                      Open →
                    </Button>
                  </Link>
                </div>
              </div>
            </article>
          ))
        ) : (
          <div className="rounded-2xl border border-dashed border-border p-10 text-center text-sm text-text-secondary">
            No sessions found for this subject yet.
          </div>
        )}
      </div>
    </div>
  );
}
