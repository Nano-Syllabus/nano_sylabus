"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { RevisionNoteSummary } from "@/lib/types";
import { formatDate } from "@/lib/utils";

export function NotesLibraryClient({ notes }: { notes: RevisionNoteSummary[] }) {
  const router = useRouter();
  const [view, setView] = useState<"grid" | "list">("grid");
  const [search, setSearch] = useState("");
  const [subjectFilter, setSubjectFilter] = useState<string>("All");

  const subjects = useMemo(
    () => ["All", ...Array.from(new Set(notes.map((note) => note.subjectTag)))],
    [notes],
  );

  const filtered = useMemo(() => {
    return notes.filter((note) => {
      if (subjectFilter !== "All" && note.subjectTag !== subjectFilter) return false;
      if (search) {
        const query = search.toLowerCase();
        if (
          !note.title.toLowerCase().includes(query) &&
          !note.answerContent.toLowerCase().includes(query)
        ) {
          return false;
        }
      }
      return true;
    });
  }, [notes, subjectFilter, search]);

  return (
    <>
      <div className="border-b border-border bg-bg-secondary px-4 py-3 md:px-6">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-2">
          <div className="relative min-w-[200px] flex-1">
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search notes..."
              className="h-9 w-full rounded-full border border-border bg-bg-primary pl-9 pr-3 text-sm placeholder:text-text-muted focus:outline-none focus:border-border-strong"
            />
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-muted">
              ⌕
            </span>
          </div>

          <select
            value={subjectFilter}
            onChange={(event) => setSubjectFilter(event.target.value)}
            className="h-9 rounded-full border border-border bg-bg-primary px-3 text-xs focus:outline-none"
          >
            {subjects.map((subject) => (
              <option key={subject}>{subject}</option>
            ))}
          </select>

          <div className="ml-auto inline-flex rounded-full border border-border p-0.5">
            {(["grid", "list"] as const).map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => setView(value)}
                className={
                  "rounded-full px-2.5 py-1 text-[11px] font-mono-ui transition " +
                  (view === value ? "bg-text-primary text-text-inverse" : "text-text-secondary")
                }
              >
                {value === "grid" ? "▦" : "≡"}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-6xl px-4 py-6 md:px-6">
        {filtered.length === 0 ? (
          <EmptyState />
        ) : view === "grid" ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {filtered.map((note) => (
              <Link
                key={note.id}
                href={`/app/notes/${note.id}`}
                onPointerEnter={() => router.prefetch(`/app/notes/${note.id}`)}
                onFocus={() => router.prefetch(`/app/notes/${note.id}`)}
                className="group relative block overflow-hidden rounded-2xl border border-white/15 bg-[linear-gradient(145deg,rgba(255,255,255,0.055),rgba(255,255,255,0.012)_38%,rgba(255,255,255,0.035))] p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_18px_45px_rgba(0,0,0,0.18)] transition hover:-translate-y-0.5 hover:border-white/30 hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.14),0_22px_60px_rgba(0,0,0,0.28)]"
              >
                <div className="flex items-center justify-between gap-2">
                  <Badge variant="outline">{note.subjectTag}</Badge>
                  <span className="text-[10px] text-text-muted">{formatDate(note.createdAt)}</span>
                </div>
                <h3 className="mt-3 line-clamp-2 font-display text-xl leading-snug">{note.title}</h3>
                <p className="mt-2 line-clamp-3 text-xs text-text-secondary">
                  {note.answerContent.replace(/[*_`#]/g, "")}
                </p>
                <div className="mt-4 flex justify-end text-[11px] text-text-muted">
                  <span className="opacity-0 transition group-hover:opacity-100">Open →</span>
                </div>
              </Link>
            ))}
          </div>
        ) : (
          <ul className="overflow-hidden rounded-lg border border-border divide-y divide-border">
            {filtered.map((note) => (
              <li key={note.id}>
                <Link
                  href={`/app/notes/${note.id}`}
                  onPointerEnter={() => router.prefetch(`/app/notes/${note.id}`)}
                  onFocus={() => router.prefetch(`/app/notes/${note.id}`)}
                  className="flex items-center gap-4 px-4 py-3 transition hover:bg-bg-secondary"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{note.title}</p>
                    <p className="truncate text-xs text-text-muted">
                      {note.subjectTag}
                      {note.chapterTag ? ` · ${note.chapterTag}` : ""}
                    </p>
                  </div>
                  <span className="text-xs text-text-muted">{formatDate(note.createdAt)}</span>
                  <span className="text-text-muted">→</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}

function EmptyState() {
  return (
    <div className="rounded-xl border border-dashed border-border p-12 text-center">
      <p className="text-3xl">📭</p>
      <h3 className="mt-3 font-display text-2xl">No notes match these filters</h3>
      <p className="mt-2 text-sm text-text-muted">
        Save grounded AI answers from the chat to build your revision set.
      </p>
      <Link href="/app/chat" className="mt-6 inline-block">
        <Button variant="outline">Go to chat</Button>
      </Link>
    </div>
  );
}
