import type { SupabaseClient } from "@supabase/supabase-js";
import type { CommunityHubData, CommunityHubMember } from "@/lib/data/community-hub";
import { communityDateKey, getCommunityHubForUser } from "@/lib/data/community-hub";
import {
  getStudentChallengeDashboard,
  type StudentChallengeDashboard,
} from "@/lib/data/student-challenge-dashboard";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export type DailyActivityStatus = "completed" | "started" | "idle" | "future";

export type DailyActivityDay = {
  date: string;
  dayOfMonth: number;
  label: string;
  attempts: number;
  completions: number;
  averageScore: number | null;
  status: DailyActivityStatus;
  isToday: boolean;
};

export type DailyLeaderboardMember = Pick<
  CommunityHubMember,
  "id" | "name" | "initials" | "todayAttempts" | "streak" | "xp" | "isViewer"
> & {
  dailyRank: number;
};

export type DailySemesterSubject = {
  id: string;
  slug: string;
  name: string;
  code: string;
  topicCount: number | null;
  materialCount: number | null;
  readiness: number | null;
};

export type DailySemester = {
  id: string;
  label: string;
  yearNumber: number;
  semesterNumber: number;
  readiness: number | null;
  measuredSubjects: number;
  subjects: DailySemesterSubject[];
};

export type StudentDailyDashboard = {
  challenge: StudentChallengeDashboard;
  todayChallengeCompletions: number;
  activity: DailyActivityDay[];
  community: null | {
    name: string;
    slug: string;
    memberCount: number;
    contentReadiness: number | null;
    materialCount: number;
    topicCount: number;
    viewerXp: number;
    viewerRank: number | null;
    leaderboard: DailyLeaderboardMember[];
    currentSemesterId: string;
    semesters: DailySemester[];
  };
};

type DailyActivityRow = {
  activity_date: string;
  attempt_count: number | string;
  completed_count: number | string;
  graded_attempt_count: number | string;
  score_percentage_sum: number | string;
};

function asNumber(value: number | string | null | undefined) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function dateFromKey(key: string) {
  return new Date(`${key}T12:00:00.000Z`);
}

export function shiftDateKey(key: string, days: number) {
  const date = dateFromKey(key);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function calendarStart(today: string) {
  const weekday = dateFromKey(today).getUTCDay();
  const daysSinceMonday = (weekday + 6) % 7;
  return shiftDateKey(today, -(daysSinceMonday + 28));
}

export function buildDailyActivityCalendar(
  rows: DailyActivityRow[],
  now = new Date(),
): DailyActivityDay[] {
  const today = communityDateKey(now);
  const start = calendarStart(today);
  const rowsByDate = new Map(rows.map((row) => [row.activity_date, row]));

  return Array.from({ length: 35 }, (_, index) => {
    const date = shiftDateKey(start, index);
    const row = rowsByDate.get(date);
    const attempts = asNumber(row?.attempt_count);
    const completions = asNumber(row?.completed_count);
    const gradedAttempts = asNumber(row?.graded_attempt_count);
    const scoreSum = asNumber(row?.score_percentage_sum);
    const isFuture = date > today;
    const parsed = dateFromKey(date);

    return {
      date,
      dayOfMonth: parsed.getUTCDate(),
      label: new Intl.DateTimeFormat("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
        timeZone: "UTC",
      }).format(parsed),
      attempts,
      completions,
      averageScore: gradedAttempts > 0 ? scoreSum / gradedAttempts : null,
      status: isFuture
        ? "future"
        : completions > 0
          ? "completed"
          : attempts > 0
            ? "started"
            : "idle",
      isToday: date === today,
    };
  });
}

export function rankDailyCommunityMembers(members: CommunityHubMember[]): DailyLeaderboardMember[] {
  return [...members]
    .sort(
      (left, right) =>
        right.todayAttempts - left.todayAttempts ||
        right.streak - left.streak ||
        right.xp - left.xp ||
        left.joinedAt.localeCompare(right.joinedAt),
    )
    .map((member, index) => ({
      id: member.id,
      name: member.name,
      initials: member.initials,
      todayAttempts: member.todayAttempts,
      streak: member.streak,
      xp: member.xp,
      isViewer: member.isViewer,
      dailyRank: index + 1,
    }));
}

export function buildDailySemesters(data: CommunityHubData): DailySemester[] {
  const subjectById = new Map(data.subjects.map((subject) => [subject.id, subject]));

  return [...data.community.terms]
    .sort((left, right) => left.position - right.position)
    .map((term) => {
      const subjects = term.subjects.map((subject) => {
        const insight = subjectById.get(subject.id);
        return {
          id: subject.id,
          slug: subject.slug,
          name: subject.name,
          code: subject.code,
          topicCount: insight?.topicCount ?? null,
          materialCount: insight?.materialCount ?? null,
          readiness: insight?.progress ?? null,
        } satisfies DailySemesterSubject;
      });
      const measured = subjects.filter(
        (subject): subject is DailySemesterSubject & { readiness: number } =>
          subject.readiness !== null,
      );

      return {
        id: term.id,
        label: `Year ${term.yearNumber} · Semester ${term.semesterNumber}`,
        yearNumber: term.yearNumber,
        semesterNumber: term.semesterNumber,
        readiness: measured.length
          ? measured.reduce((sum, subject) => sum + subject.readiness, 0) / measured.length
          : null,
        measuredSubjects: measured.length,
        subjects,
      } satisfies DailySemester;
    });
}

function kathmanduDayBounds(now = new Date()) {
  const today = communityDateKey(now);
  return {
    start: new Date(`${today}T00:00:00+05:45`).toISOString(),
    end: new Date(`${shiftDateKey(today, 1)}T00:00:00+05:45`).toISOString(),
  };
}

export async function getStudentDailyDashboard(
  userId: string,
  admin: SupabaseClient = createSupabaseAdminClient(),
): Promise<StudentDailyDashboard> {
  const today = communityDateKey(new Date());
  const activityStart = calendarStart(today);
  const bounds = kathmanduDayBounds();

  const [challenge, community, activityResult, todayCompletionsResult] = await Promise.all([
    getStudentChallengeDashboard(userId),
    getCommunityHubForUser(userId, admin),
    admin
      .from("student_daily_practice_activity")
      .select(
        "activity_date,attempt_count,completed_count,graded_attempt_count,score_percentage_sum",
      )
      .eq("user_id", userId)
      .gte("activity_date", activityStart)
      .lte("activity_date", today)
      .order("activity_date", { ascending: true }),
    admin
      .from("student_challenges")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("status", "completed")
      .gte("completed_at", bounds.start)
      .lt("completed_at", bounds.end),
  ]);

  if (activityResult.error) throw activityResult.error;
  if (todayCompletionsResult.error) throw todayCompletionsResult.error;

  return {
    challenge,
    todayChallengeCompletions: todayCompletionsResult.count ?? 0,
    activity: buildDailyActivityCalendar((activityResult.data ?? []) as DailyActivityRow[]),
    community: community
      ? {
          name: community.community.name,
          slug: community.community.slug,
          memberCount: community.memberCount,
          contentReadiness: community.contentReadiness,
          materialCount: community.materialCount,
          topicCount: community.topicCount,
          viewerXp: community.viewer.xp,
          viewerRank: community.viewer.rank,
          leaderboard: rankDailyCommunityMembers(community.members),
          currentSemesterId: community.currentTermId,
          semesters: buildDailySemesters(community),
        }
      : null,
  };
}
