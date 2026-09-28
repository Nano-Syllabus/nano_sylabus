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

/**
 * Whole-subject readiness across every indexed topic.
 *
 * The denominator is always the complete indexed syllabus. A topic with no
 * mastery row therefore contributes zero instead of disappearing from the
 * calculation and making a partially practised subject look complete.
 */
export function calculateSubjectReadiness(
  topicCount: number | null,
  topicPercentages: readonly number[] | null,
) {
  if (topicCount === null || topicCount <= 0 || topicPercentages === null) return null;

  const readinessPoints = topicPercentages
    .slice(0, topicCount)
    .reduce((sum, percentage) => sum + Math.max(0, Math.min(100, percentage)), 0);

  return Math.round((readinessPoints / topicCount) * 10) / 10;
}

type CompletedChallengeRow = {
  subject_slug: string | null;
  topic_key: string | null;
  topic_title: string | null;
  last_score: number | null;
  last_total_marks: number | null;
};

function normalizedTitle(value: string | null | undefined) {
  return String(value ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

/**
 * Best passed-challenge score (percent) per subtopic of one subject, keyed by
 * topic key and by `title:`-prefixed title — `/start` can rewrite a row's key,
 * and the title is how the Challenge Hub still recognises the topic.
 */
function bestPassedScores(rows: CompletedChallengeRow[] | null, subjectSlug: string) {
  const best = new Map<string, number>();
  for (const row of rows ?? []) {
    if (String(row.subject_slug ?? "").toLowerCase() !== subjectSlug.toLowerCase()) continue;
    const total = Number(row.last_total_marks) || 0;
    const percent = total > 0 ? Math.max(0, Math.min(100, (Number(row.last_score) / total) * 100)) : 100;
    const rounded = Math.round(percent * 10) / 10;
    for (const key of [
      String(row.topic_key ?? "").trim().toLowerCase(),
      row.topic_title ? `title:${normalizedTitle(row.topic_title)}` : "",
    ]) {
      if (key && rounded > (best.get(key) ?? -1)) best.set(key, rounded);
    }
  }
  return best;
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

  const [topicsResult, documentsResult, masteryResult, attemptsResult, challengesResult] = await Promise.allSettled([
    readCommunityLearningTopics(subjects, admin),
    teacherIds.length
      ? admin
          .from("teacher_document_files")
          .select("teacher_id,collection_path")
          .in("teacher_id", teacherIds)
      : Promise.resolve({ data: [], error: null }),
    listTopicMastery(userId),
    listPracticeAttempts(userId, 1000),
    // Passed challenges: the Challenge Hub's "N of M subtopics completed".
    community.studyCourseId
      ? admin
          .from("student_challenges")
          .select("subject_slug,topic_key,topic_title,last_score,last_total_marks")
          .eq("user_id", userId)
          .eq("course_id", community.studyCourseId)
          .eq("status", "completed")
      : Promise.resolve({ data: [], error: null }),
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
  const completedChallenges =
    challengesResult.status === "fulfilled" && !challengesResult.value.error
      ? ((challengesResult.value.data || []) as CompletedChallengeRow[])
      : null;

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
      const masteryByTopic = new Map(subjectMastery.map((row) => [row.topicKey, row]));
      const passedBest = bestPassedScores(completedChallenges, subjectSlug);
      const known = mastery !== null || completedChallenges !== null;
      const topicProgress = (topics || []).map((topic) => {
        const progress = masteryByTopic.get(topic.topic_key);
        const passed =
          passedBest.get(topic.topic_key.trim().toLowerCase()) ??
          passedBest.get(`title:${normalizedTitle(topic.title)}`);
        const status = passed !== undefined ? "strong" : progress?.status;
        return {
          key: topic.topic_key,
          title: topic.title,
          blurb: topic.blurb || "",
          unitNumber: topic.unit_number,
          // A passed challenge is the topic's score, as on the Challenge Hub's
          // "Ohm's Law · 14/20"; practice mastery is the fallback.
          percentage: !known ? null : (passed ?? progress?.percentage ?? 0),
          attempts: !known ? null : Math.max(progress?.attempts ?? 0, passed !== undefined ? 1 : 0),
          passed: passed !== undefined,
          status:
            !known
              ? "unavailable"
              : status === "weak" || status === "developing" || status === "strong"
                ? status
                : "not_attempted",
        } as const;
      });
      const practiced = topicProgress.filter((topic) => (topic.attempts ?? 0) > 0);
      const topicCount = topics?.length ?? null;
      const completedCount = topicProgress.filter((topic) => topic.passed).length;
      // Subject progress = subtopics completed / subtopics, the Challenge Hub's
      // bar ("7 of 35 subtopics completed · 20%"), so the two never disagree.
      const readiness =
        !known || topicCount === null || topicCount <= 0
          ? null
          : Math.round((completedCount / topicCount) * 1000) / 10;
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
          practicedTopicCount: !known ? null : practiced.length,
          masteredTopicCount: !known ? null : completedCount,
          // Every row is a real graded sitting for this community course + subject:
          // mock/practice, teacher exam, or challenge exam.
          examsTaken: subjectAttempts?.length ?? null,
          averageScore,
          topics: topicProgress.map(({ passed: _passed, ...topic }) => topic),
        } satisfies CommunitySubjectExplorerInsight,
      ];
    }),
  );
}
