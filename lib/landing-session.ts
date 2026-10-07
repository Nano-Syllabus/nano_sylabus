/**
 * Whether this browser holds a Supabase session on this host, read from the
 * cookie alone.
 *
 * Public pages only need this to pick a button label ("Continue learning" vs
 * "Start Learning"), and asking the SDK meant downloading the whole Supabase
 * client (~180 kB) on the first page a new student sees. `@supabase/ssr` keeps
 * the session in a readable `sb-<project>-auth-token` cookie (split into `.0`,
 * `.1` … when large), so its presence answers the same question. An expired
 * cookie still counts, which only sends the visitor through /app → sign-in.
 */
export function hasSessionCookie(): boolean {
  if (typeof document === "undefined") return false;
  return /(?:^|;\s*)sb-[^=;]+-auth-token(?:\.\d+)?=[^;]/.test(document.cookie);
}
