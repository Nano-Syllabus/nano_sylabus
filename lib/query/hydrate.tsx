import { dehydrate, HydrationBoundary, type QueryClient } from "@tanstack/react-query";
import { makeQueryClient } from "@/lib/query/client";

/**
 * Server-side prefetching, so a client query has its answer before it mounts.
 *
 * THE PROBLEM
 * -----------
 * A `useQuery` in a client component cannot run until that component has been
 * shipped, parsed and hydrated in the browser. So the sequence for a page whose
 * data lives behind a client hook is:
 *
 *     server renders shell -> HTML -> JS downloads -> hydrate -> fetch -> paint
 *
 * and the fetch does not even START until the last two steps are done. On a
 * mid-range Android phone that is comfortably a second of the user looking at a
 * skeleton, for data the server could have read while it was rendering anyway.
 *
 * WHAT THIS DOES
 * --------------
 * Runs the query on the SERVER, during the render, and serialises the result
 * into the HTML. `HydrationBoundary` puts it into the client cache before any
 * component mounts, so the `useQuery` that would have started a request finds
 * the answer already there and paints on the first frame with no network at
 * all. The sequence becomes:
 *
 *     server renders shell AND data -> HTML (with data) -> hydrate -> paint
 *
 * WHY NOT JUST PASS IT AS A PROP
 * -------------------------------
 * Because a prop is a one-way delivery and this is a CACHE ENTRY. Data arriving
 * through hydration is keyed, so the same entry is shared by every other
 * component asking for that key, invalidated by the mutation that changes it,
 * refetched in the background when it goes stale, and still there after a
 * client-side navigation away and back. A prop is none of those things — which
 * is why the components that took one still refetched on mount to stay current,
 * and why the app fetched the subject catalog three times per session.
 *
 * A NEW CLIENT PER REQUEST, ALWAYS. `makeQueryClient` and never the browser
 * singleton: a client shared across server requests would serialise one user's
 * rows into another user's HTML. That is the single worst bug this file could
 * have, and it is why `getQueryClient` in lib/query/client.ts branches on
 * `isServer` rather than exposing one client.
 */
export async function prefetchQueries(
  prefetch: (client: QueryClient) => Promise<unknown> | void,
) {
  const client = makeQueryClient();
  await prefetch(client);
  return dehydrate(client);
}

export { HydrationBoundary };

/**
 * `prefetchQueries` and the boundary in one, for the common case.
 *
 * ```tsx
 * export default async function Page() {
 *   return (
 *     <WithPrefetched prefetch={(c) => c.prefetchQuery(publishedCatalogQuery)}>
 *       <CourseBrowser />
 *     </WithPrefetched>
 *   );
 * }
 * ```
 *
 * Note `prefetchQuery` and not `fetchQuery`: a prefetch that fails resolves
 * rather than throwing, so a tenant API having a bad minute degrades the page
 * to a client-side fetch (with its retry and its error UI) instead of turning
 * the whole route into an error boundary.
 */
export async function WithPrefetched({
  prefetch,
  children,
}: {
  prefetch: (client: QueryClient) => Promise<unknown> | void;
  children: React.ReactNode;
}) {
  const state = await prefetchQueries(prefetch);
  return <HydrationBoundary state={state}>{children}</HydrationBoundary>;
}
