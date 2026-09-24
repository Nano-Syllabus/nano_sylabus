export function getCanonicalBaseUrl(): string {
  return (process.env.NEXT_PUBLIC_SITE_URL || process.env.SITE_URL || "https://nanosyllabus.com").replace(/\/+$/, "");
}

export const CANONICAL_BASE_URL = getCanonicalBaseUrl();

export function buildCanonicalUrl(pathname: string): string {
  const normalizedPath = pathname.startsWith("/") ? pathname : `/${pathname}`;
  return new URL(normalizedPath, `${getCanonicalBaseUrl()}/`).toString();
}
