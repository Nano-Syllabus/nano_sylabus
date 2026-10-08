/**
 * Which landing site a request's hostname asks for.
 *
 * `*.nanosyllabus.com` all reach this one deployment (a wildcard domain), and
 * the subdomain names the site: `highschool.nanosyllabus.com` → "highschool".
 * The bare domain and `www` are the main site. Locally, `highschool.localhost:3000`
 * works the same way — browsers resolve `*.localhost` to 127.0.0.1 unaided.
 *
 * Edge-safe (read by middleware): no imports, no I/O.
 */

/** The main site's slug — the bare domain's landing page. */
export const MAIN_SITE_SLUG = "main";

/** Subdomains that are never a landing site. */
export const RESERVED_SITE_SLUGS = new Set([
  MAIN_SITE_SLUG,
  "www",
  "app",
  "api",
  "admin",
  "mail",
  "static",
  "assets",
  "cdn",
  "status",
  "docs",
  "blog",
  "sites",
]);

const SLUG_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,38}[a-z0-9])?$/;

export function isValidSiteSlug(slug: string) {
  return SLUG_PATTERN.test(slug);
}

export function rootDomain() {
  return (process.env.NEXT_PUBLIC_ROOT_DOMAIN || "nanosyllabus.com")
    .toLowerCase()
    .replace(/^\.+|\.+$/g, "");
}

/** The site slug a Host header names, or null for the main site / anything unrecognised. */
export function siteSlugFromHost(host: string | null | undefined): string | null {
  if (!host) return null;
  const hostname = host.toLowerCase().split(":")[0].replace(/\.$/, "");

  for (const root of [rootDomain(), "localhost"]) {
    if (!hostname.endsWith(`.${root}`)) continue;
    const label = hostname.slice(0, -(root.length + 1));
    // One label only: `a.b.nanosyllabus.com` is not a site.
    if (!label || label.includes(".")) return null;
    if (RESERVED_SITE_SLUGS.has(label) || !isValidSiteSlug(label)) return null;
    return label;
  }
  return null;
}

/** The public address of a site, e.g. `https://highschool.nanosyllabus.com`. */
export function siteOrigin(slug: string) {
  const root = rootDomain();
  return slug === MAIN_SITE_SLUG ? `https://${root}` : `https://${slug}.${root}`;
}

/**
 * The origin of a site's own dashboard, matching how this request arrived:
 * `https://ioe.nanosyllabus.com` in production, `http://ioe.localhost:3000`
 * locally. The main site is the bare domain.
 */
export function siteAppOrigin(slug: string, host: string | null | undefined, protocol = "https:") {
  if (process.env.NODE_ENV === "production") return siteOrigin(slug);
  const port = (host ?? "").split(":")[1];
  const base = slug === MAIN_SITE_SLUG ? "localhost" : `${slug}.localhost`;
  return `${protocol}//${base}${port ? `:${port}` : ""}`;
}
