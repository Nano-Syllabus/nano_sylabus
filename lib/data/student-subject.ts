import { listTopicMastery, type TopicMastery } from "@/lib/data/student-mastery";
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
  const catalog = await getPublishedCatalog();
  const subject = findPublishedSubject(catalog, requestedSubject);
  if (!subject) return null;

  const mastery = await listTopicMastery(userId);

  return {
    name: subject.name,
    slug: subject.slug,
    providerName: subject.providerName,
    documentCount: subject.documentCount,
    unitCount: subject.unitCount,
    chunkCount: subject.chunkCount,
    mastery: mastery.filter((row) => row.subjectSlug === subject.slug),
  };
}
