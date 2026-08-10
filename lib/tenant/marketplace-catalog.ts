import { getMarketplace, listTenantSubjects, type TenantSubject } from "@/lib/tenant/client";

/**
 * Content is teacher-managed: every subject lives at
 * `<teacher-namespace>/<Subject>/<shelf>` and is owned by the teacher who
 * uploaded it. There is no faculty/branch/semester taxonomy to walk any more,
 * so the published marketplace decides what a student may pick, and
 * /api/v1/subjects supplies the slug and folder path those picks resolve to.
 */
export type PublishedSubject = {
  name: string;
  /** Tenant subject slug — what chat and the practice API are scoped by. */
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
};

export type PublishedProvider = {
  namespace: string;
  providerName: string;
  providerKind: string;
  chunkCount: number;
  documentCount: number;
  subjects: PublishedSubject[];
};

export type PublishedCatalog = {
  providers: PublishedProvider[];
  /** Same subjects, flattened — most callers just want the pickable list. */
  subjects: PublishedSubject[];
};

function subjectKey(namespace: string, name: string) {
  return `${namespace.trim().toLowerCase()}::${name.trim().toLowerCase()}`;
}

function indexTenantSubjects(subjects: TenantSubject[]) {
  const byKey = new Map<string, TenantSubject>();
  for (const subject of subjects) {
    if (!subject?.name) continue;
    byKey.set(subjectKey(subject.namespace ?? "", subject.name), subject);
  }
  return byKey;
}

/**
 * Joins the published marketplace with the tenant subject list. A marketplace
 * entry without a matching tenant subject has no slug, so it cannot be scoped
 * to and is dropped rather than surfaced as an unusable pick.
 */
export function joinMarketplaceWithSubjects(
  marketplace: Awaited<ReturnType<typeof getMarketplace>>,
  tenantSubjects: TenantSubject[],
): PublishedCatalog {
  const tenantSubjectsByKey = indexTenantSubjects(tenantSubjects);
  const providers: PublishedProvider[] = [];

  for (const provider of marketplace.providers ?? []) {
    const subjects: PublishedSubject[] = [];

    for (const entry of provider.subjects ?? []) {
      const match = tenantSubjectsByKey.get(subjectKey(provider.namespace, entry.subject));
      if (!match?.slug) continue;

      subjects.push({
        name: match.name || entry.subject,
        slug: match.slug,
        namespace: match.namespace || provider.namespace,
        namespaceSlug: match.namespace_slug || provider.namespace,
        folderPath: match.folder_path || `${provider.namespace}/${entry.subject}`,
        providerName: provider.provider_name || provider.tenant_name || provider.namespace,
        providerKind: provider.provider_kind || "teacher",
        chunkCount: entry.chunk_count ?? 0,
        wordCount: entry.word_count ?? 0,
        documentCount: entry.document_count ?? 0,
        unitCount: entry.unit_count ?? 0,
      });
    }

    if (!subjects.length) continue;

    subjects.sort((left, right) => left.name.localeCompare(right.name));
    providers.push({
      namespace: provider.namespace,
      providerName: provider.provider_name || provider.tenant_name || provider.namespace,
      providerKind: provider.provider_kind || "teacher",
      chunkCount: provider.chunk_count ?? 0,
      documentCount: provider.document_count ?? 0,
      subjects,
    });
  }

  providers.sort((left, right) => left.providerName.localeCompare(right.providerName));

  return {
    providers,
    subjects: providers.flatMap((provider) => provider.subjects),
  };
}

export async function getPublishedCatalog(): Promise<PublishedCatalog> {
  try {
    const [marketplace, tenantSubjects] = await Promise.all([
      getMarketplace(),
      listTenantSubjects(),
    ]);
    return joinMarketplaceWithSubjects(marketplace, tenantSubjects);
  } catch (error) {
    console.error("[marketplace] published catalog unavailable", error);
    return { providers: [], subjects: [] };
  }
}

/**
 * One canonical pick-list for every student surface. Profile subjects are
 * preferences, so they are ordered first; they never hide the rest of the
 * published, indexed catalog.
 */
export function listPublishedSubjectNames(
  catalog: PublishedCatalog,
  preferredSubjects: string[] = [],
) {
  const publishedByName = new Map<string, string>();
  for (const subject of catalog.subjects) {
    const name = subject.name.trim();
    if (!name) continue;
    publishedByName.set(name.toLowerCase(), name);
  }

  const preferred: string[] = [];
  const included = new Set<string>();
  for (const value of preferredSubjects) {
    const key = value.trim().toLowerCase();
    const publishedName = publishedByName.get(key);
    if (!publishedName || included.has(key)) continue;
    preferred.push(publishedName);
    included.add(key);
  }

  const remaining = [...publishedByName.entries()]
    .filter(([key]) => !included.has(key))
    .map(([, name]) => name)
    .sort((left, right) => left.localeCompare(right));

  return [...preferred, ...remaining];
}

/** "Engineering Physics" and "engineering-physics" have to land on one key. */
function urlKey(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

/**
 * Resolves a subject reference back to a published subject. Callers pass a
 * tenant slug, a display name, or the hyphenated form used in URLs, so all
 * three are matched.
 */
export function findPublishedSubject(catalog: PublishedCatalog, value: string) {
  const needle = value.trim().toLowerCase();
  if (!needle) return null;

  const key = urlKey(value);

  return (
    catalog.subjects.find((subject) => subject.slug.toLowerCase() === needle) ??
    catalog.subjects.find((subject) => subject.name.toLowerCase() === needle) ??
    catalog.subjects.find((subject) => urlKey(subject.name) === key) ??
    null
  );
}
