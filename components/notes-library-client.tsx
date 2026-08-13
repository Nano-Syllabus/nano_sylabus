"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { RevisionNoteSummary } from "@/lib/types";
import { formatDate, titleCase } from "@/lib/utils";

type NotesLibraryClientProps = {
  notes: RevisionNoteSummary[];
  initialSubjectSlug?: string | null;
};

function subjectKey(note: RevisionNoteSummary) {
  return note.subjectSlug || `legacy:${note.subjectTag}`;
}

function subjectHref(note: RevisionNoteSummary) {
  return note.subjectSlug ? `/app/explore/${encodeURIComponent(note.subjectSlug)}` : null;
}

export function NotesLibraryClient({ notes, initialSubjectSlug = null }: NotesLibraryClientProps) {
  const router = useRouter();
  const [view, setView] = useState<"grid" | "list">("grid");
  const [search, setSearch] = useState("");
  const [subjectFilter, setSubjectFilter] = useState(initialSubjectSlug || "all");

  const subjects = useMemo(
    () => {
      const options = new Map<string, string>();
      for (const note of notes) options.set(subjectKey(note), titleCase(note.subjectTag));
      return [{ key: "all", label: "All subjects" }, ...Array.from(options, ([key, label]) => ({ key, label }))];
    },
    [notes],
  );

  const activeSubjectLabel = subjects.find((subject) => subject.key === subjectFilter)?.label ?? null;

  function updateSubjectFilter(value: string) {
    setSubjectFilter(value);
    router.replace(value === "all" ? "/app/notes" : `/app/notes?subject=${encodeURIComponent(value)}`);
  }

  const filtered = useMemo(() => {
    return notes.filter((note) => {
      if (subjectFilter !== "all" && subjectKey(note) !== subjectFilter) return false;
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
              className="h-10 w-full rounded-full border border-border bg-bg-primary pl-9 pr-3 text-sm placeholder:text-text-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-strong focus-visible:ring-offset-2 focus-visible:ring-offset-bg-secondary"
            />
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-muted">
              ⌕
            </span>
          </div>

          <select
            aria-label="Filter notes by subject"
            value={subjectFilter}
            onChange={(event) => updateSubjectFilter(event.target.value)}
            className="h-10 rounded-full border border-border bg-bg-primary px-3 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-strong focus-visible:ring-offset-2 focus-visible:ring-offset-bg-secondary"
          >
            {subjects.map((subject) => (
              <option key={subject.key} value={subject.key}>{subject.label}</option>
            ))}
          </select>

          <div className="ml-auto inline-flex rounded-full border border-border p-0.5">
            {(["grid", "list"] as const).map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => setView(value)}
                className={
                  "rounded-full px-2.5 py-1 text-[11px] font-mono-ui transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-strong " +
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
        {activeSubjectLabel && subjectFilter !== "all" ? (
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-bg-secondary px-4 py-3">
            <p className="text-sm text-text-secondary">
              Showing notes for <span className="font-medium text-text-primary">{activeSubjectLabel}</span>
            </p>
            <Link
              href="/app/notes"
              className="text-sm font-medium text-text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-strong focus-visible:ring-offset-2 focus-visible:ring-offset-bg-primary"
            >
              View all notes
            </Link>
          </div>
        ) : null}
        {filtered.length === 0 ? (
          <EmptyState subjectLabel={activeSubjectLabel} />
        ) : view === "grid" ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {filtered.map((note) => (
              <article
                key={note.id}
                className="group relative overflow-hidden rounded-2xl border border-border bg-bg-primary p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-border-strong hover:shadow-md"
              >
                <div className="flex items-center justify-between gap-2">
                  {subjectHref(note) ? (
                    <Link
                      href={subjectHref(note)!}
                      className="rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-strong focus-visible:ring-offset-2 focus-visible:ring-offset-bg-primary"
                    >
                      <Badge variant="outline">{titleCase(note.subjectTag)}</Badge>
                    </Link>
                  ) : (
                    <Badge variant="outline">{titleCase(note.subjectTag)}</Badge>
                  )}
                  <span className="text-[10px] text-text-muted">{formatDate(note.createdAt)}</span>
                </div>
                <Link
                  href={`/app/notes/${note.id}`}
                  onPointerEnter={() => router.prefetch(`/app/notes/${note.id}`)}
                  onFocus={() => router.prefetch(`/app/notes/${note.id}`)}
                  className="mt-3 block rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-strong focus-visible:ring-offset-2 focus-visible:ring-offset-bg-primary"
                >
                  <h3 className="line-clamp-2 font-display text-xl leading-snug">{note.title}</h3>
                  <p className="mt-2 line-clamp-3 text-xs text-text-secondary">
                    {note.answerContent.replace(/[*_`#]/g, "")}
                  </p>
                </Link>
                <div className="mt-4 flex justify-end text-[11px] text-text-muted">
                  <span className="opacity-0 transition group-hover:opacity-100">Open →</span>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <ul className="overflow-hidden rounded-lg border border-border divide-y divide-border">
            {filtered.map((note) => (
              <li key={note.id} className="flex items-center gap-4 px-4 py-3 transition hover:bg-bg-secondary">
                <Link
                  href={`/app/notes/${note.id}`}
                  onPointerEnter={() => router.prefetch(`/app/notes/${note.id}`)}
                  onFocus={() => router.prefetch(`/app/notes/${note.id}`)}
                  className="min-w-0 flex-1 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-strong focus-visible:ring-offset-2 focus-visible:ring-offset-bg-primary"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{note.title}</p>
                    {note.chapterTag ? <p className="truncate text-xs text-text-muted">{note.chapterTag}</p> : null}
                  </div>
                </Link>
                {subjectHref(note) ? (
                  <Link
                    href={subjectHref(note)!}
                    className="shrink-0 rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-strong focus-visible:ring-offset-2 focus-visible:ring-offset-bg-primary"
                  >
                    <Badge variant="outline">{titleCase(note.subjectTag)}</Badge>
                  </Link>
                ) : (
                  <Badge variant="outline">{titleCase(note.subjectTag)}</Badge>
                )}
                <span className="shrink-0 text-xs text-text-muted">{formatDate(note.createdAt)}</span>
                <span className="text-text-muted" aria-hidden="true">→</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}

function EmptyState({ subjectLabel }: { subjectLabel: string | null }) {
  return (
    <div className="rounded-xl border border-dashed border-border p-12 text-center">
      <p className="text-3xl">📭</p>
      <h3 className="mt-3 font-display text-2xl">
        {subjectLabel ? `No notes for ${subjectLabel}` : "No notes match these filters"}
      </h3>
      <p className="mt-2 text-sm text-text-muted">
        Save grounded AI answers from the chat to build your revision set.
      </p>
      <Link href="/app/chat" className="mt-6 inline-block">
        <Button variant="outline">Go to chat</Button>
      </Link>
    </div>
  );
}
