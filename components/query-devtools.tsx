"use client";

import { ReactQueryDevtools } from "@tanstack/react-query-devtools";

/**
 * The TanStack Query inspector — cache contents, staleness, in-flight queries.
 *
 * DEVELOPMENT ONLY, AND THE EXCLUSION IS STRUCTURAL. This file statically
 * imports ~40 KB of devtools, and `next.config.ts` aliases it to
 * `query-devtools.stub.tsx` for every production build. Nothing at runtime
 * decides that, so nothing at runtime can get it wrong.
 *
 * A `process.env.NODE_ENV` check would not have been enough, and the difference
 * is worth stating because the first attempt at this got it wrong: a constant
 * that folds to `false` removes the RENDER, not the MODULE — and a dynamic
 * `import()` behind that check still emits the chunk, it just never fetches it.
 * Either way the bytes are built and deployed. The alias removes them.
 *
 * This is the same mechanism `components/dev-perf-hud.tsx` uses, for the same
 * reason. See the `webpack()` block in next.config.ts.
 *
 * WHAT IT IS FOR
 * --------------
 * The panel is how you check that the caching in this app is doing what it
 * claims: open it, navigate between tabs, and a query that refetches when it
 * should have been served from cache is visible immediately as a row flipping
 * to "fetching". It is the fastest way to catch a `staleTime` that did not
 * take, a key that is not stable across renders, or a mutation that
 * invalidated more than it needed to.
 */
export function QueryDevtools() {
  return <ReactQueryDevtools initialIsOpen={false} buttonPosition="bottom-left" />;
}
