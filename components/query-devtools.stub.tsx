"use client";

/**
 * The production stand-in for `components/query-devtools.tsx`.
 *
 * `next.config.ts` aliases the real module to this one for every build that is
 * not `next dev`, so the devtools bundle is never emitted rather than merely
 * never loaded. Rendering `null` keeps the call site identical in both builds:
 * nothing has to know which one it got.
 */
export function QueryDevtools() {
  return null;
}
