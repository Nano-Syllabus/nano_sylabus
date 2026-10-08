"use client";

import { useEffect, useState } from "react";
import type { AdminUserSummary } from "@/lib/types";

type Faculty = { id: string; slug: string; name: string };

const tagClass =
  "inline-flex max-w-[11rem] items-center gap-1 rounded-full bg-blue-600/10 px-2 py-0.5 text-[11px] font-medium text-blue-700 dark:text-blue-300";

/**
 * A person's faculties as tags: "All faculties" for a super admin, the list an
 * admin may switch between, a student's one faculty.
 */
export function FacultyTags({
  faculties,
  wrap = false,
}: {
  faculties: AdminUserSummary["faculties"];
  /** Show every tag (the panel); the table shows two and a count. */
  wrap?: boolean;
}) {
  if (faculties === "all") return <span className={tagClass}>All faculties</span>;
  if (!faculties.length) return <span className="text-xs text-muted-foreground">—</span>;
  const shown = wrap ? faculties : faculties.slice(0, 2);
  const hidden = faculties.length - shown.length;
  return (
    <span
      className="flex flex-wrap gap-1"
      title={faculties.map((faculty) => faculty.name).join(", ")}
    >
      {shown.map((faculty) => (
        <span key={faculty.id} className={tagClass}>
          <span className="truncate">{faculty.name}</span>
        </span>
      ))}
      {hidden > 0 ? (
        <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
          +{hidden}
        </span>
      ) : null}
    </span>
  );
}

type SiteChoice = { slug: string; name: string };

/** The subdomain an admin runs, in the table: "All" for a super admin, "—" for others. */
export function SiteTag({ user }: { user: Pick<AdminUserSummary, "role" | "site"> }) {
  if (user.role === "super_admin") return <span className={tagClass}>All</span>;
  if (user.role === "admin" && user.site)
    return (
      <span className={tagClass} title={user.site.slug}>
        <span className="truncate">{user.site.name}</span>
      </span>
    );
  if (user.role === "admin")
    return <span className="text-xs text-amber-700 dark:text-amber-300">No subdomain</span>;
  return <span className="text-xs text-muted-foreground">—</span>;
}

/**
 * A super admin picks the one subdomain an admin runs. A site may have several
 * admins, so every site can be picked.
 */
export function SubdomainPicker({
  userId,
  value,
  onChange,
  disabled,
  faculties,
}: {
  userId: string;
  value: string;
  onChange: (slug: string) => void;
  disabled?: boolean;
  /** The saved site's faculties, shown under the picker. */
  faculties: Faculty[] | null;
}) {
  const [sites, setSites] = useState<SiteChoice[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/admin/site-admins", { signal: controller.signal })
      .then(async (response) => {
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error || "Subdomains could not be loaded.");
        setSites(payload.sites);
      })
      .catch((cause) => {
        if (!controller.signal.aborted)
          setError(cause instanceof Error ? cause.message : "Subdomains could not be loaded.");
      });
    return () => controller.abort();
  }, []);

  return (
    <div className="mt-4 rounded-lg border border-border p-3">
      <label htmlFor={`site-${userId}`} className="block text-sm font-medium">
        Subdomain
      </label>
      <span className="mt-0.5 block text-xs leading-5 text-muted-foreground">
        An admin runs one subdomain and can switch only between its faculties.
      </span>
      <select
        id={`site-${userId}`}
        value={value}
        disabled={disabled || !sites}
        onChange={(event) => onChange(event.target.value)}
        className="mt-3 min-h-10 w-full rounded-lg border border-border bg-background px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-blue-600/40 disabled:opacity-50"
      >
        <option value="">{sites ? "Choose a subdomain…" : "Loading subdomains…"}</option>
        {(sites ?? []).map((site) => (
          <option key={site.slug} value={site.slug}>
            {site.name} ({site.slug})
          </option>
        ))}
      </select>
      {error ? <p className="mt-2 text-xs text-destructive">{error}</p> : null}
      {faculties ? (
        <div className="mt-3">
          <span className="mb-1.5 block text-xs text-muted-foreground">Faculties</span>
          <FacultyTags faculties={faculties} wrap />
        </div>
      ) : null}
    </div>
  );
}
