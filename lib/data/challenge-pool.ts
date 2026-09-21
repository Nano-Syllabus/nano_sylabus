import { randomUUID } from "node:crypto";
import { hostname } from "node:os";
import { after } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { collectionKeyForTeacher } from "@/lib/data/challenge-collection-key";
import { isChallengeSourceDocumentTopic } from "@/lib/challenge-topics";
import { createLimiter } from "@/lib/http/limit";
import { invalidateMemo, memo } from "@/lib/http/memo";
import {
  getTeacherChallengeRevision,
  prepareTeacherChallengeTopic,
  TeacherApiError,
  type TeacherChallengePrepareContent,
  type TeacherChallengePrepareManifest,
  type TeacherChallengePrepareResponse,
} from "@/lib/teacher-app/client";

/**
 * THE GLOBAL CHALLENGE POOL.
 *
 * A challenge's past questions, worked answers and concepts reading depend on the
 * course and the topic, never on the student. So each topic is prepared ONCE per
 * course, ahead of the students who will reach it, and kept in
 * `public.challenge_topic_pool` (supabase/migrations/20260921200000_challenge_topic_pool.sql).
 * A student's row is then cut from the pooled bank with no upstream call; only
 * the paper, which is theirs alone, is still issued per student.
 *
 * Two halves, deliberately apart:
 *
 *   ENQUEUE (`enqueueChallengeTopics`) — cheap, from request paths: publishing a
 *   subject queues its first topics, a student starting or finishing a topic
 *   queues the next two, the Challenge Hub queues the topics on its cards. It
 *   writes rows and nothing else; a request never waits on the course API here.
 *
 *   PREPARE (`sweepChallengePool`) — claims rows through a leased, skip-locked
 *   claim and asks the course API to prepare each one, two at a time. It runs
 *   from a timer on the app VPS (POST /api/internal/challenge-pool/sweep) and,
 *   in a small way, behind the requests that queued work
 *   (`kickChallengePoolSweep`), so a topic starts preparing at once rather than
 *   at the next tick.
 *
 * Everything here degrades to a no-op while the table does not exist — code
 * ships before its migration runs — and the callers then fall back to the
 * per-student preparation they have always done.
 */

const TABLE = "challenge_topic_pool";
const CLAIM_FUNCTION = "claim_challenge_topic_pool";
const CATALOGUE_MEMO = "challenge-pool:catalogue";

/**
 * How many challenges each subject keeps ready ahead of its students: two.
 *
 * The user's rule: a subject always has two challenges prepared and ready to
 * deliver, and every time one is taken — a student starts or finishes a topic,
 * so the count of challenges handed out goes up — the next is prepared in the
 * background to keep two ready. A student at topic N finds N+1 and N+2 waiting;
 * publishing a subject prepares its first two.
 */
export const CHALLENGE_POOL_AHEAD = 2;

/**
 * Higher is prepared first. A topic on a student's hub right now outranks one a
 * student reaches next, which outranks the first topics of a subject nobody has
 * opened yet. Within one priority, syllabus order.
 */
export const CHALLENGE_POOL_PRIORITY = {
  publish: 20,
  next: 30,
  waiting: 40,
} as const;

/** Failed preparations before a topic is given up on (`unavailable`). */
export const CHALLENGE_POOL_MAX_ATTEMPTS = 6;
/** A ready topic is refreshed after this long; the course API keeps a reading
 *  for thirty days, so the pool never serves one the API has already dropped. */
export const CHALLENGE_POOL_STALE_AFTER_DAYS = 25;

/** A topic the course API is still building is polled again after this. */
const BUILDING_POLL_MS = 2 * 60_000;
/** A claimed row is the sweep's for this long; a sweep that dies lets it lapse. */
const LEASE_SECONDS = 180;
/** The course API has no prepare route yet (older deploy): try again later,
 *  without counting it against the topic. */
const ROUTE_MISSING_PARK_MS = 15 * 60_000;
/** The course API is saturated: not the topic's fault either. */
const BUSY_PARK_MS = 60_000;
/** How long a missing table is believed before it is looked for again. */
const MISSING_RECHECK_MS = 60_000;
/** Concurrent preparations per sweep — the warm-up gate's number, for the same
 *  reason: the course API is one uvicorn worker. */
const SWEEP_CONCURRENCY = 2;
/** Subjects whose material revision is re-confirmed per sweep, and how often. */
const REVISION_CHECKS_PER_SWEEP = 12;
const REVISION_RECHECK_MS = 15 * 60_000;
/** Aged topics marked stale per sweep. */
const AGE_BATCH = 100;
/** Between two sweeps kicked from requests in one process. */
const KICK_INTERVAL_MS = 20_000;

export type ChallengePoolStatus =
  | "queued"
  | "building"
  | "ready"
  | "stale"
  | "failed"
  | "unavailable";

/** A row as `claim_challenge_topic_pool` hands it to the sweep. */
export type ChallengePoolClaim = {
  id: string;
  course_id: string;
  teacher_id: string;
  community_subject_id: string | null;
  subject_slug: string;
  subject_name: string;
  topic_key: string;
  topic_title: string;
  position: number;
  priority: number;
  status: ChallengePoolStatus;
  /** What the row was before this claim: a first preparation, a refresh of a
   *  stale one, a retry of a failed one, or a poll of one still building. */
  prior_status?: ChallengePoolStatus | null;
  attempts: number;
  revision: string | null;
  collection_revision: string | null;
  prepared_at: string | null;
  lease_owner: string | null;
  lease_expires_at: string | null;
};

/** A ready topic's bank, as a student's challenge is cut from it. */
export type ChallengePoolSnapshot = {
  courseId: string;
  subjectSlug: string;
  topicKey: string;
  topicTitle: string;
  revision: string;
  collectionRevision: string;
  preparedAt: string | null;
  manifest: TeacherChallengePrepareManifest | null;
  content: TeacherChallengePrepareContent;
};

export type ChallengePoolPrepareOutcome =
  | "ready"
  | "building"
  | "failed"
  | "unavailable"
  /** Put back without counting against the topic (busy, or no prepare route). */
  | "parked";

export type ChallengePoolSweepSummary = {
  /** False while the table (or its claim function) does not exist. */
  available: boolean;
  owner: string;
  claimed: number;
  outcomes: Record<ChallengePoolPrepareOutcome, number>;
  topics: Array<{
    courseId: string;
    subjectSlug: string;
    topicKey: string;
    outcome: ChallengePoolPrepareOutcome;
    error?: string;
  }>;
  stale: {
    byAge: number;
    byRevision: number;
    /** Unavailable topics queued again because their material changed. */
    requeued: number;
    subjectsChecked: number;
    errors: number;
  };
  durationMs: number;
};

// ---------------------------------------------------------------------------
// A table that is not there yet
// ---------------------------------------------------------------------------

let missingUntil = 0;
let warnedMissing = false;
let confirmedAt = 0;

function isMissingPool(error: unknown) {
  const code =
    error && typeof error === "object" && "code" in error
      ? String((error as { code?: unknown }).code || "")
      : "";
  // Table: Postgres / PostgREST. Claim function: Postgres / PostgREST.
  return ["42P01", "PGRST205", "42883", "PGRST202"].includes(code);
}

function markMissing() {
  missingUntil = Date.now() + MISSING_RECHECK_MS;
  confirmedAt = 0;
  if (warnedMissing) return;
  warnedMissing = true;
  console.warn(
    "[challenge-pool] public.challenge_topic_pool is missing — challenges are prepared per student. " +
      "Run supabase/migrations/20260921200000_challenge_topic_pool.sql.",
  );
}

function knownMissing() {
  return Date.now() < missingUntil;
}

/** Forget what this process believes about the pool. For tests. */
export function resetChallengePoolState() {
  missingUntil = 0;
  warnedMissing = false;
  confirmedAt = 0;
  lastKickAt = 0;
  kickInFlight = null;
  invalidateChallengePoolCatalogue();
}

/**
 * Whether the pool exists here. One cheap read, believed for five minutes when
 * it does and for one when it does not, so a migration applied mid-deploy is
 * picked up within the minute and a working pool costs nothing per request.
 */
export async function challengePoolAvailable(
  admin: SupabaseClient = createSupabaseAdminClient(),
): Promise<boolean> {
  if (knownMissing()) return false;
  if (Date.now() - confirmedAt < 5 * 60_000) return true;
  const { error } = await admin.from(TABLE).select("id").limit(1);
  if (error) {
    if (isMissingPool(error)) markMissing();
    return false;
  }
  confirmedAt = Date.now();
  return true;
}

// ---------------------------------------------------------------------------
// Enqueue
// ---------------------------------------------------------------------------

type CatalogueTopic = { topicKey: string; title: string; position: number };

type PoolSubject = {
  courseId: string;
  teacherId: string;
  communitySubjectId: string | null;
  subjectSlug: string;
  subjectName: string;
  /** Syllabus order. */
  topics: CatalogueTopic[];
};

type PoolTopicInput = Omit<PoolSubject, "topics"> & CatalogueTopic;

function poolKey(courseId: string, subjectSlug: string, topicKey: string) {
  return `${courseId}\u0000${subjectSlug}\u0000${topicKey}`;
}

function syllabusOrder(topics: CatalogueTopic[], subjectName: string) {
  return topics
    .filter(
      (topic) =>
        topic.topicKey &&
        !isChallengeSourceDocumentTopic({
          topicKey: topic.topicKey,
          title: topic.title,
          subjectName,
        }),
    )
    .map((topic, index) => ({ topic, index }))
    .sort((left, right) => left.topic.position - right.topic.position || left.index - right.index)
    .map(({ topic }) => topic);
}

/**
 * The published subjects of a course and their topics in syllabus order — the
 * catalogue the Challenge Hub assigns from (`community_subject_topics`, ordered
 * by `position`, source-document containers dropped). Read from Supabase only:
 * nothing here asks the course API, because enqueueing runs in request paths.
 * A course no community owns has no catalogue here and is left to the
 * per-student path.
 */
function readPoolSubjects(
  admin: SupabaseClient,
  courseId: string,
  subjectSlugs: string[],
  teacherId?: string,
): Promise<Map<string, PoolSubject>> {
  const slugs = [...new Set(subjectSlugs.filter(Boolean))].sort();
  if (!courseId || !slugs.length) return Promise.resolve(new Map());
  // A catalogue changes when a creator publishes, which invalidates it; a
  // minute's memo keeps a student's every start and reopen from re-reading
  // three tables to find the topic after theirs.
  return memo(
    `${CATALOGUE_MEMO}:${courseId}:${teacherId || ""}:${slugs.join(",")}`,
    () => loadPoolSubjects(admin, courseId, slugs, teacherId),
    { ttlSeconds: 60 },
  );
}

/** Forget a course's cached catalogue — after its topics are re-extracted. */
export function invalidateChallengePoolCatalogue(courseId?: string) {
  invalidateMemo(courseId ? `${CATALOGUE_MEMO}:${courseId}` : CATALOGUE_MEMO);
}

async function loadPoolSubjects(
  admin: SupabaseClient,
  courseId: string,
  slugs: string[],
  teacherId?: string,
): Promise<Map<string, PoolSubject>> {
  const subjects = new Map<string, PoolSubject>();

  const community = await admin
    .from("communities")
    .select("id")
    .eq("study_course_id", courseId)
    .eq("status", "active")
    .maybeSingle();
  if (community.error) throw community.error;
  if (!community.data) return subjects;

  let subjectQuery = admin
    .from("community_subjects")
    .select("id,name,teacher_id,external_subject_slug")
    .eq("community_id", String(community.data.id))
    .in("external_subject_slug", slugs)
    .eq("status", "active")
    .eq("publication_status", "published");
  if (teacherId) subjectQuery = subjectQuery.eq("teacher_id", teacherId);
  const subjectRows = await subjectQuery;
  if (subjectRows.error) throw subjectRows.error;
  const published = (subjectRows.data ?? []).filter(
    (row) => row.teacher_id && row.external_subject_slug,
  );
  if (!published.length) return subjects;

  const topicRows = await admin
    .from("community_subject_topics")
    .select("community_subject_id,topic_key,title,position")
    .in(
      "community_subject_id",
      published.map((row) => String(row.id)),
    )
    .order("position", { ascending: true });
  if (topicRows.error) throw topicRows.error;

  for (const row of published) {
    const subjectName = String(row.name || row.external_subject_slug);
    subjects.set(String(row.external_subject_slug), {
      courseId,
      teacherId: String(row.teacher_id),
      communitySubjectId: String(row.id),
      subjectSlug: String(row.external_subject_slug),
      subjectName,
      topics: syllabusOrder(
        (topicRows.data ?? [])
          .filter((topic) => String(topic.community_subject_id) === String(row.id))
          .map((topic) => ({
            topicKey: String(topic.topic_key || ""),
            title: String(topic.title || ""),
            position: Math.max(0, Math.floor(Number(topic.position) || 0)),
          })),
        subjectName,
      ),
    });
  }
  return subjects;
}

/**
 * Write these topics into the pool at `priority`: new ones `queued`, existing
 * ones only ever RAISED in priority. A row's status is never touched here — a
 * `ready` topic stays ready, a `failed` one keeps its backoff — so enqueueing is
 * safe from every request path, as often as they like.
 *
 * Returns each topic's status, or null when the pool does not exist here.
 */
async function upsertPoolTopics(
  admin: SupabaseClient,
  inputs: PoolTopicInput[],
  priority: number,
): Promise<Map<string, ChallengePoolStatus> | null> {
  const statuses = new Map<string, ChallengePoolStatus>();
  if (knownMissing()) return null;
  if (!inputs.length) return statuses;

  const unique = new Map<string, PoolTopicInput>();
  for (const input of inputs) {
    unique.set(poolKey(input.courseId, input.subjectSlug, input.topicKey), input);
  }
  const wanted = [...unique.values()];
  // Three `in` filters are a cross product, not a tuple match; the tuple is
  // re-checked below.
  const existing = await admin
    .from(TABLE)
    .select("id,course_id,subject_slug,topic_key,status,priority")
    .in("course_id", [...new Set(wanted.map((input) => input.courseId))])
    .in("subject_slug", [...new Set(wanted.map((input) => input.subjectSlug))])
    .in("topic_key", [...new Set(wanted.map((input) => input.topicKey))]);
  if (existing.error) {
    if (isMissingPool(existing.error)) {
      markMissing();
      return null;
    }
    throw existing.error;
  }
  confirmedAt = Date.now();

  const known = new Map(
    (existing.data ?? []).map((row) => [
      poolKey(String(row.course_id), String(row.subject_slug), String(row.topic_key)),
      row,
    ]),
  );
  const now = new Date().toISOString();
  const fresh: Record<string, unknown>[] = [];
  const raise: string[] = [];
  for (const [key, input] of unique) {
    const prior = known.get(key);
    if (!prior) {
      statuses.set(key, "queued");
      fresh.push({
        course_id: input.courseId,
        teacher_id: input.teacherId,
        community_subject_id: input.communitySubjectId,
        subject_slug: input.subjectSlug,
        subject_name: input.subjectName,
        topic_key: input.topicKey,
        topic_title: input.title,
        position: input.position,
        status: "queued",
        priority,
        requested_at: now,
        updated_at: now,
      });
      continue;
    }
    statuses.set(key, String(prior.status) as ChallengePoolStatus);
    if (Number(prior.priority ?? 0) < priority) raise.push(String(prior.id));
  }

  if (fresh.length) {
    // Two requests racing to queue the same topic: the second is a no-op, not
    // a unique violation, and certainly not an overwrite of a ready row.
    const { error } = await admin
      .from(TABLE)
      .upsert(fresh, { onConflict: "course_id,subject_slug,topic_key", ignoreDuplicates: true });
    if (error) throw error;
  }
  if (raise.length) {
    const { error } = await admin
      .from(TABLE)
      .update({ priority, requested_at: now, updated_at: now })
      .in("id", raise);
    if (error) throw error;
  }
  return statuses;
}

export type EnqueueChallengeTopicsInput = {
  courseId: string;
  /** Narrows the subject lookup to this creator's subject. */
  teacherId?: string;
  subjectSlug: string;
  /** Used only when the caller supplies `topics`; otherwise the catalogue's. */
  subjectName?: string;
  communitySubjectId?: string | null;
  /** Syllabus position to start from, inclusive. */
  fromPosition?: number;
  /** Instead: the topics AFTER this one in syllabus order (matched by key, then
   *  by title — `/start` may have rewritten a row's key to the provider's). */
  afterTopicKey?: string;
  afterTopicTitle?: string;
  /** Instead: exactly these topics. */
  topicKeys?: string[];
  count?: number;
  priority?: number;
  /** The subject's catalogue, when the caller already holds it (publishing
   *  does, before the subject reads as published). */
  topics?: Array<{ topic_key: string; title: string; position: number }>;
  admin?: SupabaseClient;
};

export type EnqueueChallengeTopicsResult = {
  /** True when the pool holds these topics; false means the caller should
   *  prepare them the per-student way. */
  pooled: boolean;
  /** Pool status per topic key taken. */
  topics: Map<string, ChallengePoolStatus>;
  /** Topic keys not ready yet — worth a sweep. */
  pending: string[];
  reason?: "missing-table" | "no-catalogue" | "not-in-catalogue";
};

/**
 * Queue topics of one subject for preparation.
 *
 * The window is chosen from the subject's syllabus order: `count` topics from
 * `fromPosition`, or the `count` after `afterTopicKey`, or exactly `topicKeys`.
 * Never downgrades a ready row; only raises priority. Cheap — a handful of
 * Supabase reads and at most two writes, and no call to the course API.
 */
export async function enqueueChallengeTopics(
  input: EnqueueChallengeTopicsInput,
): Promise<EnqueueChallengeTopicsResult> {
  const empty = (reason: EnqueueChallengeTopicsResult["reason"]): EnqueueChallengeTopicsResult => ({
    pooled: false,
    topics: new Map(),
    pending: [],
    reason,
  });
  if (!input.courseId || !input.subjectSlug) return empty("no-catalogue");
  if (knownMissing()) return empty("missing-table");
  const admin = input.admin ?? createSupabaseAdminClient();
  const count = Math.max(0, Math.floor(input.count ?? CHALLENGE_POOL_AHEAD));

  let subject: PoolSubject | undefined;
  if (input.topics && input.teacherId) {
    // The caller holds a catalogue that was just (re)written.
    invalidateChallengePoolCatalogue(input.courseId);
    const subjectName = input.subjectName || input.subjectSlug;
    subject = {
      courseId: input.courseId,
      teacherId: input.teacherId,
      communitySubjectId: input.communitySubjectId ?? null,
      subjectSlug: input.subjectSlug,
      subjectName,
      topics: syllabusOrder(
        input.topics.map((topic) => ({
          topicKey: String(topic.topic_key || ""),
          title: String(topic.title || ""),
          position: Math.max(0, Math.floor(Number(topic.position) || 0)),
        })),
        subjectName,
      ),
    };
  } else {
    subject = (
      await readPoolSubjects(admin, input.courseId, [input.subjectSlug], input.teacherId)
    ).get(input.subjectSlug);
  }
  if (!subject || !subject.topics.length) return empty("no-catalogue");

  let window: CatalogueTopic[];
  if (input.topicKeys) {
    const keys = new Set(input.topicKeys.filter(Boolean));
    window = subject.topics.filter((topic) => keys.has(topic.topicKey));
  } else if (input.afterTopicKey || input.afterTopicTitle) {
    const byKey = subject.topics.findIndex((topic) => topic.topicKey === input.afterTopicKey);
    const title = String(input.afterTopicTitle || "")
      .trim()
      .toLowerCase();
    const index =
      byKey >= 0
        ? byKey
        : title
          ? subject.topics.findIndex((topic) => topic.title.trim().toLowerCase() === title)
          : -1;
    if (index < 0) return empty("not-in-catalogue");
    window = subject.topics.slice(index + 1, index + 1 + count);
  } else {
    const from = Math.max(0, Math.floor(input.fromPosition ?? 0));
    window = subject.topics.filter((topic) => topic.position >= from).slice(0, count);
  }
  if (input.topicKeys && !window.length) return empty("not-in-catalogue");

  const { topics: _topics, ...identity } = subject;
  const statuses = await upsertPoolTopics(
    admin,
    window.map((topic) => ({ ...identity, ...topic })),
    input.priority ?? 0,
  );
  if (statuses === null) return empty("missing-table");

  const topics = new Map<string, ChallengePoolStatus>();
  for (const topic of window) {
    const status = statuses.get(poolKey(subject.courseId, subject.subjectSlug, topic.topicKey));
    if (status) topics.set(topic.topicKey, status);
  }
  return {
    pooled: true,
    topics,
    pending: [...topics].filter(([, status]) => status !== "ready").map(([key]) => key),
  };
}

/**
 * Queue the topics on a set of challenge rows — the Challenge Hub's cards — in
 * one pass per course rather than one per card.
 *
 * Returns each row's pool status keyed by `challengePoolRowKey`, or null when
 * the pool does not exist here. A row whose topic is not in its course's
 * catalogue is simply absent: the caller prepares that one per student.
 */
export async function enqueueChallengeRows(
  rows: Array<{ courseId: string | null; subjectSlug: string; topicKey: string }>,
  priority: number,
  admin: SupabaseClient = createSupabaseAdminClient(),
): Promise<Map<string, ChallengePoolStatus> | null> {
  const statuses = new Map<string, ChallengePoolStatus>();
  if (knownMissing()) return null;
  const byCourse = new Map<string, Array<{ subjectSlug: string; topicKey: string }>>();
  for (const row of rows) {
    if (!row.courseId || !row.subjectSlug || !row.topicKey) continue;
    const list = byCourse.get(row.courseId) ?? [];
    list.push(row);
    byCourse.set(row.courseId, list);
  }
  for (const [courseId, wanted] of byCourse) {
    const subjects = await readPoolSubjects(
      admin,
      courseId,
      wanted.map((row) => row.subjectSlug),
    );
    const inputs: PoolTopicInput[] = [];
    for (const row of wanted) {
      const subject = subjects.get(row.subjectSlug);
      const topic = subject?.topics.find((item) => item.topicKey === row.topicKey);
      if (!subject || !topic) continue;
      const { topics: _topics, ...identity } = subject;
      inputs.push({ ...identity, ...topic });
    }
    const written = await upsertPoolTopics(admin, inputs, priority);
    if (written === null) return null;
    for (const [key, status] of written) statuses.set(key, status);
  }
  return statuses;
}

/** The key `enqueueChallengeRows` reports a row's status under. */
export function challengePoolRowKey(courseId: string, subjectSlug: string, topicKey: string) {
  return poolKey(courseId, subjectSlug, topicKey);
}

// ---------------------------------------------------------------------------
// Read
// ---------------------------------------------------------------------------

function snapshotContent(value: unknown): TeacherChallengePrepareContent | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const list = <T>(key: string) => (Array.isArray(record[key]) ? (record[key] as T[]) : []);
  const reading =
    record.reading && typeof record.reading === "object" && !Array.isArray(record.reading)
      ? (record.reading as TeacherChallengePrepareContent["reading"])
      : null;
  return {
    past_questions: list("past_questions"),
    solved: list("solved"),
    reading,
    topics: list("topics"),
  };
}

/**
 * A ready topic's pooled bank, or null — not ready, not pooled, a private
 * subject (no course), or no pool here at all. Never throws: every caller has
 * the per-student path to fall back on, and a pool read must not be the reason
 * a challenge fails to open.
 */
export async function readyPoolSnapshot(
  courseId: string | null | undefined,
  subjectSlug: string,
  topicKey: string,
  admin?: SupabaseClient,
): Promise<ChallengePoolSnapshot | null> {
  if (!courseId || !subjectSlug || !topicKey || knownMissing()) return null;
  try {
    const { data, error } = await (admin ?? createSupabaseAdminClient())
      .from(TABLE)
      .select(
        "course_id,subject_slug,topic_key,topic_title,status,revision,collection_revision,content,manifest,prepared_at",
      )
      .eq("course_id", courseId)
      .eq("subject_slug", subjectSlug)
      .eq("topic_key", topicKey)
      .eq("status", "ready")
      .maybeSingle();
    if (error) {
      if (isMissingPool(error)) markMissing();
      return null;
    }
    const content = data ? snapshotContent(data.content) : null;
    if (!data || !content) return null;
    return {
      courseId,
      subjectSlug,
      topicKey,
      topicTitle: String(data.topic_title || ""),
      revision: String(data.revision || ""),
      collectionRevision: String(data.collection_revision || ""),
      preparedAt: data.prepared_at ? String(data.prepared_at) : null,
      manifest: (data.manifest as TeacherChallengePrepareManifest | null) ?? null,
      content,
    };
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Prepare
// ---------------------------------------------------------------------------

function errorMessage(cause: unknown, fallback: string) {
  const message = cause instanceof Error ? cause.message : String(cause || "");
  return (message || fallback).slice(0, 500);
}

/** FastAPI's answer for a route that does not exist: an older course API. */
function isRouteMissing(cause: unknown) {
  if (!(cause instanceof TeacherApiError)) return false;
  if (cause.status === 405) return true;
  if (cause.status !== 404) return false;
  const detail =
    cause.payload && typeof cause.payload === "object"
      ? (cause.payload as { detail?: unknown }).detail
      : undefined;
  return detail === "Not Found";
}

function isBusy(cause: unknown) {
  return cause instanceof TeacherApiError && [429, 503].includes(cause.status);
}

/** 2, 4, 8, 16, 32 minutes; never more than an hour. */
export function challengePoolBackoffMs(attempts: number) {
  return Math.min(60, 2 ** Math.max(1, attempts)) * 60_000;
}

/**
 * Prepare one claimed topic, and write down what the course API said.
 *
 *   ready        -> the bank is stored, the lease cleared, failures forgotten;
 *   building     -> still the sweep's, with a short lease so the next sweep
 *                   polls it again;
 *   failed       -> one more attempt counted, backed off exponentially, and
 *                   given up on (`unavailable`) after six;
 *   unavailable  -> the material cannot produce one; left alone until its
 *                   material changes.
 *
 * Every write is conditioned on this sweep still holding the lease, so a sweep
 * that ran past its lease cannot overwrite the one that took the row over.
 */
export async function prepareClaimedTopic(
  row: ChallengePoolClaim,
  options: { admin?: SupabaseClient; force?: boolean } = {},
): Promise<{ outcome: ChallengePoolPrepareOutcome; error?: string }> {
  const admin = options.admin ?? createSupabaseAdminClient();
  const write = async (values: Record<string, unknown>) => {
    let query = admin
      .from(TABLE)
      .update({ ...values, updated_at: new Date().toISOString() })
      .eq("id", row.id);
    if (row.lease_owner) query = query.eq("lease_owner", row.lease_owner);
    const { error } = await query;
    if (error) throw error;
  };
  const releaseLease = { lease_owner: null, lease_expires_at: null };

  const fail = async (message: string) => {
    const attempts = Math.max(0, Number(row.attempts) || 0) + 1;
    if (attempts >= CHALLENGE_POOL_MAX_ATTEMPTS) {
      await write({
        status: "unavailable",
        attempts,
        last_error: message,
        next_attempt_at: null,
        ...releaseLease,
      });
      return { outcome: "unavailable" as const, error: message };
    }
    await write({
      status: "failed",
      attempts,
      last_error: message,
      next_attempt_at: new Date(Date.now() + challengePoolBackoffMs(attempts)).toISOString(),
      ...releaseLease,
    });
    return { outcome: "failed" as const, error: message };
  };

  const park = async (delayMs: number, message: string) => {
    const prior = row.prior_status;
    await write({
      status: prior === "stale" || prior === "failed" ? prior : "queued",
      last_error: message,
      next_attempt_at: new Date(Date.now() + delayMs).toISOString(),
      ...releaseLease,
    });
    return { outcome: "parked" as const, error: message };
  };

  let response: TeacherChallengePrepareResponse;
  try {
    const key = await collectionKeyForTeacher(row.teacher_id);
    if (!key) return await fail("This course creator's study collection is not ready yet.");
    response = await prepareTeacherChallengeTopic(key, {
      subject: row.subject_name || row.subject_slug,
      topic: row.topic_key,
      ...(options.force ? { force: true } : {}),
    });
  } catch (cause) {
    if (isRouteMissing(cause)) {
      return park(
        ROUTE_MISSING_PARK_MS,
        "The course API does not offer challenge preparation yet.",
      );
    }
    if (isBusy(cause)) {
      const asked =
        cause instanceof TeacherApiError && cause.retryAfterSeconds
          ? cause.retryAfterSeconds * 1000
          : 0;
      return park(Math.max(BUSY_PARK_MS, asked), "The course API was busy.");
    }
    return fail(errorMessage(cause, "The course API could not prepare this topic."));
  }

  const revisions = {
    ...(response?.revision ? { revision: String(response.revision) } : {}),
    ...(response?.collection_revision
      ? { collection_revision: String(response.collection_revision) }
      : {}),
    ...(response?.manifest ? { manifest: response.manifest } : {}),
  };
  const now = new Date().toISOString();
  switch (response?.state) {
    case "ready": {
      const content = snapshotContent(response.content);
      if (!content) return fail("The course API called this topic ready but sent no content.");
      await write({
        status: "ready",
        content,
        ...revisions,
        prepared_at: now,
        checked_at: now,
        attempts: 0,
        last_error: null,
        next_attempt_at: null,
        ...releaseLease,
      });
      return { outcome: "ready" };
    }
    case "building":
      // Still ours, briefly: the lease lapses before the next timer tick, and
      // that sweep claims the row again to ask how far along it is.
      await write({
        status: "building",
        ...revisions,
        last_error: null,
        lease_expires_at: new Date(Date.now() + BUILDING_POLL_MS).toISOString(),
      });
      return { outcome: "building" };
    case "unavailable":
      await write({
        status: "unavailable",
        content: null,
        ...revisions,
        last_error: response.error || "The course material cannot produce this topic's challenge.",
        checked_at: now,
        next_attempt_at: null,
        ...releaseLease,
      });
      return { outcome: "unavailable", error: response.error || undefined };
    case "failed":
      return fail(response.error || "The course API could not prepare this topic.");
    default:
      return fail(`The course API answered with an unknown state (${String(response?.state)}).`);
  }
}

// ---------------------------------------------------------------------------
// Stale
// ---------------------------------------------------------------------------

type StaleSummary = ChallengePoolSweepSummary["stale"];

/**
 * Mark ready topics that no longer describe their material.
 *
 * AGE: a topic prepared more than 25 days ago is refreshed — the course API
 * keeps a reading for thirty, and the pool must not outlive it.
 *
 * REVISION: a creator who indexes new material changes the subject's
 * `collection_revision`. One revision call per (course, subject), least
 * recently confirmed first, a bounded number per sweep; every ready topic built
 * from an older revision goes `stale` and is prepared again, and an
 * `unavailable` one is given another chance — new material is exactly what it
 * was missing.
 *
 * Returns null when the pool does not exist here.
 */
async function markStaleTopics(
  admin: SupabaseClient,
  maxSubjects: number,
): Promise<StaleSummary | null> {
  const summary: StaleSummary = {
    byAge: 0,
    byRevision: 0,
    requeued: 0,
    subjectsChecked: 0,
    errors: 0,
  };
  const now = new Date();
  const nowIso = now.toISOString();
  const cutoff = new Date(
    now.getTime() - CHALLENGE_POOL_STALE_AFTER_DAYS * 24 * 60 * 60_000,
  ).toISOString();

  const aged = await admin
    .from(TABLE)
    .select("id")
    .eq("status", "ready")
    .lt("prepared_at", cutoff)
    .limit(AGE_BATCH);
  if (aged.error) {
    if (isMissingPool(aged.error)) {
      markMissing();
      return null;
    }
    throw aged.error;
  }
  const agedIds = (aged.data ?? []).map((row) => String(row.id));
  if (agedIds.length) {
    const { error } = await admin
      .from(TABLE)
      .update({ status: "stale", updated_at: nowIso })
      .in("id", agedIds)
      .eq("status", "ready");
    if (error) throw error;
    summary.byAge = agedIds.length;
  }

  if (maxSubjects <= 0) return summary;
  const candidates = await admin
    .from(TABLE)
    .select("course_id,subject_slug,subject_name,teacher_id,checked_at")
    .in("status", ["ready", "unavailable"])
    .order("checked_at", { ascending: true, nullsFirst: true })
    .limit(500);
  if (candidates.error) throw candidates.error;
  const recheckBefore = now.getTime() - REVISION_RECHECK_MS;
  const groups = new Map<
    string,
    { courseId: string; subjectSlug: string; subjectName: string; teacherId: string }
  >();
  const due = (candidates.data ?? [])
    .filter((row) => !row.checked_at || Date.parse(String(row.checked_at)) < recheckBefore)
    .sort((left, right) =>
      String(left.checked_at ?? "").localeCompare(String(right.checked_at ?? "")),
    );
  for (const row of due) {
    const key = `${row.course_id}\u0000${row.subject_slug}`;
    if (groups.has(key)) continue;
    if (groups.size >= maxSubjects) break;
    groups.set(key, {
      courseId: String(row.course_id),
      subjectSlug: String(row.subject_slug),
      subjectName: String(row.subject_name || row.subject_slug),
      teacherId: String(row.teacher_id),
    });
  }

  for (const group of groups.values()) {
    summary.subjectsChecked += 1;
    let current = "";
    try {
      const key = await collectionKeyForTeacher(group.teacherId);
      if (key) {
        const response = await getTeacherChallengeRevision(key, group.subjectName);
        current = String(response?.collection_revision || "").trim();
      }
    } catch {
      summary.errors += 1;
    }
    const rows = await admin
      .from(TABLE)
      .select("id,status,collection_revision")
      .eq("course_id", group.courseId)
      .eq("subject_slug", group.subjectSlug)
      .in("status", ["ready", "unavailable"]);
    if (rows.error) throw rows.error;
    const ids = (rows.data ?? []).map((row) => String(row.id));
    if (!ids.length) continue;
    // Confirmed (or at least looked at) now, whatever the answer: a subject whose
    // revision cannot be read must not be asked about on every sweep.
    const touched = await admin.from(TABLE).update({ checked_at: nowIso }).in("id", ids);
    if (touched.error) throw touched.error;
    if (!current) continue;

    // A row that never recorded a revision (a topic given up on after six
    // failures, say) is stamped with today's, not treated as changed — or it
    // would be retried on every check and the cap would mean nothing.
    const unstamped = (rows.data ?? [])
      .filter((row) => !row.collection_revision)
      .map((row) => String(row.id));
    if (unstamped.length) {
      const { error } = await admin
        .from(TABLE)
        .update({ collection_revision: current })
        .in("id", unstamped);
      if (error) throw error;
    }
    const changed = (rows.data ?? []).filter(
      (row) => row.collection_revision && String(row.collection_revision) !== current,
    );
    const staleIds = changed.filter((row) => row.status === "ready").map((row) => String(row.id));
    const retryIds = changed
      .filter((row) => row.status === "unavailable")
      .map((row) => String(row.id));
    if (staleIds.length) {
      const { error } = await admin
        .from(TABLE)
        .update({ status: "stale", updated_at: nowIso })
        .in("id", staleIds)
        .eq("status", "ready");
      if (error) throw error;
      summary.byRevision += staleIds.length;
    }
    if (retryIds.length) {
      const { error } = await admin
        .from(TABLE)
        .update({
          status: "queued",
          attempts: 0,
          next_attempt_at: null,
          last_error: null,
          updated_at: nowIso,
        })
        .in("id", retryIds)
        .eq("status", "unavailable");
      if (error) throw error;
      summary.requeued += retryIds.length;
    }
  }
  return summary;
}

// ---------------------------------------------------------------------------
// Sweep
// ---------------------------------------------------------------------------

function sweepOwner() {
  return `${hostname()}:${process.pid}:${randomUUID().slice(0, 8)}`;
}

/**
 * One pass over the pool: mark what has gone stale, claim up to `limit` topics
 * and prepare them two at a time.
 *
 * `markStale: false` is the cheap pass a request kicks — claim and prepare
 * only; the timer's pass does both.
 */
export async function sweepChallengePool(
  options: {
    limit?: number;
    markStale?: boolean;
    revisionChecks?: number;
    admin?: SupabaseClient;
  } = {},
): Promise<ChallengePoolSweepSummary> {
  const started = Date.now();
  const owner = sweepOwner();
  const summary: ChallengePoolSweepSummary = {
    available: true,
    owner,
    claimed: 0,
    outcomes: { ready: 0, building: 0, failed: 0, unavailable: 0, parked: 0 },
    topics: [],
    stale: { byAge: 0, byRevision: 0, requeued: 0, subjectsChecked: 0, errors: 0 },
    durationMs: 0,
  };
  const finish = () => ({ ...summary, durationMs: Date.now() - started });
  if (knownMissing()) return { ...finish(), available: false };
  const admin = options.admin ?? createSupabaseAdminClient();

  if (options.markStale !== false) {
    const stale = await markStaleTopics(admin, options.revisionChecks ?? REVISION_CHECKS_PER_SWEEP);
    if (stale === null) return { ...finish(), available: false };
    summary.stale = stale;
  }

  const limit = Math.max(0, Math.floor(options.limit ?? 6));
  if (!limit) return finish();
  const { data, error } = await admin.rpc(CLAIM_FUNCTION, {
    p_owner: owner,
    p_limit: limit,
    p_lease_seconds: LEASE_SECONDS,
  });
  if (error) {
    if (isMissingPool(error)) {
      markMissing();
      return { ...finish(), available: false };
    }
    throw error;
  }
  confirmedAt = Date.now();
  const claimed = (Array.isArray(data) ? data : data ? [data] : []) as ChallengePoolClaim[];
  summary.claimed = claimed.length;

  const gate = createLimiter(SWEEP_CONCURRENCY);
  await Promise.all(
    claimed.map((row) =>
      gate(async () => {
        const result = await prepareClaimedTopic(
          { ...row, lease_owner: row.lease_owner || owner },
          { admin },
        ).catch((cause) => ({
          // The write itself failed; the lease lapses and a later sweep retries.
          outcome: "failed" as const,
          error: errorMessage(cause, "Could not record this topic's preparation."),
        }));
        summary.outcomes[result.outcome] += 1;
        summary.topics.push({
          courseId: String(row.course_id),
          subjectSlug: String(row.subject_slug),
          topicKey: String(row.topic_key),
          outcome: result.outcome,
          ...(result.error ? { error: result.error } : {}),
        });
      }),
    ),
  );
  return finish();
}

let kickInFlight: Promise<unknown> | null = null;
let lastKickAt = 0;

/**
 * Start preparing queued topics now, behind the response that queued them,
 * rather than at the next timer tick.
 *
 * Small on purpose — two topics, no stale pass — and at most one in flight per
 * process, at most one every twenty seconds: the timer is what drains the pool;
 * this only takes the wait out of the common case. `CHALLENGE_POOL_INLINE_SWEEP=0`
 * turns it off and leaves the pool to the timer alone.
 */
export function kickChallengePoolSweep(limit = 2) {
  if ((process.env.CHALLENGE_POOL_INLINE_SWEEP || "").trim() === "0") return;
  if (kickInFlight || knownMissing()) return;
  if (Date.now() - lastKickAt < KICK_INTERVAL_MS) return;
  lastKickAt = Date.now();
  const task = sweepChallengePool({ limit, markStale: false })
    .catch((cause) => {
      console.warn(`[challenge-pool] inline sweep failed: ${errorMessage(cause, "unknown")}`);
      return null;
    })
    .finally(() => {
      kickInFlight = null;
    });
  kickInFlight = task;
  try {
    after(() => task);
  } catch {
    // Not in a request scope. The work is under way regardless.
  }
}
