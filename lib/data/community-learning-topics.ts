import type { SupabaseClient } from "@supabase/supabase-js";
import { getTeacherPracticeTopics, type ApiRecord } from "@/lib/teacher-app/client";
import { isChallengeSourceDocumentTopic } from "@/lib/challenge-topics";
import { cache } from "react";

export type LearningTopic = {
  topic_key: string;
  title: string;
  blurb: string;
  unit_number: string | null;
  position: number;
  source: string;
};

export type LearningSubject = {
  id: string;
  name: string;
  teacherId: string | null;
  externalSubjectSlug: string | null;
};

export type CommunityLearningTopic = LearningTopic & {
  id: string;
  community_subject_id: string;
};

export function extractedLearningTopics(payload: ApiRecord): LearningTopic[] {
  if (!Array.isArray(payload?.topics))
    throw new Error("The learning service did not return a topic catalogue.");
  const seen = new Set<string>();
  return payload.topics.flatMap((item, index) => {
    if (!item || typeof item !== "object")
      throw new Error("The learning service returned an invalid topic.");
    const row = item as ApiRecord;
    const title = typeof row.title === "string" ? row.title.trim() : "";
    const key = typeof row.topic_key === "string" ? row.topic_key.trim() : "";
    // Outline labels are not executable IDs. Generation and grading must use
    // the provider graph's IDs, never IDs synthesized from editable labels.
    if (!title || !key)
      throw new Error("The learning service returned a topic without a usable ID or title.");
    if (
      isChallengeSourceDocumentTopic({
        topicKey: key,
        title,
        subjectName: typeof payload.subject === "string" ? payload.subject : "",
      })
    )
      return [];
    if (seen.has(key)) return [];
    seen.add(key);
    const position = Number(row.order_index ?? index);
    return [
      {
        topic_key: key,
        title,
        blurb: typeof row.blurb === "string" ? row.blurb.trim() : "",
        unit_number: row.unit_number == null ? null : String(row.unit_number),
        position: Number.isFinite(position) ? Math.max(0, Math.floor(position)) : index,
        source:
          typeof payload.topic_source === "string" ? payload.topic_source : "indexed_material",
      },
    ];
  });
}

/** Only pass subjects already resolved through ownership/member access.
 * The editable outline and executable catalogue are different provider concepts.
 * Old extracted-but-unpublished subjects use the provider's stored graph without
 * refresh, not synthetic IDs. Student GETs never write application tables.
 */
export async function readCommunityLearningTopics(
  subjects: LearningSubject[],
  admin: SupabaseClient,
): Promise<CommunityLearningTopic[]> {
  if (!subjects.length) return [];
  const stored = await admin
    .from("community_subject_topics")
    .select("id,community_subject_id,topic_key,title,blurb,unit_number,position,source")
    .in(
      "community_subject_id",
      subjects.map((subject) => subject.id),
    )
    .order("position", { ascending: true });
  if (stored.error) throw stored.error;
  const rows = (stored.data || []) as CommunityLearningTopic[];
  const learningRows = rows.filter((row) => {
    const subject = subjects.find((item) => item.id === row.community_subject_id);
    return !isChallengeSourceDocumentTopic({
      topicKey: row.topic_key,
      title: row.title,
      subjectName: subject?.name,
    });
  });
  const missing = subjects.filter(
    (subject) =>
      subject.teacherId &&
      subject.externalSubjectSlug &&
      !learningRows.some((row) => row.community_subject_id === subject.id),
  );
  if (!missing.length) return learningRows;
  const teacherIds = [...new Set(missing.map((subject) => subject.teacherId as string))];
  const syllabi = await admin
    .from("teacher_subject_syllabi")
    .select("teacher_id,subject_slug,structure")
    .in("teacher_id", teacherIds)
    .in(
      "subject_slug",
      missing.map((subject) => subject.externalSubjectSlug),
    );
  if (syllabi.error) throw syllabi.error;
  const recoverable = missing.filter((subject) =>
    (syllabi.data || []).some(
      (syllabus) =>
        syllabus.teacher_id === subject.teacherId &&
        syllabus.subject_slug === subject.externalSubjectSlug &&
        Array.isArray(syllabus.structure) &&
        syllabus.structure.length > 0,
    ),
  );
  if (!recoverable.length) return learningRows;
  const teachers = await admin.from("teachers").select("id,collection_sk").in("id", teacherIds);
  if (teachers.error) throw teachers.error;
  const recovered = await Promise.all(
    recoverable.map(async (subject) => {
      const teacher = teachers.data?.find((row) => row.id === subject.teacherId);
      if (!teacher?.collection_sk) throw new Error("Subject collection is unavailable.");
      const payload = await getTeacherPracticeTopics(String(teacher.collection_sk), subject.name);
      return extractedLearningTopics(payload).map((topic) => ({
        ...topic,
        id: topic.topic_key,
        community_subject_id: subject.id,
      }));
    }),
  );
  return [...learningRows, ...recovered.flat()];
}

/**
 * The community that owns a study course, resolved once per request.
 *
 * `readCourseLearningTopics` is called once per subject, in parallel, and every
 * one of those calls looked up the SAME community — a student's subjects all
 * belong to the community they joined, so `courseId` is identical across the
 * fan-out. That was one redundant round trip per subject on the Challenge Hub's
 * critical path.
 *
 * `cache()` is React's per-request memo: the first caller issues the query and
 * the rest await that same promise, so N subjects cost one lookup instead of N.
 * Per-request is the important half — it is scoped to a single server render
 * and shares nothing between users or requests, which is what makes memoising a
 * tenant-scoped row safe here.
 *
 * Keyed on `courseId` alone. The admin client is a process-wide singleton
 * (lib/supabase/admin.ts), so including it would only defeat the memo without
 * changing what is fetched.
 */
const communityIdForCourse = cache(async function communityIdForCourse(
  courseId: string,
  admin: SupabaseClient,
): Promise<string | null> {
  const community = await admin
    .from("communities")
    .select("id")
    .eq("study_course_id", courseId)
    .eq("status", "active")
    .maybeSingle();
  if (community.error) throw community.error;
  return community.data ? String(community.data.id) : null;
});

/** The caller has already checked this user's course/subject entitlement. */
export async function readCourseLearningTopics(
  courseId: string,
  teacherId: string,
  subjectSlug: string,
  admin: SupabaseClient,
): Promise<CommunityLearningTopic[] | null> {
  const communityId = await communityIdForCourse(courseId, admin);
  if (!communityId) return null;
  const subject = await admin
    .from("community_subjects")
    .select("id,name,teacher_id,external_subject_slug")
    .eq("community_id", communityId)
    .eq("teacher_id", teacherId)
    .eq("external_subject_slug", subjectSlug)
    .eq("status", "active")
    .eq("publication_status", "published")
    .maybeSingle();
  if (subject.error) throw subject.error;
  if (!subject.data) return [];
  return readCommunityLearningTopics(
    [
      {
        id: String(subject.data.id),
        name: String(subject.data.name),
        teacherId,
        externalSubjectSlug: subjectSlug,
      },
    ],
    admin,
  );
}
