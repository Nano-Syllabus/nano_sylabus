"use client";

import { useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { queryFetcher } from "@/lib/query/api";
import { keys } from "@/lib/query/keys";
import { STALE } from "@/lib/query/client";

export type CatalogSubject = {
  name: string;
  slug: string;
  namespace: string;
  namespaceSlug: string;
  folderPath: string;
  providerName: string;
  providerKind: string;
  chunkCount: number;
  wordCount: number;
  documentCount: number;
  unitCount: number;
  code?: string;
  university?: string;
  programme?: string;
};

export type CatalogProvider = {
  namespace: string;
  providerName: string;
  providerKind: string;
  chunkCount: number;
  documentCount: number;
  subjects: CatalogSubject[];
};

export type PublishedCatalogPayload = {
  providers: CatalogProvider[];
  subjects: CatalogSubject[];
};

/**
 * The options that make the published catalog the fastest read in the app.
 *
 * Shared between the hook and the prefetch helper so the two can never
 * disagree — a prefetch written with a different `staleTime` from the hook it
 * is warming produces a cache entry the hook immediately considers stale and
 * refetches, which is the one bug that makes prefetching look useless.
 *
 * `meta.persist` is the opt-in that lets this survive a page reload; see
 * `shouldDehydrateQuery` in lib/query/client.ts for why that flag exists and
 * why almost nothing else carries it. The catalog qualifies on both counts:
 * identical for every student, and expensive enough that a cold start is felt.
 */
export const publishedCatalogQuery = {
  queryKey: keys.tenant.catalog(),
  queryFn: queryFetcher<PublishedCatalogPayload>("/api/tenant/catalog"),
  staleTime: STALE.STATIC,
  meta: { persist: true },
} as const;

/**
 * Every published course, for the course browser, onboarding and settings.
 *
 * Three surfaces asked for this independently and each kept its own copy in
 * component state, so opening the course browser after having been through
 * onboarding refetched a list the app had already downloaded twice. One key,
 * one copy, one request per half hour.
 */
export function usePublishedCatalog(enabled = true) {
  return useQuery({ ...publishedCatalogQuery, enabled });
}

/**
 * Warm the catalog before anything asks for it.
 *
 * Called on hover/focus of the control that opens a course browser. By the
 * time the dialog mounts the data is usually already there, so it opens with
 * content rather than a spinner — which is most of what "feels fast" means
 * here, since the dialog itself is instant and only the list was ever slow.
 *
 * `prefetchQuery` is a no-op when the entry is present and fresh, so calling
 * it on every pointer-enter costs nothing after the first.
 */
export function prefetchPublishedCatalog(client: QueryClient) {
  return client.prefetchQuery(publishedCatalogQuery);
}

/** `prefetchPublishedCatalog` bound to the mounted client, for event handlers. */
export function usePrefetchPublishedCatalog() {
  const client = useQueryClient();
  return () => void prefetchPublishedCatalog(client);
}

export type TenantSubject = {
  courseId: string | null;
  name: string;
  slug: string;
  namespaceSlug: string;
  folderPath: string;
  private?: boolean;
  community?: boolean;
};

/**
 * The subjects this student may scope chat and practice to.
 *
 * SHORT rather than STATIC: joining a course is a thing the student just did,
 * and the subject picker is often the very next thing they open.
 */
export function useTenantSubjects(enabled = true) {
  return useQuery({
    queryKey: keys.tenant.subjects(),
    queryFn: queryFetcher<{ subjects: TenantSubject[] }>("/api/tenant/subjects"),
    staleTime: STALE.SHORT,
    enabled,
  });
}

/**
 * The credit balance in the header.
 *
 * `STALE.LIVE` — always revalidate on mount. This is the number a student
 * watches go down as they ask questions, and the one piece of data in the app
 * where showing a cached value is a support ticket. It is still cheap: the
 * route answers `304` when nothing has changed (see app/api/billing/credits).
 */
export function useCreditBalance(initialBalance?: number) {
  return useQuery({
    queryKey: keys.billing.credits(),
    queryFn: queryFetcher<{ balance: number }>("/api/billing/credits"),
    staleTime: STALE.LIVE,
    // The server already rendered a balance into the page. Seeding it means
    // the header paints the right number on the first frame and corrects
    // itself behind the paint, instead of showing a dash and then a number.
    initialData: initialBalance === undefined ? undefined : { balance: initialBalance },
  });
}

export function useStudentCourses(enabled = true) {
  return useQuery({
    queryKey: keys.student.courses(),
    queryFn: queryFetcher<{ courses: unknown[] }>("/api/student/courses"),
    staleTime: STALE.SHORT,
    enabled,
  });
}

export function useBillingPlans(enabled = true) {
  return useQuery({
    queryKey: keys.billing.plans(),
    queryFn: queryFetcher<{ plans: unknown[]; paymentConfig: unknown }>("/api/billing/plans"),
    staleTime: STALE.STATIC,
    enabled,
  });
}
