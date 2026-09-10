/**
 * The decisions behind warming the other tabs, kept out of the component so
 * they can be tested. `components/tab-warmer.tsx` holds the effect that runs
 * them; everything here is pure.
 */

/**
 * The tabs worth warming, in the order a student is most likely to want them.
 *
 * Deliberately not every route: warming something nobody opens spends a server
 * render to fill a cache entry that expires unread.
 */
export const WARM_ROUTES = [
  "/app/today",
  "/app/challenges",
  "/app/community",
  "/app/chat",
] as const;

/** Space the renders out so they never arrive as one burst. */
export const WARM_GAP_MS = 400;

export type ConnectionHint = {
  saveData?: boolean;
  effectiveType?: string;
} | null | undefined;

/**
 * Don't spend someone's mobile data speculatively.
 *
 * `saveData` is the explicit "I am paying per megabyte" signal, and 2g/3g means
 * these extra renders would compete with the page being read rather than fill
 * an idle pipe. Both are common on the network this app is used on, so the
 * feature turns itself off rather than making the current page slower.
 *
 * An absent `connection` (Safari, Firefox) is treated as fine — the API is
 * Chromium-only, and refusing to warm wherever it is missing would disable this
 * for most desktop browsers on the strength of no evidence at all.
 */
export function connectionAllowsWarming(connection: ConnectionHint): boolean {
  if (!connection) return true;
  if (connection.saveData) return false;
  return !["slow-2g", "2g", "3g"].includes(connection.effectiveType ?? "");
}

/**
 * Which tabs still need rendering, given where the student already is.
 *
 * The current route is skipped: it is on screen already, so warming it is a
 * wasted round trip that also re-renders what is being read. `startsWith`
 * rather than equality because a student sitting on `/app/chat?session=…` or
 * `/app/community/bct` is still "on" that tab.
 */
export function routesToWarm(
  pathname: string,
  routes: readonly string[] = WARM_ROUTES,
): string[] {
  return routes.filter((route) => !pathname.startsWith(route));
}
