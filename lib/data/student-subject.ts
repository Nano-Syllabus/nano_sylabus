import { listTopicMastery, type TopicMastery } from "@/lib/data/student-mastery";
import type { StudentCourseSubjectAccess } from "@/lib/student-courses";
import { findTenantSubject, listTenantSubjects } from "@/lib/tenant/client";
import { findPublishedSubject, getPublishedCatalog } from "@/lib/tenant/marketplace-catalog";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type StudentSubjectDetail = {
  name: string;
  slug: string;
  providerName: string;
  documentCount: number;
  unitCount: number;
  chunkCount: number;
  /** Saved revision notes the current student has linked to this subject. */
  revisionNoteCount: number;
  /** Only this subject's rows — the client merges them onto the chapter list. */
  mastery: TopicMastery[];
};

export async function getStudentSubjectDetail(
  userId: string,
  requestedSubject: string,
  accessOverride?: StudentCourseSubjectAccess,
): Promise<StudentSubjectDetail | null> {
  const [tenantSubjects, catalog] = await Promise.all([
    listTenantSubjects(),
    getPublishedCatalog(),
  ]);
  const tenantSubject = findTenantSubject(tenantSubjects, requestedSubject);
  const subject = tenantSubject || (accessOverride
    ? {
        name: accessOverride.subjectName,
        slug: accessOverride.subjectSlug,
        namespace: "Private subject",
        chunk_count: 0,
      }
    : null);
  if (!subject) return null;
  const published = tenantSubject ? findPublishedSubject(catalog, subject.slug) : null;

  const [mastery, revisionNoteCount] = await Promise.all([
    listTopicMastery(userId),
    countSubjectRevisionNotes(userId, subject.slug),
  ]);

  return {
    name: subject.name,
    slug: subject.slug,
    providerName: published?.providerName || subject.namespace,
    documentCount: published?.documentCount ?? 0,
    unitCount: published?.unitCount ?? 0,
    chunkCount: subject.chunk_count,
    revisionNoteCount,
    mastery: mastery.filter((row) => row.subjectSlug === subject.slug),
  };
}

async function countSubjectRevisionNotes(userId: string, subjectSlug: string) {
  const supabase = await createSupabaseServerClient();
  const { count, error } = await supabase
    .from("revision_notes")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("subject_slug", subjectSlug);

  // A notes-count failure should never prevent a student from opening their subject.
  return error ? 0 : count ?? 0;
}
