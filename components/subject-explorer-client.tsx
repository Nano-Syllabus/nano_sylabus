"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/field";
import type { SubjectExplorerSummary } from "@/lib/types";
import { formatDate } from "@/lib/utils";

export function SubjectExplorerClient({ subjects }: { subjects: SubjectExplorerSummary[] }) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const lowered = query.trim().toLowerCase();
    if (!lowered) return subjects;
    return subjects.filter((subject) => subject.subject.toLowerCase().includes(lowered));
  }, [query, subjects]);

  return (
    <div className="mx-auto max-w-6xl px-5 py-8">
      <div className="mb-6 max-w-md">
        <Input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search subjects..."
        />
      </div>

      {filtered.length ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {filtered.map((subject) => (
            <article key={subject.subject} className="rounded-2xl border border-border bg-bg-primary p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[10px] font-mono-ui uppercase text-text-muted">
                    {subject.inProfile ? "From your profile" : "Other subject"}
                  </p>
                  <h2 className="mt-2 font-display text-3xl">{subject.subject}</h2>
                </div>
                <span className="flex h-10 w-10 items-center justify-center rounded-full bg-bg-secondary text-lg">
                  {subject.subject.slice(0, 1).toUpperCase()}
                </span>
              </div>

              <div className="mt-6 grid grid-cols-2 gap-3">
                <div className="rounded-xl border border-border bg-bg-secondary p-3">
                  <p className="text-[10px] font-mono-ui uppercase text-text-muted">Questions</p>
                  <p className="mt-1 font-display text-3xl">{subject.questionCount}</p>
                </div>
                <div className="rounded-xl border border-border bg-bg-secondary p-3">
                  <p className="text-[10px] font-mono-ui uppercase text-text-muted">Sessions</p>
                  <p className="mt-1 font-display text-3xl">{subject.sessionCount}</p>
                </div>
              </div>

              <p className="mt-4 text-xs text-text-muted">
                {subject.lastActivityAt ? `Last activity ${formatDate(subject.lastActivityAt)}` : "No chat yet"}
              </p>

              <div className="mt-5 flex gap-2">
                <Link href={`/app/explore/${encodeURIComponent(subject.subject)}`} className="flex-1">
                  <Button variant="outline" className="w-full">
                    Open subject
                  </Button>
                </Link>
                <Link href={`/app/chat?subject=${encodeURIComponent(subject.subject)}`} className="flex-1">
                  <Button className="w-full">Start chat</Button>
                </Link>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className="rounded-2xl border border-dashed border-border p-10 text-center text-sm text-text-secondary">
          No subjects found yet.
        </div>
      )}
    </div>
  );
}
