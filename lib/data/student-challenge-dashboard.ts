import { listPracticeAttempts, listTopicMastery, type TopicMastery } from "@/lib/data/student-mastery";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import {
  findTenantSubjectForCourseSubject,
  listPracticeTopics,
  listTenantSubjects,
} from "@/lib/tenant/client";
import {
  listCreatorPrivateSubjectAccess,
  listStudentCourseSubjects,
} from "@/lib/student-courses";

export type ChallengeSubject = {
  slug: string;
  name: string;
  readiness: number | null;
  totalTopics: number;
  practicedTopics: number;
  weakTopics: number;
  nextTopic: { key: string; title: string } | null;
  topicDataAvailable: boolean;
};

export type StudentChallengeDashboard = {
  subjects: ChallengeSubject[];
  readiness: number | null;
  totalTopics: number;
  practicedTopics: number;
  readinessChange: number | null;
  currentStreak: number;
  todayCompleted: boolean;
  passedThisMonth: number;
  passedThisWeek: number;
  passRateLast30Days: number | null;
  practicePerDay: number;
  hasPracticeHistory: boolean;
  leaderboard: {
    currentStreakRank: number | null;
    bestStreak: number;
    platformBestStreak: number;
    daysFromBest: number;
    practicePerDayRank: number | null;
    topPracticePerDay: number;
  } | null;
};

type Attempt = {
  totalScore: number;
  totalMarks: number;
  createdAt: string;
};

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

function daysAgo(days: number) {
  const value = new Date();
  value.setUTCDate(value.getUTCDate() - days);
  return nepaliDateKey(value);
}

function attemptPercent(attempt: Attempt) {
  return attempt.totalMarks > 0 ? (attempt.totalScore / attempt.totalMarks) * 100 : null;
}

function dateBefore(date: string) {
  const cursor = new Date(`${date}T12:00:00.000Z`);
  cursor.setUTCDate(cursor.getUTCDate() - 1);
  return cursor.toISOString().slice(0, 10);
}

function streaks(activeDays: Set<string>) {
  let cursor = nepaliDateKey(new Date());
  // Students can keep a streak alive until the end of the current day. If they
  // have not practised today, yesterday is the last day that can extend it.
  if (!activeDays.has(cursor)) cursor = dateBefore(cursor);

  let current = 0;
  while (activeDays.has(cursor)) {
    current += 1;
    cursor = dateBefore(cursor);
  }

  const ordered = [...activeDays].sort();
  let best = 0;
  let running = 0;
  let previous = "";
  for (const day of ordered) {
    running = previous && dateBefore(day) === previous ? running + 1 : 1;
    best = Math.max(best, running);
    previous = day;
  }
  return { current, best };
}

type DailyActivity = { user_id: string; activity_date: string; completed_count: number };

function rankFor(entries: Array<{ userId: string; value: number }>, userId: string) {
  const ordered = [...entries].sort((left, right) => right.value - left.value || left.userId.localeCompare(right.userId));
  const index = ordered.findIndex((entry) => entry.userId === userId);
  if (index < 0) return null;
  const value = ordered[index].value;
  return ordered.findIndex((entry) => entry.value === value) + 1;
}

async function loadLeaderboard(userId: string) {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("student_daily_practice_activity")
    .select("user_id,activity_date,completed_count");
  // The dashboard keeps working during a deploy before its migration runs.
  if (error?.code === "42P01") return null;
  if (error) throw error;

  const byUser = new Map<string, DailyActivity[]>();
  for (const row of (data ?? []) as DailyActivity[]) {
    if (Number(row.completed_count) <= 0) continue;
    const items = byUser.get(row.user_id) ?? [];
    items.push({ ...row, completed_count: Number(row.completed_count) });
    byUser.set(row.user_id, items);
  }

  const weekStart = daysAgo(6);
  const userStats = [...byUser.entries()].map(([id, rows]) => {
    const streak = streaks(new Set(rows.map((row) => row.activity_date)));
    const weeklyCompleted = rows
      .filter((row) => row.activity_date >= weekStart)
      .reduce((sum, row) => sum + row.completed_count, 0);
    return { userId: id, ...streak, weeklyCompleted };
  });
  const viewer = userStats.find((row) => row.userId === userId);
  if (!viewer) {
    return {
      currentStreakRank: null,
      bestStreak: 0,
      platformBestStreak: Math.max(0, ...userStats.map((row) => row.best)),
      daysFromBest: 0,
      practicePerDayRank: null,
      topPracticePerDay: Math.max(0, ...userStats.map((row) => row.weeklyCompleted / 7)),
    };
  }

  const platformBestStreak = Math.max(0, ...userStats.map((row) => row.best));
  return {
    currentStreakRank: rankFor(userStats.map((row) => ({ userId: row.userId, value: row.current })), userId),
    bestStreak: viewer.best,
    platformBestStreak,
    daysFromBest: Math.max(0, platformBestStreak - viewer.current),
    practicePerDayRank: rankFor(
      userStats.map((row) => ({ userId: row.userId, value: row.weeklyCompleted })),
      userId,
    ),
    topPracticePerDay: Math.max(0, ...userStats.map((row) => row.weeklyCompleted / 7)),
  };
}

function masteryBySubject(rows: TopicMastery[]) {
  const result = new Map<string, Map<string, TopicMastery>>();
  for (const row of rows) {
    const byTopic = result.get(row.subjectSlug) ?? new Map<string, TopicMastery>();
    byTopic.set(row.topicKey, row);
    result.set(row.subjectSlug, byTopic);
  }
  return result;
}

type SubjectAccess = {
  subjectSlug: string;
  subjectName: string;
  folderPath?: string;
};

function uniqueSubjects(...groups: SubjectAccess[][]) {
  const result = new Map<string, SubjectAccess>();
  for (const subject of groups.flat()) {
    const key = subject.subjectSlug.trim().toLowerCase();
    if (key && !result.has(key)) result.set(key, subject);
  }
  return [...result.values()];
}

/**
 * Real student dashboard data. Topic definitions and question generation stay
 * with the tenant; every progress number is calculated from our persisted
 * student practice history, so it remains available after a tenant session
 * expires and is never shared across students by mistake.
 */
export async function getStudentChallengeDashboard(userId: string): Promise<StudentChallengeDashboard> {
  const [mastery, attempts, tenantSubjects, courseSubjects, privateSubjects, leaderboard] = await Promise.all([
    listTopicMastery(userId),
    listPracticeAttempts(userId, 500),
    listTenantSubjects(),
    listStudentCourseSubjects(userId),
    listCreatorPrivateSubjectAccess(userId),
    loadLeaderboard(userId),
  ]);

  const masteryBySubjectKey = masteryBySubject(mastery);
  const subjects = uniqueSubjects(courseSubjects, privateSubjects);

  const resolvedSubjects = subjects.flatMap((courseSubject) => {
    const tenantSubject = findTenantSubjectForCourseSubject(tenantSubjects, courseSubject);
    return tenantSubject ? [{ courseSubject, tenantSubject }] : [];
  });

  const subjectRows = await Promise.all(
    resolvedSubjects.map(async ({ courseSubject, tenantSubject }): Promise<ChallengeSubject> => {
      const stored = masteryBySubjectKey.get(tenantSubject.slug) ?? new Map<string, TopicMastery>();
      try {
        const topicResponse = await listPracticeTopics({
          subject: tenantSubject.slug,
          namespaces: [tenantSubject.namespace],
          totalMarks: 20,
          maxQuestions: 5,
        });
        const topics = topicResponse.topics ?? [];
        const attempted = topics.filter((topic) => (stored.get(topic.topic_key)?.attempts ?? 0) > 0);
        const readiness = topics.length
          ? topics.reduce((sum, topic) => sum + (stored.get(topic.topic_key)?.percentage ?? 0), 0) /
            topics.length
          : null;
        const next = topics
          .map((topic) => ({ topic, mastery: stored.get(topic.topic_key) }))
          .sort((left, right) => {
            const leftPriority = left.mastery?.status === "weak" ? 0 : left.mastery?.attempts ? 1 : 2;
            const rightPriority = right.mastery?.status === "weak" ? 0 : right.mastery?.attempts ? 1 : 2;
            return leftPriority - rightPriority || (left.mastery?.percentage ?? 0) - (right.mastery?.percentage ?? 0);
          })[0]?.topic;

        return {
          slug: tenantSubject.slug,
          name: tenantSubject.name || courseSubject.subjectName,
          readiness,
          totalTopics: topics.length,
          practicedTopics: attempted.length,
          weakTopics: topics.filter((topic) => {
            const status = stored.get(topic.topic_key)?.status;
            return status === "weak" || status === "developing";
          }).length,
          nextTopic: next ? { key: next.topic_key, title: next.title } : null,
          topicDataAvailable: true,
        };
      } catch {
        // A tenant outage must not turn the whole student page into a blank
        // screen. We can still report local mastered topics honestly.
        const localTopics = [...stored.values()];
        return {
          slug: tenantSubject.slug,
          name: tenantSubject.name || courseSubject.subjectName,
          readiness: localTopics.length
            ? localTopics.reduce((sum, topic) => sum + topic.percentage, 0) / localTopics.length
            : null,
          totalTopics: localTopics.length,
          practicedTopics: localTopics.filter((topic) => topic.attempts > 0).length,
          weakTopics: localTopics.filter((topic) => topic.status === "weak" || topic.status === "developing").length,
          nextTopic: localTopics[0]
            ? { key: localTopics[0].topicKey, title: localTopics[0].topicTitle }
            : null,
          topicDataAvailable: false,
        };
      }
    }),
  );

  const datedAttempts: Attempt[] = attempts.map((attempt) => ({
    totalScore: attempt.totalScore,
    totalMarks: attempt.totalMarks,
    createdAt: attempt.createdAt,
  }));
  const today = nepaliDateKey(new Date());
  const weekStart = daysAgo(6);
  const previousWeekStart = daysAgo(13);
  const monthStart = `${today.slice(0, 7)}-01`;
  const lastThirtyDays = daysAgo(29);
  const passed = (attempt: Attempt) => (attemptPercent(attempt) ?? 0) >= 50;
  const thisWeek = datedAttempts.filter((attempt) => nepaliDateKey(attempt.createdAt) >= weekStart);
  const previousWeek = datedAttempts.filter((attempt) => {
    const day = nepaliDateKey(attempt.createdAt);
    return day >= previousWeekStart && day < weekStart;
  });
  const average = (items: Attempt[]) => {
    const percentages = items.map(attemptPercent).filter((value): value is number => value !== null);
    return percentages.length ? percentages.reduce((sum, value) => sum + value, 0) / percentages.length : null;
  };
  const thisWeekAverage = average(thisWeek);
  const previousWeekAverage = average(previousWeek);
  const readinessValues = subjectRows
    .map((subject) => subject.readiness)
    .filter((value): value is number => value !== null);
  const personalStreak = streaks(
    new Set(datedAttempts.filter(passed).map((attempt) => nepaliDateKey(attempt.createdAt))),
  );

  return {
    subjects: subjectRows,
    readiness: readinessValues.length
      ? readinessValues.reduce((sum, value) => sum + value, 0) / readinessValues.length
      : null,
    totalTopics: subjectRows.reduce((sum, subject) => sum + subject.totalTopics, 0),
    practicedTopics: subjectRows.reduce((sum, subject) => sum + subject.practicedTopics, 0),
    readinessChange:
      thisWeekAverage !== null && previousWeekAverage !== null
        ? thisWeekAverage - previousWeekAverage
        : null,
    currentStreak: personalStreak.current,
    todayCompleted: datedAttempts.some((attempt) => nepaliDateKey(attempt.createdAt) === today && passed(attempt)),
    passedThisMonth: datedAttempts.filter(
      (attempt) => nepaliDateKey(attempt.createdAt) >= monthStart && passed(attempt),
    ).length,
    passedThisWeek: thisWeek.filter(passed).length,
    passRateLast30Days: (() => {
      const recent = datedAttempts.filter((attempt) => nepaliDateKey(attempt.createdAt) >= lastThirtyDays);
      return recent.length ? (recent.filter(passed).length / recent.length) * 100 : null;
    })(),
    practicePerDay: thisWeek.filter(passed).length / 7,
    hasPracticeHistory: datedAttempts.length > 0,
    leaderboard,
  };
}
