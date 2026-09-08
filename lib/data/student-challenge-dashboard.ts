import {
  listPracticeAttempts,
  listTopicMastery,
  type TopicMastery,
} from "@/lib/data/student-mastery";
import {
  ensureDailyChallenges,
  isMissingChallengeTable,
  listCompletedStudentChallenges,
  type ChallengeRecommendation,
  type StudentChallengeSummary,
} from "@/lib/data/student-challenges";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { type PracticeTopic, type PracticeTopicStatus } from "@/lib/tenant/client";
import { getTeacherPracticeTopics } from "@/lib/teacher-app/client";
import { readCourseLearningTopics } from "@/lib/data/community-learning-topics";
import {
  getStudentCommunityLearningScope,
  listStudentCommunitySubjectAccess,
} from "@/lib/student-courses";
import { isChallengeSourceDocumentTopic } from "@/lib/challenge-topics";
import { timed } from "@/lib/dev-timing";

export type ChallengeDashboardScope = {
  courseId: string;
  subjectSlug: string;
};

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

export type ChallengeSubjectOption = {
  courseId: string;
  scopeKey: string;
  subjectSlug: string;
  subjectName: string;
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
  community: {
    id: string;
    slug: string;
    name: string;
    courseId: string | null;
  } | null;
  scope: {
    courseId: string;
    subjectSlug: string;
    subjectName: string;
  } | null;
  subjects: ChallengeSubject[];
  subjectOptions: ChallengeSubjectOption[];
  challenges: StudentChallengeSummary[];
  completedChallenges: StudentChallengeSummary[];
  completedChallengePage: number;
  completedChallengeTotal: number;
  completedChallengeTotalPages: number;
  readiness: number | null;
  totalTopics: number;
  practicedTopics: number;
  /** Change in average graded practice score, not a historical mastery snapshot. */
  practiceScoreChange: number | null;
  currentStreak: number;
  todayCompleted: boolean;
  todayCompletedCount: number;
  passedThisMonth: number;
  passedThisWeek: number;
  averageTestScore: number | null;
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
  accessKind?: "course" | "community" | "owner-private";
  subjectSlug: string;
  subjectName: string;
  folderPath?: string;
};

type ChallengeMetrics = {
  hasPracticeHistory: boolean;
  todayCompleted: boolean;
  todayCompletedCount: number;
  currentStreak: number;
  passedThisMonth: number;
  passedThisWeek: number;
  passRateLast30Days: number | null;
  practicePerDay: number;
  practiceScoreChange: number | null;
  leaderboard: ChallengeLeaderboard;
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
export function calculateAttemptMetrics(
  attempts: Attempt[],
  now = new Date(),
): Omit<ChallengeMetrics, "leaderboard"> {
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
    const percentages = items
      .map(attemptPercent)
      .filter((value): value is number => value !== null);
    return percentages.length
      ? percentages.reduce((sum, value) => sum + value, 0) / percentages.length
      : null;
  };
  const currentAverage = average(thisWeek);
  const previousAverage = average(previousWeek);
  const recent = attempts.filter((attempt) => nepaliDateKey(attempt.createdAt) >= lastThirtyDays);

  return {
    hasPracticeHistory: attempts.length > 0,
    todayCompleted: attempts.some(
      (attempt) => nepaliDateKey(attempt.createdAt) === today && passed(attempt),
    ),
    todayCompletedCount: attempts.filter(
      (attempt) => nepaliDateKey(attempt.createdAt) === today && passed(attempt),
    ).length,
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
      currentAverage !== null && previousAverage !== null ? currentAverage - previousAverage : null,
  };
}

function bestStreak(activeDays: Set<string>) {
  const days = [...activeDays].sort();
  let best = 0;
  let run = 0;
  let previous = "";
  for (const day of days) {
    run = previous && dateBefore(day) === previous ? run + 1 : 1;
    best = Math.max(best, run);
    previous = day;
  }
  return best;
}

function rankedPosition(values: Map<string, number>, userId: string) {
  const viewerValue = values.get(userId) ?? 0;
  if (viewerValue <= 0) return null;
  const higherValues = new Set([...values.values()].filter((value) => value > viewerValue));
  return higherValues.size + 1;
}

function emptyChallengeMetrics(): ChallengeMetrics {
  return {
    hasPracticeHistory: false,
    todayCompleted: false,
    todayCompletedCount: 0,
    currentStreak: 0,
    passedThisMonth: 0,
    passedThisWeek: 0,
    passRateLast30Days: null,
    practicePerDay: 0,
    practiceScoreChange: null,
    leaderboard: {
      currentStreakRank: null,
      bestStreak: 0,
      platformBestStreak: 0,
      daysFromBest: 0,
      practicePerDayRank: null,
      topPracticePerDay: 0,
    },
  };
}

async function loadScopedChallengeMetrics(
  userId: string,
  communityId: string,
  courseId: string,
  attempts: Attempt[],
): Promise<ChallengeMetrics> {
  const admin = createSupabaseAdminClient();
  const [{ data, error }, membershipResult] = await Promise.all([
    admin
      .from("student_challenges")
      .select("user_id,status,completed_at")
      .eq("course_id", courseId)
      .eq("status", "completed"),
    admin
      .from("community_memberships")
      .select("user_id")
      .eq("community_id", communityId)
      .eq("status", "active"),
  ]);
  if (isMissingChallengeTable(error)) return emptyChallengeMetrics();
  if (error) throw error;
  if (membershipResult.error) throw membershipResult.error;
  const activeMemberIds = new Set(
    (membershipResult.data ?? []).map((row) => String(row.user_id || "")).filter(Boolean),
  );

  const completionDatesByUser = new Map<string, string[]>();
  for (const row of data ?? []) {
    if (!row.completed_at) continue;
    const memberId = String(row.user_id || "");
    if (!memberId || !activeMemberIds.has(memberId)) continue;
    const dates = completionDatesByUser.get(memberId) ?? [];
    dates.push(nepaliDateKey(String(row.completed_at)));
    completionDatesByUser.set(memberId, dates);
  }
  const today = nepaliDateKey(new Date());
  const weekStart = daysAgo(6);
  const monthStart = `${today.slice(0, 7)}-01`;
  const streaks = new Map<string, number>();
  const bestStreaks = new Map<string, number>();
  const weeklyCompletions = new Map<string, number>();
  for (const [memberId, dates] of completionDatesByUser) {
    const activeDays = new Set(dates);
    streaks.set(memberId, currentStreak(activeDays));
    bestStreaks.set(memberId, bestStreak(activeDays));
    weeklyCompletions.set(
      memberId,
      dates.filter((date) => date >= weekStart && date <= today).length,
    );
  }

  const viewerDates = completionDatesByUser.get(userId) ?? [];
  const viewerAttempts = calculateAttemptMetrics(attempts);
  const personalBest = bestStreaks.get(userId) ?? 0;
  const platformBest = Math.max(0, ...bestStreaks.values());
  const passedThisWeek = weeklyCompletions.get(userId) ?? 0;
  const topWeekly = Math.max(0, ...weeklyCompletions.values());

  return {
    hasPracticeHistory: viewerDates.length > 0 || attempts.length > 0,
    todayCompleted: viewerDates.includes(today),
    todayCompletedCount: viewerDates.filter((date) => date === today).length,
    currentStreak: streaks.get(userId) ?? 0,
    passedThisMonth: viewerDates.filter((date) => date >= monthStart && date <= today).length,
    passedThisWeek,
    passRateLast30Days: viewerAttempts.passRateLast30Days,
    practicePerDay: passedThisWeek / 7,
    practiceScoreChange: viewerAttempts.practiceScoreChange,
    leaderboard: {
      currentStreakRank: rankedPosition(streaks, userId),
      bestStreak: personalBest,
      platformBestStreak: platformBest,
      daysFromBest: Math.max(0, platformBest - (streaks.get(userId) ?? 0)),
      practicePerDayRank: rankedPosition(weeklyCompletions, userId),
      topPracticePerDay: topWeekly / 7,
    },
  };
}

function subjectScopeKey(courseId: string | null, subjectSlug: string) {
  return `${courseId ?? "owner-private"}:${subjectSlug.trim().toLowerCase()}`;
}

function normalizedSubjectSlug(value: string) {
  return value.trim().toLowerCase();
}

export function challengeBelongsToScope(
  challenge: Pick<StudentChallengeSummary, "courseId" | "subjectSlug">,
  scope: ChallengeDashboardScope,
) {
  return (
    challenge.courseId === scope.courseId &&
    normalizedSubjectSlug(challenge.subjectSlug) === normalizedSubjectSlug(scope.subjectSlug)
  );
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

export async function getStudentChallengeDashboard(
  userId: string,
  completedChallengePage = 1,
  requestedScope?: ChallengeDashboardScope,
  preferredCommunitySlug?: string,
): Promise<StudentChallengeDashboard> {
  const [allMastery, allCommunitySubjects, communityScope, allPracticeAttempts] = await timed(
    "challenge:scope-batch(4)",
    async () =>
      Promise.all([
        timed("  challenge:listTopicMastery", () => listTopicMastery(userId)),
        timed("  challenge:listStudentCommunitySubjectAccess", () =>
          listStudentCommunitySubjectAccess(userId),
        ),
        timed("  challenge:getStudentCommunityLearningScope", () =>
          getStudentCommunityLearningScope(userId, undefined, {
            communitySlug: preferredCommunitySlug,
            courseId: requestedScope?.courseId,
          }),
        ),
        timed("  challenge:listPracticeAttempts(200)", () => listPracticeAttempts(userId, 200)),
      ]),
  );
  const currentCourseId = communityScope?.courseId ?? null;
  const communitySubjects = currentCourseId
    ? allCommunitySubjects.filter((subject) => subject.courseId === currentCourseId)
    : [];
  const mastery = currentCourseId
    ? allMastery.filter((row) => row.courseId === currentCourseId)
    : [];
  const practiceAttempts = currentCourseId
    ? allPracticeAttempts.filter((attempt) => attempt.courseId === currentCourseId)
    : [];
  const activeRequestedScope =
    currentCourseId && requestedScope?.courseId === currentCourseId ? requestedScope : undefined;
  const metrics =
    communityScope && currentCourseId
      ? await timed("challenge:loadScopedChallengeMetrics", () =>
          loadScopedChallengeMetrics(
          userId,
          communityScope.communityId,
          currentCourseId,
          practiceAttempts
            .filter((attempt) => attempt.source === "challenge")
            .map((attempt) => ({
              totalScore: attempt.totalScore,
              totalMarks: attempt.totalMarks,
              createdAt: attempt.createdAt,
              passed: attempt.passed,
            })),
        ))
      : emptyChallengeMetrics();
  const storedBySubject = masteryBySubject(mastery);
  const accessibleSubjects = uniqueSubjects(communitySubjects);
  const subjectOptions = accessibleSubjects
    .filter((subject) => subject.accessKind !== "owner-private")
    .map((subject) => ({
      courseId: subject.courseId,
      scopeKey: subjectScopeKey(subject.courseId, subject.subjectSlug),
      subjectSlug: subject.subjectSlug,
      subjectName: subject.subjectName,
    }));
  const accessibleScopeKeys = new Set(
    accessibleSubjects.map((subject) =>
      subjectScopeKey(
        subject.accessKind === "owner-private" ? null : subject.courseId,
        subject.subjectSlug,
      ),
    ),
  );
  const subjects = activeRequestedScope
    ? accessibleSubjects.filter(
        (subject) =>
          subject.courseId === activeRequestedScope.courseId &&
          normalizedSubjectSlug(subject.subjectSlug) ===
            normalizedSubjectSlug(activeRequestedScope.subjectSlug),
      )
    : accessibleSubjects;
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

  const subjectResults = await timed(`challenge:per-subject-fanout(${subjects.length})`, async () =>
    Promise.all(
    subjects.map(
      async (
        courseSubject,
      ): Promise<{
        row: ChallengeSubject;
        recommendations: ChallengeRecommendation[];
      }> => {
        const subjectSlug = courseSubject.subjectSlug;
        const subjectName = courseSubject.subjectName;
        const courseId =
          courseSubject.accessKind === "owner-private" ? null : courseSubject.courseId;
        const scopeKey = subjectScopeKey(courseId, subjectSlug);
        const stored = storedBySubject.get(scopeKey) ?? new Map<string, TopicMastery>();
        const collectionKey = collectionKeyByTeacher.get(courseSubject.teacherId);
        try {
          // Use the same catalogue as Subject Explorer, including syllabi saved
          // before automatic publication existed. An empty community map must
          // not be replaced by a different, stale provider topic list.
          const sharedTopics = courseId
            ? await readCourseLearningTopics(courseId, courseSubject.teacherId, subjectSlug, admin)
            : null;
          let topics: Array<Pick<PracticeTopic, "topic_key" | "title" | "blurb">>;
          if (sharedTopics !== null) {
            topics = sharedTopics;
          } else {
            if (!collectionKey) throw new Error("Subject collection is unavailable.");
            const response = await getTeacherPracticeTopics(collectionKey, subjectName, {
              totalMarks: 20,
              maxQuestions: 5,
            });
            topics = (Array.isArray(response.topics) ? response.topics : []) as PracticeTopic[];
          }
          const learningTopics = topics.filter(
            (topic) =>
              !isChallengeSourceDocumentTopic({
                topicKey: topic.topic_key,
                title: topic.title,
                subjectName,
              }),
          );
          const rankedTopics = learningTopics
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
              readiness: learningTopics.length
                ? learningTopics.reduce(
                    (sum, topic) => sum + (stored.get(topic.topic_key)?.percentage ?? 0),
                    0,
                  ) / learningTopics.length
                : null,
              totalTopics: learningTopics.length,
              practicedTopics: learningTopics.filter(
                (topic) => (stored.get(topic.topic_key)?.attempts ?? 0) > 0,
              ).length,
              weakTopics: learningTopics.filter(
                (topic) => stored.get(topic.topic_key)?.status === "weak",
              ).length,
              nextTopic: next ? { key: next.topic_key, title: next.title } : null,
              topicDataAvailable: true,
            },
            recommendations: rankedTopics.map(({ topic, mastery: topicMastery }) => ({
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
      },
    ),
  ));
  const subjectRows = subjectResults.map((result) => result.row);
  const recommendationDepth = Math.max(
    0,
    ...subjectResults.map((result) => result.recommendations.length),
  );
  const dailyChallenges = await timed("challenge:ensureDailyChallenges", () =>
    ensureDailyChallenges(
    userId,
    // Round-robin keeps one large subject from monopolising the daily queue.
    Array.from({ length: recommendationDepth }, (_, position) => position).flatMap((position) =>
      subjectResults
        .map((result) => result.recommendations[position])
        .filter((value): value is ChallengeRecommendation => Boolean(value)),
    ),
    // Assign the joined community its own three-card queue even when stale,
    // unfinished rows from a previously joined community still exist.
    { minimumRecommendationCount: currentCourseId ? 3 : 0 },
  ));
  const accessibleChallenges = dailyChallenges.filter((challenge) =>
    accessibleScopeKeys.has(subjectScopeKey(challenge.courseId, challenge.subjectSlug)),
  );
  const challenges = activeRequestedScope
    ? accessibleChallenges.filter((challenge) =>
        challengeBelongsToScope(challenge, activeRequestedScope),
      )
    : accessibleChallenges;
  const completedHistory = currentCourseId
    ? await listCompletedStudentChallenges(userId, completedChallengePage, undefined, {
        courseId: currentCourseId,
        subjectSlug: activeRequestedScope?.subjectSlug,
      })
    : { challenges: [], page: 1, total: 0, totalPages: 0 };

  const progress = metrics;
  const weekStart = daysAgo(6);
  const today = nepaliDateKey(new Date());
  const weeklyChallengeScores = practiceAttempts
    .filter((attempt) => attempt.source === "challenge" && attempt.totalMarks > 0)
    .filter((attempt) => {
      const attemptDay = nepaliDateKey(attempt.createdAt);
      return attemptDay >= weekStart && attemptDay <= today;
    })
    .filter((attempt) =>
      activeRequestedScope
        ? attempt.courseId === activeRequestedScope.courseId &&
          normalizedSubjectSlug(attempt.subjectSlug) ===
            normalizedSubjectSlug(activeRequestedScope.subjectSlug)
        : true,
    )
    .map((attempt) => Math.max(0, Math.min(100, (attempt.totalScore / attempt.totalMarks) * 100)));
  const averageTestScore = weeklyChallengeScores.length
    ? weeklyChallengeScores.reduce((sum, score) => sum + score, 0) / weeklyChallengeScores.length
    : null;
  const totalTopics = subjectRows.reduce((sum, subject) => sum + subject.totalTopics, 0);
  const readinessComplete = subjectRows.every((subject) => subject.topicDataAvailable);
  const readinessPoints = subjectRows.reduce(
    (sum, subject) => sum + (subject.readiness ?? 0) * subject.totalTopics,
    0,
  );

  return {
    community: communityScope
      ? {
          id: communityScope.communityId,
          slug: communityScope.communitySlug,
          name: communityScope.communityName,
          courseId: communityScope.courseId,
        }
      : null,
    scope: activeRequestedScope
      ? {
          courseId: activeRequestedScope.courseId,
          subjectSlug: activeRequestedScope.subjectSlug,
          subjectName: subjectRows[0]?.name || activeRequestedScope.subjectSlug,
        }
      : null,
    subjects: subjectRows,
    subjectOptions,
    challenges,
    completedChallenges: completedHistory.challenges,
    completedChallengePage: completedHistory.page,
    completedChallengeTotal: completedHistory.total,
    completedChallengeTotalPages: completedHistory.totalPages,
    readiness: readinessComplete && totalTopics > 0 ? readinessPoints / totalTopics : null,
    totalTopics,
    practicedTopics: subjectRows.reduce((sum, subject) => sum + subject.practicedTopics, 0),
    practiceScoreChange: progress.practiceScoreChange,
    currentStreak: progress.currentStreak,
    todayCompleted: progress.todayCompleted,
    todayCompletedCount: progress.todayCompletedCount,
    passedThisMonth: progress.passedThisMonth,
    passedThisWeek: progress.passedThisWeek,
    averageTestScore,
    passRateLast30Days: progress.passRateLast30Days,
    practicePerDay: progress.practicePerDay,
    hasPracticeHistory: progress.hasPracticeHistory,
    leaderboard: progress.leaderboard,
  };
}
