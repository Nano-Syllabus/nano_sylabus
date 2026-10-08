"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import type { FacultyManagement, FacultyManager } from "@/lib/data/faculty-managers";

const inputClass =
  "min-h-10 w-full rounded-lg border border-border bg-background px-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-blue-600/40";
const tagClass =
  "inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground";

/** Every faculty with the people who manage it; the search matches faculty, site and person. */
export function AdminFacultyManagers({
  faculties,
  showEmails,
}: {
  faculties: FacultyManagement[];
  showEmails: boolean;
}) {
  const [query, setQuery] = useState("");
  const [unmanagedOnly, setUnmanagedOnly] = useState(false);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return faculties.filter((faculty) => {
      if (unmanagedOnly && faculty.managers.some((manager) => manager.role === "admin"))
        return false;
      if (!q) return true;
      return [
        faculty.name,
        faculty.slug,
        ...faculty.sites.map((site) => site.name),
        ...faculty.managers.flatMap((manager) => [manager.fullName, manager.email]),
      ].some((text) => text.toLowerCase().includes(q));
    });
  }, [faculties, query, unmanagedOnly]);

  const withoutAdmin = faculties.filter(
    (faculty) => !faculty.managers.some((manager) => manager.role === "admin"),
  ).length;

  return (
    <div className="mt-6">
      <div className="grid gap-3 sm:grid-cols-3">
        <Stat label="Faculties" value={faculties.length} />
        <Stat
          label="Members"
          value={faculties.reduce((sum, faculty) => sum + faculty.members, 0)}
        />
        <Stat label="Without an admin" value={withoutAdmin} warn={withoutAdmin > 0} />
      </div>

      <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center">
        <label className="relative block flex-1">
          <span className="sr-only">Search faculties or people</span>
          <Search
            size={16}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
          />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={showEmails ? "Search faculty, subdomain, name or email" : "Search faculty, subdomain or name"}
            className={`${inputClass} pl-9`}
          />
        </label>
        <label className="flex items-center gap-2 text-sm text-muted-foreground">
          <input
            type="checkbox"
            checked={unmanagedOnly}
            onChange={(event) => setUnmanagedOnly(event.target.checked)}
            className="size-4 rounded border-border"
          />
          Only faculties without an admin
        </label>
      </div>

      <div className="mt-4 overflow-hidden rounded-xl border border-border bg-card">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-border text-xs font-medium text-muted-foreground">
            <tr>
              <th className="px-4 py-3 font-medium">Faculty</th>
              <th className="hidden px-4 py-3 font-medium md:table-cell">Subdomains</th>
              <th className="px-4 py-3 font-medium">Managed by</th>
              <th className="hidden px-4 py-3 text-right font-medium sm:table-cell">Members</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {shown.length ? (
              shown.map((faculty) => (
                <tr key={faculty.id} className="align-top">
                  <td className="px-4 py-3">
                    <Link
                      href={`/admin/users?faculty=${encodeURIComponent(faculty.slug)}`}
                      className="font-medium text-foreground hover:underline"
                    >
                      {faculty.name}
                    </Link>
                    <div className="text-xs text-muted-foreground">
                      {faculty.slug}
                      {faculty.status !== "active" ? ` · ${faculty.status}` : ""}
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground sm:hidden">
                      {faculty.members} members
                    </div>
                  </td>
                  <td className="hidden px-4 py-3 md:table-cell">
                    {faculty.sites.length ? (
                      <div className="flex flex-wrap gap-1">
                        {faculty.sites.map((site) => (
                          <span key={site.slug} className={tagClass} title={site.slug}>
                            {site.name}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <span className="text-xs text-muted-foreground">None</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {faculty.managers.length ? (
                      <ul className="space-y-2">
                        {faculty.managers.map((manager) => (
                          <ManagerRow key={`${manager.role}:${manager.userId}`} manager={manager} />
                        ))}
                      </ul>
                    ) : (
                      <span className="text-xs text-amber-700 dark:text-amber-300">
                        Only super admins
                      </span>
                    )}
                  </td>
                  <td className="hidden px-4 py-3 text-right tabular-nums sm:table-cell">
                    {faculty.members}
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={4} className="px-4 py-6 text-center text-sm text-muted-foreground">
                  {faculties.length ? "No faculty matches." : "No faculties to show."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ManagerRow({ manager }: { manager: FacultyManager }) {
  return (
    <li className="min-w-0">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="truncate font-medium text-foreground">{manager.fullName}</span>
        <span
          className={
            manager.role === "admin"
              ? "rounded-full bg-blue-600/10 px-2 py-0.5 text-xs font-medium text-blue-700 dark:text-blue-300"
              : tagClass
          }
        >
          {manager.role === "admin" ? `Admin · ${manager.site?.name}` : "Creator"}
        </span>
        {manager.ambassador ? (
          <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:text-emerald-300">
            Ambassador
          </span>
        ) : null}
      </div>
      {manager.email ? (
        <div className="truncate text-xs text-muted-foreground">{manager.email}</div>
      ) : null}
    </li>
  );
}

function Stat({ label, value, warn }: { label: string; value: number; warn?: boolean }) {
  return (
    <div className="rounded-xl border border-border bg-card px-4 py-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div
        className={`mt-1 font-display text-2xl font-semibold tabular-nums ${
          warn ? "text-amber-700 dark:text-amber-300" : "text-foreground"
        }`}
      >
        {value}
      </div>
    </div>
  );
}
