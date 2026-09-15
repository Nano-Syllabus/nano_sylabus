import { after } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import {
  getStudentCourseSubjectAccess,
  getStudentCourseSubjectAccessForCourse,
} from "@/lib/student-courses";
import {
  createTeacherChallengeExam,
  gradeTeacherAnswers,
  gradeTeacherPracticePaper,
  gradeTeacherPracticePaperFile,
  getTeacherChallengePastQuestions,
  getTeacherChallengeReading,
  getTeacherChallengeSolvedQuestions,
  getTeacherPracticeTopics,
  submitTeacherChallengeExam,
  submitTeacherChallengeExamFile,
  TeacherApiError,
  type ApiRecord,
  type TeacherChallengeExam,
  type TeacherChallengeGradeResponse,
  type TeacherChallengeLearnResponse,
  type TeacherChallengePastQuestionsResponse,
  type TeacherChallengeSolvedQuestion,
  type TeacherChallengeSolvedResponse,
  type TeacherPracticePaperGradeResponse,
  type TeacherStandaloneGradeResponse,
} from "@/lib/teacher-app/client";
import { isChallengeSourceDocumentTopic } from "@/lib/challenge-topics";
import { memo } from "@/lib/http/memo";
import { devCollectionKey } from "@/lib/dev-collection-key";
import type { PracticeEvaluation } from "@/lib/tenant/client";

const UNDEFINED_TABLE = "42P01";
const UNDEFINED_COLUMN = "42703";
/** PostgREST's own code for a column its schema cache does not know. */
const POSTGREST_MISSING_COLUMN = "PGRST204";
const POSTGREST_MISSING_TABLE = "PGRST205";
export const CHALLENGE_PASS_PERCENT = 40;
export const CHALLENGE_QUESTIONS = 2;
export const CHALLENGE_PAST_QUESTIONS = 6;
export const CHALLENGE_MARKS_PER_QUESTION = 10;

/**
 * How long a half-built challenge may sit before any reader re-runs the tail of
 * its build. The background pass normally lands in a few seconds; this only
 * fires when the process that owned it went away (a deploy, a crash) and would
 * otherwise leave the row waiting for worked examples forever.
 */
const CONTENT_PENDING_STALE_MS = 90_000;

/** Challenge ids whose background completion is running in THIS process. */
const completionsInFlight = new Map<string, Promise<StudentChallengeDetail | null>>();

export function isMissingChallengeTable(error: { code?: string } | null) {
  return error?.code === UNDEFINED_TABLE || error?.code === POSTGREST_MISSING_TABLE;
}

/**
 * A column the code knows about and the database does not.
 *
 * Code ships before its migration runs — that is the normal order of a deploy,
 * not a mistake — and for the window in between, every query naming the new
 * column fails outright. `unit_number` is the live example: it is a nicety that
 * files a revision topic under its syllabus unit, and a missing one took down
 * the whole Challenge Hub and the whole Revision section with a 42703.
 *
 * So the queries that use it degrade instead. What the column buys is worth
 * having and is never worth a page for.
 */
export function isMissingColumn(error: { code?: string } | null) {
  return error?.code === UNDEFINED_COLUMN || error?.code === POSTGREST_MISSING_COLUMN;
}

export type ChallengeStatus = "assigned" | "started" | "completed";

export type ChallengeRecommendation = {
  courseId: string | null;
  subjectSlug: string;
  subjectName: string;
  namespace: string;
  topicKey: string;
  topicTitle: string;
  topicBlurb: string;
  /** The unit this subtopic sits under, "" when the syllabus does not number it.
   *  A challenge covers one SUBTOPIC; the unit is how it is grouped and how the
   *  revision docs rebuild "Unit 1" out of the topics filed beneath it. */
  unitNumber: string;
  reason: string;
};

export type EnsureDailyChallengeOptions = {
  /**
   * A subject-scoped screen must retain its own daily set even when the
   * general queue already contains assignments from other subjects.
   */
  minimumRecommendationCount?: number;
};

export type StudentChallengeSummary = {
  id: string;
  courseId: string | null;
  date: string;
  position: number;
  subjectSlug: string;
  subjectName: string;
  topicKey: string;
  topicTitle: string;
  title: string;
  recommendationReason: string;
  status: ChallengeStatus;
  durationMinutes: number;
  totalMarks: number;
  passMarks: number;
  lessonRead: boolean;
  examplesReviewed: boolean;
  attemptCount: number;
  lastScore: number | null;
  lastTotalMarks: number | null;
};

export type ChallengeSolvedExample = {
  year: string | null;
  question: string;
  solution: string;
  topic: string;
  marks: number;
  grounded: boolean;
  source: string;
};

/**
 * One real question this subject's own papers set on the topic — unsolved.
 *
 * It replaces the prerequisite chapters that used to open a challenge. A student
 * opening a challenge is shown what the examiner actually asks before a line of
 * the reading is written for them; the worked solutions stay at the learning
 * step, where they cannot be read as the answer to the topic and skipped past.
 */
export type ChallengePastQuestion = {
  id: string;
  question: string;
  topic: string;
  topicKey: string;
  /** Null when the question bank does not print one. Never guessed. */
  marks: number | null;
  /** The session a real paper printed beside it, or "" when it printed none. */
  year: string;
};

export type ChallengeExamQuestion = {
  id: string;
  question: string;
  topic: string;
  marks: number;
  questionType: string;
};

/**
 * `pending` means the row holds a real lesson but its worked examples and exam
 * are still being built behind the response. It is never a loading spinner for
 * the whole screen — the student reads the lesson while the rest lands.
 */
export type ChallengeContentStatus = "ready" | "pending";

export type StudentChallengeContent = {
  provider?: "collection-challenge-v1";
  /**
   * Which upstream issued this paper, and therefore which route marks it.
   *
   * `challenge-exam-v1` is the pooled challenge exam: questions are assembled
   * from the collection's own RAG index (`rag_service.challenge_store`) and only
   * the shortfall is generated, so a topic with a healthy pool costs no model
   * call at all. `practice-paper-v1` is the older persisted practice paper, kept
   * as a value because rows issued before the switch still have to grade.
   */
  examProvider?: "practice-paper-v1" | "challenge-exam-v1";
  contentStatus?: ChallengeContentStatus;
  /** When the background completion was handed off; drives the stale re-kick. */
  contentPendingSince?: string;
  /** Why the background completion last failed, if it did. */
  contentError?: string | null;
  upstreamChallengeId?: string;
  topicKeys?: string[];
  canStart?: boolean;
  pastQuestions?: ChallengePastQuestion[];
  pastQuestionNote?: string;
  pastQuestionSource?: "syllabus" | "stored" | "index_chapters" | "none";
  /** False => this subject's bank has nothing on the topic. */
  pastQuestionsGrounded?: boolean;
  pastQuestionBlockers?: string[];
  pastQuestionWarnings?: string[];
  learningWarning?: string | null;
  solvedWarning?: string | null;
  examWarning?: string | null;
  lesson: {
    title: string;
    content: string[];
    focus: string;
    /** The one sentence the topic reduces to. Absent on a reading written before
     *  the concept-led rewrite, so the UI must render without it. */
    bigIdea?: string;
    /** Where the topic sits in the subject: what it builds on, what builds on it. */
    connections?: string[];
    sources?: Array<{ title: string; source: string; excerpt: string }>;
  };
  solvedExamples: ChallengeSolvedExample[];
  examQuestions: ChallengeExamQuestion[];
  examExpiresAt?: string;
  examAttemptNumber?: number;
  warning: string | null;
};

export type StudentChallengeDetail = StudentChallengeSummary & {
  content: StudentChallengeContent | null;
  latestAttempt: ChallengeAttemptReview | null;
};

export type ChallengeAttemptReview = {
  attemptId: string;
  handedInAt: string | null;
  evaluation?: PracticeEvaluation;
  answers: Array<{
    questionId: string;
    answerText: string;
    score: number;
    feedback: string;
  }>;
};

function practiceEvaluationFromUnknown(value: unknown): PracticeEvaluation | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const required = [
    "total_score",
    "total_marks",
    "percentage",
    "marks_lost",
    "questions",
    "questions_answered",
    "summary",
  ];
  if (required.some((key) => !(key in record))) return null;

  const parseChapter = (value: unknown) => {
    if (!value || typeof value !== "object" || Array.isArray(value)) return null;
    const chapter = value as Record<string, unknown>;
    const status = String(chapter.status ?? "developing");
    return {
      chapter: String(chapter.chapter ?? ""),
      topic_key: String(chapter.topic_key ?? ""),
      questions: number(chapter.questions),
      questions_answered: number(chapter.questions_answered),
      marks: number(chapter.marks),
      score: number(chapter.score),
      marks_lost: number(chapter.marks_lost),
      percentage: number(chapter.percentage),
      weightage: number(chapter.weightage),
      lost_weightage: number(chapter.lost_weightage),
      status: ["strong", "developing", "weak", "not_attempted"].includes(status)
        ? (status as PracticeEvaluation["chapters"][number]["status"])
        : "developing",
    };
  };
  const parseChapters = (key: string) =>
    (Array.isArray(record[key]) ? record[key] : [])
      .map(parseChapter)
      .filter((chapter): chapter is NonNullable<ReturnType<typeof parseChapter>> =>
        Boolean(chapter),
      );

  return {
    total_score: number(record.total_score),
    total_marks: number(record.total_marks),
    percentage: number(record.percentage),
    marks_lost: number(record.marks_lost),
    questions: number(record.questions),
    questions_answered: number(record.questions_answered),
    chapters: parseChapters("chapters"),
    strong_topics: parseChapters("strong_topics"),
    weak_topics: parseChapters("weak_topics"),
    not_attempted: parseChapters("not_attempted"),
    summary: String(record.summary ?? ""),
  };
}

type ChallengeRow = Record<string, unknown>;

function number(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function nullableNumber(value: unknown) {
  return value === null || value === undefined ? null : number(value);
}

/** Prevent source filenames/paper identifiers from leaking into student UI. */
export function studentFacingTopicTitle(topicTitle: string, subjectName: string) {
  const title = topicTitle.trim();
  const fallback = subjectName.trim() || "Course topic";
  const looksLikeArxivId = /^\d{4}[._]\d{4,5}(?:v\d+)?$/i.test(title);
  const looksLikeFile = /\.(?:pdf|docx?|pptx?|txt|md)$/i.test(title);
  const looksLikeUuid = /^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(title);
  return !title || looksLikeArxivId || looksLikeFile || looksLikeUuid ? fallback : title;
}

export function nepaliChallengeDate(value = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kathmandu",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(value);
  const part = (name: string) => parts.find((item) => item.type === name)?.value || "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

function toSummary(row: ChallengeRow): StudentChallengeSummary {
  const subjectName = String(row.subject_name ?? "");
  const rawTopicTitle = String(row.topic_title ?? "");
  const topicTitle = studentFacingTopicTitle(rawTopicTitle, subjectName);
  return {
    id: String(row.id ?? ""),
    courseId: row.course_id ? String(row.course_id) : null,
    date: String(row.challenge_date ?? ""),
    position: number(row.position),
    subjectSlug: String(row.subject_slug ?? ""),
    subjectName,
    topicKey: String(row.topic_key ?? ""),
    topicTitle,
    // The topic, never the stored `title`. Challenges were written to the row as
    // "Master <topic>", which put a word we do not say to students into the page
    // heading, the focus-mode rail, the compact bar and the exam record that
    // grading stores. The topic name is what every other surface already shows
    // (`topicTitle` below, the daily dashboard, the challenge list), so reading it
    // here is what makes them agree rather than one more place to strip a prefix.
    title: topicTitle,
    recommendationReason: String(row.recommendation_reason ?? ""),
    status: (row.status as ChallengeStatus) ?? "assigned",
    durationMinutes: number(row.duration_minutes) || 20,
    totalMarks: number(row.total_marks),
    passMarks: number(row.pass_marks),
    lessonRead: Boolean(row.lesson_read_at),
    examplesReviewed: Boolean(row.examples_reviewed_at),
    attemptCount: number(row.attempt_count),
    lastScore: nullableNumber(row.last_score),
    lastTotalMarks: nullableNumber(row.last_total_marks),
  };
}

function toDetail(row: ChallengeRow): StudentChallengeDetail {
  const content =
    row.content && typeof row.content === "object" && !Array.isArray(row.content)
      ? (row.content as StudentChallengeContent)
      : null;
  return { ...toSummary(row), content, latestAttempt: null };
}

export function challengeAttemptReviewFromEvaluation(
  attemptId: string,
  evaluation: unknown,
  createdAt?: string | null,
): ChallengeAttemptReview | null {
  if (!evaluation || typeof evaluation !== "object" || Array.isArray(evaluation)) return null;
  const history = (evaluation as Record<string, unknown>).attempt_history;
  if (!history || typeof history !== "object" || Array.isArray(history)) return null;
  const historyRecord = history as Record<string, unknown>;
  if (!Array.isArray(historyRecord.results)) return null;

  const answers = historyRecord.results
    .filter((item): item is Record<string, unknown> => Boolean(item && typeof item === "object"))
    .map((item) => ({
      questionId: String(item.question_id ?? ""),
      answerText: String(item.student_answer ?? ""),
      score: number(item.score),
      feedback: String(item.feedback ?? ""),
    }))
    .filter((answer) => answer.questionId);
  if (!answers.length) return null;

  return {
    attemptId,
    handedInAt: historyRecord.handedInAt ? String(historyRecord.handedInAt) : createdAt || null,
    evaluation: practiceEvaluationFromUnknown(evaluation) ?? undefined,
    answers,
  };
}

export function challengeAttemptReviewFromNormalizedRows(
  attemptId: string,
  questions: Array<{ id: unknown; external_question_id: unknown }>,
  answers: Array<{
    question_id: unknown;
    answer_text: unknown;
    score: unknown;
    feedback: unknown;
  }>,
  createdAt?: string | null,
): ChallengeAttemptReview | null {
  const answerByQuestion = new Map(
    answers.map((answer) => [String(answer.question_id ?? ""), answer]),
  );
  const restored = questions
    .map((question) => {
      const answer = answerByQuestion.get(String(question.id ?? ""));
      return {
        questionId: String(question.external_question_id ?? ""),
        answerText: String(answer?.answer_text ?? ""),
        score: number(answer?.score),
        feedback: String(answer?.feedback ?? ""),
      };
    })
    .filter((answer) => answer.questionId);
  if (!restored.length) return null;

  return {
    attemptId,
    handedInAt: createdAt || null,
    answers: restored,
  };
}

async function withLatestAttemptReview(
  userId: string,
  row: ChallengeRow,
  detail = toDetail(row),
): Promise<StudentChallengeDetail> {
  const attemptId = String(row.last_attempt_id ?? "");
  if (!attemptId) return detail;

  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("student_practice_attempts")
    .select("id, evaluation, created_at")
    .eq("id", attemptId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return detail;

  const embeddedReview = challengeAttemptReviewFromEvaluation(
    String(data.id),
    data.evaluation,
    data.created_at ? String(data.created_at) : null,
  );
  if (embeddedReview) return { ...detail, latestAttempt: embeddedReview };

  const [{ data: questions, error: questionError }, { data: answers, error: answerError }] =
    await Promise.all([
      admin
        .from("student_practice_attempt_questions")
        .select("id, external_question_id")
        .eq("attempt_id", attemptId)
        .eq("user_id", userId)
        .order("position", { ascending: true }),
      admin
        .from("student_practice_attempt_answers")
        .select("question_id, answer_text, score, feedback")
        .eq("attempt_id", attemptId)
        .eq("user_id", userId),
    ]);
  if (questionError && questionError.code !== UNDEFINED_TABLE) throw questionError;
  if (answerError && answerError.code !== UNDEFINED_TABLE) throw answerError;

  return {
    ...detail,
    latestAttempt: challengeAttemptReviewFromNormalizedRows(
      String(data.id),
      questions ?? [],
      answers ?? [],
      data.created_at ? String(data.created_at) : null,
    ),
  };
}

async function listDailyRows(userId: string, date: string) {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("student_challenges")
    .select("*")
    .eq("user_id", userId)
    .eq("challenge_date", date)
    .order("position", { ascending: true });
  if (isMissingChallengeTable(error)) return null;
  if (error) throw error;
  return (data ?? []) as ChallengeRow[];
}

function recommendationKey(recommendation: ChallengeRecommendation) {
  return [
    recommendation.courseId ?? "owner-private",
    recommendation.subjectSlug.trim().toLowerCase(),
    recommendation.topicKey.trim().toLowerCase(),
  ].join(":");
}

function rowRecommendationKey(row: ChallengeRow) {
  return [
    row.course_id ? String(row.course_id) : "owner-private",
    String(row.subject_slug ?? "")
      .trim()
      .toLowerCase(),
    String(row.topic_key ?? "")
      .trim()
      .toLowerCase(),
  ].join(":");
}

/** Subject identity for a row or a recommendation, without the topic. */
function subjectRecommendationKey(courseId: string | null, subjectSlug: string) {
  return `${courseId || "owner-private"}:${subjectSlug.trim().toLowerCase()}`;
}

/**
 * Rows sitting on a topic this subject no longer teaches.
 *
 * A challenge is assigned against the subject's topic catalogue and then keeps
 * the `topic_key` it was given. That key can stop being something a student may
 * be OFFERED while still resolving perfectly well — which is exactly what happens
 * when a syllabus is re-read and a unit is replaced by the bullets under it.
 * "Oscillation" stops being a study session and becomes the week that contains
 * "Mechanical Oscillation: Introduction", "Free oscillation" and four others.
 *
 * The row does not notice. It stays unfinished, it keeps counting against the
 * three daily slots, and the student is handed a whole unit under a column that
 * says Subtopic — forever, because nothing ever retires it.
 *
 * So a row whose topic is absent from its OWN subject's current recommendations
 * is treated the way `isSourceDocumentChallengeRow` treats a row built on an
 * uploaded file: kept in storage for auditability, never occupying a slot and
 * never listed. Scoped per subject, and only for subjects the recommendations
 * actually cover — a subject that is simply not in today's scope has no
 * catalogue here to be missing from, and must not have its rows retired on the
 * strength of that silence.
 */
export function retiredTopicRows(
  rows: ChallengeRow[],
  recommendations: ChallengeRecommendation[],
) {
  const offerable = new Map<string, Set<string>>();
  for (const recommendation of recommendations) {
    const subject = subjectRecommendationKey(recommendation.courseId, recommendation.subjectSlug);
    const keys = offerable.get(subject) ?? new Set<string>();
    keys.add(recommendation.topicKey.trim().toLowerCase());
    offerable.set(subject, keys);
  }
  return new Set(
    rows
      .filter((row) => {
        const subject = subjectRecommendationKey(
          row.course_id ? String(row.course_id) : null,
          String(row.subject_slug ?? ""),
        );
        const keys = offerable.get(subject);
        return Boolean(keys) && !keys?.has(String(row.topic_key ?? "").trim().toLowerCase());
      })
      .map((row) => String(row.id)),
  );
}

function isSourceDocumentChallengeRow(row: ChallengeRow) {
  return isChallengeSourceDocumentTopic({
    topicKey: String(row.topic_key || ""),
    title: String(row.topic_title || ""),
    subjectName: String(row.subject_name || ""),
  });
}

export function dailyChallengeAssignmentCount({
  activeCount,
  activeRecommendationCount,
  availableCount,
  minimumRecommendationCount = 0,
  dailyCount = 0,
  maximumDailyCount = Infinity,
}: {
  activeCount: number;
  activeRecommendationCount: number;
  availableCount: number;
  minimumRecommendationCount?: number;
  dailyCount?: number;
  maximumDailyCount?: number;
}) {
  const openSlots = Math.max(0, 3 - activeCount);
  const scopedSlots = Math.max(0, minimumRecommendationCount - activeRecommendationCount);
  const requested = Math.max(openSlots, scopedSlots);
  return Math.min(availableCount, requested, Math.max(0, maximumDailyCount - dailyCount));
}

async function hasUnlimitedDailyChallenges(userId: string): Promise<boolean> {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("user_subscriptions")
    .select("ends_at,subscription_plans(slug,is_unlimited)")
    .eq("user_id", userId)
    .eq("status", "active");
  if (error) throw error;
  const now = Date.now();
  return (data ?? []).some((subscription) => {
    const plan = Array.isArray(subscription.subscription_plans)
      ? subscription.subscription_plans[0]
      : subscription.subscription_plans;
    const active = !subscription.ends_at || new Date(subscription.ends_at).getTime() > now;
    return active && (plan?.slug === "plus-monthly" || plan?.is_unlimited === true);
  });
}

/**
 * Keeps up to three real, unfinished challenges in today's general queue.
 * Free students receive at most three assignments total per day; Plus and
 * unlimited subscribers get the next unused recommendation as they finish.
 * Completed rows stay immutable for history/metrics. A subject-scoped caller
 * can request three matching assignments only within that daily allowance.
 */
export async function ensureDailyChallenges(
  userId: string,
  recommendations: ChallengeRecommendation[],
  options: EnsureDailyChallengeOptions = {},
): Promise<StudentChallengeSummary[]> {
  const date = nepaliChallengeDate();
  const [existing, unlimitedDailyChallenges] = await Promise.all([
    listDailyRows(userId, date),
    hasUnlimitedDailyChallenges(userId),
  ]);
  if (existing === null) return [];

  // Old catalogues sometimes exposed uploaded files (for example
  // "Applied Mechanics QB") as if they were syllabus chapters, and a unit that
  // has since been re-read into its own bullets stops being a subtopic anyone
  // may be offered. Keep both in storage for auditability, but do not let them
  // occupy today's student challenge slots or appear in the list.
  const retired = retiredTopicRows(existing, recommendations);
  const offerableRow = (row: ChallengeRow) =>
    !isSourceDocumentChallengeRow(row) && !retired.has(String(row.id));
  const active = existing.filter((row) => row.status !== "completed" && offerableRow(row));
  const assignedKeys = new Set(existing.map(rowRecommendationKey));
  const recommendationKeys = new Set(recommendations.map(recommendationKey));
  const activeRecommendationCount = active.filter((row) =>
    recommendationKeys.has(rowRecommendationKey(row)),
  ).length;
  const available = recommendations.filter(
    (recommendation) => !assignedKeys.has(recommendationKey(recommendation)),
  );
  const selected = available.slice(
    0,
    dailyChallengeAssignmentCount({
      activeCount: active.length,
      activeRecommendationCount,
      availableCount: available.length,
      minimumRecommendationCount: options.minimumRecommendationCount,
        dailyCount: existing.filter(offerableRow).length,
      maximumDailyCount: unlimitedDailyChallenges ? Infinity : 3,
    }),
  );

  if (!selected.length) {
    return active
      .sort((left, right) => {
        const created = String(right.created_at ?? "").localeCompare(String(left.created_at ?? ""));
        return created || number(left.position) - number(right.position);
      })
      .map(toSummary);
  }

  const admin = createSupabaseAdminClient();
  const nextPosition = existing.reduce(
    (maximum, row) => Math.max(maximum, number(row.position) + 1),
    0,
  );
  const rows = selected.map((recommendation, offset) => {
    const topicTitle = studentFacingTopicTitle(
      recommendation.topicTitle,
      recommendation.subjectName,
    );
    return {
      user_id: userId,
      course_id: recommendation.courseId,
      challenge_date: date,
      position: nextPosition + offset,
      subject_slug: recommendation.subjectSlug,
      subject_name: recommendation.subjectName,
      namespace: recommendation.namespace,
      topic_key: recommendation.topicKey,
      topic_title: topicTitle,
      topic_blurb: recommendation.topicBlurb,
      // The syllabus's own unit for this subtopic, written down at assignment.
      // `/start` rewrites `topic_key` to whatever the provider resolved, so the
      // revision docs' catalogue join on that key is not something to depend on
      // — this is the copy that survives a re-extraction. See the migration
      // 20260915120000_challenge_syllabus_unit.sql for the whole argument.
      unit_number: recommendation.unitNumber || "",
      title: topicTitle,
      recommendation_reason: recommendation.reason,
      duration_minutes: 20,
    };
  });
  let { error } = await admin.from("student_challenges").insert(rows);
  if (isMissingColumn(error)) {
    // The migration has not run here yet. Assign the challenges anyway and let
    // the revision docs fall back to the live catalogue for unit placement,
    // which is what they did before this column existed.
    console.warn(
      "[challenge] student_challenges.unit_number is missing — assigning without it. " +
        "Run supabase/migrations/20260915120000_challenge_syllabus_unit.sql.",
    );
    ({ error } = await admin
      .from("student_challenges")
      .insert(rows.map(({ unit_number: _unitNumber, ...row }) => row)));
  }
  if (error?.code === "23505") {
    const concurrent = (await listDailyRows(userId, date)) ?? [];
    return concurrent
      .filter((row) => row.status !== "completed" && offerableRow(row))
      .sort((left, right) => {
        const created = String(right.created_at ?? "").localeCompare(String(left.created_at ?? ""));
        return created || number(left.position) - number(right.position);
      })
      .map(toSummary);
  }
  if (error) throw error;

  return (((await listDailyRows(userId, date)) ?? []) as ChallengeRow[])
    .filter((row) => row.status !== "completed" && offerableRow(row))
    .sort((left, right) => {
      const created = String(right.created_at ?? "").localeCompare(String(left.created_at ?? ""));
      return created || number(left.position) - number(right.position);
    })
    .map(toSummary);
}

export async function listCompletedStudentChallenges(
  userId: string,
  page: number,
  pageSize = 5,
  scope?: { courseId: string; subjectSlug?: string },
) {
  const admin = createSupabaseAdminClient();
  const requestedPage = Math.max(1, Math.floor(page));
  const from = (requestedPage - 1) * pageSize;
  let query = admin
    .from("student_challenges")
    .select("*", { count: "exact" })
    .eq("user_id", userId)
    .eq("status", "completed")
    .order("completed_at", { ascending: false })
    .order("created_at", { ascending: false });
  if (scope) {
    query = query.eq("course_id", scope.courseId);
    if (scope.subjectSlug) query = query.eq("subject_slug", scope.subjectSlug);
  }
  const { data, error, count } = await query.range(from, from + pageSize - 1);
  if (isMissingChallengeTable(error)) {
    return { challenges: [], page: 1, total: 0, totalPages: 0 };
  }
  if (error) throw error;

  const total = count ?? 0;
  const totalPages = total ? Math.ceil(total / pageSize) : 0;
  if (totalPages > 0 && requestedPage > totalPages) {
    return listCompletedStudentChallenges(userId, totalPages, pageSize, scope);
  }
  return {
    challenges: ((data ?? []) as ChallengeRow[]).map(toSummary),
    page: totalPages ? Math.min(requestedPage, totalPages) : 1,
    total,
    totalPages,
  };
}

export async function getStudentChallenge(userId: string, challengeId: string) {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("student_challenges")
    .select("*")
    .eq("id", challengeId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const row = data as ChallengeRow;
  await requireChallengeAccess(userId, row);
  return withLatestAttemptReview(userId, row);
}

export async function getStudentChallengeGradeContext(userId: string, challengeId: string) {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("student_challenges")
    .select("*")
    .eq("id", challengeId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const row = data as ChallengeRow;
  await requireChallengeAccess(userId, row);
  return {
    detail: toDetail(row),
    externalPaperId: String(row.external_paper_id ?? ""),
  };
}

function solvedExample(question: TeacherChallengeSolvedQuestion): ChallengeSolvedExample {
  const source = String(question.source || "").trim();
  return {
    year: question.year?.trim() || null,
    question: question.text,
    solution: question.solution?.trim() || "",
    topic: question.topic || "",
    marks: number(question.marks),
    grounded: source !== "generated_from_notes",
    source,
  };
}

function examQuestion(question: TeacherChallengeExam["questions"][number]): ChallengeExamQuestion {
  return {
    id: question.id,
    question: question.text,
    topic: question.topic || "",
    marks: number(question.marks),
    questionType: question.question_type || "Short answer",
  };
}

/**
 * Issue the sitting from the collection's own question pool.
 *
 * WHY NOT `/api/v1/practice/generate`, WHICH THIS USED TO CALL
 * ------------------------------------------------------------
 * Two reasons, and both of them were visible to students.
 *
 * COST. `practice/generate` writes every paper from scratch — there is no pool
 * and no cache behind it, so opening a challenge was a guaranteed Gemini call
 * for two questions plus their full reference answers, every time, for every
 * student on the same topic. `/v1/collection/challenge/exam` asks the pool in
 * the RAG index FIRST and generates only the shortfall, so the second student
 * on a topic usually pays nothing, and serving least-served-first is what keeps
 * a retake from handing back the paper that was just failed.
 *
 * CORRECTNESS. `practice/generate` takes marks BANDS, not topics. This sent one
 * band labelled "Challenge", which matches no chapter in the index, so the
 * setter was free to range across the whole subject — an Oscillation challenge
 * came back with a question on Maxwell's equations. The challenge route builds
 * one band per topic the challenge covers, each drawing only on that topic's own
 * material, so it cannot happen.
 *
 * `exclude` is the worked examples this student was just shown: nothing about a
 * student is remembered upstream between calls, so the client walking the steps
 * is the only thing that knows the two requests belong to the same person.
 */
async function issueChallengeExam(input: {
  collectionKey: string;
  subject: string;
  topicKeys: string[];
  questionCount: number;
  durationMinutes: number;
  exclude?: string[];
}): Promise<TeacherChallengeExam> {
  const exam = await createTeacherChallengeExam(input.collectionKey, {
    subject: input.subject,
    topics: input.topicKeys,
    questions: Math.max(1, input.questionCount),
    duration_minutes: input.durationMinutes,
    pass_percent: CHALLENGE_PASS_PERCENT,
    exclude_questions: (input.exclude || []).filter(Boolean),
  });
  if (!exam.attempt_id || !exam.questions?.length) {
    throw new Error("The course API could not issue a live challenge exam.");
  }
  return exam;
}

async function requireChallengeAccess(userId: string, row: ChallengeRow) {
  const admin = createSupabaseAdminClient();
  const courseId = row.course_id ? String(row.course_id) : null;
  const subjectSlug = String(row.subject_slug || "");
  const access = courseId
    ? await getStudentCourseSubjectAccessForCourse(userId, courseId, subjectSlug, admin)
    : await getStudentCourseSubjectAccess(userId, subjectSlug, admin);
  if (!access) {
    throw new Error("You no longer have access to the course that assigned this challenge.");
  }
  return access;
}

type ChallengeAccess = Awaited<ReturnType<typeof requireChallengeAccess>>;

/**
 * A creator's collection key, memoized per teacher.
 *
 * It is one row on `teachers` that effectively never changes, and every single
 * challenge call — start, refresh, each progress tick, submit — was fetching it
 * again. TTL is short because a creator whose collection is provisioned mid-
 * session must not be told for an hour that it is "not ready yet".
 */
function collectionKeyForTeacher(teacherId: string) {
  // Local dev against a local api-service: the key in Supabase was issued by
  // production and means nothing to it. See lib/dev-collection-key.ts — this is
  // "" in every build that ships, so the memo below is the only real path.
  const devKey = devCollectionKey();
  if (devKey) return Promise.resolve(devKey);
  return memo(
    `challenge:collection-sk:${teacherId}`,
    async () => {
      const { data, error } = await createSupabaseAdminClient()
        .from("teachers")
        .select("collection_sk")
        .eq("id", teacherId)
        .maybeSingle();
      if (error) throw error;
      return String(data?.collection_sk || "").trim();
    },
    { ttlSeconds: 60, staleSeconds: 240 },
  );
}

/**
 * `access` is threaded through rather than re-resolved.
 *
 * `getStudentCourseSubjectAccessForCourse` is three to four sequential Supabase
 * round trips, and `startStudentChallenge` used to pay for it twice — once
 * directly and once again inside here — before a single upstream call had
 * started. The caller that has already authorized the row passes what it found.
 */
async function resolveChallengeLane(userId: string, row: ChallengeRow, known?: ChallengeAccess) {
  const access = known ?? (await requireChallengeAccess(userId, row));
  const collectionKey = await collectionKeyForTeacher(access.teacherId);
  if (!collectionKey) {
    throw new Error("This course creator's study collection is not ready yet.");
  }
  return { collectionKey, subject: access.subjectName || String(row.subject_name || "") };
}

function lessonParagraphs(content: string) {
  return content
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);
}

function warningText(...warnings: Array<string | null | undefined | string[]>) {
  return (
    warnings
      .flatMap((warning) => (Array.isArray(warning) ? warning : [warning]))
      .map((warning) => String(warning || "").trim())
      .filter(Boolean)
      .join(" ") || null
  );
}

function questionBankCoverage(payload: ApiRecord | null, topicKeys: string[]) {
  const topics = Array.isArray(payload?.topics) ? payload.topics : [];
  const requested = new Set(topicKeys.map((key) => key.trim().toLowerCase()).filter(Boolean));
  const topicQuestions = topics.reduce((sum, item) => {
    if (!item || typeof item !== "object") return sum;
    const row = item as ApiRecord;
    const key = String(row.topic_key || "")
      .trim()
      .toLowerCase();
    return requested.has(key) ? sum + number(row.qb_question_count) : sum;
  }, 0);
  return {
    totalQuestions: number(payload?.question_bank_questions),
    topicQuestions,
  };
}

function studentFacingSolvedWarning(
  solved: TeacherChallengeSolvedResponse,
  practiceTopics: ApiRecord | null,
  topicKeys: string[],
  topicTitle: string,
) {
  const providerWarning = warningText(solved.warnings);
  if (solved.grounded || !providerWarning) return providerWarning;

  const coverage = questionBankCoverage(practiceTopics, topicKeys);
  if (coverage.topicQuestions > 0) {
    return `Past questions are indexed for ${topicTitle}, but a complete worked solution could not be matched from them. These examples were prepared from the course notes.`;
  }
  if (coverage.totalQuestions > 0) {
    return `This course has an indexed Question Bank, but no past question is currently matched to ${topicTitle}. These examples were prepared from the course notes.`;
  }
  return providerWarning;
}

function contentWithExam(
  content: StudentChallengeContent,
  exam: TeacherChallengeExam,
  attemptNumber: number,
): StudentChallengeContent {
  return {
    ...content,
    examProvider: "challenge-exam-v1",
    examQuestions: (exam.questions || []).map(examQuestion),
    examExpiresAt: exam.expires_at,
    examAttemptNumber: attemptNumber,
    examWarning: warningText(content.examWarning, exam.warning),
  };
}

/**
 * Steps one and two — the syllabus ordering and the reading — and nothing else.
 *
 * This is deliberately everything the student can see BEFORE they need a worked
 * example, because it is what `/start` now waits for. The past questions cost no
 * model call at all (they are lifted off the subject's own question bank) and the
 * reading is usually served from the collection's cache, so this half is cheap.
 * The worked examples and the exam are built behind the response by
 * `runChallengeContentCompletion`, which returns here through `contentStatus`.
 */
/** The reading as the screen stores it. `null` while the tail is still building. */
function lessonFromReading(learning: TeacherChallengeLearnResponse | null) {
  if (!learning) {
    return {
      title: "",
      content: [] as string[],
      focus: "",
      bigIdea: "",
      connections: [] as string[],
      sources: [] as Array<{ title: string; source: string; excerpt: string }>,
    };
  }
  return {
    title: learning.reading.headline || "What you need to know",
    content: lessonParagraphs(learning.reading.content),
    focus: learning.reading.focus || "",
    bigIdea: learning.reading.big_idea || "",
    connections: (learning.reading.connections || []).filter(Boolean),
    sources: (learning.reading.sources || []).map((source) => ({
      title: source.chapter?.trim() || source.filename?.trim() || "Course material",
      source: source.source_path?.trim() || source.filename?.trim() || "Indexed source",
      excerpt: "",
    })),
  };
}

/** Fold a reading that arrived late into content that already carries step one. */
function contentWithReading(
  content: StudentChallengeContent,
  learning: TeacherChallengeLearnResponse,
): StudentChallengeContent {
  return {
    ...content,
    learningWarning: warningText(content.learningWarning, warningText(learning.warnings)),
    lesson: lessonFromReading(learning),
  };
}

function challengeLessonContent(
  pastQuestions: TeacherChallengePastQuestionsResponse,
  learning: TeacherChallengeLearnResponse | null,
): StudentChallengeContent {
  const topicKeys = (pastQuestions.topics || []).map((topic) => topic.topic_key).filter(Boolean);
  const topicTitle = pastQuestions.topics?.[0]?.title || "this topic";
  return {
    provider: "collection-challenge-v1",
    contentStatus: "pending",
    contentPendingSince: new Date().toISOString(),
    contentError: null,
    topicKeys,
    canStart: pastQuestions.can_start,
    pastQuestions: (pastQuestions.questions || []).map((question) => ({
      id: String(question.id || ""),
      question: String(question.text || ""),
      topic: question.topic || topicTitle,
      topicKey: question.topic_key || topicKeys[0] || "",
      // Never defaulted to a number. A marks figure the bank did not print is a
      // figure a student would read as the examiner's, and it would be ours.
      marks:
        question.marks === null || question.marks === undefined ? null : number(question.marks),
      year: question.year || "",
    })),
    pastQuestionNote: pastQuestions.note || "",
    pastQuestionSource: pastQuestions.topic_source,
    pastQuestionsGrounded: pastQuestions.grounded,
    pastQuestionBlockers: pastQuestions.blockers || [],
    pastQuestionWarnings: pastQuestions.warnings || [],
    learningWarning: learning ? warningText(learning.warnings) : null,
    solvedWarning: null,
    // `null` learning is the fast path: `/start` no longer waits on the reading,
    // so the lesson is an empty shell here and `contentWithReading` fills it in
    // from the background pass. An empty `content` array is what the screen reads
    // as "still building", the same signal the worked examples already use.
    lesson: lessonFromReading(learning),
    solvedExamples: [],
    examQuestions: [],
    warning: null,
  };
}

/** Step three, folded into content that already carries steps one and two. */
function contentWithSolved(
  content: StudentChallengeContent,
  solved: TeacherChallengeSolvedResponse,
  practiceTopics: ApiRecord | null,
  topicTitle: string,
): StudentChallengeContent {
  return {
    ...content,
    solvedWarning: studentFacingSolvedWarning(
      solved,
      practiceTopics,
      content.topicKeys || [],
      topicTitle,
    ),
    solvedExamples: (solved.questions || []).map(solvedExample),
  };
}

function hasLiveExam(detail: StudentChallengeDetail, externalAttemptId: string) {
  const content = detail.content;
  if (
    content?.provider !== "collection-challenge-v1" ||
    !content.examProvider ||
    !externalAttemptId ||
    !content.examExpiresAt
  ) {
    return false;
  }
  /**
   * The pooled exam sets questions at the marks value this subject's own
   * examiner uses (`_marks_each`, measured from its question bank), which is not
   * always ten. Pinning the check to `CHALLENGE_MARKS_PER_QUESTION` would call
   * every such paper stale and re-issue one on every open — so the marks shape
   * is only enforced for the legacy practice papers, which really were always
   * banded at ten.
   */
  const hasCurrentMarkingShape =
    content.examQuestions.length === CHALLENGE_QUESTIONS &&
    (content.examProvider === "challenge-exam-v1" ||
      content.examQuestions.every((question) => question.marks === CHALLENGE_MARKS_PER_QUESTION));
  if (!hasCurrentMarkingShape) return false;
  const expiresAt = Date.parse(content.examExpiresAt);
  return (
    Number.isFinite(expiresAt) &&
    expiresAt > Date.now() &&
    number(content.examAttemptNumber) > detail.attemptCount
  );
}

/**
 * Everything a student must wait for before the challenge screen can be drawn —
 * and nothing they will not look at for another two minutes.
 *
 * WHY THIS RETURNS BEFORE THE CHALLENGE IS FINISHED
 * -------------------------------------------------
 * It used to build all four steps in one request and measured about thirty
 * seconds: three to four Supabase round trips for access (paid TWICE, because
 * `resolveChallengeLane` re-resolved what this function had already resolved),
 * then a blocking step-one call, then a fan-out whose slowest leg wrote
 * two exam questions and their reference answers from scratch on every single
 * open. The student sat on a spinner for all of it and then landed on step one,
 * which needs none of it.
 *
 * So the wait is now only what the first two steps render: the topic's past
 * questions (no model call — they are lifted off the subject's own question
 * bank) and the reading (normally served from the collection's cache). The worked examples and
 * the exam are handed to `runChallengeContentCompletion` behind the response,
 * and they land while the student is still reading. `content.contentStatus` says
 * which state the row is in, and readers pick the rest up through
 * `getStudentChallengeContent` or through their next `/progress` write.
 *
 * The one path that still blocks is issuing a FRESH exam onto a challenge whose
 * lesson is already built — there the student is waiting for the paper itself,
 * so there is nothing to hide the wait behind.
 */
export async function startStudentChallenge(
  userId: string,
  challengeId: string,
  options: { restart?: boolean } = {},
): Promise<StudentChallengeDetail | null> {
  const admin = createSupabaseAdminClient();
  const { data: raw, error: loadError } = await admin
    .from("student_challenges")
    .select("*")
    .eq("id", challengeId)
    .eq("user_id", userId)
    .maybeSingle();
  if (loadError) throw loadError;
  if (!raw) return null;
  const row = raw as ChallengeRow;
  const access = await requireChallengeAccess(userId, row);
  const current = toDetail(row);
  const externalAttemptId = String(row.external_paper_id || "");
  const sourceDocumentTopic = isSourceDocumentChallengeRow(row);
  if (current.status === "completed" && !options.restart) {
    return withLatestAttemptReview(userId, row, current);
  }
  if (!sourceDocumentTopic) {
    // A build that has not finished is not a stale paper. Reopening a challenge
    // whose tail is still running must hand back the lesson that is already
    // there — never fall through and issue a second exam alongside the one the
    // background pass is about to write.
    if (current.content?.contentStatus === "pending" && !options.restart) {
      restartStaleContentCompletion(userId, challengeId, current.content);
      return current;
    }
    if (hasLiveExam(current, externalAttemptId)) return current;
    if (current.content?.provider === "collection-challenge-v1") {
      // A restart is the student explicitly asking for a fresh paper, so that one
      // is still awaited — they are asking for the exam itself and a stale set of
      // questions would be the wrong answer.
      if (options.restart) {
        return refreshStudentChallengeExam(userId, challengeId, {
          allowCompleted: true,
          access,
        });
      }
      // A plain reopen is not. The lesson is already written and is what the
      // student is about to read; the paper is issued behind them rather than in
      // front of them.
      scheduleChallengeExamRefresh(userId, challengeId, access);
      return current;
    }
  }

  const lane = await resolveChallengeLane(userId, row, access);
  const topicRequest = {
    subject: lane.subject,
    // A legacy row may point at the uploaded QB/syllabus file itself. Let the
    // provider choose a real syllabus topic instead of building a challenge on
    // a document container.
    topics: sourceDocumentTopic
      ? []
      : [String(row.topic_key || row.topic_title || "")].filter(Boolean),
    // How many past questions step one shows — enough to recognise the shape of
    // what gets asked, few enough to read before starting the reading.
    limit: CHALLENGE_PAST_QUESTIONS,
  };
  let pastQuestions: TeacherChallengePastQuestionsResponse;
  try {
    pastQuestions = await getTeacherChallengePastQuestions(lane.collectionKey, topicRequest);
  } catch (error) {
    if (!(error instanceof TeacherApiError) || ![404, 422].includes(error.status)) throw error;
    /**
     * THE SUBTOPIC IS TRIED TWICE BEFORE IT IS GIVEN UP ON.
     *
     * A daily row assigned before this subject's catalogue was re-extracted can
     * carry a key the provider no longer knows. Sending `topics: []` at that
     * point does work — the provider picks its most heavily examined chapter —
     * but that chapter is a UNIT, so the challenge silently stops being about a
     * subtopic at all, and the student is handed a week of the course with no
     * sign anything changed.
     *
     * The provider resolves a topic by key OR by the title a student sees, so
     * the title is a second, better shot at the same subtopic: a re-extraction
     * that renumbers keys almost never renames "Ohm's law". Only when that also
     * misses is the choice handed over.
     */
    const topicTitle = String(row.topic_title || "").trim();
    if (topicTitle && !sourceDocumentTopic) {
      try {
        pastQuestions = await getTeacherChallengePastQuestions(lane.collectionKey, {
          ...topicRequest,
          topics: [topicTitle],
        });
      } catch (retryError) {
        if (!(retryError instanceof TeacherApiError) || ![404, 422].includes(retryError.status)) {
          throw retryError;
        }
        pastQuestions = await getTeacherChallengePastQuestions(lane.collectionKey, {
          ...topicRequest,
          topics: [],
        });
      }
    } else {
      pastQuestions = await getTeacherChallengePastQuestions(lane.collectionKey, {
        ...topicRequest,
        topics: [],
      });
    }
  }
  if (!pastQuestions.can_start) {
    throw new Error(
      "This topic is not taught by the course material yet, so its challenge cannot start.",
    );
  }
  const selectedTopic = pastQuestions.topics?.[0];
  const selectedTopicKeys = (pastQuestions.topics || [])
    .map((topic) => topic.topic_key)
    .filter(Boolean);
  // Deliberately AFTER the past questions, not alongside them. Overlapping the two
  // would halve this wait, but the reading is a model call and `can_start` is not
  // known until the past questions come back — so a speculative reading is paid
  // for in full every time a challenge cannot start or the provider is down.
  // `keeps the assignment intact when the provider is unavailable` pins that: it
  // asserts the reading is never called when step one fails.
  const learning = await getTeacherChallengeReading(lane.collectionKey, {
    subject: lane.subject,
    topics: selectedTopicKeys,
  });
  const title = String(selectedTopic?.title || row.topic_title || lane.subject);
  const content = challengeLessonContent(pastQuestions, learning);
  const now = new Date().toISOString();
  const { data, error } = await admin
    .from("student_challenges")
    .update({
      status: "started",
      // The previous sitting's paper is gone the moment its lesson is rebuilt;
      // leaving the id behind would let `hasLiveExam` claim a live exam that no
      // longer has questions on the row.
      external_paper_id: null,
      content,
      ...(selectedTopic
        ? {
            topic_key: selectedTopic.topic_key,
            topic_title: selectedTopic.title,
            title,
          }
        : {}),
      started_at: now,
      updated_at: now,
    })
    .eq("id", challengeId)
    .eq("user_id", userId)
    .select("*")
    .single();
  if (error) throw error;
  scheduleChallengeContentCompletion(userId, challengeId);
  return toDetail(data as ChallengeRow);
}

/**
 * The half of a challenge the student is not looking at yet: its worked examples
 * and its exam. Runs behind `/start`'s response.
 *
 * The exam goes AFTER the worked examples rather than beside them, because it
 * must not re-ask what the student was just shown the solution to — `exclude`
 * carries those question texts, and nothing about a student is remembered
 * upstream between two calls, so this is the only place that knows the two
 * requests belong to one person. Same ordering, and the same reason, as the
 * course API's own composite route.
 */
async function runChallengeContentCompletion(
  userId: string,
  challengeId: string,
): Promise<StudentChallengeDetail | null> {
  const admin = createSupabaseAdminClient();
  const { data: raw, error: loadError } = await admin
    .from("student_challenges")
    .select("*")
    .eq("id", challengeId)
    .eq("user_id", userId)
    .maybeSingle();
  if (loadError) throw loadError;
  if (!raw) return null;
  const row = raw as ChallengeRow;
  const detail = toDetail(row);
  let pending = detail.content;
  // Another process may have finished it between the schedule and this run.
  if (!pending || pending.contentStatus !== "pending") return detail;

  const access = await requireChallengeAccess(userId, row);
  const lane = await resolveChallengeLane(userId, row, access);
  const topicKeys = pending.topicKeys?.length
    ? pending.topicKeys
    : [String(row.topic_key || "")].filter(Boolean);
  const topicTitle = String(row.topic_title || detail.topicTitle || "this topic");

  try {
    // A row written before `/start` carried the reading (or one whose reading call
    // failed) still has an empty lesson here. Refetched alongside the worked
    // examples rather than before them: they share no inputs, and in the normal
    // case there is nothing to fetch at all.
    const needsReading = !pending.lesson?.content?.length;
    const [learning, solved] = await Promise.all([
      needsReading
        ? getTeacherChallengeReading(lane.collectionKey, {
            subject: lane.subject,
            topics: topicKeys,
          }).catch(() => null)
        : Promise.resolve(null),
      getTeacherChallengeSolvedQuestions(lane.collectionKey, {
        subject: lane.subject,
        topics: topicKeys,
        limit: 2,
      }),
    ]);
    if (learning) pending = contentWithReading(pending, learning);
    // Only fetched when it can change what the student is told. It exists to
    // phrase ONE warning — whether the thin worked examples mean "no past paper
    // covers this topic" or "this course has no question bank at all" — and
    // fetching it for a grounded response bought nothing.
    const practiceTopics = solved.grounded
      ? null
      : await getTeacherPracticeTopics(lane.collectionKey, lane.subject, {
          totalMarks: CHALLENGE_QUESTIONS * CHALLENGE_MARKS_PER_QUESTION,
          maxQuestions: CHALLENGE_QUESTIONS,
        }).catch(() => null);
    const exam = await issueChallengeExam({
      collectionKey: lane.collectionKey,
      subject: lane.subject,
      topicKeys,
      questionCount: CHALLENGE_QUESTIONS,
      durationMinutes: number(row.duration_minutes) || 20,
      exclude: (solved.questions || []).map((question) => question.text),
    });
    const content: StudentChallengeContent = {
      ...contentWithExam(
        contentWithSolved(pending, solved, practiceTopics, topicTitle),
        exam,
        number(row.attempt_count) + 1,
      ),
      contentStatus: "ready",
      contentPendingSince: undefined,
      contentError: null,
    };
    const now = new Date().toISOString();
    const { data, error } = await admin
      .from("student_challenges")
      .update({
        external_paper_id: exam.attempt_id,
        content,
        total_marks: exam.total_marks,
        pass_marks: exam.pass_marks,
        duration_minutes: exam.duration_minutes,
        // The clock the student sees starts when the paper exists, not when the
        // lesson did — otherwise every second spent building this ate into the
        // twenty minutes they are given to sit it.
        started_at: now,
        updated_at: now,
      })
      .eq("id", challengeId)
      .eq("user_id", userId)
      .select("*")
      .single();
    if (error) throw error;
    return toDetail(data as ChallengeRow);
  } catch (cause) {
    const message =
      cause instanceof Error ? cause.message : "Could not finish preparing this challenge.";
    console.warn(`[challenge] background completion failed for ${challengeId}: ${message}`);
    // The row stays `pending` with the failure recorded on it: the lesson the
    // student is reading is real and must not be thrown away, and a reader can
    // ask for the tail again. Re-stamping the clock is what lets the stale
    // re-kick retry rather than hammering a failing upstream.
    const { data } = await admin
      .from("student_challenges")
      .update({
        content: {
          ...pending,
          contentStatus: "pending",
          contentPendingSince: new Date().toISOString(),
          contentError: message,
        } satisfies StudentChallengeContent,
        updated_at: new Date().toISOString(),
      })
      .eq("id", challengeId)
      .eq("user_id", userId)
      .select("*")
      .maybeSingle();
    return data ? toDetail(data as ChallengeRow) : detail;
  } finally {
    completionsInFlight.delete(challengeId);
  }
}

/**
 * Hand the tail of the build to the runtime and return immediately.
 *
 * `after()` is what keeps the work alive past the response without holding the
 * response open. Outside a request scope it throws — a cron, a test — and there
 * the promise is already running under its own steam, so the throw is caught
 * and ignored rather than guarded with a framework check.
 */
function scheduleChallengeContentCompletion(userId: string, challengeId: string) {
  if (completionsInFlight.has(challengeId)) return;
  const task = runChallengeContentCompletion(userId, challengeId).catch(() => null);
  completionsInFlight.set(challengeId, task);
  try {
    after(() => task);
  } catch {
    // Not in a request scope. The work is under way regardless.
  }
}

/**
 * Re-issue an expired exam WITHOUT the student waiting on it.
 *
 * Reopening a challenge used to await `refreshStudentChallengeExam`, which issues
 * a paper through the tenant API on a 120s timeout. That is the whole reason
 * "Continue" sat on `Opening…` — and it bought nothing, because a reopened
 * challenge lands on step 1 (past questions) and the exam is not read until step
 * 3. The student was blocked on a model call for a screen two steps away.
 *
 * So the lesson is handed back immediately and the paper is issued behind it, the
 * same shape `/start` already uses for the worked examples. `examRefreshInFlight`
 * is what stops a second open (or an impatient double click) from issuing a
 * second paper alongside the one already on its way — the same race
 * `refreshStudentChallengeExam` guards against for a pending build.
 */
const examRefreshInFlight = new Map<string, Promise<StudentChallengeDetail | null>>();

function scheduleChallengeExamRefresh(userId: string, challengeId: string, access: ChallengeAccess) {
  if (examRefreshInFlight.has(challengeId) || completionsInFlight.has(challengeId)) return;
  const task = refreshStudentChallengeExam(userId, challengeId, { access })
    .catch(() => null)
    .finally(() => {
      examRefreshInFlight.delete(challengeId);
    });
  examRefreshInFlight.set(challengeId, task);
  try {
    after(() => task);
  } catch {
    // Not in a request scope. The work is under way regardless.
  }
}

/**
 * Re-run a completion whose owning process went away.
 *
 * Nothing here is a retry loop: a build that is merely slow is left alone, and
 * only a row that has been `pending` past `CONTENT_PENDING_STALE_MS` — a deploy
 * mid-build, a crash, an upstream that failed and recorded it — is picked up
 * again. `force` is the student pressing the retry the failure surfaced.
 */
function restartStaleContentCompletion(
  userId: string,
  challengeId: string,
  content: StudentChallengeContent,
  force = false,
) {
  if (content.contentStatus !== "pending") return;
  if (completionsInFlight.has(challengeId)) return;
  const since = Date.parse(content.contentPendingSince || "");
  const stale = !Number.isFinite(since) || Date.now() - since > CONTENT_PENDING_STALE_MS;
  if (!force && !stale) return;
  scheduleChallengeContentCompletion(userId, challengeId);
}

/**
 * The current state of a challenge, for a client waiting on its background half.
 *
 * Cheap by design — one row read and the access check — because the challenge
 * screen polls it while the student reads. It also re-kicks a build that has
 * gone stale, so a student who was mid-open during a deploy is not left holding
 * a challenge that never finishes.
 */
export async function getStudentChallengeContent(
  userId: string,
  challengeId: string,
  options: { retry?: boolean } = {},
): Promise<StudentChallengeDetail | null> {
  const { data: raw, error } = await createSupabaseAdminClient()
    .from("student_challenges")
    .select("*")
    .eq("id", challengeId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  if (!raw) return null;
  const row = raw as ChallengeRow;
  await requireChallengeAccess(userId, row);
  const detail = toDetail(row);
  if (detail.content) {
    restartStaleContentCompletion(userId, challengeId, detail.content, options.retry);
  }
  if (detail.status === "completed") return withLatestAttemptReview(userId, row, detail);
  return detail;
}

/** Reopens a completed challenge with a fresh sitting; prior attempts remain durable. */
export async function restartStudentChallenge(userId: string, challengeId: string) {
  const detail = await getStudentChallenge(userId, challengeId);
  if (!detail) return null;
  if (detail.status !== "completed") return startStudentChallenge(userId, challengeId);
  return startStudentChallenge(userId, challengeId, { restart: true });
}

/** Issues a fresh saved paper while retaining the durable learning steps. */
export async function refreshStudentChallengeExam(
  userId: string,
  challengeId: string,
  options: { allowCompleted?: boolean; access?: ChallengeAccess } = {},
) {
  const admin = createSupabaseAdminClient();
  const { data: raw, error: loadError } = await admin
    .from("student_challenges")
    .select("*")
    .eq("id", challengeId)
    .eq("user_id", userId)
    .maybeSingle();
  if (loadError) throw loadError;
  if (!raw) return null;
  const row = raw as ChallengeRow;
  const access = options.access ?? (await requireChallengeAccess(userId, row));
  const detail = toDetail(row);
  if (detail.status === "completed" && !options.allowCompleted) return detail;
  if (detail.content?.provider !== "collection-challenge-v1") {
    return startStudentChallenge(userId, challengeId, { restart: options.allowCompleted });
  }
  // A lesson whose tail is still building already has an exam on the way. Issuing
  // a second one here would race that write and leave the row pointing at an
  // attempt whose questions it never stored.
  if (detail.content.contentStatus === "pending") {
    restartStaleContentCompletion(userId, challengeId, detail.content);
    return detail;
  }

  const lane = await resolveChallengeLane(userId, row, access);
  const exam = await issueChallengeExam({
    collectionKey: lane.collectionKey,
    subject: lane.subject,
    topicKeys: detail.content.topicKeys?.length
      ? detail.content.topicKeys
      : [String(row.topic_key || "")].filter(Boolean),
    questionCount: CHALLENGE_QUESTIONS,
    durationMinutes: detail.durationMinutes,
    // A retake must not be handed the worked examples as its paper. The pool
    // serves least-served-first, so this mostly matters on a thin topic.
    exclude: (detail.content.solvedExamples || []).map((example) => example.question),
  });
  if (!exam.attempt_id || !exam.questions?.length) {
    throw new Error("The course API could not issue a fresh challenge exam.");
  }
  const content = contentWithExam(detail.content, exam, detail.attemptCount + 1);
  const now = new Date().toISOString();
  const { data, error } = await admin
    .from("student_challenges")
    .update({
      status: "started",
      external_paper_id: exam.attempt_id,
      content,
      total_marks: exam.total_marks,
      pass_marks: exam.pass_marks,
      duration_minutes: exam.duration_minutes,
      started_at: now,
      updated_at: now,
    })
    .eq("id", challengeId)
    .eq("user_id", userId)
    .select("*")
    .single();
  if (error) throw error;
  return toDetail(data as ChallengeRow);
}

export function challengeExamExpired(challenge: StudentChallengeDetail) {
  const expiresAt = Date.parse(challenge.content?.examExpiresAt || "");
  return Number.isFinite(expiresAt) && expiresAt <= Date.now();
}

export async function submitStudentChallengeAttempt(input: {
  userId: string;
  challengeId: string;
  answers: Array<{ questionId: string; answerText: string }>;
}): Promise<TeacherChallengeGradeResponse> {
  const admin = createSupabaseAdminClient();
  const { data: raw, error } = await admin
    .from("student_challenges")
    .select("*")
    .eq("id", input.challengeId)
    .eq("user_id", input.userId)
    .maybeSingle();
  if (error) throw error;
  if (!raw) throw new Error("Challenge not found.");
  const row = raw as ChallengeRow;
  const attemptId = String(row.external_paper_id || "");
  if (!attemptId) throw new Error("Start the challenge before submitting it.");
  const detail = toDetail(row);
  const lane = await resolveChallengeLane(input.userId, row);
  const answers = input.answers.map((answer) => ({
    question_id: answer.questionId,
    answer_text: answer.answerText,
  }));
  if (detail.content?.examProvider !== "challenge-exam-v1") {
    const graded = await gradeTeacherPracticePaper(lane.collectionKey, attemptId, {
      student_name: "Student",
      answers,
    });
    return practiceGradeAsChallengeGrade(graded, attemptId, lane.subject, number(row.pass_marks));
  }
  try {
    return await submitTeacherChallengeExam(lane.collectionKey, attemptId, { answers });
  } catch (cause) {
    if (!isLostChallengeAttempt(cause)) throw cause;
    return gradeChallengeFromStoredQuestions({
      collectionKey: lane.collectionKey,
      subject: lane.subject,
      attemptId,
      questions: detail.content?.examQuestions || [],
      passMarks: number(row.pass_marks),
      answers: input.answers,
    });
  }
}

/**
 * Whether an upstream failure means "that sitting is gone", not "that was wrong".
 *
 * The pooled challenge exam holds its attempt in the course API's memory — a map
 * capped at 500 entries, cleared by a restart — so a deploy during a student's
 * twenty minutes takes the paper out from under them. That reads as a 404 or a
 * 410 on submit, and it is the one upstream failure this app answers by marking
 * the sitting itself rather than by handing back an error.
 */
function isLostChallengeAttempt(cause: unknown) {
  return cause instanceof TeacherApiError && [404, 410].includes(cause.status);
}

/**
 * Mark a sitting from the questions this app stored, when the upstream attempt
 * that held them is gone.
 *
 * `/api/v1/practice/grade` is self-contained: it takes each question, its marks
 * and the student's answer, and needs no stored paper behind it. What it does
 * not get here is the reference answer — the exam response withholds those by
 * design, so the paper cannot be read out of its own response — which makes this
 * marking a shade less exact than `/exam/{id}/submit`. That is the right trade
 * against telling a student who has just written for twenty minutes that their
 * answers cannot be marked at all.
 */
async function gradeChallengeFromStoredQuestions(input: {
  collectionKey: string;
  subject: string;
  attemptId: string;
  questions: ChallengeExamQuestion[];
  passMarks: number;
  answers: Array<{ questionId: string; answerText: string }>;
}): Promise<TeacherChallengeGradeResponse> {
  if (!input.questions.length) {
    throw new Error(
      "This sitting expired on the course server and its questions are no longer available. Start a fresh exam.",
    );
  }
  const answerFor = new Map(input.answers.map((answer) => [answer.questionId, answer.answerText]));
  const graded = await gradeTeacherAnswers(input.collectionKey, {
    items: input.questions.map((question) => ({
      question_id: question.id,
      question: question.question,
      marks: question.marks,
      chapter: question.topic,
      student_answer: answerFor.get(question.id) || "",
    })),
  });
  return standaloneGradeAsChallengeGrade(
    graded,
    input.attemptId,
    input.subject,
    input.passMarks,
    answerFor,
  );
}

function standaloneGradeAsChallengeGrade(
  graded: TeacherStandaloneGradeResponse,
  attemptId: string,
  subject: string,
  passMarks: number,
  answerFor: Map<string, string>,
): TeacherChallengeGradeResponse {
  const totalScore = number(graded.total_score);
  const totalMarks = number(graded.total_marks);
  return {
    attempt_id: attemptId,
    subject,
    results: (graded.results || []).map((result) => ({
      question_id: result.question_id,
      topic: result.chapter || "",
      question: result.question,
      marks: number(result.marks),
      student_answer: answerFor.get(result.question_id) || "",
      score: number(result.score),
      feedback: result.feedback,
    })),
    total_score: totalScore,
    total_marks: totalMarks,
    percentage: totalMarks > 0 ? (totalScore / totalMarks) * 100 : 0,
    pass_marks: passMarks,
    passed: graded.graded && totalScore >= passMarks,
    graded: graded.graded,
    stored: false,
    evaluation: graded.evaluation,
  };
}

function practiceGradeAsChallengeGrade(
  graded: TeacherPracticePaperGradeResponse,
  setId: string,
  subject: string,
  passMarks: number,
): TeacherChallengeGradeResponse {
  const totalScore = number(graded.total_score);
  const totalMarks = number(graded.total_marks);
  return {
    attempt_id: setId,
    subject,
    results: (graded.results || []).map((result) => ({
      ...result,
      topic: result.chapter || "",
    })),
    total_score: totalScore,
    total_marks: totalMarks,
    percentage: totalMarks > 0 ? (totalScore / totalMarks) * 100 : 0,
    pass_marks: passMarks,
    passed: totalScore >= passMarks,
    graded: graded.graded,
    stored: true,
    evaluation: graded.evaluation,
  };
}

export async function submitStudentChallengeFile(input: {
  userId: string;
  challengeId: string;
  studentName: string;
  file: { name: string; mimeType: string; buffer: Buffer };
}) {
  const admin = createSupabaseAdminClient();
  const { data: raw, error } = await admin
    .from("student_challenges")
    .select("*")
    .eq("id", input.challengeId)
    .eq("user_id", input.userId)
    .maybeSingle();
  if (error) throw error;
  if (!raw) throw new Error("Challenge not found.");
  const row = raw as ChallengeRow;
  const attemptId = String(row.external_paper_id || "");
  if (!attemptId) throw new Error("Start the challenge before submitting it.");
  const detail = toDetail(row);
  const lane = await resolveChallengeLane(input.userId, row);
  if (detail.content?.examProvider === "challenge-exam-v1") {
    // No stored-question fallback on this one: reading the answers off the scan
    // is the upstream's job and there is no local copy of what the student wrote.
    return submitTeacherChallengeExamFile(lane.collectionKey, attemptId, {
      studentName: input.studentName,
      file: input.file,
    });
  }
  const graded = await gradeTeacherPracticePaperFile(lane.collectionKey, attemptId, {
    studentName: input.studentName,
    file: input.file,
  });
  return practiceGradeAsChallengeGrade(graded, attemptId, lane.subject, number(row.pass_marks));
}

export async function markStudentChallengeStep(
  userId: string,
  challengeId: string,
  step: "lesson" | "examples",
) {
  const admin = createSupabaseAdminClient();
  const { data: current, error: currentError } = await admin
    .from("student_challenges")
    .select("status,content,lesson_read_at,course_id,subject_slug")
    .eq("id", challengeId)
    .eq("user_id", userId)
    .maybeSingle();
  if (currentError) throw currentError;
  if (!current) return null;
  await requireChallengeAccess(userId, current as ChallengeRow);
  if (!current.content) throw new Error("Start the challenge before saving progress.");
  if (step === "examples" && !current.lesson_read_at) {
    throw new Error("Finish the lesson before reviewing examples.");
  }
  const now = new Date().toISOString();
  const column = step === "lesson" ? "lesson_read_at" : "examples_reviewed_at";
  const { data, error } = await admin
    .from("student_challenges")
    .update({
      [column]: now,
      status: current.status === "completed" ? "completed" : "started",
      updated_at: now,
    })
    .eq("id", challengeId)
    .eq("user_id", userId)
    .select("*")
    .maybeSingle();
  if (error) throw error;
  return data ? toDetail(data as ChallengeRow) : null;
}

export async function recordStudentChallengeGrade(input: {
  userId: string;
  challengeId: string;
  attemptId: string;
  score: number;
  totalMarks: number;
  passed: boolean;
}) {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.rpc("record_student_challenge_grade", {
    target_user_id: input.userId,
    target_challenge_id: input.challengeId,
    target_attempt_id: input.attemptId,
    earned_score: input.score,
    available_marks: input.totalMarks,
    did_pass: input.passed,
  });
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  return row ? toDetail(row as ChallengeRow) : null;
}
