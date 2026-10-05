import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createLimiter } from "@/lib/http/limit";
import { memo } from "@/lib/http/memo";
import { getTeacherCollectionUsage } from "@/lib/teacher-app/client";
import {
  describeUsageEndpoint,
  FEATURE_LABELS,
  FORMAT_LABELS,
  type UsageFeature,
  type UsageFormat,
} from "@/lib/token-usage-groups";

/**
 * AI token spend across the whole platform, for the admin Overview.
 *
 * The backend records usage per collection (one per teacher) and answers
 * `/v1/collection/usage` only to that collection's own key — there is no
 * platform-wide endpoint. So this reads every teacher's usage with their key
 * from `teachers.collection_sk` and adds them up. Three in flight at a time
 * (the tenant API is one worker; see lib/http/limit.ts), and the whole answer
 * is memoized for five minutes so reopening the Overview costs nothing.
 */

export type TokenCounts = {
  calls: number;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
};

export type TeacherTokenUsage = TokenCounts & {
  teacherId: string;
  name: string;
  email: string | null;
  /** False when that teacher's usage could not be read (bad key, backend busy). */
  available: boolean;
};

/** One route's spend, with its plain-English name and where it belongs. */
export type TaskTokenUsage = TokenCounts & {
  endpoint: string;
  label: string;
  feature: UsageFeature;
  format: UsageFormat;
};

export type FacultyTokenUsage = TokenCounts & {
  community: string;
  name: string;
  /** How this faculty's challenges are set: qna, mcq or hybrid (null = untagged / unknown). */
  challengeFormat: string | null;
  /** Where this faculty's tokens went, biggest first. */
  tasks: TaskTokenUsage[];
};

export type GroupTokenUsage<K extends string> = TokenCounts & {
  key: K;
  label: string;
  /** Its routes, biggest first. */
  tasks: TaskTokenUsage[];
};

export type UsageRange = "7d" | "30d" | "all";

export type PlatformTokenUsage = {
  range: UsageRange;
  totals: TokenCounts;
  teachers: TeacherTokenUsage[];
  /** Every route, all teachers combined. */
  tasks: TaskTokenUsage[];
  /** Where in the product the tokens went: challenges, practice, chat… */
  features: GroupTokenUsage<UsageFeature>[];
  /** What kind of question work: MCQ, written answers, lessons… */
  formats: GroupTokenUsage<UsageFormat>[];
  /** Spend tagged with a student faculty, all teachers combined; '' = untagged. */
  faculties: FacultyTokenUsage[];
  unavailableCount: number;
  generatedAt: string;
};

const limit = createLimiter(3);

const zero = (): TokenCounts => ({
  calls: 0,
  promptTokens: 0,
  completionTokens: 0,
  totalTokens: 0,
});

function readCounts(record: Record<string, unknown>): TokenCounts {
  return {
    calls: Number(record.calls) || 0,
    promptTokens: Number(record.prompt_tokens) || 0,
    completionTokens: Number(record.completion_tokens) || 0,
    totalTokens: Number(record.total_tokens) || 0,
  };
}

function add(into: TokenCounts, counts: TokenCounts) {
  into.calls += counts.calls;
  into.promptTokens += counts.promptTokens;
  into.completionTokens += counts.completionTokens;
  into.totalTokens += counts.totalTokens;
}

const DAY_MS = 24 * 60 * 60 * 1000;
function rangeStart(range: UsageRange) {
  return range === "all"
    ? undefined
    : new Date(Date.now() - (range === "7d" ? 7 : 30) * DAY_MS).toISOString();
}

function taskOf(endpoint: string, counts: TokenCounts): TaskTokenUsage {
  return { endpoint, ...describeUsageEndpoint(endpoint), ...counts };
}
const byTokens = (a: TokenCounts, b: TokenCounts) => b.totalTokens - a.totalTokens;

function groupTasks<K extends string>(
  tasks: TaskTokenUsage[],
  pick: (task: TaskTokenUsage) => K,
  labels: Record<K, string>,
): GroupTokenUsage<K>[] {
  const groups = new Map<K, GroupTokenUsage<K>>();
  for (const task of tasks) {
    const key = pick(task);
    const group = groups.get(key) ?? { key, label: labels[key], ...zero(), tasks: [] };
    add(group, task);
    group.tasks.push(task);
    groups.set(key, group);
  }
  return [...groups.values()]
    .map((group) => ({ ...group, tasks: group.tasks.sort(byTokens) }))
    .sort(byTokens);
}

async function buildPlatformTokenUsage(range: UsageRange): Promise<PlatformTokenUsage> {
  const since = rangeStart(range);
  const admin = createSupabaseAdminClient();
  const { data: teachers, error } = await admin
    .from("teachers")
    .select("id, user_id, handle, collection_sk");
  if (error) throw error;

  const userIds = (teachers ?? []).map((teacher) => teacher.user_id).filter(Boolean);
  const [{ data: profiles }, emails] = await Promise.all([
    userIds.length
      ? admin.from("student_profiles").select("user_id, full_name").in("user_id", userIds)
      : Promise.resolve({ data: [] as Array<{ user_id: string; full_name: string | null }> }),
    // Emails live on auth.users only; one lookup per teacher (a handful).
    Promise.all(
      userIds.map((userId) =>
        admin.auth.admin
          .getUserById(userId)
          .then(({ data }) => [userId, data.user?.email ?? null] as const)
          .catch(() => [userId, null] as const),
      ),
    ),
  ]);
  const profileByUser = new Map((profiles ?? []).map((profile) => [profile.user_id, profile]));
  const emailByUser = new Map(emails);

  const byFaculty = new Map<string, TokenCounts>();
  const byTask = new Map<string, TokenCounts>();
  const byFacultyTask = new Map<string, Map<string, TokenCounts>>();
  const rows = await Promise.all(
    (teachers ?? []).map((teacher) =>
      limit(async (): Promise<TeacherTokenUsage> => {
        const profile = profileByUser.get(teacher.user_id);
        const base = {
          teacherId: String(teacher.id),
          name: profile?.full_name?.trim() || teacher.handle || "Unnamed teacher",
          email: emailByUser.get(teacher.user_id) ?? null,
        };
        const key = String(teacher.collection_sk || "").trim();
        if (!key) return { ...base, ...zero(), available: false };
        try {
          const usage = (await getTeacherCollectionUsage(key, since)) as Record<string, unknown>;
          for (const bucket of Array.isArray(usage.by_community) ? usage.by_community : []) {
            const record = (bucket || {}) as Record<string, unknown>;
            const slug = String(record.community || "");
            const counts = byFaculty.get(slug) ?? zero();
            add(counts, readCounts(record));
            byFaculty.set(slug, counts);
          }
          for (const bucket of Array.isArray(usage.by_endpoint) ? usage.by_endpoint : []) {
            const record = (bucket || {}) as Record<string, unknown>;
            const endpoint = String(record.endpoint || "unattributed");
            const counts = byTask.get(endpoint) ?? zero();
            add(counts, readCounts(record));
            byTask.set(endpoint, counts);
          }
          // Older backends do not send this yet; the faculty rows then just have no detail.
          for (const bucket of Array.isArray(usage.by_community_endpoint)
            ? usage.by_community_endpoint
            : []) {
            const record = (bucket || {}) as Record<string, unknown>;
            const slug = String(record.community || "");
            const endpoint = String(record.endpoint || "unattributed");
            const tasks = byFacultyTask.get(slug) ?? new Map<string, TokenCounts>();
            const counts = tasks.get(endpoint) ?? zero();
            add(counts, readCounts(record));
            tasks.set(endpoint, counts);
            byFacultyTask.set(slug, tasks);
          }
          return { ...base, ...readCounts(usage), available: true };
        } catch (caught) {
          console.error(`[admin/token-usage] teacher ${teacher.id}`, caught);
          return { ...base, ...zero(), available: false };
        }
      }),
    ),
  );

  const slugs = [...byFaculty.keys()].filter(Boolean);
  const { data: communities } = slugs.length
    ? await admin
        .from("communities")
        .select("slug, name, challenge_question_format")
        .in("slug", slugs)
    : {
        data: [] as Array<{ slug: string; name: string; challenge_question_format: string | null }>,
      };
  const communityName = new Map((communities ?? []).map((row) => [row.slug, row.name]));
  const communityFormat = new Map(
    (communities ?? []).map((row) => [row.slug, row.challenge_question_format]),
  );

  const totals = zero();
  for (const row of rows) add(totals, row);

  const tasks = [...byTask.entries()]
    .map(([endpoint, counts]) => taskOf(endpoint, counts))
    .sort(byTokens);

  return {
    range,
    totals,
    teachers: rows.sort((a, b) => b.totalTokens - a.totalTokens),
    tasks,
    features: groupTasks(tasks, (task) => task.feature, FEATURE_LABELS),
    formats: groupTasks(tasks, (task) => task.format, FORMAT_LABELS),
    faculties: [...byFaculty.entries()]
      .map(([community, counts]) => ({
        community,
        name: community
          ? communityName.get(community) || community
          : "Teacher workspaces & earlier usage",
        challengeFormat: community ? (communityFormat.get(community) ?? null) : null,
        tasks: [...(byFacultyTask.get(community) ?? new Map<string, TokenCounts>()).entries()]
          .map(([endpoint, taskCounts]) => taskOf(endpoint, taskCounts))
          .sort(byTokens),
        ...counts,
      }))
      .filter((row) => row.totalTokens > 0)
      // Tagged faculties by spend, the untagged bucket last.
      .sort((a, b) => Number(!a.community) - Number(!b.community) || b.totalTokens - a.totalTokens),
    unavailableCount: rows.filter((row) => !row.available).length,
    generatedAt: new Date().toISOString(),
  };
}

export function getPlatformTokenUsage(range: UsageRange = "all"): Promise<PlatformTokenUsage> {
  return memo(`admin:platform-token-usage:${range}`, () => buildPlatformTokenUsage(range), {
    ttlSeconds: 300,
    staleSeconds: 900,
  });
}
