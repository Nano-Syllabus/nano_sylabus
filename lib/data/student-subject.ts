import { listTopicMastery, type TopicMastery } from "@/lib/data/student-mastery";
import { findTenantSubject, listTenantSubjects } from "@/lib/tenant/client";
import { findPublishedSubject, getPublishedCatalog } from "@/lib/tenant/marketplace-catalog";

export type StudentSubjectDetail = {
  name: string;
  slug: string;
  providerName: string;
  documentCount: number;
  unitCount: number;
  chunkCount: number;
  /** Only this subject's rows — the client merges them onto the chapter list. */
  mastery: TopicMastery[];
};

export async function getStudentSubjectDetail(
  userId: string,
  requestedSubject: string,
): Promise<StudentSubjectDetail | null> {
  const [tenantSubjects, catalog] = await Promise.all([
    listTenantSubjects(),
    getPublishedCatalog(),
  ]);
  const subject = findTenantSubject(tenantSubjects, requestedSubject);
  if (!subject) return null;
  const published = findPublishedSubject(catalog, subject.slug);

  const mastery = await listTopicMastery(userId);

  return {
    name: subject.name,
    slug: subject.slug,
    providerName: published?.providerName || subject.namespace,
    documentCount: published?.documentCount ?? 0,
    unitCount: published?.unitCount ?? 0,
    chunkCount: subject.chunk_count,
    mastery: mastery.filter((row) => row.subjectSlug === subject.slug),
  };
}
