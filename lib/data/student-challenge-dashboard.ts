import { listTopicMastery, type TopicMastery } from "@/lib/data/student-mastery";
import {
  ensureDailyChallenges,
  isMissingChallengeTable,
  type ChallengeRecommendation,
  type StudentChallengeSummary,
} from "@/lib/data/student-challenges";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import {
  type PracticeTopic,
  type PracticeTopicStatus,
} from "@/lib/tenant/client";
import { getTeacherPracticeTopics } from "@/lib/teacher-app/client";
import { listCreatorPrivateSubjectAccess, listStudentCourseSubjects } from "@/lib/student-courses";

export type ChallengeSubject = {
  courseId: string | null;
  /** Course-scoped identity; subject slugs are not globally unique. */
  scopeKey: string;
  slug: string;
  name: string;
  readiness: number | null;
  totalTopics: number;
  practicedTopics: number;
  weakTopics: number;
  nextTopic: { key: string; title: string } | null;
  topicDataAvailable: boolean;
};

export type ChallengeLeaderboard = {
  currentStreakRank: number | null;
  bestStreak: number;
  platformBestStreak: number;
  daysFromBest: number;
  practicePerDayRank: number | null;
  topPracticePerDay: number;
};

export type StudentChallengeDashboard = {
  subjects: ChallengeSubject[];
  challenges: StudentChallengeSummary[];
  readiness: number | null;
  totalTopics: number;
  practicedTopics: number;
  /** Change in average graded practice score, not a historical mastery snapshot. */
  practiceScoreChange: number | null;
  currentStreak: number;
  todayCompleted: boolean;
  passedThisMonth: number;
  passedThisWeek: number;
  passRateLast30Days: number | null;
  practicePerDay: number;
  hasPracticeHistory: boolean;
  leaderboard: ChallengeLeaderboard | null;
};

type Attempt = {
  totalScore: number;
  totalMarks: number;
  createdAt: string;
  /** Verdict returned by the challenge grader, not inferred by this client. */
  passed: boolean;
};
type SubjectAccess = {
  courseId: string;
  teacherId: string;
  accessKind?: "course" | "owner-private";
  subjectSlug: string;
  subjectName: string;
  folderPath?: string;
};

type ChallengeMetricsRow = {
  has_practice_history: boolean;
  today_completed: boolean;
  current_streak: number | string;
  current_streak_rank: number | string | null;
  personal_best_streak: number | string;
  platform_best_streak: number | string;
  days_from_best: number | string;
  practice_per_day: number | string;
  practice_per_day_rank: number | string | null;
  top_practice_per_day: number | string;
  passed_this_week: number | string;
  passed_this_month: number | string;
  attempts_last_30: number | string;
  passed_last_30: number | string;
  practice_score_change: number | string | null;
};

type ChallengeMetrics = {
  hasPracticeHistory: boolean;
  todayCompleted: boolean;
  currentStreak: number;
  passedThisMonth: number;
  passedThisWeek: number;
  passRateLast30Days: number | null;
  practicePerDay: number;
  practiceScoreChange: number | null;
  leaderboard: ChallengeLeaderboard;
};

function number(value: number | string | null | undefined) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function optionalNumber(value: number | string | null | undefined) {
  return value === null || value === undefined ? null : number(value);
}

function nepaliDateKey(value: string | Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kathmandu",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(value));
  const part = (name: string) => parts.find((item) => item.type === name)?.value || "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

function daysAgo(days: number, now = new Date()) {
  const value = new Date(now);
  value.setUTCDate(value.getUTCDate() - days);
  return nepaliDateKey(value);
}

function dateBefore(date: string) {
  const cursor = new Date(`${date}T12:00:00.000Z`);
  cursor.setUTCDate(cursor.getUTCDate() - 1);
  return cursor.toISOString().slice(0, 10);
}

function currentStreak(activeDays: Set<string>, now = new Date()) {
  let cursor = nepaliDateKey(now);
  if (!activeDays.has(cursor)) cursor = dateBefore(cursor);

  let streak = 0;
  while (activeDays.has(cursor)) {
    streak += 1;
    cursor = dateBefore(cursor);
  }
  return streak;
}

function attemptPercent(attempt: Attempt) {
  return attempt.totalMarks > 0
    ? Math.max(0, Math.min(100, (attempt.totalScore / attempt.totalMarks) * 100))
    : null;
}

/** Pure mirror of the durable metrics query, retained for regression coverage. */
export function calculateAttemptMetrics(attempts: Attempt[], now = new Date()): Omit<ChallengeMetrics, "leaderboard"> {
  const today = nepaliDateKey(now);
  const weekStart = daysAgo(6, now);
  const previousWeekStart = daysAgo(13, now);
  const monthStart = `${today.slice(0, 7)}-01`;
  const lastThirtyDays = daysAgo(29, now);
  const passed = (attempt: Attempt) => attempt.passed;
  const thisWeek = attempts.filter((attempt) => nepaliDateKey(attempt.createdAt) >= weekStart);
  const previousWeek = attempts.filter((attempt) => {
    const day = nepaliDateKey(attempt.createdAt);
    return day >= previousWeekStart && day < weekStart;
  });
  const average = (items: Attempt[]) => {
    const percentages = items.map(attemptPercent).filter((value): value is number => value !== null);
    return percentages.length ? percentages.reduce((sum, value) => sum + value, 0) / percentages.length : null;
  };
  const currentAverage = average(thisWeek);
  const previousAverage = average(previousWeek);
  const recent = attempts.filter((attempt) => nepaliDateKey(attempt.createdAt) >= lastThirtyDays);

  return {
    hasPracticeHistory: attempts.length > 0,
    todayCompleted: attempts.some(
      (attempt) => nepaliDateKey(attempt.createdAt) === today && passed(attempt),
    ),
    currentStreak: currentStreak(
      new Set(attempts.filter(passed).map((attempt) => nepaliDateKey(attempt.createdAt))),
      now,
    ),
    passedThisMonth: attempts.filter(
      (attempt) => nepaliDateKey(attempt.createdAt) >= monthStart && passed(attempt),
    ).length,
    passedThisWeek: thisWeek.filter(passed).length,
    passRateLast30Days: recent.length ? (recent.filter(passed).length / recent.length) * 100 : null,
    practicePerDay: thisWeek.filter(passed).length / 7,
    practiceScoreChange:
      currentAverage !== null && previousAverage !== null
        ? currentAverage - previousAverage
        : null,
  };
}

async function loadChallengeMetrics(userId: string): Promise<ChallengeMetrics> {
  const admin = createSupabaseAdminClient();

  // An older deployment of the RPC counted arbitrary practice attempts as
  // challenges. Never call it unless the durable challenge table exists.
  const { error: schemaError } = await admin
    .from("student_challenges")
    .select("id")
    .eq("user_id", userId)
    .limit(1);
  if (isMissingChallengeTable(schemaError)) {
    throw new Error("Challenge metrics are unavailable because the student challenge migration has not been applied.");
  }
  if (schemaError) throw schemaError;

  const { data, error } = await admin
    .rpc("get_student_challenge_metrics", { target_user_id: userId })
    .maybeSingle();

  // Never turn a metrics outage into believable-looking zeroes. An empty
  // account is represented by a real all-zero RPC row; an error must remain an
  // error so the UI cannot present fabricated dashboard values.
  if (error) throw error;
  if (!data) throw new Error("The challenge metrics query returned no result.");
  const row = data as ChallengeMetricsRow;
  const recentAttempts = number(row.attempts_last_30);
  const recentPassed = number(row.passed_last_30);

  return {
    hasPracticeHistory: Boolean(row.has_practice_history),
    todayCompleted: Boolean(row.today_completed),
    currentStreak: number(row.current_streak),
    passedThisMonth: number(row.passed_this_month),
    passedThisWeek: number(row.passed_this_week),
    passRateLast30Days: recentAttempts > 0 ? (recentPassed / recentAttempts) * 100 : null,
    practicePerDay: number(row.practice_per_day),
    practiceScoreChange: optionalNumber(row.practice_score_change),
    leaderboard: {
      currentStreakRank: optionalNumber(row.current_streak_rank),
      bestStreak: number(row.personal_best_streak),
      platformBestStreak: number(row.platform_best_streak),
      daysFromBest: number(row.days_from_best),
      practicePerDayRank: optionalNumber(row.practice_per_day_rank),
      topPracticePerDay: number(row.top_practice_per_day),
    },
  };
}

function subjectScopeKey(courseId: string | null, subjectSlug: string) {
  return `${courseId ?? "owner-private"}:${subjectSlug.trim().toLowerCase()}`;
}

function masteryBySubject(rows: TopicMastery[]) {
  const result = new Map<string, Map<string, TopicMastery>>();
  for (const row of rows) {
    const scope = subjectScopeKey(row.courseId, row.subjectSlug);
    const byTopic = result.get(scope) ?? new Map<string, TopicMastery>();
    byTopic.set(row.topicKey, row);
    result.set(scope, byTopic);
  }
  return result;
}

function uniqueSubjects(...groups: SubjectAccess[][]) {
  const result = new Map<string, SubjectAccess>();
  for (const subject of groups.flat()) {
    const key = subjectScopeKey(
      subject.accessKind === "owner-private" ? null : subject.courseId,
      subject.subjectSlug,
    );
    if (key && !result.has(key)) result.set(key, subject);
  }
  return [...result.values()];
}

function topicPriority(status: PracticeTopicStatus | undefined, attempts: number) {
  if (status === "weak") return 0;
  if (status === "developing") return 1;
  if (!attempts || status === "not_attempted") return 2;
  return 3;
}

function recommendationReason(mastery: TopicMastery | undefined) {
  return mastery?.status === "weak"
    ? "Recommended because this is one of your weakest tested topics."
    : mastery?.status === "developing"
      ? "Recommended to turn a developing topic into a strong one."
      : !mastery?.attempts
        ? "Recommended because you have not been tested on this topic yet."
        : "Recommended as one of your next lowest-readiness topics.";
}

function localSubjectRow(
  courseSubject: SubjectAccess,
  subjectSlug: string,
  subjectName: string,
  stored: Map<string, TopicMastery>,
): ChallengeSubject {
  const topics = [...stored.values()];
  const next = [...topics].sort(
    (left, right) =>
      topicPriority(left.status, left.attempts) - topicPriority(right.status, right.attempts) ||
      left.percentage - right.percentage,
  )[0];
  return {
    courseId: courseSubject.accessKind === "owner-private" ? null : courseSubject.courseId,
    scopeKey: subjectScopeKey(
      courseSubject.accessKind === "owner-private" ? null : courseSubject.courseId,
      subjectSlug || courseSubject.subjectSlug,
    ),
    slug: subjectSlug || courseSubject.subjectSlug,
    name: subjectName || courseSubject.subjectName,
    // Stored attempts are real, but they are not a complete topic catalogue.
    // Do not use a partial denominator to claim whole-subject readiness.
    readiness: null,
    totalTopics: topics.length,
    practicedTopics: topics.filter((topic) => topic.attempts > 0).length,
    weakTopics: topics.filter((topic) => topic.status === "weak").length,
    nextTopic: next ? { key: next.topicKey, title: next.topicTitle } : null,
    topicDataAvailable: false,
  };
}

export async function getStudentChallengeDashboard(userId: string): Promise<StudentChallengeDashboard> {
  const [mastery, courseSubjects, privateSubjects, metrics] = await Promise.all([
    listTopicMastery(userId),
    listStudentCourseSubjects(userId),
    listCreatorPrivateSubjectAccess(userId),
    loadChallengeMetrics(userId),
  ]);
  const storedBySubject = masteryBySubject(mastery);
  const subjects = uniqueSubjects(courseSubjects, privateSubjects);
  const admin = createSupabaseAdminClient();
  const teacherIds = [...new Set(subjects.map((subject) => subject.teacherId).filter(Boolean))];
  const collectionKeyByTeacher = new Map<string, string>();
  if (teacherIds.length) {
    const { data, error } = await admin
      .from("teachers")
      .select("id,collection_sk")
      .in("id", teacherIds);
    if (error) throw error;
    for (const teacher of data ?? []) {
      const key = String(teacher.collection_sk || "").trim();
      if (key) collectionKeyByTeacher.set(String(teacher.id), key);
    }
  }

  const subjectResults = await Promise.all(
    subjects.map(async (courseSubject): Promise<{
      row: ChallengeSubject;
      recommendations: ChallengeRecommendation[];
    }> => {
      const subjectSlug = courseSubject.subjectSlug;
      const subjectName = courseSubject.subjectName;
      const courseId = courseSubject.accessKind === "owner-private" ? null : courseSubject.courseId;
      const scopeKey = subjectScopeKey(courseId, subjectSlug);
      const stored = storedBySubject.get(scopeKey) ?? new Map<string, TopicMastery>();
      const collectionKey = collectionKeyByTeacher.get(courseSubject.teacherId);
      if (!collectionKey) {
        return {
          row: localSubjectRow(courseSubject, subjectSlug, subjectName, stored),
          recommendations: [],
        };
      }

      try {
        const response = await getTeacherPracticeTopics(collectionKey, subjectName, {
          totalMarks: 20,
          maxQuestions: 5,
        });
        const topics = (Array.isArray(response.topics) ? response.topics : []) as PracticeTopic[];
        const rankedTopics = topics
          .map((topic) => ({ topic, mastery: stored.get(topic.topic_key) }))
          .sort(
            (left, right) =>
              topicPriority(left.mastery?.status, left.mastery?.attempts ?? 0) -
                topicPriority(right.mastery?.status, right.mastery?.attempts ?? 0) ||
              (left.mastery?.percentage ?? 0) - (right.mastery?.percentage ?? 0),
          );
        const next = rankedTopics[0]?.topic;
        return {
          row: {
            courseId,
            scopeKey,
            slug: subjectSlug,
            name: subjectName,
            readiness: topics.length
              ? topics.reduce(
                  (sum, topic) => sum + (stored.get(topic.topic_key)?.percentage ?? 0),
                  0,
                ) / topics.length
              : null,
            totalTopics: topics.length,
            practicedTopics: topics.filter(
              (topic) => (stored.get(topic.topic_key)?.attempts ?? 0) > 0,
            ).length,
            weakTopics: topics.filter(
              (topic) => stored.get(topic.topic_key)?.status === "weak",
            ).length,
            nextTopic: next ? { key: next.topic_key, title: next.title } : null,
            topicDataAvailable: true,
          },
          recommendations: rankedTopics.slice(0, 3).map(({ topic, mastery: topicMastery }) => ({
            courseId:
              courseSubject.accessKind === "owner-private" ? null : courseSubject.courseId,
            subjectSlug,
            subjectName,
            namespace: courseSubject.folderPath || subjectSlug,
            topicKey: topic.topic_key,
            topicTitle: topic.title,
            topicBlurb: topic.blurb?.trim() || "",
            reason: recommendationReason(topicMastery),
          })),
        };
      } catch {
        return {
          row: localSubjectRow(courseSubject, subjectSlug, subjectName, stored),
          recommendations: [],
        };
      }
    }),
  );
  const subjectRows = subjectResults.map((result) => result.row);
  const challenges = await ensureDailyChallenges(
    userId,
    // Round-robin keeps one large subject from monopolising the daily queue.
    [0, 1, 2].flatMap((position) =>
      subjectResults
        .map((result) => result.recommendations[position])
        .filter((value): value is ChallengeRecommendation => Boolean(value)),
    ),
  );

  const progress = metrics;
  const totalTopics = subjectRows.reduce((sum, subject) => sum + subject.totalTopics, 0);
  const readinessComplete = subjectRows.every((subject) => subject.topicDataAvailable);
  const readinessPoints = subjectRows.reduce(
    (sum, subject) => sum + (subject.readiness ?? 0) * subject.totalTopics,
    0,
  );

  return {
    subjects: subjectRows,
    challenges,
    readiness: readinessComplete && totalTopics > 0 ? readinessPoints / totalTopics : null,
    totalTopics,
    practicedTopics: subjectRows.reduce((sum, subject) => sum + subject.practicedTopics, 0),
    practiceScoreChange: progress.practiceScoreChange,
    currentStreak: progress.currentStreak,
    todayCompleted: progress.todayCompleted,
    passedThisMonth: progress.passedThisMonth,
    passedThisWeek: progress.passedThisWeek,
    passRateLast30Days: progress.passRateLast30Days,
    practicePerDay: progress.practicePerDay,
    hasPracticeHistory: progress.hasPracticeHistory,
    leaderboard: progress.leaderboard,
  };
}
