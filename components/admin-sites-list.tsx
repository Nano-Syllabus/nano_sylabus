"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Check, ExternalLink, Globe, ImagePlus, PencilLine, Plus, Search, X } from "lucide-react";
import { messageOf, toast } from "@/components/admin/admin-toaster";
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

function timeAgo(value: string) {
  const minutes = Math.round((Date.now() - new Date(value).getTime()) / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return days === 1 ? "yesterday" : `${days} days ago`;
  return new Date(value).toLocaleDateString(undefined, { dateStyle: "medium" });
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
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"all" | "live" | "hidden" | "attention">("all");
  const facultyBySlug = new Map(faculties.map((faculty) => [faculty.slug, faculty]));

  const needsAttention = (site: LandingSiteListItem) =>
    site.slug !== MAIN_SITE_SLUG &&
    (site.hasUnpublishedChanges ||
      !(admins[site.slug]?.length) ||
      !site.facultySlugs.length ||
      !site.examEnabled);
  const counts = {
    all: sites.length,
    live: sites.filter((site) => site.status === "live").length,
    hidden: sites.filter((site) => site.status !== "live").length,
    attention: sites.filter(needsAttention).length,
  };
  const q = query.trim().toLowerCase();
  const shown = sites.filter((site) => {
    if (filter === "live" && site.status !== "live") return false;
    if (filter === "hidden" && site.status === "live") return false;
    if (filter === "attention" && !needsAttention(site)) return false;
    if (!q) return true;
    return [
      domainOf(site.slug, rootDomain),
      site.name,
      ...site.facultySlugs.map((slug) => facultyBySlug.get(slug)?.name ?? slug),
      ...(admins[site.slug] ?? []).flatMap((admin) => [admin.fullName, admin.email]),
    ].some((text) => text.toLowerCase().includes(q));
  });

  const rowProps = (site: LandingSiteListItem) => ({
    site,
    domain: domainOf(site.slug, rootDomain),
    admins: site.slug === MAIN_SITE_SLUG ? [] : (admins[site.slug] ?? []),
    facultyBySlug,
    onAssign: canAssignAdmins ? () => setAssigning(site) : null,
    onLink: () => setLinking(site),
    onRename: (name: string) =>
      setSites((all) => all.map((row) => (row.slug === site.slug ? { ...row, name } : row))),
    onIcon: (iconUrl: string) =>
      setSites((all) => all.map((row) => (row.slug === site.slug ? { ...row, iconUrl } : row))),
  });

  return (
    <div className="mt-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
        <div className="flex gap-1 overflow-x-auto rounded-lg bg-muted p-1" role="group" aria-label="Show">
          {(
            [
              ["all", "All"],
              ["live", "Live"],
              ["hidden", "Hidden"],
              ["attention", "Needs attention"],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              aria-pressed={filter === value}
              onClick={() => setFilter(value)}
              className={`inline-flex min-h-8 shrink-0 items-center gap-1.5 rounded-md px-3 text-sm font-medium ${
                filter === value
                  ? "bg-card text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {label}
              <span
                className={`rounded-full px-1.5 text-[11px] tabular-nums ${
                  value === "attention" && counts.attention
                    ? "bg-amber-500/15 text-amber-700 dark:text-amber-300"
                    : "bg-background/70 text-muted-foreground"
                }`}
              >
                {counts[value]}
              </span>
            </button>
          ))}
        </div>
        <label className="relative flex-1">
          <span className="sr-only">Search websites</span>
          <Search
            size={16}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
          />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search domain, faculty or admin"
            className={`${inputClass} pl-9`}
          />
        </label>
        {canCreateSites ? (
          <button type="button" className={primaryButton} onClick={() => setCreating(true)}>
            <Plus size={16} aria-hidden="true" />
            New subdomain
          </button>
        ) : null}
      </div>

      {/* Wide screens: a fixed-layout table that never scrolls sideways. */}
      <div className="mt-4 hidden overflow-hidden rounded-xl border border-border bg-card lg:block">
        <table className="w-full table-fixed text-left text-sm">
          <colgroup>
            <col className="w-[28%]" />
            <col className="w-[22%]" />
            <col className="w-[21%]" />
            <col className="w-[15%]" />
            <col className="w-[14%]" />
          </colgroup>
          <thead className="border-b border-border bg-muted/40 text-xs font-medium text-muted-foreground">
            <tr>
              <th className="px-4 py-2.5 font-medium">Website</th>
              <th className="px-4 py-2.5 font-medium">Faculties</th>
              <th className="px-4 py-2.5 font-medium">Admins</th>
              <th className="px-4 py-2.5 font-medium">Status</th>
              <th className="px-4 py-2.5 text-right font-medium">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {shown.map((site) => (
              <SiteRow key={site.slug} {...rowProps(site)} />
            ))}
          </tbody>
        </table>
        {!shown.length ? <EmptySites any={sites.length > 0} /> : null}
      </div>

      {/* Phones and tablets: one card per site, nothing hidden. */}
      <ul className="mt-4 space-y-3 lg:hidden">
        {shown.map((site) => (
          <SiteCard key={site.slug} {...rowProps(site)} />
        ))}
        {!shown.length ? (
          <li className="rounded-xl border border-border bg-card">
            <EmptySites any={sites.length > 0} />
          </li>
        ) : null}
      </ul>

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

function EmptySites({ any }: { any: boolean }) {
  return (
    <p className="px-4 py-10 text-center text-sm text-muted-foreground">
      {any
        ? "No website matches."
        : "No subdomain is assigned to you yet. Ask a super admin to add you to one."}
    </p>
  );
}

type SiteRowProps = {
  site: LandingSiteListItem;
  domain: string;
  admins: SiteAdmin[];
  facultyBySlug: Map<string, CommunityChoice>;
  onAssign: (() => void) | null;
  onLink: () => void;
  onIcon: (iconUrl: string) => void;
  onRename: (name: string) => void;
};

function SiteIdentity({
  site,
  domain,
  onIcon,
  onRename,
}: Pick<SiteRowProps, "site" | "domain" | "onIcon" | "onRename">) {
  const main = site.slug === MAIN_SITE_SLUG;
  return (
    <div className="flex min-w-0 items-center gap-3">
      {main ? (
        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-blue-600/10 text-blue-700 dark:text-blue-300">
          <Globe size={18} aria-hidden="true" />
        </span>
      ) : (
        <SiteIconButton site={site} onChange={onIcon} />
      )}
      <div className="min-w-0 flex-1">
        <Link
          href={`/admin/sites/${site.slug}`}
          className="block truncate font-medium text-foreground hover:text-blue-700 hover:underline dark:hover:text-blue-300"
          title={domain}
        >
          {domain}
        </Link>
        <SiteNameEditor site={site} onRename={onRename} />
      </div>
    </div>
  );
}

/**
 * The site's admin-only name, renamed in place: pencil → field, Enter saves,
 * Escape cancels.
 */
function SiteNameEditor({ site, onRename }: Pick<SiteRowProps, "site" | "onRename">) {
  const [value, setValue] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function save() {
    const name = (value ?? "").trim();
    if (!name || name === site.name) {
      setValue(null);
      return;
    }
    setSaving(true);
    try {
      const response = await fetch(`/api/admin/sites/${site.slug}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.site) throw new Error(payload.error || "Couldn’t rename the site.");
      onRename(payload.site.name);
      setValue(null);
      toast.success(`Renamed to ${payload.site.name}`);
    } catch (cause) {
      toast.error("Couldn’t rename the site", { description: messageOf(cause, "Try again.") });
    } finally {
      setSaving(false);
    }
  }

  if (value !== null) {
    return (
      <form
        className="mt-0.5 flex items-center gap-1"
        onSubmit={(event) => {
          event.preventDefault();
          void save();
        }}
      >
        <input
          autoFocus
          aria-label={`Name of ${site.slug}`}
          value={value}
          maxLength={80}
          disabled={saving}
          onChange={(event) => setValue(event.target.value)}
          onKeyDown={(event) => event.key === "Escape" && setValue(null)}
          className="h-7 min-w-0 flex-1 rounded-md border border-border bg-background px-2 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-blue-600/40"
        />
        <button
          type="submit"
          disabled={saving}
          aria-label="Save name"
          title="Save (Enter)"
          className="grid size-7 shrink-0 place-items-center rounded-md bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
        >
          <Check size={13} />
        </button>
        <button
          type="button"
          disabled={saving}
          onClick={() => setValue(null)}
          aria-label="Cancel"
          title="Cancel (Esc)"
          className="grid size-7 shrink-0 place-items-center rounded-md text-muted-foreground hover:bg-muted"
        >
          <X size={13} />
        </button>
      </form>
    );
  }

  return (
    <div className="group/name flex min-w-0 items-center gap-1">
      <span className="truncate text-xs text-muted-foreground" title={site.name}>
        {site.name}
      </span>
      <button
        type="button"
        onClick={() => setValue(site.name)}
        aria-label={`Rename ${site.name}`}
        title="Rename"
        className="grid size-6 shrink-0 place-items-center rounded-md text-muted-foreground opacity-60 hover:bg-muted hover:text-foreground hover:opacity-100 focus-visible:opacity-100 group-hover/name:opacity-100"
      >
        <PencilLine size={12} />
      </button>
    </div>
  );
}

function SiteActions({ site, domain }: Pick<SiteRowProps, "site" | "domain">) {
  return (
    <div className="flex items-center justify-end gap-1.5">
      {site.status === "live" ? (
        <a
          href={`https://${domain}`}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`Visit ${domain}`}
          title={`Visit ${domain}`}
          className="grid size-9 shrink-0 place-items-center rounded-lg border border-border bg-card text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <ExternalLink size={15} aria-hidden="true" />
        </a>
      ) : null}
      <Link
        href={`/admin/sites/${site.slug}`}
        className="inline-flex min-h-9 items-center gap-1.5 whitespace-nowrap rounded-lg bg-blue-600 px-3 text-sm font-medium text-white hover:bg-blue-700"
      >
        <PencilLine size={14} aria-hidden="true" />
        Edit
      </Link>
    </div>
  );
}

function SiteRow(props: SiteRowProps) {
  const { site, domain, admins, facultyBySlug, onAssign, onLink } = props;
  const main = site.slug === MAIN_SITE_SLUG;
  return (
    <tr className="align-middle hover:bg-muted/30">
      <td className="px-4 py-3">
        <SiteIdentity {...props} />
      </td>
      <td className="px-4 py-3">
        {main ? (
          <span className="text-xs text-muted-foreground">Every faculty</span>
        ) : (
          <SiteFacultyCell site={site} facultyBySlug={facultyBySlug} onChange={onLink} />
        )}
      </td>
      <td className="px-4 py-3">
        <SiteAdminCell admins={admins} main={main} onChange={onAssign} />
      </td>
      <td className="px-4 py-3">
        <StatusBadge site={site} />
        <div className="mt-1 truncate text-xs text-muted-foreground" title={formatDate(site.publishedAt)}>
          {site.publishedAt ? `Published ${timeAgo(site.publishedAt)}` : "Never published"}
        </div>
      </td>
      <td className="px-4 py-3">
        <SiteActions site={site} domain={domain} />
      </td>
    </tr>
  );
}

function SiteCard(props: SiteRowProps) {
  const { site, domain, admins, facultyBySlug, onAssign, onLink } = props;
  const main = site.slug === MAIN_SITE_SLUG;
  return (
    <li className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-start justify-between gap-3">
        <SiteIdentity {...props} />
        <SiteActions site={site} domain={domain} />
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1">
        <StatusBadge site={site} />
        <span className="text-xs text-muted-foreground">
          {site.publishedAt ? `Published ${timeAgo(site.publishedAt)}` : "Never published"}
        </span>
      </div>
      {main ? null : (
        <dl className="mt-3 grid gap-3 border-t border-border pt-3 sm:grid-cols-2">
          <div>
            <dt className="mb-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              Faculties
            </dt>
            <dd>
              <SiteFacultyCell site={site} facultyBySlug={facultyBySlug} onChange={onLink} />
            </dd>
          </div>
          <div>
            <dt className="mb-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              Admins
            </dt>
            <dd>
              <SiteAdminCell admins={admins} main={false} onChange={onAssign} />
            </dd>
          </div>
        </dl>
      )}
    </li>
  );
}

/** The Browse card's initials ("Institute of Engineering" → "IOE"), same rule as communityMonogram. */
function initials(name: string) {
  const words = name.trim().split(/\s+/).filter(Boolean);
  const acronym = words.find((word) => /^[A-Z]{2,4}$/.test(word));
  if (acronym) return acronym;
  return (words.length > 1 ? words.slice(0, 3).map((word) => word[0]).join("") : name.slice(0, 3))
    .toUpperCase() || "NS";
}

/**
 * The square image on this site's Browse card. Click to upload one (live at
 * once); without one the card shows the initials. Hover shows the remove button.
 */
function SiteIconButton({
  site,
  onChange,
}: {
  site: LandingSiteListItem;
  onChange: (iconUrl: string) => void;
}) {
  const [busy, setBusy] = useState(false);

  async function send(file: File | null) {
    setBusy(true);
    const id = toast.loading(file ? "Uploading card image…" : "Removing card image…");
    try {
      const body = new FormData();
      if (file) body.set("file", file);
      const response = await fetch(`/api/admin/sites/${site.slug}/icon`, {
        method: file ? "POST" : "DELETE",
        body: file ? body : undefined,
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "Couldn’t save the image.");
      onChange(payload.iconUrl ?? "");
      toast.success(file ? "Card image updated" : "Card image removed", {
        id,
        description: `Browse shows it for ${site.name} now.`,
      });
    } catch (cause) {
      toast.error("Couldn’t save the image", { id, description: messageOf(cause, "Try again.") });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="group relative shrink-0">
      <label
        className={`relative grid size-10 cursor-pointer place-items-center overflow-hidden rounded-xl border border-border bg-muted text-[11px] font-semibold text-muted-foreground hover:border-blue-600 ${busy ? "opacity-50" : ""}`}
        title={site.iconUrl ? "Change the card image" : "Add a card image (shown on Browse instead of the initials)"}
      >
        {site.iconUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- admin-uploaded image on the storage host
          <img src={site.iconUrl} alt="" className="size-full object-contain" />
        ) : (
          initials(site.name)
        )}
        <span className="absolute inset-0 hidden place-items-center bg-black/45 text-white group-hover:grid">
          <ImagePlus size={15} aria-hidden="true" />
        </span>
        <input
          type="file"
          accept="image/png,image/svg+xml,image/webp,image/jpeg"
          className="sr-only"
          aria-label={`Card image for ${site.name}`}
          disabled={busy}
          onChange={(event) => {
            const file = event.target.files?.[0] ?? null;
            event.target.value = "";
            if (file) void send(file);
          }}
        />
      </label>
      {site.iconUrl ? (
        <button
          type="button"
          disabled={busy}
          onClick={() => void send(null)}
          aria-label={`Remove the card image of ${site.name}`}
          title="Remove image"
          className="absolute -right-1.5 -top-1.5 hidden size-5 place-items-center rounded-full border border-border bg-card text-muted-foreground shadow-sm hover:text-red-600 focus-visible:grid group-hover:grid"
        >
          <X size={11} />
        </button>
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
  const visible = names.slice(0, 3);
  return (
    <div className="flex min-w-0 items-start gap-2">
      <div className="min-w-0 flex-1">
        {names.length ? (
          <ul className="flex flex-wrap gap-1" title={names.join(", ")}>
            {visible.map((name) => (
              <li
                key={name}
                className="max-w-full truncate rounded-md bg-muted px-2 py-0.5 text-xs font-medium text-foreground"
              >
                {name}
              </li>
            ))}
            {names.length > visible.length ? (
              <li className="rounded-md px-1 py-0.5 text-xs text-muted-foreground">
                +{names.length - visible.length}
              </li>
            ) : null}
          </ul>
        ) : (
          <span className="text-xs text-amber-700 dark:text-amber-300">No faculty linked</span>
        )}
        {names.length && !site.examEnabled ? (
          <div className="mt-1 text-xs text-amber-700 dark:text-amber-300">Not shown to visitors yet</div>
        ) : null}
      </div>
      <button
        type="button"
        onClick={onChange}
        aria-label={names.length ? `Change the faculties of ${site.name}` : `Link a faculty to ${site.name}`}
        title={names.length ? "Change faculties" : "Link a faculty"}
        className="inline-flex shrink-0 items-center gap-1 rounded-md px-1.5 py-1 text-xs font-medium text-blue-700 hover:bg-blue-600/10 dark:text-blue-300"
      >
        {names.length ? <PencilLine size={13} aria-hidden="true" /> : <><Plus size={13} aria-hidden="true" />Link</>}
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
  const [query, setQuery] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const shown = faculties.filter((faculty) =>
    `${faculty.name} ${faculty.faculty ?? ""} ${faculty.slug}`
      .toLowerCase()
      .includes(query.trim().toLowerCase()),
  );

  async function save() {
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
          examConfig: { ...loaded.site.examConfig, facultySlugs: picked },
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
      toast.success(`Faculties saved for ${domain}`, {
        description: payload.site.examConfig.enabled
          ? `Visitors now choose from ${picked.length} ${picked.length === 1 ? "faculty" : "faculties"}.`
          : "The faculties are linked but not shown to visitors.",
      });
    } catch (cause) {
      toast.error("Couldn’t save the faculties", { description: messageOf(cause, "Try again.") });
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

        <p className="mt-3 text-xs text-muted-foreground">
          The site’s main buttons open these faculties as soon as one is linked. Questions, plans
          and prices are under Edit → Exam &amp; checkout.
        </p>

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
    <div className="flex min-w-0 items-start gap-2">
      <div className="min-w-0 flex-1">
        {admins.length ? (
          <ul className="space-y-1">
            {admins.map((admin) => (
              <li key={admin.userId} className="flex min-w-0 items-center gap-2" title={admin.email || admin.fullName}>
                <span
                  aria-hidden="true"
                  className="grid size-6 shrink-0 place-items-center rounded-full bg-blue-600/10 text-[10px] font-semibold text-blue-700 dark:text-blue-300"
                >
                  {personInitials(admin.fullName)}
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium text-foreground">{admin.fullName}</span>
                  {admin.email ? (
                    <span className="block truncate text-xs text-muted-foreground">{admin.email}</span>
                  ) : null}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <span className="text-xs text-amber-700 dark:text-amber-300">No admin</span>
        )}
      </div>
      {onChange ? (
        <button
          type="button"
          onClick={onChange}
          aria-label={admins.length ? "Manage admins" : "Add an admin"}
          title={admins.length ? "Manage admins" : "Add an admin"}
          className="inline-flex shrink-0 items-center gap-1 rounded-md px-1.5 py-1 text-xs font-medium text-blue-700 hover:bg-blue-600/10 dark:text-blue-300"
        >
          {admins.length ? <PencilLine size={13} aria-hidden="true" /> : <><Plus size={13} aria-hidden="true" />Add</>}
        </button>
      ) : null}
    </div>
  );
}

function personInitials(name: string) {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]!.toUpperCase())
      .join("") || "?"
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
      const who =
        action === "add"
          ? picked?.fullName || picked?.email
          : current.find((admin) => admin.userId === userId)?.fullName;
      toast.success(
        action === "add" ? `${who || "New admin"} now runs ${domain}` : `${who || "Admin"} removed`,
        action === "remove" ? { description: "They are a student again." } : undefined,
      );
      setPicked(null);
      setQuery("");
      setConfirmRemove(null);
    } catch (cause) {
      toast.error("The admins could not be changed", { description: messageOf(cause, "Try again.") });
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
    try {
      const response = await fetch("/api/admin/sites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug: cleanSlug, name, copyFrom }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "Couldn’t create the site.");
      toast.success(`${cleanSlug}.${rootDomain} created`, {
        description: "It stays hidden until you publish it from the editor.",
      });
      router.push(`/admin/sites/${cleanSlug}`);
    } catch (caught) {
      toast.error("Couldn’t create the site", { description: messageOf(caught, "Try again.") });
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
          <span className="text-xs font-normal text-muted-foreground">
            Only admins see this. You can rename it later from Edit text.
          </span>
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
