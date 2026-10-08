"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ExternalLink, Plus, Search, X } from "lucide-react";
import type {
  CommunityChoice,
  LandingSiteListItem,
  LandingSiteSummary,
} from "@/lib/data/landing-sites";
import type { SiteAdmin } from "@/lib/data/admin-users";
import type { AdminUserSummary } from "@/lib/types";
import { MAIN_SITE_SLUG, RESERVED_SITE_SLUGS, isValidSiteSlug } from "@/lib/landing-site-host";

const primaryButton =
  "inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50";
const secondaryButton =
  "inline-flex min-h-9 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg border border-border bg-card px-3 text-sm font-medium text-foreground hover:bg-muted";
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
  initialAdmins,
  faculties,
  canAssignAdmins,
  canCreateSites = false,
  viewerUserId,
  rootDomain,
}: {
  initialSites: LandingSiteListItem[];
  /** Active public faculties a site can lead into. */
  faculties: CommunityChoice[];
  /** Who runs each site, by slug (a site may have several admins). */
  initialAdmins: Record<string, SiteAdmin[]>;
  /** Only a super admin changes who runs a site. */
  canAssignAdmins: boolean;
  /** A new subdomain is a new tenant: super admins only. */
  canCreateSites?: boolean;
  viewerUserId: string;
  rootDomain: string;
}) {
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  const [admins, setAdmins] = useState(initialAdmins);
  const [assigning, setAssigning] = useState<LandingSiteSummary | null>(null);
  const [sites, setSites] = useState(initialSites);
  const [linking, setLinking] = useState<LandingSiteListItem | null>(null);
  const facultyBySlug = new Map(faculties.map((faculty) => [faculty.slug, faculty]));

  return (
    <div className="mt-6">
      {canCreateSites ? (
        <div className="flex justify-end">
          <button type="button" className={primaryButton} onClick={() => setCreating(true)}>
            <Plus size={16} aria-hidden="true" />
            New subdomain
          </button>
        </div>
      ) : null}

      <div className="mt-4 overflow-hidden rounded-xl border border-border bg-card">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-border text-xs font-medium text-muted-foreground">
            <tr>
              <th className="px-4 py-3 font-medium">Website</th>
              <th className="hidden px-4 py-3 font-medium md:table-cell">Admin</th>
              <th className="hidden px-4 py-3 font-medium lg:table-cell">Faculties</th>
              <th className="hidden px-4 py-3 font-medium sm:table-cell">Status</th>
              <th className="hidden px-4 py-3 font-medium md:table-cell">Last published</th>
              <th className="px-4 py-3 text-right font-medium">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {sites.map((site) => (
              <tr key={site.slug}>
                <td className="px-4 py-3">
                  <div className="font-medium text-foreground">
                    {domainOf(site.slug, rootDomain)}
                  </div>
                  <div className="text-xs text-muted-foreground">{site.name}</div>
                  <div className="mt-1 sm:hidden">
                    <StatusBadge site={site} />
                  </div>
                  {site.slug !== MAIN_SITE_SLUG ? (
                    <div className="mt-2 lg:hidden">
                      <SiteFacultyCell
                        site={site}
                        facultyBySlug={facultyBySlug}
                        onChange={() => setLinking(site)}
                      />
                    </div>
                  ) : null}
                  <div className="mt-2 md:hidden">
                    <SiteAdminCell
                      admins={site.slug === MAIN_SITE_SLUG ? [] : (admins[site.slug] ?? [])}
                      main={site.slug === MAIN_SITE_SLUG}
                      onChange={canAssignAdmins ? () => setAssigning(site) : null}
                    />
                  </div>
                </td>
                <td className="hidden px-4 py-3 md:table-cell">
                  <SiteAdminCell
                    admins={site.slug === MAIN_SITE_SLUG ? [] : (admins[site.slug] ?? [])}
                    main={site.slug === MAIN_SITE_SLUG}
                    onChange={canAssignAdmins ? () => setAssigning(site) : null}
                  />
                </td>
                <td className="hidden px-4 py-3 lg:table-cell">
                  {site.slug === MAIN_SITE_SLUG ? (
                    <span className="text-xs text-muted-foreground">Every faculty</span>
                  ) : (
                    <SiteFacultyCell
                      site={site}
                      facultyBySlug={facultyBySlug}
                      onChange={() => setLinking(site)}
                    />
                  )}
                </td>
                <td className="hidden px-4 py-3 sm:table-cell">
                  <StatusBadge site={site} />
                </td>
                <td className="hidden whitespace-nowrap px-4 py-3 text-muted-foreground md:table-cell">
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
                      className="inline-flex min-h-9 items-center whitespace-nowrap rounded-lg bg-blue-600 px-3 text-sm font-medium text-white hover:bg-blue-700"
                    >
                      Edit text
                    </Link>
                  </div>
                </td>
              </tr>
            ))}
            {!sites.length ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-sm text-muted-foreground">
                  No subdomain is assigned to you yet. Ask a super admin to add you to one.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      {assigning ? (
        <AssignAdminDialog
          site={assigning}
          domain={domainOf(assigning.slug, rootDomain)}
          current={admins[assigning.slug] ?? []}
          viewerUserId={viewerUserId}
          onClose={() => setAssigning(null)}
          onSaved={(list) =>
            setAdmins((all) => {
              const ids = new Set(list.map((admin) => admin.userId));
              // An admin runs one site: adding them here takes them off the site they left.
              const next: Record<string, SiteAdmin[]> = {};
              for (const [slug, held] of Object.entries(all))
                next[slug] = held.filter((admin) => !ids.has(admin.userId));
              next[assigning.slug] = list;
              return next;
            })
          }
        />
      ) : null}

      {linking ? (
        <SiteFacultiesDialog
          site={linking}
          domain={domainOf(linking.slug, rootDomain)}
          faculties={faculties}
          onClose={() => setLinking(null)}
          onSaved={(saved) => {
            setSites((all) =>
              all.map((site) => (site.slug === saved.slug ? { ...site, ...saved } : site)),
            );
            setLinking(null);
            router.refresh();
          }}
        />
      ) : null}

      {creating ? (
        <CreateSiteDialog
          sites={sites}
          rootDomain={rootDomain}
          onClose={() => setCreating(false)}
        />
      ) : null}
    </div>
  );
}

/** The faculties a site leads into, and whether its exam flow is on. */
function SiteFacultyCell({
  site,
  facultyBySlug,
  onChange,
}: {
  site: LandingSiteListItem;
  facultyBySlug: Map<string, CommunityChoice>;
  onChange: () => void;
}) {
  const names = site.facultySlugs.map((slug) => facultyBySlug.get(slug)?.name || slug);
  return (
    <div className="flex items-start gap-3">
      <div className="min-w-0">
        {names.length ? (
          <ul className="space-y-0.5">
            {names.map((name) => (
              <li key={name} className="truncate text-sm text-foreground">
                {name}
              </li>
            ))}
          </ul>
        ) : (
          <span className="text-xs text-amber-700 dark:text-amber-300">No faculty</span>
        )}
        {names.length && !site.examEnabled ? (
          <div className="mt-0.5 text-xs text-amber-700 dark:text-amber-300">
            Not shown to visitors yet
          </div>
        ) : null}
      </div>
      <button
        type="button"
        onClick={onChange}
        className="shrink-0 rounded-md px-2 py-1 text-xs font-medium text-blue-700 hover:bg-blue-600/10 dark:text-blue-300"
      >
        {names.length ? "Manage" : "Link faculty"}
      </button>
    </div>
  );
}

/**
 * Which faculties a subdomain leads into, and the site's name — the two things
 * a creator reaches for when "license.nanosyllabus.com" should open the
 * Engineering License faculty. The rest of the exam setup (questions, plans,
 * prices) stays in the site editor; this reads the full config and changes
 * only these fields.
 */
function SiteFacultiesDialog({
  site,
  domain,
  faculties,
  onClose,
  onSaved,
}: {
  site: LandingSiteListItem;
  domain: string;
  faculties: CommunityChoice[];
  onClose: () => void;
  onSaved: (site: Pick<LandingSiteListItem, "slug" | "name" | "facultySlugs" | "examEnabled">) => void;
}) {
  const [name, setName] = useState(site.name);
  const [picked, setPicked] = useState<string[]>(site.facultySlugs);
  // Opening this is asking for the faculties to show, so the switch starts on.
  const [enabled, setEnabled] = useState(true);
  const [query, setQuery] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const shown = faculties.filter((faculty) =>
    `${faculty.name} ${faculty.faculty ?? ""} ${faculty.slug}`
      .toLowerCase()
      .includes(query.trim().toLowerCase()),
  );

  async function save() {
    if (enabled && !picked.length) {
      setError("Choose at least one faculty, or turn off “Send visitors to these faculties”.");
      return;
    }
    if (!name.trim()) {
      setError("Give the site a name.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const current = await fetch(`/api/admin/sites/${site.slug}`);
      const loaded = await current.json().catch(() => ({}));
      if (!current.ok || !loaded.site) throw new Error(loaded.error || "Couldn’t load the site.");
      const response = await fetch(`/api/admin/sites/${site.slug}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...(name.trim() !== site.name ? { name: name.trim() } : {}),
          examConfig: { ...loaded.site.examConfig, facultySlugs: picked, enabled },
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.site) throw new Error(payload.error || "Couldn’t save.");
      onSaved({
        slug: site.slug,
        name: payload.site.name,
        facultySlugs: payload.site.examConfig.facultySlugs,
        examEnabled: payload.site.examConfig.enabled,
      });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Couldn’t save.");
      setSaving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="site-faculties-title"
      onKeyDown={(event) => event.key === "Escape" && !saving && onClose()}
    >
      <div className="flex max-h-[90vh] w-full max-w-md flex-col rounded-xl border border-border bg-card p-5 shadow-xl">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h2 id="site-faculties-title" className="font-display text-lg font-semibold">
              Faculties on {domain}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Visitors to this subdomain choose from these faculties.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            aria-label="Close"
            className="grid size-9 shrink-0 place-items-center rounded-lg text-muted-foreground hover:bg-muted"
          >
            <X size={16} />
          </button>
        </div>

        <label className="mt-4 block text-sm font-medium" htmlFor={`site-name-${site.slug}`}>
          Site name
        </label>
        <input
          id={`site-name-${site.slug}`}
          value={name}
          maxLength={80}
          onChange={(event) => setName(event.target.value)}
          className={`${inputClass} mt-1.5`}
        />

        <label className="relative mt-4 block">
          <span className="sr-only">Search faculties</span>
          <Search
            size={16}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
          />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search faculties"
            className={`${inputClass} pl-9`}
          />
        </label>
        <ul className="mt-2 min-h-0 flex-1 divide-y divide-border overflow-y-auto rounded-lg border border-border">
          {shown.length ? (
            shown.map((faculty) => {
              const checked = picked.includes(faculty.slug);
              return (
                <li key={faculty.slug}>
                  <label className="flex cursor-pointer items-center gap-3 px-3 py-2.5 hover:bg-muted">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => {
                        setError(null);
                        setPicked((current) =>
                          checked
                            ? current.filter((slug) => slug !== faculty.slug)
                            : [...current, faculty.slug],
                        );
                      }}
                      className="size-4 accent-blue-600"
                    />
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium">{faculty.name}</span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {[faculty.faculty, faculty.slug].filter(Boolean).join(" · ")}
                      </span>
                    </span>
                  </label>
                </li>
              );
            })
          ) : (
            <li className="px-3 py-3 text-sm text-muted-foreground">
              {faculties.length
                ? "No faculty matches."
                : "No public faculty yet. Create one and make it public first."}
            </li>
          )}
        </ul>
        <p className="mt-1.5 text-xs text-muted-foreground">
          Only active, public faculties are listed.
        </p>

        <label className="mt-4 flex items-start gap-3 rounded-lg bg-muted/50 p-3">
          <input
            type="checkbox"
            checked={enabled}
            onChange={(event) => {
              setError(null);
              setEnabled(event.target.checked);
            }}
            className="mt-0.5 size-4 accent-blue-600"
          />
          <span className="text-sm">
            <span className="block font-medium">Send visitors to these faculties</span>
            <span className="text-xs text-muted-foreground">
              The site’s main buttons open these faculties. Questions, plans and prices stay in
              Edit text → Exam, faculties &amp; checkout.
            </span>
          </span>
        </label>

        {error ? <p className="mt-3 text-sm text-red-600">{error}</p> : null}

        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onClose} disabled={saving} className={secondaryButton}>
            Cancel
          </button>
          <button type="button" disabled={saving} onClick={() => void save()} className={primaryButton}>
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}

/** The site's admins, name over email; a super admin gets a Manage button. */
function SiteAdminCell({
  admins,
  main,
  onChange,
}: {
  admins: SiteAdmin[];
  main: boolean;
  onChange: (() => void) | null;
}) {
  if (main) return <span className="text-xs text-muted-foreground">Super admins</span>;
  return (
    <div className="flex items-center gap-3">
      {admins.length ? (
        <ul className="min-w-0 space-y-1">
          {admins.map((admin) => (
            <li key={admin.userId} className="min-w-0">
              <div className="truncate font-medium text-foreground">{admin.fullName}</div>
              {admin.email ? (
                <div className="truncate text-xs text-muted-foreground">{admin.email}</div>
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <span className="text-xs text-amber-700 dark:text-amber-300">No admin</span>
      )}
      {onChange ? (
        <button
          type="button"
          onClick={onChange}
          className="shrink-0 rounded-md px-2 py-1 text-xs font-medium text-blue-700 hover:bg-blue-600/10 dark:text-blue-300"
        >
          {admins.length ? "Manage" : "Add admin"}
        </button>
      ) : null}
    </div>
  );
}

/**
 * Who runs a site. A site may have several admins: add anyone who signed up
 * (super admins can't be picked — they already see every site), or remove one,
 * which makes them a student again — said before saving, not after.
 */
function AssignAdminDialog({
  site,
  domain,
  current,
  viewerUserId,
  onClose,
  onSaved,
}: {
  site: LandingSiteSummary;
  domain: string;
  current: SiteAdmin[];
  viewerUserId: string;
  onClose: () => void;
  onSaved: (admins: SiteAdmin[]) => void;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<AdminUserSummary[] | null>(null);
  const [picked, setPicked] = useState<AdminUserSummary | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setResults(null);
      return;
    }
    const controller = new AbortController();
    const timer = setTimeout(() => {
      fetch(`/api/admin/users?q=${encodeURIComponent(q)}&pageSize=6`, { signal: controller.signal })
        .then(async (response) => {
          const payload = await response.json();
          if (!response.ok) throw new Error(payload.error || "Search failed.");
          setResults(payload.items as AdminUserSummary[]);
        })
        .catch((cause) => {
          if (!controller.signal.aborted)
            setError(cause instanceof Error ? cause.message : "Search failed.");
        });
    }, 250);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query]);

  async function save(userId: string, action: "add" | "remove") {
    setSaving(true);
    setError(null);
    try {
      const response = await fetch(`/api/admin/sites/${site.slug}/admin`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, action }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "The admins could not be changed.");
      onSaved((payload.admins ?? []) as SiteAdmin[]);
      setPicked(null);
      setQuery("");
      setConfirmRemove(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The admins could not be changed.");
    } finally {
      setSaving(false);
    }
  }

  const currentIds = new Set(current.map((admin) => admin.userId));
  const blocked = (user: AdminUserSummary) =>
    user.role === "super_admin"
      ? "Super admin"
      : user.userId === viewerUserId
        ? "You"
        : currentIds.has(user.userId)
          ? "Already admin"
          : null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="assign-admin-title"
      onKeyDown={(event) => event.key === "Escape" && onClose()}
    >
      <div className="w-full max-w-md rounded-xl border border-border bg-card p-5 shadow-xl">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h2 id="assign-admin-title" className="font-display text-lg font-semibold">
              Admins of {site.name}
            </h2>
            <p className="mt-1 truncate text-sm text-muted-foreground">{domain}</p>
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

        <ul className="mt-4 divide-y divide-border rounded-lg border border-border">
          {current.length ? (
            current.map((admin) => (
              <li key={admin.userId} className="flex items-center justify-between gap-3 px-3 py-2.5">
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium">{admin.fullName}</div>
                  <div className="truncate text-xs text-muted-foreground">{admin.email}</div>
                </div>
                <button
                  type="button"
                  disabled={saving}
                  onClick={() =>
                    confirmRemove === admin.userId
                      ? void save(admin.userId, "remove")
                      : setConfirmRemove(admin.userId)
                  }
                  className="shrink-0 rounded-md px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-500/10 disabled:opacity-50"
                >
                  {confirmRemove === admin.userId ? "Confirm remove" : "Remove"}
                </button>
              </li>
            ))
          ) : (
            <li className="px-3 py-2.5 text-sm text-muted-foreground">No admin yet.</li>
          )}
        </ul>
        {confirmRemove ? (
          <p className="mt-2 text-xs leading-5 text-red-600">
            Removing {current.find((admin) => admin.userId === confirmRemove)?.fullName} makes them
            a student again.
          </p>
        ) : null}

        <label className="relative mt-4 block">
          <span className="sr-only">Search people</span>
          <Search
            size={16}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
          />
          <input
            autoFocus
            type="search"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setPicked(null);
              setError(null);
            }}
            placeholder="Add an admin — search by name or email"
            className={`${inputClass} pl-9`}
          />
        </label>

        {results ? (
          <ul className="mt-2 max-h-64 divide-y divide-border overflow-y-auto rounded-lg border border-border">
            {results.length ? (
              results.map((user) => {
                const reason = blocked(user);
                return (
                  <li key={user.userId}>
                    <button
                      type="button"
                      disabled={Boolean(reason)}
                      aria-pressed={picked?.userId === user.userId}
                      onClick={() => setPicked(user)}
                      className={`flex w-full items-center justify-between gap-3 px-3 py-2 text-left disabled:cursor-not-allowed disabled:opacity-50 ${
                        picked?.userId === user.userId ? "bg-blue-600/10" : "hover:bg-muted"
                      }`}
                    >
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-medium">
                          {user.fullName || "No name"}
                        </span>
                        <span className="block truncate text-xs text-muted-foreground">
                          {user.email}
                        </span>
                      </span>
                      <span className="shrink-0 text-xs text-muted-foreground">
                        {reason ??
                          (user.role === "admin" && user.site ? `Runs ${user.site.name}` : "")}
                      </span>
                    </button>
                  </li>
                );
              })
            ) : (
              <li className="px-3 py-3 text-sm text-muted-foreground">No one matches.</li>
            )}
          </ul>
        ) : null}

        {picked ? (
          <p className="mt-3 text-xs leading-5 text-muted-foreground">
            {picked.fullName || picked.email} becomes an admin of {domain}
            {picked.role === "admin" && picked.site ? ` and stops running ${picked.site.name}` : ""}.
          </p>
        ) : null}

        {error ? <p className="mt-3 text-sm text-red-600">{error}</p> : null}

        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onClose} className={secondaryButton}>
            Done
          </button>
          <button
            type="button"
            disabled={!picked || saving}
            onClick={() => picked && void save(picked.userId, "add")}
            className={primaryButton}
          >
            {saving ? "Saving…" : "Add admin"}
          </button>
        </div>
      </div>
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
      <form
        onSubmit={submit}
        className="w-full max-w-md rounded-xl border border-border bg-card p-5 shadow-xl"
      >
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
          {slugProblem ? (
            <span className="text-xs font-normal text-red-600">{slugProblem}</span>
          ) : null}
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
          <select
            value={copyFrom}
            onChange={(event) => setCopyFrom(event.target.value)}
            className={inputClass}
          >
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
