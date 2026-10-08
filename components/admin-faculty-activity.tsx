"use client";

import { useCallback, useEffect, useState } from "react";
import {
  BookOpen,
  Building2,
  Globe2,
  History,
  Settings2,
  UserCog,
  Users,
  type LucideIcon,
} from "lucide-react";
import type { FacultyActivityEntry } from "@/lib/data/faculty-activity";

type Category = "all" | "subjects" | "access" | "settings" | "students";

const CATEGORIES: Array<{ id: Category; label: string }> = [
  { id: "all", label: "All" },
  { id: "subjects", label: "Subjects" },
  { id: "access", label: "People & access" },
  { id: "settings", label: "Faculty & site" },
  { id: "students", label: "Students" },
];

function categoryOf(action: string): Exclude<Category, "all"> {
  if (action.startsWith("subject.")) return "subjects";
  if (action === "site.admin_added" || action === "site.admin_removed" || action === "faculty.owner_changed")
    return "access";
  if (action.startsWith("student.")) return "students";
  return "settings";
}

const ICONS: Record<Exclude<Category, "all">, LucideIcon> = {
  subjects: BookOpen,
  access: UserCog,
  settings: Settings2,
  students: Users,
};

function iconFor(action: string): LucideIcon {
  if (action.startsWith("site.faculty_")) return Globe2;
  if (action === "faculty.created" || action === "faculty.deleted") return Building2;
  return ICONS[categoryOf(action)];
}

function when(value: string) {
  const date = new Date(value);
  const minutes = Math.round((Date.now() - date.getTime()) / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  if (minutes < 60 * 24) return `${Math.round(minutes / 60)} h ago`;
  return date.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

/**
 * The change log: who did what to a faculty (or to every faculty in reach when
 * `facultySlug` is omitted), filterable by kind, newest first, paged.
 */
export function AdminFacultyActivity({
  facultySlug,
  showFaculty = !facultySlug,
  title = "Change history",
}: {
  facultySlug?: string;
  /** Name the faculty on each row — on for the all-faculties feed. */
  showFaculty?: boolean;
  title?: string;
}) {
  const [entries, setEntries] = useState<FacultyActivityEntry[] | null>(null);
  const [available, setAvailable] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [done, setDone] = useState(false);
  const [category, setCategory] = useState<Category>("all");

  const load = useCallback(
    async (before?: number) => {
      const params = new URLSearchParams({ limit: "50" });
      if (facultySlug) params.set("faculty", facultySlug);
      if (before) params.set("before", String(before));
      const response = await fetch(`/api/admin/faculty-activity?${params}`, { cache: "no-store" });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "Couldn’t load the change history.");
      return payload as { entries: FacultyActivityEntry[]; available: boolean };
    },
    [facultySlug],
  );

  useEffect(() => {
    let cancelled = false;
    load()
      .then((result) => {
        if (cancelled) return;
        setEntries(result.entries);
        setAvailable(result.available);
        setDone(result.entries.length < 50);
      })
      .catch((cause) => !cancelled && setError((cause as Error).message));
    return () => {
      cancelled = true;
    };
  }, [load]);

  async function loadMore() {
    if (!entries?.length) return;
    setLoadingMore(true);
    try {
      const result = await load(entries[entries.length - 1].id);
      setEntries((current) => [...(current ?? []), ...result.entries]);
      setDone(result.entries.length < 50);
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setLoadingMore(false);
    }
  }

  const shown = (entries ?? []).filter(
    (entry) => category === "all" || categoryOf(entry.action) === category,
  );

  return (
    <section className="rounded-xl border border-border bg-card">
      <div className="flex flex-wrap items-center gap-3 border-b border-border px-4 py-3">
        <History size={16} className="text-muted-foreground" aria-hidden="true" />
        <h2 className="flex-1 text-sm font-semibold">{title}</h2>
        <div className="flex flex-wrap gap-1" role="group" aria-label="Filter changes">
          {CATEGORIES.map((item) => (
            <button
              key={item.id}
              type="button"
              aria-pressed={category === item.id}
              onClick={() => setCategory(item.id)}
              className={`min-h-8 rounded-full px-3 text-xs font-medium ${
                category === item.id
                  ? "bg-blue-600 text-white"
                  : "bg-muted text-muted-foreground hover:text-foreground"
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      {error ? (
        <p className="px-4 py-6 text-sm text-red-600">{error}</p>
      ) : !available ? (
        <p className="px-4 py-6 text-sm text-muted-foreground">
          Change tracking starts once the Supabase migration{" "}
          <code className="text-xs">20261008150000_faculty_activity.sql</code> is applied.
        </p>
      ) : entries === null ? (
        <ul className="divide-y divide-border" aria-hidden="true">
          {Array.from({ length: 4 }, (_, index) => (
            <li key={index} className="flex gap-3 px-4 py-3">
              <span className="size-8 shrink-0 rounded-lg bg-border" />
              <span className="flex-1 space-y-2 py-1">
                <span className="block h-3 w-2/3 rounded bg-border" />
                <span className="block h-3 w-1/3 rounded bg-border" />
              </span>
            </li>
          ))}
        </ul>
      ) : shown.length ? (
        <ol className="divide-y divide-border">
          {shown.map((entry) => {
            const Icon = iconFor(entry.action);
            const via = typeof entry.details.via === "string" ? entry.details.via : "";
            return (
              <li key={entry.id} className="flex gap-3 px-4 py-3">
                <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground">
                  <Icon size={15} aria-hidden="true" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-foreground">
                    {showFaculty && entry.facultyName ? (
                      <span className="font-medium">{entry.facultyName}: </span>
                    ) : null}
                    {entry.summary}
                  </p>
                  <p className="mt-0.5 flex flex-wrap gap-x-2 text-xs text-muted-foreground">
                    <span>
                      {entry.actor ? (
                        <>
                          by <span className="font-medium text-foreground">{entry.actor.fullName}</span>
                          {entry.actor.email ? ` (${entry.actor.email})` : ""}
                        </>
                      ) : (
                        "by the system"
                      )}
                    </span>
                    <time dateTime={entry.createdAt} title={new Date(entry.createdAt).toLocaleString()}>
                      {when(entry.createdAt)}
                    </time>
                    {entry.siteSlug ? <span>· {entry.siteSlug}</span> : null}
                    {via ? <span>· {via}</span> : null}
                  </p>
                </div>
              </li>
            );
          })}
        </ol>
      ) : (
        <p className="px-4 py-6 text-sm text-muted-foreground">
          {entries.length ? "Nothing of this kind yet." : "No changes recorded yet."}
        </p>
      )}

      {entries?.length && !done ? (
        <div className="border-t border-border px-4 py-3 text-center">
          <button
            type="button"
            onClick={() => void loadMore()}
            disabled={loadingMore}
            className="min-h-9 rounded-lg px-3 text-sm font-medium text-blue-700 hover:bg-blue-600/10 disabled:opacity-50 dark:text-blue-300"
          >
            {loadingMore ? "Loading…" : "Show older changes"}
          </button>
        </div>
      ) : null}
    </section>
  );
}
