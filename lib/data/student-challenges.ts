import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import {
  getStudentCourseSubjectAccess,
  getStudentCourseSubjectAccessForCourse,
} from "@/lib/student-courses";
import {
  generateTeacherPracticePaper,
  gradeTeacherPracticePaper,
  gradeTeacherPracticePaperFile,
  getTeacherChallengePrerequisites,
  getTeacherChallengeReading,
  getTeacherChallengeSolvedQuestions,
  getTeacherPracticeTopics,
  TeacherApiError,
  type ApiRecord,
  type TeacherChallengeExam,
  type TeacherChallengeGradeResponse,
  type TeacherChallengeLearnResponse,
  type TeacherChallengePrerequisitesResponse,
  type TeacherChallengeSolvedQuestion,
  type TeacherChallengeSolvedResponse,
  type TeacherPracticePaperGradeResponse,
} from "@/lib/teacher-app/client";
import { isChallengeSourceDocumentTopic } from "@/lib/challenge-topics";
import type { PracticeEvaluation } from "@/lib/tenant/client";

const UNDEFINED_TABLE = "42P01";
const POSTGREST_MISSING_TABLE = "PGRST205";
export const CHALLENGE_PASS_PERCENT = 40;
export const CHALLENGE_QUESTIONS = 2;
export const CHALLENGE_MARKS_PER_QUESTION = 10;

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

export type ChallengePrerequisite = {
  topicKey: string;
  title: string;
  unitNumber: string;
  orderIndex: number;
  taught: boolean;
  bankQuestions: number;
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
  examProvider?: "practice-paper-v1";
  upstreamChallengeId?: string;
  topicKeys?: string[];
  canStart?: boolean;
  prerequisites?: ChallengePrerequisite[];
  prerequisiteNote?: string;
  prerequisiteSource?: "syllabus" | "stored" | "index_chapters" | "none";
  prerequisiteBlockers?: string[];
  prerequisiteWarnings?: string[];
  learningWarning?: string | null;
  solvedWarning?: string | null;
  examWarning?: string | null;
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
  latestAttempt: ChallengeAttemptReview | null;
};

export type StudentChallengePrerequisiteReading = {
  topicKey: string;
  title: string;
  content: string[];
  focus: string;
  warning: string | null;
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
    title: topicTitle === rawTopicTitle ? String(row.title ?? "") : `Master ${topicTitle}`,
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
}: {
  activeCount: number;
  activeRecommendationCount: number;
  availableCount: number;
  minimumRecommendationCount?: number;
}) {
  const openSlots = Math.max(0, 3 - activeCount);
  const scopedSlots = Math.max(0, minimumRecommendationCount - activeRecommendationCount);
  const requested = Math.max(openSlots, scopedSlots);
  return Math.min(availableCount, requested);
}

/**
 * Keeps three real, unfinished challenges in today's general queue. Completed
 * rows stay immutable for history/metrics, while the next unused recommendation
 * is inserted as a fresh assignment and sorts above the older active rows. A
 * subject-scoped caller can request its own three matching assignments so
 * opening a subject preserves the same three-challenge experience even when
 * other subjects already filled the general queue.
 */
export async function ensureDailyChallenges(
  userId: string,
  recommendations: ChallengeRecommendation[],
  options: EnsureDailyChallengeOptions = {},
): Promise<StudentChallengeSummary[]> {
  const date = nepaliChallengeDate();
  const existing = await listDailyRows(userId, date);
  if (existing === null) return [];

  // Old catalogues sometimes exposed uploaded files (for example
  // "Applied Mechanics QB") as if they were syllabus chapters. Keep those
  // rows in storage for auditability, but do not let them occupy today's
  // student challenge slots.
  const active = existing.filter(
    (row) => row.status !== "completed" && !isSourceDocumentChallengeRow(row),
  );
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
      title: `Master ${topicTitle}`,
      recommendation_reason: recommendation.reason,
      duration_minutes: 20,
    };
  });
  const { error } = await admin.from("student_challenges").insert(rows);
  if (error?.code === "23505") {
    const concurrent = (await listDailyRows(userId, date)) ?? [];
    return concurrent
      .filter((row) => row.status !== "completed" && !isSourceDocumentChallengeRow(row))
      .sort((left, right) => {
        const created = String(right.created_at ?? "").localeCompare(String(left.created_at ?? ""));
        return created || number(left.position) - number(right.position);
      })
      .map(toSummary);
  }
  if (error) throw error;

  return (((await listDailyRows(userId, date)) ?? []) as ChallengeRow[])
    .filter((row) => row.status !== "completed" && !isSourceDocumentChallengeRow(row))
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

/** Loads a prerequisite lesson only when the student asks to read it. */
export async function getStudentChallengePrerequisiteReading(
  userId: string,
  challengeId: string,
  topicKey: string,
): Promise<StudentChallengePrerequisiteReading | null> {
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
  const detail = toDetail(row);
  const prerequisite = detail.content?.prerequisites?.find(
    (candidate) => candidate.topicKey === topicKey,
  );
  if (!prerequisite) throw new Error("This topic is not a prerequisite for this challenge.");
  if (!prerequisite.taught) {
    throw new Error("No course notes are available for this prerequisite yet.");
  }

  const lane = await resolveChallengeLane(userId, row);
  const learning = await getTeacherChallengeReading(lane.collectionKey, {
    subject: lane.subject,
    topics: [prerequisite.topicKey],
  });
  return {
    topicKey: prerequisite.topicKey,
    title: learning.reading.headline || prerequisite.title,
    content: lessonParagraphs(learning.reading.content),
    focus: learning.reading.focus || "",
    warning: warningText(learning.warnings),
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

async function issueChallengeExam(input: {
  collectionKey: string;
  subject: string;
  topicKeys: string[];
  chapters?: string[];
  questionCount: number;
  durationMinutes: number;
}): Promise<TeacherChallengeExam> {
  const questionCount = Math.max(1, input.questionCount);
  const marksEach = CHALLENGE_MARKS_PER_QUESTION;
  const totalMarks = questionCount * marksEach;
  const paper = await generateTeacherPracticePaper(input.collectionKey, {
    subject: input.subject,
    chapters: input.chapters?.length ? input.chapters : input.topicKeys,
    title: `${input.subject} challenge`,
    instruction: "Set concise handwritten-answer questions on only the requested topic.",
    pass_marks: Math.ceil((totalMarks * CHALLENGE_PASS_PERCENT) / 100),
    bands: [
      {
        label: "Challenge",
        question_type: "Short answer",
        count: questionCount,
        marks_each: marksEach,
      },
    ],
  });
  if (!paper.id || !paper.questions?.length) {
    throw new Error("The course API could not issue a live challenge exam.");
  }
  return {
    attempt_id: paper.id,
    subject: paper.subject || input.subject,
    topics: input.topicKeys.map((topicKey, index) => ({
      topic_key: topicKey,
      title: input.chapters?.[index] || paper.chapters?.[index] || topicKey,
      order_index: index,
    })),
    questions: paper.questions.map((question) => ({
      id: question.id,
      topic_key: input.topicKeys[0] || question.chapter,
      topic: question.chapter || input.topicKeys[0] || "",
      marks: number(question.marks),
      question_type: question.question_type || "Short answer",
      text: question.text,
    })),
    total_marks: number(paper.total_marks),
    pass_marks:
      number(paper.pass_marks) ||
      Math.ceil((number(paper.total_marks) * CHALLENGE_PASS_PERCENT) / 100),
    duration_minutes: input.durationMinutes,
    expires_at: new Date(Date.now() + input.durationMinutes * 60_000).toISOString(),
    warning: paper.warning,
  };
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

async function resolveChallengeLane(userId: string, row: ChallengeRow) {
  const admin = createSupabaseAdminClient();
  const access = await requireChallengeAccess(userId, row);

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
    examProvider: "practice-paper-v1",
    examQuestions: (exam.questions || []).map(examQuestion),
    examExpiresAt: exam.expires_at,
    examAttemptNumber: attemptNumber,
    examWarning: warningText(content.examWarning, exam.warning),
  };
}

function granularChallengeContent(
  prerequisites: TeacherChallengePrerequisitesResponse,
  learning: TeacherChallengeLearnResponse,
  solved: TeacherChallengeSolvedResponse,
  practiceTopics: ApiRecord | null = null,
): StudentChallengeContent {
  const topicKeys = (prerequisites.topics || []).map((topic) => topic.topic_key).filter(Boolean);
  const topicTitle = prerequisites.topics?.[0]?.title || "this topic";
  return {
    provider: "collection-challenge-v1",
    topicKeys,
    canStart: prerequisites.can_start,
    prerequisites: (prerequisites.prerequisites || []).map((prerequisite) => ({
      topicKey: prerequisite.topic_key,
      title: prerequisite.title,
      unitNumber: prerequisite.unit_number || "",
      orderIndex: number(prerequisite.order_index),
      taught: prerequisite.taught,
      bankQuestions: number(prerequisite.bank_questions),
      reason: prerequisite.reason,
    })),
    prerequisiteNote: prerequisites.note || "",
    prerequisiteSource: prerequisites.topic_source,
    prerequisiteBlockers: prerequisites.blockers || [],
    prerequisiteWarnings: prerequisites.warnings || [],
    learningWarning: warningText(learning.warnings),
    solvedWarning: studentFacingSolvedWarning(solved, practiceTopics, topicKeys, topicTitle),
    lesson: {
      title: learning.reading.headline || "What you need to know",
      content: lessonParagraphs(learning.reading.content),
      focus: learning.reading.focus || "",
      sources: (learning.reading.sources || []).map((source) => ({
        title: source.chapter?.trim() || source.filename?.trim() || "Course material",
        source: source.source_path?.trim() || source.filename?.trim() || "Indexed source",
        excerpt: "",
      })),
    },
    solvedExamples: (solved.questions || []).map(solvedExample),
    examQuestions: [],
    warning: null,
  };
}

function hasLiveExam(detail: StudentChallengeDetail, externalAttemptId: string) {
  if (
    detail.content?.provider !== "collection-challenge-v1" ||
    detail.content.examProvider !== "practice-paper-v1" ||
    !externalAttemptId ||
    !detail.content.examExpiresAt
  ) {
    return false;
  }
  const hasCurrentMarkingShape =
    detail.content.examQuestions.length === CHALLENGE_QUESTIONS &&
    detail.content.examQuestions.every(
      (question) => question.marks === CHALLENGE_MARKS_PER_QUESTION,
    );
  if (!hasCurrentMarkingShape) return false;
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
  await requireChallengeAccess(userId, row);
  const current = toDetail(row);
  const externalAttemptId = String(row.external_paper_id || "");
  const sourceDocumentTopic = isSourceDocumentChallengeRow(row);
  if (current.status === "completed" && !options.restart) {
    return withLatestAttemptReview(userId, row, current);
  }
  if (!sourceDocumentTopic && hasLiveExam(current, externalAttemptId)) return current;
  if (!sourceDocumentTopic && current.content?.provider === "collection-challenge-v1") {
    return refreshStudentChallengeExam(userId, challengeId, { allowCompleted: options.restart });
  }

  const lane = await resolveChallengeLane(userId, row);
  const prerequisiteRequest = {
    subject: lane.subject,
    // A legacy row may point at the uploaded QB/syllabus file itself. Let the
    // provider choose a real syllabus topic instead of building a challenge on
    // a document container.
    topics: sourceDocumentTopic
      ? []
      : [String(row.topic_key || row.topic_title || "")].filter(Boolean),
    limit: 3,
  };
  let prerequisites: TeacherChallengePrerequisitesResponse;
  try {
    prerequisites = await getTeacherChallengePrerequisites(lane.collectionKey, prerequisiteRequest);
  } catch (error) {
    // Daily rows assigned before the collection-scoped wiring may carry a
    // legacy topic key. Let the API choose the real highest-weight topic once.
    if (!(error instanceof TeacherApiError) || ![404, 422].includes(error.status)) throw error;
    prerequisites = await getTeacherChallengePrerequisites(lane.collectionKey, {
      ...prerequisiteRequest,
      topics: [],
    });
  }
  if (!prerequisites.can_start) {
    throw new Error(
      "This topic is not taught by the course material yet, so its challenge cannot start.",
    );
  }
  const selectedTopic = prerequisites.topics?.[0];
  const selectedTopicKeys = (prerequisites.topics || [])
    .map((topic) => topic.topic_key)
    .filter(Boolean);
  const [learning, solved, challengeExam, practiceTopics] = await Promise.all([
    getTeacherChallengeReading(lane.collectionKey, {
      subject: lane.subject,
      topics: selectedTopicKeys,
    }),
    getTeacherChallengeSolvedQuestions(lane.collectionKey, {
      subject: lane.subject,
      topics: selectedTopicKeys,
      limit: 2,
    }),
    issueChallengeExam({
      collectionKey: lane.collectionKey,
      subject: lane.subject,
      topicKeys: selectedTopicKeys,
      chapters: (prerequisites.topics || []).map((topic) => topic.title).filter(Boolean),
      questionCount: CHALLENGE_QUESTIONS,
      durationMinutes: number(row.duration_minutes) || 20,
    }),
    getTeacherPracticeTopics(lane.collectionKey, lane.subject, {
      totalMarks: CHALLENGE_QUESTIONS * CHALLENGE_MARKS_PER_QUESTION,
      maxQuestions: CHALLENGE_QUESTIONS,
    }).catch(() => null),
  ]);
  const title = `Master ${selectedTopic?.title || row.topic_title || lane.subject}`;
  const content = contentWithExam(
    granularChallengeContent(prerequisites, learning, solved, practiceTopics),
    challengeExam,
    number(row.attempt_count) + 1,
  );
  const now = new Date().toISOString();
  const { data, error } = await admin
    .from("student_challenges")
    .update({
      status: "started",
      external_paper_id: challengeExam.attempt_id,
      content,
      total_marks: challengeExam.total_marks,
      pass_marks: challengeExam.pass_marks,
      duration_minutes: challengeExam.duration_minutes,
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
  return toDetail(data as ChallengeRow);
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
  options: { allowCompleted?: boolean } = {},
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
  await requireChallengeAccess(userId, row);
  const detail = toDetail(row);
  if (detail.status === "completed" && !options.allowCompleted) return detail;
  if (detail.content?.provider !== "collection-challenge-v1") {
    return startStudentChallenge(userId, challengeId, { restart: options.allowCompleted });
  }

  const lane = await resolveChallengeLane(userId, row);
  const exam = await issueChallengeExam({
    collectionKey: lane.collectionKey,
    subject: lane.subject,
    topicKeys: detail.content.topicKeys?.length
      ? detail.content.topicKeys
      : [String(row.topic_key || "")].filter(Boolean),
    chapters: [String(row.topic_title || detail.topicTitle)].filter(Boolean),
    questionCount: CHALLENGE_QUESTIONS,
    durationMinutes: detail.durationMinutes,
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
  const graded = await gradeTeacherPracticePaper(lane.collectionKey, attemptId, {
    student_name: "Student",
    answers: input.answers.map((answer) => ({
      question_id: answer.questionId,
      answer_text: answer.answerText,
    })),
  });
  return practiceGradeAsChallengeGrade(graded, attemptId, lane.subject, number(row.pass_marks));
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
  const lane = await resolveChallengeLane(input.userId, row);
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
