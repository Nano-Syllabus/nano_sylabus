import type { CommunityDetail } from "@/lib/communities";
import { listPracticeAttempts, listTopicMastery } from "@/lib/data/student-mastery";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { readCommunityLearningTopics } from "@/lib/data/community-learning-topics";

export type CommunitySubjectExplorerInsight = {
  subjectId: string;
  readiness: number | null;
  materialCount: number | null;
  topicCount: number | null;
  practicedTopicCount: number | null;
  masteredTopicCount: number | null;
  examsTaken: number | null;
  averageScore: number | null;
  topics: Array<{
    key: string;
    title: string;
    blurb: string;
    unitNumber: string | null;
    percentage: number | null;
    attempts: number | null;
    status: "not_attempted" | "weak" | "developing" | "strong" | "unavailable";
  }>;
};

type TopicRow = {
  community_subject_id: string;
  topic_key: string;
  title: string;
  blurb: string | null;
  unit_number: string | null;
  position: number;
};

type DocumentRow = {
  teacher_id: string;
  collection_path: string | null;
};

function normalizedPath(value: string) {
  return value.replace(/^\/+|\/+$/g, "").toLowerCase();
}

/** Real student-facing counts and mastery for the joined community explorer. */
export async function getCommunitySubjectExplorerInsights(
  userId: string,
  community: CommunityDetail,
): Promise<Record<string, CommunitySubjectExplorerInsight>> {
  const subjects = community.terms.flatMap((term) => term.subjects);
  if (!subjects.length) return {};

  const admin = createSupabaseAdminClient();
  const teacherIds = [
    ...new Set(
      subjects.map((subject) => subject.teacherId).filter((id): id is string => Boolean(id)),
    ),
  ];

  const [topicsResult, documentsResult, masteryResult, attemptsResult] = await Promise.allSettled([
    readCommunityLearningTopics(subjects, admin),
    teacherIds.length
      ? admin
          .from("teacher_document_files")
          .select("teacher_id,collection_path")
          .in("teacher_id", teacherIds)
      : Promise.resolve({ data: [], error: null }),
    listTopicMastery(userId),
    listPracticeAttempts(userId, 1000),
  ]);

  const topicRows =
    topicsResult.status === "fulfilled"
      ? (topicsResult.value as TopicRow[])
      : null;
  const documentRows =
    documentsResult.status === "fulfilled" && !documentsResult.value.error
      ? ((documentsResult.value.data || []) as DocumentRow[])
      : null;
  const mastery = masteryResult.status === "fulfilled" ? masteryResult.value : null;
  const practiceAttempts = attemptsResult.status === "fulfilled" ? attemptsResult.value : null;

  return Object.fromEntries(
    subjects.map((subject) => {
      const topics =
        topicRows
          ?.filter((row) => row.community_subject_id === subject.id)
          .sort((left, right) => left.position - right.position) ?? null;
      const topicKeys = new Set((topics || []).map((row) => row.topic_key));
      const subjectSlug = subject.externalSubjectSlug || subject.slug;
      const subjectMastery = (mastery || []).filter(
        (row) =>
          row.courseId === community.studyCourseId &&
          row.subjectSlug.toLowerCase() === subjectSlug.toLowerCase() &&
          (!topicKeys.size || topicKeys.has(row.topicKey)),
      );
      const practiced = subjectMastery.filter((row) => row.attempts > 0);
      const masteryByTopic = new Map(subjectMastery.map((row) => [row.topicKey, row]));
      const topicProgress = (topics || []).map((topic) => {
        const progress = masteryByTopic.get(topic.topic_key);
        const status = progress?.status;
        return {
          key: topic.topic_key,
          title: topic.title,
          blurb: topic.blurb || "",
          unitNumber: topic.unit_number,
          percentage: mastery === null ? null : (progress?.percentage ?? 0),
          attempts: mastery === null ? null : (progress?.attempts ?? 0),
          status:
            mastery === null
              ? "unavailable"
              : status === "weak" || status === "developing" || status === "strong"
                ? status
                : "not_attempted",
        } as const;
      });
      const topicCount = topics?.length ?? null;
      const readiness =
        topicCount === null || mastery === null
          ? null
          : topicCount === 0
            ? null
            : Math.round(
                (subjectMastery.reduce((sum, row) => sum + row.percentage, 0) / topicCount) * 10,
              ) / 10;
      const subjectAttempts =
        practiceAttempts?.filter(
          (attempt) =>
            attempt.courseId === community.studyCourseId &&
            attempt.subjectSlug.toLowerCase() === subjectSlug.toLowerCase(),
        ) ?? null;
      const scoredAttempts = (subjectAttempts || []).filter((attempt) => attempt.totalMarks > 0);
      const averageScore =
        subjectAttempts === null
          ? null
          : scoredAttempts.length
            ? Math.round(
                (scoredAttempts.reduce(
                  (sum, attempt) => sum + (attempt.totalScore / attempt.totalMarks) * 100,
                  0,
                ) /
                  scoredAttempts.length) *
                  10,
              ) / 10
            : null;
      const folder = normalizedPath(subject.folderPath || subject.name);
      const materialCount =
        documentRows === null
          ? null
          : documentRows.filter((row) => {
              if (subject.teacherId && row.teacher_id !== subject.teacherId) return false;
              const path = normalizedPath(row.collection_path || "");
              return path === folder || path.startsWith(`${folder}/`);
            }).length;

      return [
        subject.id,
        {
          subjectId: subject.id,
          readiness,
          materialCount,
          topicCount,
          practicedTopicCount: mastery === null ? null : practiced.length,
          masteredTopicCount:
            mastery === null
              ? null
              : subjectMastery.filter((row) => row.status === "strong").length,
          // Every row is a real graded sitting for this community course + subject:
          // mock/practice, teacher exam, or challenge exam.
          examsTaken: subjectAttempts?.length ?? null,
          averageScore,
          topics: topicProgress,
        } satisfies CommunitySubjectExplorerInsight,
      ];
    }),
  );
}
