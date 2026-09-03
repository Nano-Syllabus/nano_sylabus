export type SubjectCommunity = { slug: string; name: string };

/** Effective member access comes from active community links, not library visibility. */
export function groupSubjectCommunities(rows: readonly Record<string, unknown>[]) {
  const result = new Map<string, SubjectCommunity[]>();
  for (const row of rows) {
    if (row.status !== "active" || typeof row.external_subject_slug !== "string") continue;
    const joined = Array.isArray(row.communities) ? row.communities : [row.communities];
    for (const value of joined) {
      if (!value || typeof value !== "object") continue;
      const community = value as Record<string, unknown>;
      if (
        community.status !== "active" ||
        typeof community.slug !== "string" ||
        typeof community.name !== "string"
      )
        continue;
      const links = result.get(row.external_subject_slug) || [];
      if (!links.some((link) => link.slug === community.slug)) {
        links.push({ slug: community.slug, name: community.name });
      }
      result.set(row.external_subject_slug, links);
    }
  }
  return result;
}

export function subjectAccessLabel(communities: readonly SubjectCommunity[], visibility: string) {
  if (communities.length) return "Community members";
  if (visibility === "public") return "Public";
  return "Not added to a community";
}
