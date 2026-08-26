import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import {
  getStudentCourseSubjectAccess,
  getStudentCourseSubjectAccessForCourse,
} from "@/lib/student-courses";
import {
  createTeacherChallenge,
  createTeacherChallengeExam,
  submitTeacherChallengeExam,
  TeacherApiError,
  type TeacherChallengeExam,
  type TeacherChallengeGradeResponse,
  type TeacherChallengeResponse,
  type TeacherChallengeSolvedQuestion,
} from "@/lib/teacher-app/client";

const UNDEFINED_TABLE = "42P01";
const POSTGREST_MISSING_TABLE = "PGRST205";
export const CHALLENGE_PASS_PERCENT = 40;

export function isMissingChallengeTable(error: { code?: string } | null) {
  return error?.code === UNDEFINED_TABLE || error?.code === POSTGREST_MISSING_TABLE;
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
  reason: string;
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

export type ChallengePrerequisite = {
  topicKey: string;
  title: string;
  taught: boolean;
  reason: string;
};

export type ChallengeExamQuestion = {
  id: string;
  question: string;
  topic: string;
  marks: number;
  questionType: string;
};

export type StudentChallengeContent = {
  provider?: "collection-challenge-v1";
  upstreamChallengeId?: string;
  topicKeys?: string[];
  canStart?: boolean;
  prerequisites?: ChallengePrerequisite[];
  lesson: {
    title: string;
    content: string[];
    focus: string;
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
};

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
    title: topicTitle === rawTopicTitle
      ? String(row.title ?? "")
      : `Master ${topicTitle}`,
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
  return { ...toSummary(row), content };
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
    String(row.subject_slug ?? "").trim().toLowerCase(),
    String(row.topic_key ?? "").trim().toLowerCase(),
  ].join(":");
}

/**
 * Keeps three real, unfinished challenges in today's queue. Completed rows stay
 * immutable for history/metrics, while the next unused recommendation is
 * inserted as a fresh assignment and sorts above the older active rows.
 */
export async function ensureDailyChallenges(
  userId: string,
  recommendations: ChallengeRecommendation[],
): Promise<StudentChallengeSummary[]> {
  const date = nepaliChallengeDate();
  const existing = await listDailyRows(userId, date);
  if (existing === null) return [];

  const active = existing.filter((row) => row.status !== "completed");
  const assignedKeys = new Set(existing.map(rowRecommendationKey));
  const available = recommendations.filter(
    (recommendation) => !assignedKeys.has(recommendationKey(recommendation)),
  );
  const openSlots = Math.max(0, 3 - active.length);
  const selected = available.slice(0, openSlots);

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
      title: `Master ${topicTitle}`,
      recommendation_reason: recommendation.reason,
      duration_minutes: 20,
    };
  });
  const { error } = await admin.from("student_challenges").insert(rows);
  if (error?.code === "23505") {
    const concurrent = (await listDailyRows(userId, date)) ?? [];
    return concurrent
      .filter((row) => row.status !== "completed")
      .sort((left, right) => {
        const created = String(right.created_at ?? "").localeCompare(String(left.created_at ?? ""));
        return created || number(left.position) - number(right.position);
      })
      .map(toSummary);
  }
  if (error) throw error;

  return (((await listDailyRows(userId, date)) ?? []) as ChallengeRow[])
    .filter((row) => row.status !== "completed")
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
) {
  const admin = createSupabaseAdminClient();
  const requestedPage = Math.max(1, Math.floor(page));
  const from = (requestedPage - 1) * pageSize;
  const { data, error, count } = await admin
    .from("student_challenges")
    .select("*", { count: "exact" })
    .eq("user_id", userId)
    .eq("status", "completed")
    .order("completed_at", { ascending: false })
    .order("created_at", { ascending: false })
    .range(from, from + pageSize - 1);
  if (isMissingChallengeTable(error)) {
    return { challenges: [], page: 1, total: 0, totalPages: 0 };
  }
  if (error) throw error;

  const total = count ?? 0;
  const totalPages = total ? Math.ceil(total / pageSize) : 0;
  if (totalPages > 0 && requestedPage > totalPages) {
    return listCompletedStudentChallenges(userId, totalPages, pageSize);
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
  return data ? toDetail(data as ChallengeRow) : null;
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

async function resolveChallengeLane(userId: string, row: ChallengeRow) {
  const admin = createSupabaseAdminClient();
  const courseId = row.course_id ? String(row.course_id) : null;
  const subjectSlug = String(row.subject_slug || "");
  const access = courseId
    ? await getStudentCourseSubjectAccessForCourse(userId, courseId, subjectSlug, admin)
    : await getStudentCourseSubjectAccess(userId, subjectSlug, admin);
  if (!access) {
    throw new Error("You no longer have access to the course that assigned this challenge.");
  }

  const { data: teacher, error } = await admin
    .from("teachers")
    .select("collection_sk")
    .eq("id", access.teacherId)
    .maybeSingle();
  if (error) throw error;
  const collectionKey = String(teacher?.collection_sk || "").trim();
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
  return warnings
    .flatMap((warning) => (Array.isArray(warning) ? warning : [warning]))
    .map((warning) => String(warning || "").trim())
    .filter(Boolean)
    .join(" ") || null;
}

function contentWithExam(
  content: StudentChallengeContent,
  exam: TeacherChallengeExam,
  attemptNumber: number,
): StudentChallengeContent {
  return {
    ...content,
    examQuestions: (exam.questions || []).map(examQuestion),
    examExpiresAt: exam.expires_at,
    examAttemptNumber: attemptNumber,
    warning: warningText(content.warning, exam.warning),
  };
}

function challengeContent(
  response: TeacherChallengeResponse,
  attemptNumber: number,
): StudentChallengeContent {
  return contentWithExam(
    {
      provider: "collection-challenge-v1",
      upstreamChallengeId: response.challenge_id,
      topicKeys: (response.topics || []).map((topic) => topic.topic_key).filter(Boolean),
      canStart: response.can_start,
      prerequisites: (response.prerequisites || []).map((prerequisite) => ({
        topicKey: prerequisite.topic_key,
        title: prerequisite.title,
        taught: prerequisite.taught,
        reason: prerequisite.reason,
      })),
      lesson: {
        title: response.reading.headline || "What you need to know",
        content: lessonParagraphs(response.reading.content),
        focus: response.reading.focus || "",
        sources: (response.reading.sources || []).map((source) => ({
          title: source.chapter?.trim() || source.filename?.trim() || "Course material",
          source: source.source_path?.trim() || source.filename?.trim() || "Indexed source",
          excerpt: "",
        })),
      },
      solvedExamples: (response.solved_questions || []).map(solvedExample),
      examQuestions: [],
      warning: warningText(response.warnings),
    },
    response.exam,
    attemptNumber,
  );
}

function hasLiveExam(detail: StudentChallengeDetail, externalAttemptId: string) {
  if (
    detail.content?.provider !== "collection-challenge-v1" ||
    !externalAttemptId ||
    !detail.content.examExpiresAt
  ) {
    return false;
  }
  const expiresAt = Date.parse(detail.content.examExpiresAt);
  return (
    Number.isFinite(expiresAt) &&
    expiresAt > Date.now() &&
    number(detail.content.examAttemptNumber) > detail.attemptCount
  );
}

/** Lazily materializes grounded content so unopened daily cards cost no AI work. */
export async function startStudentChallenge(
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
  const current = toDetail(row);
  const externalAttemptId = String(row.external_paper_id || "");
  if (current.status === "completed" || hasLiveExam(current, externalAttemptId)) return current;
  if (current.content?.provider === "collection-challenge-v1") {
    return refreshStudentChallengeExam(userId, challengeId);
  }

  const lane = await resolveChallengeLane(userId, row);
  const challengeRequest = {
    subject: lane.subject,
    topics: [String(row.topic_key || row.topic_title || "")].filter(Boolean),
    prerequisite_limit: 3,
    solved_questions: 2,
    exam_questions: 2,
    duration_minutes: number(row.duration_minutes) || 20,
    pass_percent: CHALLENGE_PASS_PERCENT,
  };
  let response: TeacherChallengeResponse;
  try {
    response = await createTeacherChallenge(lane.collectionKey, challengeRequest);
  } catch (error) {
    // Daily rows assigned before the collection-scoped wiring may carry a
    // legacy topic key. Let the API choose the real highest-weight topic once.
    if (!(error instanceof TeacherApiError) || ![404, 422].includes(error.status)) throw error;
    response = await createTeacherChallenge(lane.collectionKey, {
      ...challengeRequest,
      topics: [],
    });
  }
  if (!response.can_start || !response.exam?.attempt_id || !response.exam.questions?.length) {
    throw new Error("This topic is not taught by the course material yet, so its challenge cannot start.");
  }
  const content = challengeContent(response, number(row.attempt_count) + 1);
  const selectedTopic = response.topics?.[0];
  const now = new Date().toISOString();
  const { data, error } = await admin
    .from("student_challenges")
    .update({
      status: "started",
      external_paper_id: response.exam.attempt_id,
      content,
      total_marks: response.exam.total_marks,
      pass_marks: response.exam.pass_marks,
      duration_minutes: response.exam.duration_minutes,
      ...(selectedTopic
        ? {
            topic_key: selectedTopic.topic_key,
            topic_title: selectedTopic.title,
            title: response.title || `Master ${selectedTopic.title}`,
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
  return toDetail(data as ChallengeRow);
}

/** Issues a fresh in-memory sitting while retaining the durable learning steps. */
export async function refreshStudentChallengeExam(userId: string, challengeId: string) {
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
  if (detail.status === "completed") return detail;
  if (detail.content?.provider !== "collection-challenge-v1") {
    return startStudentChallenge(userId, challengeId);
  }

  const lane = await resolveChallengeLane(userId, row);
  const exam = await createTeacherChallengeExam(lane.collectionKey, {
    subject: lane.subject,
    topics:
      detail.content.topicKeys?.filter(Boolean) ||
      [String(row.topic_key || row.topic_title || "")].filter(Boolean),
    questions: 2,
    duration_minutes: detail.durationMinutes,
    pass_percent: CHALLENGE_PASS_PERCENT,
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
  const lane = await resolveChallengeLane(input.userId, row);
  return submitTeacherChallengeExam(lane.collectionKey, attemptId, {
    answers: input.answers.map((answer) => ({
      question_id: answer.questionId,
      answer_text: answer.answerText,
    })),
  });
}

export async function markStudentChallengeStep(
  userId: string,
  challengeId: string,
  step: "lesson" | "examples",
) {
  const admin = createSupabaseAdminClient();
  const { data: current, error: currentError } = await admin
    .from("student_challenges")
    .select("status, content, lesson_read_at")
    .eq("id", challengeId)
    .eq("user_id", userId)
    .maybeSingle();
  if (currentError) throw currentError;
  if (!current) return null;
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
