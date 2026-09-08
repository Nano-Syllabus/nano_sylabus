import { queryFetcher } from "@/lib/query/api";
import { keys } from "@/lib/query/keys";
import { STALE } from "@/lib/query/client";
import { getPublishedCatalog } from "@/lib/tenant/marketplace-catalog";
import type { PublishedCatalogPayload } from "@/lib/query/catalog";

/**
 * Query definitions for use on the SERVER, where the data is already reachable.
 *
 * The difference from the client definitions in lib/query/catalog.ts is the
 * `queryFn`, and it is the whole point of this file: on the server there is no
 * reason to make an HTTP request to our own `/api/tenant/catalog` route. That
 * would mean the Node process opening a socket to itself, going back through
 * middleware, re-authenticating a user it already has, and paying to serialise
 * and re-parse a payload it could have had as an object.
 *
 * So the server version calls `getPublishedCatalog()` directly — the same
 * function the route handler calls, behind the same in-process memo — and puts
 * the result under the SAME key the client hook reads. The key is what makes
 * the two interchangeable: the client never learns which side produced its
 * data, it just finds it already there.
 *
 * `staleTime` has to match the client's or hydration is pointless: seeded with
 * a shorter one, the hook would consider the entry stale the moment it mounted
 * and refetch immediately, which is the exact request this exists to remove.
 */
export const publishedCatalogServerQuery = {
  queryKey: keys.tenant.catalog(),
  queryFn: async (): Promise<PublishedCatalogPayload> => {
    const catalog = await getPublishedCatalog();
    return { providers: catalog.providers, subjects: catalog.subjects };
  },
  staleTime: STALE.STATIC,
  meta: { persist: true },
} as const;

/**
 * The escape hatch for a server prefetch that has no in-process equivalent.
 *
 * Needs an absolute URL and the caller's cookies forwarded, because a server
 * `fetch` carries neither — which is why it is a last resort rather than the
 * default. Prefer a direct call to the same helper the route handler uses.
 */
export function serverApiQuery<T>(key: readonly unknown[], path: string, origin: string) {
  return {
    queryKey: key,
    queryFn: queryFetcher<T>(new URL(path, origin).toString()),
  };
}
