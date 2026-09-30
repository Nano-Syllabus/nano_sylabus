"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ExternalLink, Plus, X } from "lucide-react";
import type { LandingSiteSummary } from "@/lib/data/landing-sites";
import { MAIN_SITE_SLUG, RESERVED_SITE_SLUGS, isValidSiteSlug } from "@/lib/landing-site-host";

const primaryButton =
  "inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50";
const secondaryButton =
  "inline-flex min-h-9 items-center justify-center gap-1.5 rounded-lg border border-border bg-card px-3 text-sm font-medium text-foreground hover:bg-muted";
const inputClass =
  "min-h-10 w-full rounded-lg border border-border bg-background px-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-blue-600/40";

function domainOf(slug: string, root: string) {
  return slug === MAIN_SITE_SLUG ? root : `${slug}.${root}`;
}

function formatDate(value: string | null) {
  if (!value) return "Never";
  return new Date(value).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

export function AdminSitesList({
  initialSites,
  rootDomain,
}: {
  initialSites: LandingSiteSummary[];
  rootDomain: string;
}) {
  const [creating, setCreating] = useState(false);

  return (
    <div className="mt-6">
      <div className="flex justify-end">
        <button type="button" className={primaryButton} onClick={() => setCreating(true)}>
          <Plus size={16} aria-hidden="true" />
          New subdomain
        </button>
      </div>

      <div className="mt-4 overflow-hidden rounded-xl border border-border bg-card">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-border text-xs font-medium text-muted-foreground">
            <tr>
              <th className="px-4 py-3 font-medium">Website</th>
              <th className="hidden px-4 py-3 font-medium sm:table-cell">Status</th>
              <th className="hidden px-4 py-3 font-medium md:table-cell">Last published</th>
              <th className="px-4 py-3 text-right font-medium">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {initialSites.map((site) => (
              <tr key={site.slug}>
                <td className="px-4 py-3">
                  <div className="font-medium text-foreground">{domainOf(site.slug, rootDomain)}</div>
                  <div className="text-xs text-muted-foreground">{site.name}</div>
                  <div className="mt-1 sm:hidden">
                    <StatusBadge site={site} />
                  </div>
                </td>
                <td className="hidden px-4 py-3 sm:table-cell">
                  <StatusBadge site={site} />
                </td>
                <td className="hidden px-4 py-3 text-muted-foreground md:table-cell">
                  {formatDate(site.publishedAt)}
                </td>
                <td className="px-4 py-3">
                  <div className="flex justify-end gap-2">
                    {site.status === "live" ? (
                      <a
                        href={`https://${domainOf(site.slug, rootDomain)}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={`${secondaryButton} hidden sm:inline-flex`}
                      >
                        Visit
                        <ExternalLink size={14} aria-hidden="true" />
                      </a>
                    ) : null}
                    <Link
                      href={`/admin/sites/${site.slug}`}
                      className="inline-flex min-h-9 items-center rounded-lg bg-blue-600 px-3 text-sm font-medium text-white hover:bg-blue-700"
                    >
                      Edit text
                    </Link>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {creating ? (
        <CreateSiteDialog
          sites={initialSites}
          rootDomain={rootDomain}
          onClose={() => setCreating(false)}
        />
      ) : null}
    </div>
  );
}

function StatusBadge({ site }: { site: LandingSiteSummary }) {
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      {site.status === "live" ? (
        <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:text-emerald-300">
          <span className="size-1.5 rounded-full bg-emerald-500" aria-hidden="true" />
          Live
        </span>
      ) : (
        <span className="inline-flex items-center gap-1.5 rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
          <span className="size-1.5 rounded-full bg-muted-foreground" aria-hidden="true" />
          Hidden
        </span>
      )}
      {site.hasUnpublishedChanges ? (
        <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-xs font-medium text-amber-700 dark:text-amber-300">
          Unpublished changes
        </span>
      ) : null}
    </span>
  );
}

function CreateSiteDialog({
  sites,
  rootDomain,
  onClose,
}: {
  sites: LandingSiteSummary[];
  rootDomain: string;
  onClose: () => void;
}) {
  const router = useRouter();
  const [slug, setSlug] = useState("");
  const [name, setName] = useState("");
  const [copyFrom, setCopyFrom] = useState(MAIN_SITE_SLUG);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cleanSlug = slug.trim().toLowerCase();
  const slugProblem = !cleanSlug
    ? null
    : RESERVED_SITE_SLUGS.has(cleanSlug)
      ? `“${cleanSlug}” is reserved.`
      : !isValidSiteSlug(cleanSlug)
        ? "Lowercase letters, numbers and hyphens only."
        : sites.some((site) => site.slug === cleanSlug)
          ? "That subdomain already exists."
          : null;

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!cleanSlug || slugProblem || !name.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const response = await fetch("/api/admin/sites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug: cleanSlug, name, copyFrom }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "Couldn’t create the site.");
      router.push(`/admin/sites/${cleanSlug}`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Couldn’t create the site.");
      setSaving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="create-site-title"
      onKeyDown={(event) => event.key === "Escape" && onClose()}
    >
      <form onSubmit={submit} className="w-full max-w-md rounded-xl border border-border bg-card p-5 shadow-xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 id="create-site-title" className="font-display text-lg font-semibold">
              New subdomain
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              It starts with a copy of another site’s text and stays hidden until you publish.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="grid size-9 shrink-0 place-items-center rounded-lg text-muted-foreground hover:bg-muted"
          >
            <X size={16} />
          </button>
        </div>

        <label className="mt-5 grid gap-1.5 text-sm font-medium">
          Subdomain
          <div className="flex items-center rounded-lg border border-border bg-background focus-within:ring-2 focus-within:ring-blue-600/40">
            <input
              autoFocus
              value={slug}
              onChange={(event) => setSlug(event.target.value.toLowerCase().replace(/\s+/g, "-"))}
              placeholder="highschool"
              className="min-h-10 min-w-0 flex-1 rounded-l-lg bg-transparent px-3 text-sm focus:outline-none"
            />
            <span className="shrink-0 pr-3 text-sm text-muted-foreground">.{rootDomain}</span>
          </div>
          {slugProblem ? <span className="text-xs font-normal text-red-600">{slugProblem}</span> : null}
        </label>

        <label className="mt-4 grid gap-1.5 text-sm font-medium">
          Name
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="High School Prep"
            maxLength={80}
            className={inputClass}
          />
          <span className="text-xs font-normal text-muted-foreground">Only admins see this.</span>
        </label>

        <label className="mt-4 grid gap-1.5 text-sm font-medium">
          Start from the text of
          <select value={copyFrom} onChange={(event) => setCopyFrom(event.target.value)} className={inputClass}>
            {sites.map((site) => (
              <option key={site.slug} value={site.slug}>
                {domainOf(site.slug, rootDomain)}
              </option>
            ))}
          </select>
        </label>

        {error ? <p className="mt-4 text-sm text-red-600">{error}</p> : null}

        <div className="mt-6 flex justify-end gap-2">
          <button type="button" onClick={onClose} className={secondaryButton}>
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving || !cleanSlug || Boolean(slugProblem) || !name.trim()}
            className={primaryButton}
          >
            {saving ? "Creating…" : "Create and edit"}
          </button>
        </div>
      </form>
    </div>
  );
}
