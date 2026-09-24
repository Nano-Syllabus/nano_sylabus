import { createHash, randomUUID } from "node:crypto";
import { after } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getStudentCourseSubjectAccessCached } from "@/lib/student-courses";
import {
  createTeacherChallengeExam,
  gradeTeacherAnswers,
  gradeTeacherPracticePaper,
  gradeTeacherPracticePaperFile,
  getTeacherChallengePastQuestions,
  getTeacherChallengeReading,
  getTeacherChallengeSolvedQuestions,
  requestTeacherMediaImage,
  translateTeacherChallengeTexts,
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
import { normalizeQuestionText } from "@/lib/challenge-learn-questions";
import {
  drawnFigureDigest,
  emptyFigureSection,
  figureBrief,
  withFigure,
  withoutFigure,
} from "@/lib/answer-figures";
import { proxyMedia } from "@/lib/tenant/media-proxy";
import { readCourseLearningTopics } from "@/lib/data/community-learning-topics";
import { createLimiter } from "@/lib/http/limit";
import { collectionKeyForTeacher } from "@/lib/data/challenge-collection-key";
import {
  CHALLENGE_POOL_AHEAD,
  CHALLENGE_POOL_PRIORITY,
  challengePoolAvailable,
  challengePoolRowKey,
  enqueueChallengeRows,
  enqueueChallengeTopics,
  kickChallengePoolSweep,
  readyPoolSnapshot,
  type ChallengePoolSnapshot,
} from "@/lib/data/challenge-pool";
import type { PracticeEvaluation } from "@/lib/tenant/client";
import {
  CHALLENGE_HYBRID_MCQ_QUESTIONS,
  CHALLENGE_HYBRID_WRITTEN_QUESTIONS,
  CHALLENGE_MCQ_EXAM_QUESTIONS,
  type ChallengeQuestionFormat,
} from "@/lib/challenge-format";
import { challengeFormatForCourse, challengeSettingsForCourse } from "@/lib/data/community-challenge-format";
import {
  ChallengeMcqUnavailableError,
  issueChallengeChoiceQuestions,
  type ChallengeChoiceOption,
} from "@/lib/data/challenge-exam-format";

const UNDEFINED_TABLE = "42P01";
const UNDEFINED_COLUMN = "42703";
/** PostgREST's own code for a column its schema cache does not know. */
const POSTGREST_MISSING_COLUMN = "PGRST204";
const POSTGREST_MISSING_TABLE = "PGRST205";
export const CHALLENGE_PASS_PERCENT = 40;
export const CHALLENGE_QUESTIONS = 2;
/**
 * How many of this subject's own questions step one lists.
 *
 * Step one IS the list now, so it is sized to be the list: a topic whose bank
 * has ten questions on it shows ten rather than the six that fitted when this
 * was a preamble to a reading. A bank with fewer simply returns fewer.
 */
/**
 * Rebuild a challenge's content on EVERY open, ignoring what is on the row.
 *
 * The row is the cache that outlives every other one. A challenge keeps the
 * lesson, the questions and the solutions it was built with — that is the whole
 * point of storing them, and it is why a student who opened a topic yesterday
 * still sees yesterday's questions after the indexer, the prompts and the
 * catalogue have all been replaced underneath them.
 *
 * `CHALLENGE_FRESH_CONTENT=1` turns the short-circuits off so every open is a
 * full build: past questions and reading fetched again, worked examples and exam
 * issued again behind them. It costs a model call per open, which is exactly why
 * it is off by default and belongs in a testing environment rather than in front
 * of a class.
 */
export const CHALLENGE_FRESH_CONTENT =
  (process.env.CHALLENGE_FRESH_CONTENT || "").trim().toLowerCase() === "1" ||
  (process.env.CHALLENGE_FRESH_CONTENT || "").trim().toLowerCase() === "true";

export const CHALLENGE_PAST_QUESTIONS = 10;
/** How many of those come back with a worked solution under them. The provider
 *  clamps this at five. */
export const CHALLENGE_SOLVED_QUESTIONS = 5;
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

/** Challenge ids whose reading is being written onto the row after completion. */
const readingsInFlight = new Map<string, Promise<void>>();

/**
 * Per finished challenge, the preparation of the one the student reaches next —
 * kept so the request that owns the completion stays alive until it has landed.
 */
const nextPreparationsInFlight = new Map<string, Promise<unknown>>();

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
  /**
   * How many challenges may be open at once.
   *
   * Three was a flat number, and a student taking four subjects this semester
   * therefore saw three of them. The queue is meant to read as "the subjects I
   * am studying, one challenge each" before it reads as a daily quota, so the
   * caller raises this to the number of subjects in the running semester and
   * nobody's fourth subject waits for somebody else's topic to be finished.
   */
  concurrentChallengeLimit?: number;
  /**
   * The subjects (`${courseId ?? "owner-private"}:${slug}`) whose open
   * challenges count against `concurrentChallengeLimit`.
   *
   * Without it every open row dated today counted, including ones from a
   * community the student has since left or a semester they have moved off.
   * Those rows are never shown, yet they spent the allowance: seven open
   * challenges from the old community left a ten-subject semester three cards.
   */
  ceilingScopeKeys?: ReadonlySet<string>;
  /**
   * Also return today's COMPLETED challenges, after the open ones. The Challenge
   * Hub keeps a finished challenge on its list — green, and not openable from
   * there — so today's work stays visible instead of vanishing when it is done.
   * Every other caller wants only what can still be started.
   */
  includeCompleted?: boolean;
  /**
   * Never hand a subject a second open challenge. The hub is one card per
   * subject of the running semester; without this the slots were filled by
   * count alone, so a subject whose card had been started was given another
   * — "Data Structures and Algorithm" twice, one Continue and one Start.
   */
  onePerSubject?: boolean;
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
  /** The syllabus unit this subtopic sits under, "" when the syllabus numbers
   *  none. Written at assignment, so it survives a re-extraction that renumbers
   *  topic keys. */
  unitNumber: string;
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
  /** Past questions prepared for this subtopic; null until its content is built. */
  pastQuestionCount?: number | null;
  /** Practice questions on the paper — never more than `CHALLENGE_QUESTIONS`. */
  practiceQuestionCount?: number | null;
  /** Reading plus answering, in minutes, rounded to 5 and at most 20. Null until
   *  the content is built — never a guess. See `challengeEstimate`. */
  estimatedMinutes?: number | null;
};

export type ChallengeSolvedExample = {
  year: string | null;
  question: string;
  /** `question` with its mathematics typeset in LaTeX, for display. Absent on
   *  content built before the solver returned one. */
  displayQuestion?: string;
  /** Every session the bank printed it in, oldest first. */
  years?: string[];
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
  /** Typeset for display once the question has been worked; see
   *  `ChallengeSolvedExample.displayQuestion`. */
  displayQuestion?: string;
  /** Every session the bank printed it in, oldest first; `year` is the latest. */
  years?: string[];
};

export type ChallengeExamQuestion = {
  id: string;
  question: string;
  topic: string;
  marks: number;
  questionType: string;
  /** Present on a multiple-choice question, answered on screen rather than on
   *  paper. Its key is sealed in `answerCheck` — see `challenge-exam-format.ts`. */
  options?: ChallengeChoiceOption[];
  answerCheck?: string;
  explanationSealed?: string;
};

export function isChoiceQuestion(
  question: ChallengeExamQuestion,
): question is ChallengeExamQuestion & { options: ChallengeChoiceOption[]; answerCheck: string } {
  return Array.isArray(question.options) && question.options.length > 0 && Boolean(question.answerCheck);
}

/**
 * `pending` means the row holds a real lesson but its worked examples and exam
 * are still being built behind the response. It is never a loading spinner for
 * the whole screen — the student reads the lesson while the rest lands.
 */
export type ChallengeContentStatus = "ready" | "pending";

/**
 * A challenge's study material in Roman Nepali: its reading and its worked
 * answers. Past questions and the exam stay as the paper prints them.
 */
export type ChallengeRomanNepali = {
  /** Identity of the English it was translated from. A reading that lands
   *  later, or answers added since, make it stale and it is translated again. */
  sourceHash: string;
  reading: string[];
  /** Worked answers, keyed by `normalizeQuestionText(question)`. */
  solutions: Record<string, string>;
  /** Parts that could not be translated faithfully and are shown in English. */
  untranslated: number;
};

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
  examProvider?: "practice-paper-v1" | "challenge-exam-v1" | "challenge-mcq-v1";
  /**
   * The community's challenge question format when this paper was issued
   * (`lib/challenge-format.ts`). A paper whose format no longer matches the
   * community's is re-issued at the next open, which is how a creator's change
   * reaches every student. Absent on papers from before formats: those are QnA.
   */
  examFormat?: ChallengeQuestionFormat;
  /** Negative marking on this paper's MCQs, as the community had it when the
   *  paper was issued: a creator's later change does not re-mark a sitting. */
  examNegativePercent?: number;
  /** Final picks on an MCQ paper, recorded as each is made — see
   *  `lib/data/challenge-exam-picks.ts`. Cleared with each new paper. */
  examPicks?: Record<string, string>;
  contentStatus?: ChallengeContentStatus;
  /** When the background completion was handed off; drives the stale re-kick. */
  contentPendingSince?: string;
  /** Why the background completion last failed, if it did. */
  contentError?: string | null;
  /**
   * Why the concepts reading could not be written, the last time it was asked
   * for. Cleared when one lands. Lets a screen waiting on the reading stop
   * saying "a moment" about a topic whose material cannot produce one.
   */
  readingError?: string | null;
  /** The reading and the worked answers in Roman Nepali, kept once written —
   *  see `getStudentChallengeRomanNepali`. */
  romanNepali?: ChallengeRomanNepali;
  /**
   * Set when this content was cut from the global challenge pool
   * (`lib/data/challenge-pool.ts`) rather than built per student: the worked
   * answers are already here, and the background pass issues only the paper.
   */
  pooledFrom?: { revision: string; preparedAt: string | null };
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

/** Minutes to read one worked past question, by what the paper paid for it. */
function readingMinutes(marks: number | null | undefined) {
  if (!marks || marks <= 0) return 3;
  return Math.min(6, Math.max(2, Math.round(marks / 2)));
}

/** Minutes to write one practice answer on paper, by its marks. */
function answeringMinutes(marks: number | null | undefined) {
  if (!marks || marks <= 0) return 5;
  return Math.min(8, Math.max(3, Math.round(marks * 0.75)));
}

/** No challenge is estimated at more than this: it is a twenty-minute sitting. */
export const CHALLENGE_MINUTES_CAP = 20;

/**
 * How long a challenge takes, from what has actually been prepared for it.
 *
 * Reading the subtopic's worked past questions — a 2-mark definition is a
 * couple of minutes, a 10-mark derivation several — then answering the practice
 * questions on paper, of which there are never more than `CHALLENGE_QUESTIONS`.
 * The two are added and held to `CHALLENGE_MINUTES_CAP`, so a heavily examined
 * topic reads as a full twenty minutes and a light one as less. A challenge
 * whose content is not built yet has nothing to go on and says nothing, rather
 * than the same guess on every row.
 */
export function challengeEstimate(content: StudentChallengeContent | null): {
  pastQuestionCount: number | null;
  practiceQuestionCount: number | null;
  estimatedMinutes: number | null;
} {
  if (!content || content.provider !== "collection-challenge-v1") {
    return { pastQuestionCount: null, practiceQuestionCount: null, estimatedMinutes: null };
  }
  const past = content.pastQuestions ?? [];
  // A topic no paper examined is studied from its worked examples instead.
  const reading = past.length
    ? past.reduce((sum, question) => sum + readingMinutes(question.marks), 0)
    : (content.solvedExamples ?? []).reduce((sum, example) => sum + readingMinutes(example.marks), 0);
  // Written questions are capped as they always were; an MCQ paper's choices
  // are all counted, since each one is on the screen to be answered.
  const practice = [
    ...(content.examQuestions ?? []).filter(isChoiceQuestion),
    ...(content.examQuestions ?? []).filter((question) => !isChoiceQuestion(question)).slice(0, CHALLENGE_QUESTIONS),
  ];
  const answering = practice.length
    ? practice.reduce(
        // A choice is picked on screen in about a minute, not written out.
        (sum, question) => sum + (isChoiceQuestion(question) ? 1 : answeringMinutes(question.marks)),
        0,
      )
    : CHALLENGE_QUESTIONS * answeringMinutes(null);
  const total = Math.round((reading + answering) / 5) * 5;
  return {
    pastQuestionCount: past.length,
    practiceQuestionCount: practice.length || CHALLENGE_QUESTIONS,
    estimatedMinutes: Math.min(CHALLENGE_MINUTES_CAP, Math.max(5, total)),
  };
}

function rowContent(row: ChallengeRow): StudentChallengeContent | null {
  if (!row.content || typeof row.content !== "object" || Array.isArray(row.content)) return null;
  const content = row.content as StudentChallengeContent;
  // A build error filed before `studentFacingBuildError` existed still carries
  // the course API's own wording; it is read back in the student's.
  return content.contentError
    ? { ...content, contentError: studentFacingBuildError(content.contentError) }
    : content;
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
    unitNumber: String(row.unit_number ?? ""),
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
    ...challengeEstimate(rowContent(row)),
  };
}

function toDetail(row: ChallengeRow): StudentChallengeDetail {
  return { ...toSummary(row), content: rowContent(row), latestAttempt: null };
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

/** The subject a row belongs to, keyed as the dashboard keys subjects. */
function rowSubjectKey(row: ChallengeRow) {
  return [
    row.course_id ? String(row.course_id) : "owner-private",
    String(row.subject_slug ?? "")
      .trim()
      .toLowerCase(),
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
  concurrentChallengeLimit = 3,
}: {
  activeCount: number;
  activeRecommendationCount: number;
  availableCount: number;
  minimumRecommendationCount?: number;
  dailyCount?: number;
  maximumDailyCount?: number;
  /** How many may be open at once. The caller raises it to cover every subject
   *  in the running semester; below three it stays three. */
  concurrentChallengeLimit?: number;
}) {
  const openSlots = Math.max(0, Math.max(3, concurrentChallengeLimit) - activeCount);
  const scopedSlots = Math.max(0, minimumRecommendationCount - activeRecommendationCount);
  /**
   * TWO CEILINGS, BECAUSE A FILTERED SUBJECT IS A DIFFERENT QUESTION.
   *
   * The plain queue is measured across everything open: three on your plate,
   * and solving one lets the next arrive.
   *
   * A student who has FILTERED to one subject is asking about that subject, and
   * measuring them against the same global count answers a question they did
   * not ask — their three open challenges are other subjects, the allowance is
   * spent, and the subject they chose shows an empty hub with "ask the community
   * creator to refresh this subject's topics", which is not the reason and not
   * something they can act on.
   *
   * So a scoped request is measured against what is open IN THAT SCOPE. It is
   * still a ceiling, not a bypass: at most three open per subject, so nobody
   * accumulates an unbounded pile by switching filters.
   */
  const openAllowance = Math.max(0, maximumDailyCount - dailyCount);
  const scopedAllowance = Math.max(0, maximumDailyCount - activeRecommendationCount);
  const requested = Math.max(
    Math.min(openSlots, openAllowance),
    Math.min(scopedSlots, scopedAllowance),
  );
  return Math.min(availableCount, requested);
}

async function hasUnlimitedConcurrentChallenges(userId: string): Promise<boolean> {
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
  const [existing, unlimitedConcurrentChallenges] = await Promise.all([
    listDailyRows(userId, date),
    hasUnlimitedConcurrentChallenges(userId),
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
  const ceilingKeys = options.ceilingScopeKeys;
  const activeInScope = ceilingKeys
    ? active.filter((row) => ceilingKeys.has(rowSubjectKey(row)))
    : active;
  const assignedKeys = new Set(existing.map(rowRecommendationKey));
  const recommendationKeys = new Set(recommendations.map(recommendationKey));
  const activeRecommendationCount = active.filter((row) =>
    recommendationKeys.has(rowRecommendationKey(row)),
  ).length;
  const openSubjects = new Set(active.map(rowSubjectKey));
  const available = recommendations.filter(
    (recommendation) => !assignedKeys.has(recommendationKey(recommendation)),
  ).filter((recommendation) => {
    if (!options.onePerSubject) return true;
    // One per subject: none for a subject that already has an open card, and
    // only the first (best-ranked) for one that does not.
    const subject = `${recommendation.courseId ?? "owner-private"}:${recommendation.subjectSlug.trim().toLowerCase()}`;
    if (openSubjects.has(subject)) return false;
    openSubjects.add(subject);
    return true;
  });
  const selected = available.slice(
    0,
    dailyChallengeAssignmentCount({
      activeCount: activeInScope.length,
      activeRecommendationCount,
      availableCount: available.length,
      minimumRecommendationCount: options.minimumRecommendationCount,
        // OPEN AT ONCE, NOT ISSUED TODAY.
      //
      // This counted every row dated today, completed ones included, against a
      // ceiling of three. So a student who finished all three was done until
      // tomorrow — and, worse, one whose three happened to be other subjects saw
      // nothing at all under a subject they had explicitly filtered to. Measured
      // on the live data: 39 rows across 12 students, every one of them at the
      // ceiling, which is a Challenge Hub that cannot hand anybody a challenge.
      //
      // Counting only what is still OPEN makes the ceiling mean "three on your
      // plate", so solving one lets the next arrive — which is what the queue
      // was always described as doing.
      dailyCount: activeInScope.length,
      maximumDailyCount: unlimitedConcurrentChallenges
        ? Infinity
        : Math.max(3, options.concurrentChallengeLimit ?? 3),
      concurrentChallengeLimit: options.concurrentChallengeLimit,
    }),
  );

  if (!selected.length) return listedToday(existing);

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
    return listedToday((await listDailyRows(userId, date)) ?? []);
  }
  if (error) throw error;

  return listedToday(((await listDailyRows(userId, date)) ?? []) as ChallengeRow[]);

  /** Open challenges newest first; then, when asked, today's completed ones. */
  function listedToday(rows: ChallengeRow[]) {
    const open = rows
      .filter((row) => row.status !== "completed" && offerableRow(row))
      .sort((left, right) => {
        const created = String(right.created_at ?? "").localeCompare(String(left.created_at ?? ""));
        return created || number(left.position) - number(right.position);
      });
    // A finished challenge is shown even if its topic has since been retired:
    // it is today's record, not an offer.
    const done = options.includeCompleted
      ? rows
          .filter((row) => row.status === "completed" && !isSourceDocumentChallengeRow(row))
          .sort((left, right) =>
            String(left.completed_at ?? "").localeCompare(String(right.completed_at ?? "")),
          )
      : [];
    return [...open, ...done].map(toSummary);
  }
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

/** Distinct, non-empty sessions in the order the API gave them (oldest first). */
function sessions(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const out = [...new Set(value.map((item) => String(item ?? "").trim()).filter(Boolean))];
  return out.length ? out : undefined;
}

function solvedExample(question: TeacherChallengeSolvedQuestion): ChallengeSolvedExample {
  const source = String(question.source || "").trim();
  return {
    year: question.year?.trim() || null,
    question: question.text,
    displayQuestion: question.display_text?.trim() || undefined,
    years: sessions(question.years),
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
    // Typeset for the student: a determinant as a grid, not "|a, b; c, d|".
    question: question.display_text?.trim() || question.text,
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

/** A sitting as this app stores it, whichever format set it. */
type IssuedChallengePaper = {
  /** The upstream attempt for a paper with written questions; a local id for an
   *  all-MCQ paper, which is marked here and has no upstream attempt. */
  externalPaperId: string;
  provider: NonNullable<StudentChallengeContent["examProvider"]>;
  format: ChallengeQuestionFormat;
  questions: ChallengeExamQuestion[];
  expiresAt: string;
  totalMarks: number;
  passMarks: number;
  durationMinutes: number;
  warning: string | null;
  negativePercent: number;
};

/** How long an MCQ-only paper stays open. Nothing upstream holds it, so this is
 *  only the sitting's own shelf life — a new day is a fresh paper. */
const MCQ_PAPER_TTL_MS = 24 * 60 * 60 * 1000;

function passMarksFor(totalMarks: number) {
  return Math.ceil((totalMarks * CHALLENGE_PASS_PERCENT) / 100);
}

/**
 * Issue the sitting in the format the student's community chose.
 *
 * - `qna`    — the original: `CHALLENGE_QUESTIONS` written questions, from the pool.
 * - `mcq`    — `CHALLENGE_MCQ_EXAM_QUESTIONS` multiple-choice questions, marked here.
 * - `hybrid` — one written question from the pool plus
 *              `CHALLENGE_HYBRID_MCQ_QUESTIONS` multiple-choice ones.
 *
 * A course service too old to set exam MCQs gets the written paper and a note,
 * with `format` still the one requested — so the paper is not re-issued on every
 * open in the hope that the service has changed in the meantime.
 */
async function issueFormattedChallengeExam(input: {
  format: ChallengeQuestionFormat;
  /** MCQs on an MCQ paper — the community's count. */
  mcqCount?: number;
  negativePercent?: number;
  challengeId: string;
  collectionKey: string;
  subject: string;
  topicKeys: string[];
  topicTitle: string;
  durationMinutes: number;
  attemptNumber: number;
  exclude?: string[];
}): Promise<IssuedChallengePaper> {
  const written = async (count: number) => {
    const exam = await issueChallengeExam({
      collectionKey: input.collectionKey,
      subject: input.subject,
      topicKeys: input.topicKeys,
      questionCount: count,
      durationMinutes: input.durationMinutes,
      exclude: input.exclude,
    });
    return exam;
  };
  const choices = (count: number) =>
    issueChallengeChoiceQuestions({
      collectionKey: input.collectionKey,
      challengeId: input.challengeId,
      subject: input.subject,
      topicKeys: input.topicKeys,
      topicTitle: input.topicTitle,
      count,
      attemptNumber: input.attemptNumber,
    });
  const writtenPaper = async (warning: string | null = null): Promise<IssuedChallengePaper> => {
    const exam = await written(CHALLENGE_QUESTIONS);
    return {
      externalPaperId: exam.attempt_id,
      provider: "challenge-exam-v1",
      format: input.format,
      questions: (exam.questions || []).map(examQuestion),
      expiresAt: exam.expires_at,
      totalMarks: number(exam.total_marks),
      passMarks: number(exam.pass_marks),
      durationMinutes: number(exam.duration_minutes) || input.durationMinutes,
      warning: warningText(warning, exam.warning),
      negativePercent: 0,
    };
  };
  const unavailable =
    "Multiple-choice challenge questions are not available on the course server yet, so this exam is written.";

  if (input.format === "mcq") {
    try {
      const questions = await choices(input.mcqCount ?? CHALLENGE_MCQ_EXAM_QUESTIONS);
      const totalMarks = questions.reduce((sum, question) => sum + question.marks, 0);
      return {
        externalPaperId: `mcq-${randomUUID()}`,
        provider: "challenge-mcq-v1",
        format: "mcq",
        questions,
        expiresAt: new Date(Date.now() + MCQ_PAPER_TTL_MS).toISOString(),
        totalMarks,
        passMarks: passMarksFor(totalMarks),
        // About a minute a question, and never less than the challenge's own.
        durationMinutes: Math.max(input.durationMinutes, questions.length),
        warning: null,
        negativePercent: input.negativePercent ?? 0,
      };
    } catch (cause) {
      if (cause instanceof ChallengeMcqUnavailableError) return writtenPaper(unavailable);
      throw cause;
    }
  }
  if (input.format === "hybrid") {
    const [exam, picked] = await Promise.all([
      written(CHALLENGE_HYBRID_WRITTEN_QUESTIONS),
      choices(CHALLENGE_HYBRID_MCQ_QUESTIONS).catch((cause) => {
        if (cause instanceof ChallengeMcqUnavailableError) return null;
        throw cause;
      }),
    ]);
    if (!picked) return writtenPaper(unavailable);
    const writtenQuestions = (exam.questions || []).map(examQuestion);
    const totalMarks =
      picked.reduce((sum, question) => sum + question.marks, 0) +
      writtenQuestions.reduce((sum, question) => sum + question.marks, 0);
    return {
      externalPaperId: exam.attempt_id,
      provider: "challenge-exam-v1",
      format: "hybrid",
      // Choices first: they are answered on screen, then the written answer on paper.
      questions: [...picked, ...writtenQuestions],
      expiresAt: exam.expires_at,
      totalMarks,
      passMarks: passMarksFor(totalMarks),
      durationMinutes: number(exam.duration_minutes) || input.durationMinutes,
      warning: warningText(exam.warning),
      negativePercent: input.negativePercent ?? 0,
    };
  }
  return writtenPaper();
}

/**
 * Whether this student may still open this challenge's subject.
 *
 * Cached for 30s per student-subject rather than re-derived per request — see
 * `getStudentCourseSubjectAccessCached`. Every route in this file runs this, and
 * `/content` runs it on a poll, so it was the fixed cost in front of reads that
 * otherwise touch one row.
 */
async function requireChallengeAccess(userId: string, row: ChallengeRow) {
  const access = await getStudentCourseSubjectAccessCached(
    userId,
    row.course_id ? String(row.course_id) : null,
    String(row.subject_slug || ""),
  );
  if (!access) {
    throw new Error("You no longer have access to the course that assigned this challenge.");
  }
  return access;
}

type ChallengeAccess = Awaited<ReturnType<typeof requireChallengeAccess>>;

// `collectionKeyForTeacher` lives in lib/data/challenge-collection-key.ts so the
// global challenge pool shares its memo.

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
  // THE SLUG, NOT THE NAME. The course API resolves a subject by either, but a
  // community subject's display name can drift from the creator's own ("Computer
  // Network and Network Security System" against "Concept of Computer Network…"),
  // and every call then failed with a list of the collection's subjects shown to
  // the student. The slug is what the community row was attached by; it does not
  // change when a title does.
  return {
    collectionKey,
    subject: access.subjectSlug || access.subjectName || String(row.subject_name || ""),
  };
}

/**
 * What a per-challenge upstream call needs, for callers outside this file (the
 * fundamentals MCQs): the challenge is this student's, they can still open its
 * subject, and which collection, subject and topic keys to ask about. `null`
 * when there is no such challenge for this student.
 *
 * Reads `content->topicKeys` alone rather than `content`: the column carries the
 * whole reading and every worked answer, and this runs on every answer checked.
 */
export async function challengeUpstreamScope(userId: string, challengeId: string) {
  const admin = createSupabaseAdminClient();
  const { data: raw, error } = await admin
    .from("student_challenges")
    .select("id,course_id,subject_slug,subject_name,topic_key,topic_title,topicKeys:content->topicKeys")
    .eq("id", challengeId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  if (!raw) return null;
  const row = raw as ChallengeRow & { topicKeys?: unknown };
  const lane = await resolveChallengeLane(userId, row, await requireChallengeAccess(userId, row));
  const stored = Array.isArray(row.topicKeys) ? row.topicKeys.map(String).filter(Boolean) : [];
  return {
    collectionKey: lane.collectionKey,
    subject: lane.subject,
    topics: stored.length ? stored : [String(row.topic_key || "")].filter(Boolean),
    topicTitle: studentFacingTopicTitle(String(row.topic_title ?? ""), String(row.subject_name ?? "")),
  };
}

/**
 * Operator-facing text that must never be filed as a student's reading.
 *
 * A reading is stored once, on `/start`, and is then handed back verbatim every
 * time the challenge or its revision doc is opened. So anything that reaches
 * `lesson.content` is permanent until the row is cleared — which is how a
 * challenge came to open on "GEMINI_API_KEY is not configured, so NSDI returned
 * a grounded extractive answer from cached/retrieved evidence", under the
 * heading "What you need to know", for as long as that row existed.
 *
 * Which key a server is missing is not something a student can act on. The
 * provider has its own fallback for an unreachable writing service now
 * (`_extractive_reading` in routers/challenge.py), so this is the second line
 * rather than the first — but the first line lives in another service, and the
 * cost of it failing again is durable garbage in front of a student.
 *
 * Dropping the paragraph leaves the lesson empty, which is already a state the
 * app understands: `contentStatus` stays `pending`, the screen says the reading
 * is still being written, and the background pass fetches it again. Storing
 * nothing and retrying beats storing this and never retrying.
 */
const OPERATOR_DIAGNOSTIC = /\b(?:GEMINI_API_KEY|OPENAI_API_KEY|API key)\b|\bis not configured\b/i;

/** Exported under a test-only name: the hygiene rule above is worth pinning. */
export const lessonParagraphsForTest = (content: string) => lessonParagraphs(content);

function lessonParagraphs(content: string) {
  return content
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean)
    .filter((paragraph) => !OPERATOR_DIAGNOSTIC.test(paragraph));
}

/**
 * What a student is told when their challenge could not be built. The course
 * API's own message is for the creator and for logs — "subject 'X' is not
 * pinned in this collection — one of: …" put the collection's whole subject
 * list on a student's screen.
 */
export function studentFacingBuildError(message: string) {
  if (/not pinned in this collection|no subjects are pinned|subject is required/i.test(message)) {
    return "This subject's course material couldn't be found. Your teacher may have renamed or moved it — try again later.";
  }
  if (message.length > 240 || /one of: '/.test(message)) {
    return "This challenge couldn't be prepared right now. Try again in a little while.";
  }
  return message;
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
  paper: IssuedChallengePaper,
  attemptNumber: number,
): StudentChallengeContent {
  return {
    ...content,
    examProvider: paper.provider,
    examFormat: paper.format,
    examQuestions: paper.questions,
    examExpiresAt: paper.expiresAt,
    examAttemptNumber: attemptNumber,
    examNegativePercent: paper.negativePercent,
    examPicks: {},
    // The previous paper's note is not carried: it described that paper.
    examWarning: paper.warning,
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
    readingError: null,
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
      displayQuestion: question.display_text?.trim() || undefined,
      years: sessions(question.years),
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

function hasLiveExam(
  detail: StudentChallengeDetail,
  externalAttemptId: string,
  format: ChallengeQuestionFormat,
) {
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
  // A paper set in another format than the community now asks for is stale:
  // this is how a creator switching QnA → MCQ reaches every student.
  if ((content.examFormat ?? "qna") !== format) return false;
  // An MCQ community's paper with no choices on it is the written fallback a
  // course server too old for exam MCQs gave. Its one-page screen cannot sit
  // it, so it is re-issued on the next open — which is how it heals once the
  // course server is updated.
  if (format === "mcq" && !content.examQuestions.some(isChoiceQuestion)) return false;
  const hasCurrentMarkingShape =
    content.examQuestions.length > 0 &&
    (content.examProvider === "challenge-mcq-v1" ||
      content.examQuestions.some(isChoiceQuestion) ||
      (content.examQuestions.length === CHALLENGE_QUESTIONS &&
        (content.examProvider === "challenge-exam-v1" ||
          content.examQuestions.every((question) => question.marks === CHALLENGE_MARKS_PER_QUESTION))));
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
  if (!options.restart && current.content?.contentStatus === "ready") {
    // A challenge built before step one's list and the worked answers were the
    // same questions has listed questions with no answer. Opening it answers
    // them behind the response — see `topUpChallengeAnswers`.
    scheduleChallengeAnswerTopUp(userId, challengeId, access);
    scheduleChallengeReadingBackfill(userId, row, access);
    // Its completion ran on an earlier open; the next one is prepared now.
    if (current.status !== "completed") scheduleNextChallengePreparation(userId, row);
  }
  if (current.status === "completed" && !options.restart) {
    return withLatestAttemptReview(userId, row, current);
  }
  /**
   * EVERY SHORT-CIRCUIT BELOW IS FOR A REOPEN, NEVER FOR A RESTART.
   *
   * Each one hands back content that is already on the row — which is exactly
   * right when a student is returning to a challenge they are part-way through,
   * and exactly wrong when they have asked for it to be built again. A restart
   * that swapped only the paper left the lesson, the past questions and the
   * worked examples untouched, so a reading that came out badly the first time
   * survived every restart the student pressed.
   *
   * So a restart falls through to the full build below: past questions, the
   * reading, and — behind the response — the worked examples and a fresh paper,
   * every one of them fetched from the course API rather than read off the row.
   */
  if (!sourceDocumentTopic && !options.restart && !CHALLENGE_FRESH_CONTENT) {
    /**
     * A WARMED ROW IS OPENED, NOT REBUILT — AND NOT MISTAKEN FOR A REOPEN.
     *
     * `warmStudentChallenge` writes the lesson onto a row that is still
     * `assigned`, and that lesson carries `contentStatus: "pending"` like every
     * freshly built one. Without this branch the next check would read that as
     * "a build is still running, hand back what is there" and return — leaving a
     * challenge the student has just pressed Start on sitting at `assigned`,
     * with no clock and no paper on its way.
     *
     * Opening a warmed row is therefore the ownership transition on its own: the
     * lesson is already what they are about to read, so all that is missing is
     * the status, the start time, and the exam behind them.
     */
    if (current.status === "assigned" && current.content?.provider === "collection-challenge-v1") {
      const startedAt = new Date().toISOString();
      const { data, error } = await admin
        .from("student_challenges")
        .update({
          status: "started",
          started_at: startedAt,
          updated_at: startedAt,
          content: { ...current.content, examFormat: await challengeFormatForCourse(current.courseId) },
        })
        .eq("id", challengeId)
        .eq("user_id", userId)
        .select("*")
        .single();
      if (error) throw error;
      scheduleChallengeContentCompletion(userId, challengeId);
      scheduleChallengePoolAhead(row, access);
      return toDetail(data as ChallengeRow);
    }
    // A build that has not finished is not a stale paper. Reopening a challenge
    // whose tail is still running must hand back the lesson that is already
    // there — never fall through and issue a second exam alongside the one the
    // background pass is about to write.
    if (current.content?.contentStatus === "pending") {
      restartStaleContentCompletion(userId, challengeId, current.content);
      return current;
    }
    if (hasLiveExam(current, externalAttemptId, await challengeFormatForCourse(current.courseId))) {
      return current;
    }
    if (current.content?.provider === "collection-challenge-v1") {
      // The lesson is already written and is what the student is about to read;
      // the paper is issued behind them rather than in front of them.
      scheduleChallengeExamRefresh(userId, challengeId, access);
      return current;
    }
  }

  // A topic the global pool has ready is cut from it: no past-questions call,
  // and the worked answers and reading come with it. Anything else is built
  // per student, as it always was.
  const pooled =
    sourceDocumentTopic || CHALLENGE_FRESH_CONTENT
      ? null
      : await pooledChallengeContent(userId, row);
  const built = pooled
    ? { content: pooled, topicFields: {} }
    : await buildChallengeLesson(userId, row, access, sourceDocumentTopic);
  const now = new Date().toISOString();
  const { data, error } = await admin
    .from("student_challenges")
    .update({
      status: "started",
      // The previous sitting's paper is gone the moment its lesson is rebuilt;
      // leaving the id behind would let `hasLiveExam` claim a live exam that no
      // longer has questions on the row.
      external_paper_id: null,
      // The format is on the row from the start, so the screen can lay out an
      // MCQ community's single page before its questions have been set.
      content: { ...built.content, examFormat: await challengeFormatForCourse(current.courseId) },
      ...built.topicFields,
      started_at: now,
      updated_at: now,
    })
    .eq("id", challengeId)
    .eq("user_id", userId)
    .select("*")
    .single();
  if (error) throw error;
  scheduleChallengeContentCompletion(userId, challengeId);
  scheduleChallengePoolAhead(row, access);
  return toDetail(data as ChallengeRow);
}

/**
 * The half of the build a student waits in front of: the topic's past questions
 * and the reading written from them.
 *
 * Split out of `startStudentChallenge` so the identical build can run BEFORE the
 * student presses Start — see `warmStudentChallenge`. Nothing in here depends on
 * the student: both calls are keyed by the creator's collection and the topic,
 * which is what makes warming it in advance the same content they would have
 * waited for.
 */
async function buildChallengeLesson(
  userId: string,
  row: ChallengeRow,
  access: ChallengeAccess,
  sourceDocumentTopic: boolean,
) {
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
    pastQuestions = await pastQuestionsForReplacedTopic(
      userId, row, access, lane.collectionKey, topicRequest, sourceDocumentTopic,
    );
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
  /**
   * THE READING IS NOT WAITED FOR HERE ANY MORE.
   *
   * Step one is the past questions, and only the past questions — the concepts
   * section it used to sit under is gone from the challenge screen. Blocking the
   * student on a model call whose output that screen never renders was the
   * largest share of the wait on Start, for nothing they were about to read.
   *
   * It is still WRITTEN, because Revision Docs is built from it
   * (`lib/data/student-revision-docs.ts`): the background pass already refetches
   * a reading whose lesson came through empty, which is exactly the state
   * `challengeLessonContent(pastQuestions, null)` leaves behind.
   */
  const title = String(selectedTopic?.title || row.topic_title || lane.subject);
  return {
    content: challengeLessonContent(pastQuestions, null),
    // `/start` rewrites the row's topic to whatever the provider actually
    // resolved, so a warm-up writes the same correction rather than leaving the
    // row pointing at a key the provider has renumbered.
    topicFields: selectedTopic
      ? { topic_key: selectedTopic.topic_key, topic_title: selectedTopic.title, title }
      : {},
  };
}

/** A provider miss — the topic it was asked for does not exist (any more). */
function isTopicMiss(error: unknown) {
  return error instanceof TeacherApiError && [404, 422].includes(error.status);
}

/**
 * Step one for a row whose topic the provider no longer knows.
 *
 * A daily row assigned before its subject's catalogue was re-read carries a key
 * that no longer exists — most often a whole UNIT ("Electro-chemistry and
 * Buffer") that the re-read split into its bullets. The candidates, in order:
 *
 *   1. the title a student sees — a re-extraction that renumbers keys almost
 *      never renames "Ohm's law";
 *   2. the unit's own bullets, which its blurb lists — the replaced unit's first
 *      subtopic is the challenge it meant;
 *   3. the subject's catalogue, in syllabus order;
 *   4. the provider's own choice.
 *
 * EVERY SUBTOPIC ALREADY IN TODAY'S QUEUE IS SKIPPED. Moving this row onto one
 * breaks the one-row-per-subtopic-per-day rule
 * (`student_challenges_course_daily_topic_key`): the provider's choice for a
 * retired Engineering Chemistry unit was a subtopic the student already had at
 * position 12, and the write failed with a raw database error the route could
 * only report as "Could not build this challenge from the course material."
 */
async function pastQuestionsForReplacedTopic(
  userId: string,
  row: ChallengeRow,
  access: ChallengeAccess,
  collectionKey: string,
  topicRequest: { subject: string; topics: string[]; limit: number },
  sourceDocumentTopic: boolean,
): Promise<TeacherChallengePastQuestionsResponse> {
  const admin = createSupabaseAdminClient();
  let sameDay = admin
    .from("student_challenges")
    .select("id,topic_key")
    .eq("user_id", userId)
    .eq("challenge_date", String(row.challenge_date ?? ""));
  sameDay = row.course_id ? sameDay.eq("course_id", String(row.course_id)) : sameDay.is("course_id", null);
  const { data: todays } = await sameDay;
  const taken = new Set(
    (todays || [])
      .filter((other) => String(other.id) !== String(row.id))
      .map((other) => String(other.topic_key || "")),
  );

  const candidates: string[] = [];
  if (!sourceDocumentTopic) {
    const title = String(row.topic_title || "").trim();
    if (title) candidates.push(title);
    // "Electro-chemical cells, Electrode Potential and Standard Electrode
    // Potential, ..." — split on commas that are not inside brackets, so
    // "(source, load, communication & control)" stays one bullet.
    const bullets = String(row.topic_blurb || "")
      .split(/,(?![^()]*\))/)
      .map((bullet) => bullet.trim())
      .filter((bullet) => bullet.length > 2);
    candidates.push(...bullets.slice(0, 8));
    try {
      const catalogue = row.course_id
        ? await readCourseLearningTopics(
            String(row.course_id), String(access.teacherId), String(row.subject_slug || ""), admin,
          )
        : null;
      candidates.push(
        ...(catalogue || [])
          .map((topic) => topic.topic_key)
          .filter((key) => key && !taken.has(key))
          .slice(0, 6),
      );
    } catch {
      // The catalogue is a better guess, not a requirement.
    }
  }

  for (const candidate of candidates) {
    if (taken.has(candidate)) continue;
    try {
      const response = await getTeacherChallengePastQuestions(collectionKey, {
        ...topicRequest,
        topics: [candidate],
      });
      const resolved = response.topics?.[0]?.topic_key;
      if (resolved && taken.has(resolved)) continue;
      return response;
    } catch (error) {
      if (!isTopicMiss(error)) throw error;
    }
  }

  const chosen = await getTeacherChallengePastQuestions(collectionKey, { ...topicRequest, topics: [] });
  const resolved = chosen.topics?.[0]?.topic_key;
  if (resolved && taken.has(resolved)) {
    throw new Error(
      "This challenge's topic was replaced when the course syllabus was re-read, and the subtopic it now maps to is already in today's list. Open that challenge instead.",
    );
  }
  return chosen;
}

/**
 * Build a challenge's lesson BEFORE the student asks for it.
 *
 * Pressing Start used to be the first moment anything was built, and the build
 * is two upstream calls — the topic's past questions, then a written reading —
 * so the first challenge of every subject opened on a spinner that had nothing
 * to do with the student. The content is the same for whoever is assigned that
 * subtopic, so there is no reason for it to be built in front of them.
 *
 * This writes ONLY the lesson. Status stays `assigned` and `started_at` stays
 * empty, because those two are the student's own clock: the hub must still say
 * Start rather than Continue, and the twenty minutes must not begin while the
 * page is being looked at. When Start is finally pressed, `startStudentChallenge`
 * sees `provider === "collection-challenge-v1"` on the row, hands the lesson
 * straight back and issues the paper behind it.
 */
export async function warmStudentChallenge(
  userId: string,
  challengeId: string,
  /** `poolOnly`: fill it from the global pool if its topic is ready there, and
   *  otherwise leave it — never an upstream call. */
  options: { poolOnly?: boolean } = {},
): Promise<"warmed" | "skipped" | "failed"> {
  const admin = createSupabaseAdminClient();
  const { data: raw, error } = await admin
    .from("student_challenges")
    .select("*")
    .eq("id", challengeId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  if (!raw) return "skipped";
  const row = raw as ChallengeRow;
  // Only an untouched row. A started challenge is already the student's, and a
  // completed one has a result on it that a rebuild would silently replace.
  if (String(row.status || "assigned") !== "assigned") return "skipped";
  if (isSourceDocumentChallengeRow(row)) return "skipped";
  // Nothing to warm when every open rebuilds anyway — warming would spend a
  // build the open is about to throw away.
  if (CHALLENGE_FRESH_CONTENT) return "skipped";
  const detail = toDetail(row);
  if (detail.content?.provider === "collection-challenge-v1") return "skipped";

  // A topic the global pool has ready is written straight from it — the whole
  // of step one, worked answers and reading included, with no upstream call.
  const pooled = await pooledChallengeContent(userId, row);
  if (pooled) {
    const { error: writeError } = await admin
      .from("student_challenges")
      .update({ content: pooled, updated_at: new Date().toISOString() })
      .eq("id", challengeId)
      .eq("user_id", userId)
      // As below: a row the student has started since the read is theirs.
      .eq("status", "assigned");
    return writeError ? "failed" : "warmed";
  }
  if (options.poolOnly) return "skipped";

  try {
    const access = await requireChallengeAccess(userId, row);
    const built = await buildChallengeLesson(userId, row, access, false);
    const { error: writeError } = await admin
      .from("student_challenges")
      .update({
        content: built.content,
        ...built.topicFields,
        updated_at: new Date().toISOString(),
      })
      .eq("id", challengeId)
      .eq("user_id", userId)
      // Nothing may be overwritten if the student got there first: between the
      // read above and this write they may have pressed Start, and that row is
      // now a started challenge with its own clock running.
      .eq("status", "assigned");
    if (writeError) throw writeError;
    return "warmed";
  } catch {
    // A warm-up that fails costs nothing: Start builds the lesson the old way.
    // It is deliberately not recorded on the row — a student must never be shown
    // an error for work they did not ask for.
    return "failed";
  }
}

const warmupsInFlight = new Map<string, Promise<unknown>>();

/**
 * Speculative warm-ups queue; a student waiting on Start does not.
 *
 * `scheduleChallengeWarmups` used to start one warm-up per subject in the same
 * instant, and each is a `past-questions` call — the heaviest non-model route on
 * the collection API. On 2026-09-19 eight of them were in flight together and
 * the tenant API logged nothing for 4m40s; the creator's own workspace reads
 * arrived in the middle of it, timed out, and the screen fell back to its
 * last-good snapshot ("The creator service is busy…"). Several serverless
 * renders each doing this independently is what turned one page view into a
 * burst — the same two lambdas were observed asking for identical subjects.
 *
 * Two at a time, and deliberately its own gate rather than one shared with the
 * on-demand path: this is work nobody has asked for yet, so it must never be
 * the reason a student who DID press Start is waiting. The total still reaching
 * the API is bounded by the server's `challenge_bank` pool, which is what holds
 * when several instances warm at once; this keeps a single instance from being
 * the burst in the first place, and stops it spending its own sockets on
 * requests the pool would only queue.
 */
const warmupGate = createLimiter(2);

/**
 * Warm the first open challenge of each subject, behind the response — and
 * prepare the very first one completely.
 *
 * One per subject, not the whole queue: the first card of each subject is what a
 * student opens, and every warm-up is two upstream calls that are wasted if the
 * challenge is never started. The first open card of all is the one they are
 * most likely to press, and nothing before it will prepare it (a challenge
 * prepares the one AFTER it — `scheduleNextChallengePreparation`), so it gets its
 * worked answers and reading too (`prepareStudentChallenge`). `after()` keeps
 * the work alive past the response without holding it open; outside a request
 * scope it throws and the promise is already running anyway.
 */
export function scheduleChallengeWarmups(userId: string, challenges: StudentChallengeSummary[]) {
  if (!challenges.some((challenge) => challenge.status === "assigned")) return;
  // The global pool first: a card whose topic it holds is filled from it (or
  // queued there) with no upstream call. Only the cards it cannot take are
  // warmed per student, exactly as before — which is every card while the pool
  // table does not exist yet.
  const task = warmChallengesFromPool(userId, challenges)
    .catch(() => new Set<string>())
    .then((pooled) =>
      scheduleLegacyChallengeWarmups(
        userId,
        challenges.filter((challenge) => !pooled.has(challenge.id)),
      ),
    );
  try {
    after(() => task);
  } catch {
    // Not in a request scope. The work is under way regardless.
  }
}

/** The per-student warm-up, for cards the global pool does not take. */
function scheduleLegacyChallengeWarmups(
  userId: string,
  challenges: StudentChallengeSummary[],
): Promise<unknown> {
  const tasks: Promise<unknown>[] = [];
  const firstOpen = challenges.find((challenge) => challenge.status === "assigned");
  if (firstOpen) tasks.push(scheduleChallengePreparation(userId, firstOpen.id));
  const firstPerSubject = new Map<string, StudentChallengeSummary>();
  for (const challenge of challenges) {
    if (challenge.status !== "assigned") continue;
    const key = `${challenge.courseId || ""}:${challenge.subjectSlug}`;
    if (!firstPerSubject.has(key)) firstPerSubject.set(key, challenge);
  }
  for (const challenge of firstPerSubject.values()) {
    // Being prepared, which warms it first.
    if (challenge.id === firstOpen?.id) continue;
    if (warmupsInFlight.has(challenge.id)) continue;
    const task = warmupGate(() => warmStudentChallenge(userId, challenge.id))
      .catch(() => null)
      .finally(() => warmupsInFlight.delete(challenge.id));
    warmupsInFlight.set(challenge.id, task);
    tasks.push(task);
    try {
      after(() => task);
    } catch {
      // Not in a request scope. The work is under way regardless.
    }
  }
  return Promise.all(tasks);
}

/**
 * The Challenge Hub's cards, through the global challenge pool.
 *
 * Every open card's topic is queued in the pool at the highest priority — a
 * student is looking at it — and a card whose topic is already ready there is
 * filled from it on the spot, which is a Supabase read and a write and nothing
 * upstream. Cards already built are the pool's too: nothing more is done for
 * them per student, since starting one takes its worked answers from the pool.
 *
 * Returns the ids the pool took. A card whose course no community owns, or whose
 * topic its catalogue does not list, is left for the per-student warm-up — and
 * so is every card while the pool does not exist.
 */
async function warmChallengesFromPool(
  userId: string,
  challenges: StudentChallengeSummary[],
): Promise<Set<string>> {
  const taken = new Set<string>();
  if (CHALLENGE_FRESH_CONTENT) return taken;
  const open = challenges.filter(
    (challenge) =>
      challenge.status === "assigned" &&
      challenge.courseId &&
      !isChallengeSourceDocumentTopic({
        topicKey: challenge.topicKey,
        title: challenge.topicTitle,
        subjectName: challenge.subjectName,
      }),
  );
  if (!open.length || !(await challengePoolAvailable())) return taken;

  // `pastQuestionCount` is null exactly while a card has no content yet.
  const built = (challenge: StudentChallengeSummary) =>
    challenge.pastQuestionCount !== null && challenge.pastQuestionCount !== undefined;
  const cold = open.filter((challenge) => !built(challenge));
  const statuses = cold.length
    ? await enqueueChallengeRows(
        cold.map((challenge) => ({
          courseId: challenge.courseId,
          subjectSlug: challenge.subjectSlug,
          topicKey: challenge.topicKey,
        })),
        CHALLENGE_POOL_PRIORITY.waiting,
      )
    : new Map();
  if (statuses === null) return taken;
  for (const challenge of open) if (built(challenge)) taken.add(challenge.id);

  let waiting = false;
  for (const challenge of cold) {
    const status = statuses.get(
      challengePoolRowKey(String(challenge.courseId), challenge.subjectSlug, challenge.topicKey),
    );
    if (!status) continue;
    taken.add(challenge.id);
    if (status === "ready") {
      await warmStudentChallenge(userId, challenge.id, { poolOnly: true }).catch(() => null);
    } else {
      waiting = true;
    }
  }
  if (waiting) kickChallengePoolSweep();
  return taken;
}

/**
 * THE NEXT CHALLENGE IS PREPARED WHILE THE STUDENT IS ON THIS ONE.
 *
 * Everything a challenge shows before its paper — the past questions, their
 * worked answers, the concepts reading — depends on the course and the topic,
 * never on the student, and the course API keeps what it writes: worked answers
 * are pooled per question and the reading is cached per topic's material
 * (`challenge_store` upstream). So the first student to reach a topic waits on
 * the model, and everyone after is served from the pool.
 *
 * This moves that first wait ahead of the student. The lesson is warmed onto the
 * row (`warmStudentChallenge`); the worked answers are asked for with exactly the
 * request the completion will make — the listed past questions — so they are in
 * the pool when it makes it; and the reading is written onto the row, so step
 * one's concepts card is there the moment the challenge opens and the completion
 * does not fetch it again. What is left after Start is pool hits and the paper.
 *
 * The paper is NOT issued here. It is the student's own sitting, and its clock
 * starts when it exists.
 *
 * Only an untouched row, and never twice: a row whose reading is already on it
 * has been prepared. Failure costs nothing — Start builds what is missing, as it
 * always has — and is never shown to the student, who did not ask for this work.
 */
export async function prepareStudentChallenge(
  userId: string,
  challengeId: string,
): Promise<"prepared" | "skipped" | "failed"> {
  if ((await warmStudentChallenge(userId, challengeId)) === "failed") return "failed";
  const admin = createSupabaseAdminClient();
  const { data: raw, error } = await admin
    .from("student_challenges")
    .select("*")
    .eq("id", challengeId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error || !raw) return error ? "failed" : "skipped";
  const row = raw as ChallengeRow;
  if (String(row.status || "assigned") !== "assigned") return "skipped";
  const content = toDetail(row).content;
  // Not warmed means warming was skipped for a reason (a source-document row,
  // fresh-content mode) that applies here too.
  if (content?.provider !== "collection-challenge-v1") return "skipped";
  if (content.lesson?.content?.length) return "skipped";

  try {
    const access = await requireChallengeAccess(userId, row);
    const lane = await resolveChallengeLane(userId, row, access);
    const topics = content.topicKeys?.length
      ? content.topicKeys
      : [String(row.topic_key || "")].filter(Boolean);
    const listed = (content.pastQuestions || [])
      .map((question) => question.question.trim())
      .filter(Boolean);
    // The completion's own request, so what it asks for after Start is what
    // this put in the pool. The answers themselves are not kept here: the
    // completion writes them, with the paper that must exclude them. An MCQ
    // community shows no worked answers, so none are written ahead for it.
    if ((await challengeFormatForCourse(row.course_id ? String(row.course_id) : null)) !== "mcq") {
      await getTeacherChallengeSolvedQuestions(lane.collectionKey, {
        subject: lane.subject,
        topics,
        limit: CHALLENGE_SOLVED_QUESTIONS,
        ...(listed.length ? { questions: listed } : {}),
      });
    }
    const learning = await getTeacherChallengeReading(lane.collectionKey, {
      subject: lane.subject,
      topics,
    });
    let write = admin
      .from("student_challenges")
      .update({ content: contentWithReading(content, learning) })
      .eq("id", challengeId)
      .eq("user_id", userId)
      // The student may have pressed Start while this ran; that row is theirs.
      .eq("status", "assigned");
    if (row.updated_at) write = write.eq("updated_at", String(row.updated_at));
    const { error: writeError } = await write;
    if (writeError) throw writeError;
    return "prepared";
  } catch {
    return "failed";
  }
}

const preparationsInFlight = new Map<string, Promise<unknown>>();

/** Prepare one challenge behind the response, through the warm-up gate. */
function scheduleChallengePreparation(userId: string, challengeId: string): Promise<unknown> {
  const running = preparationsInFlight.get(challengeId);
  if (running) return running;
  // Speculative work, so it queues behind the same gate as the warm-ups and is
  // never the reason a student who pressed Start is waiting.
  const task = warmupGate(() => prepareStudentChallenge(userId, challengeId))
    .catch(() => null)
    .finally(() => preparationsInFlight.delete(challengeId));
  preparationsInFlight.set(challengeId, task);
  try {
    after(() => task);
  } catch {
    // Not in a request scope. The work is under way regardless.
  }
  return task;
}

/**
 * The open challenge a student reaches after this one: the next in the same
 * subject, else the next on today's list — the order the hub and `/next` use.
 */
export async function nextOpenChallengeId(userId: string, current: ChallengeRow) {
  const rows = await listDailyRows(userId, nepaliChallengeDate());
  if (!rows) return null;
  const open = rows.filter(
    (row) =>
      String(row.id) !== String(current.id) &&
      String(row.status || "assigned") === "assigned" &&
      !isSourceDocumentChallengeRow(row),
  );
  const sameSubject = (row: ChallengeRow) =>
    String(row.course_id ?? "") === String(current.course_id ?? "") &&
    String(row.subject_slug ?? "") === String(current.subject_slug ?? "");
  const later = (row: ChallengeRow) => number(row.position) > number(current.position);
  const next =
    open.find((row) => sameSubject(row) && later(row)) ??
    open.find(sameSubject) ??
    open.find(later) ??
    open[0];
  return next ? String(next.id) : null;
}

/**
 * Once `current` has what its student needs, prepare the challenge after it.
 *
 * Through the global pool when it can: the next three topics of this subject
 * are queued there, and the student's next open card is filled from the pool if
 * its topic is ready (or queued there if not). A card the pool cannot take — no
 * pool table yet, or a topic outside its course's catalogue — is prepared per
 * student, as before.
 */
function scheduleNextChallengePreparation(userId: string, current: ChallengeRow) {
  const key = String(current.id);
  if (nextPreparationsInFlight.has(key)) return;
  const task = (async () => {
    const ahead = scheduleChallengePoolAhead(current);
    const nextId = await nextOpenChallengeId(userId, current);
    const viaPool = nextId
      ? await warmChallengeFromPool(userId, nextId).catch(() => "unpooled" as const)
      : null;
    if (nextId && viaPool === "unpooled") await scheduleChallengePreparation(userId, nextId);
    await ahead;
  })()
    .catch(() => null)
    .finally(() => nextPreparationsInFlight.delete(key));
  nextPreparationsInFlight.set(key, task);
  try {
    after(() => task);
  } catch {
    // Not in a request scope. The work is under way regardless.
  }
}

/**
 * Queue the topics a student reaches after `row` into the global challenge pool
 * — the next `CHALLENGE_POOL_AHEAD` of this subject, in syllabus order — and
 * start preparing them behind the response.
 *
 * Enqueueing only: a few Supabase reads and a write, never the course API. A
 * no-op for a private subject (no course), a source-document row, and while the
 * pool table does not exist.
 */
function scheduleChallengePoolAhead(row: ChallengeRow, access?: ChallengeAccess): Promise<unknown> {
  if (!row.course_id || isSourceDocumentChallengeRow(row) || CHALLENGE_FRESH_CONTENT) {
    return Promise.resolve(null);
  }
  const task = enqueueChallengeTopics({
    courseId: String(row.course_id),
    teacherId: access?.teacherId,
    subjectSlug: String(row.subject_slug || ""),
    afterTopicKey: String(row.topic_key || ""),
    afterTopicTitle: String(row.topic_title || ""),
    count: CHALLENGE_POOL_AHEAD,
    priority: CHALLENGE_POOL_PRIORITY.next,
  })
    .then((result) => {
      if (result.pending.length) kickChallengePoolSweep();
      return result;
    })
    .catch(() => null);
  try {
    after(() => task);
  } catch {
    // Not in a request scope. The work is under way regardless.
  }
  return task;
}

/**
 * One open card, through the global pool: filled from it when its topic is
 * ready, queued there when it is not. `unpooled` means the pool cannot take it
 * and the caller should prepare it per student.
 */
async function warmChallengeFromPool(
  userId: string,
  challengeId: string,
): Promise<"warmed" | "pooled" | "skipped" | "unpooled"> {
  const { data: raw, error } = await createSupabaseAdminClient()
    .from("student_challenges")
    .select("*")
    .eq("id", challengeId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error || !raw) return "skipped";
  const row = raw as ChallengeRow;
  if (String(row.status || "assigned") !== "assigned" || isSourceDocumentChallengeRow(row)) {
    return "skipped";
  }
  if (CHALLENGE_FRESH_CONTENT || !row.course_id) return "unpooled";
  const queued = await enqueueChallengeTopics({
    courseId: String(row.course_id),
    subjectSlug: String(row.subject_slug || ""),
    topicKeys: [String(row.topic_key || "")],
    priority: CHALLENGE_POOL_PRIORITY.waiting,
  });
  if (!queued.pooled) return "unpooled";
  if (queued.topics.get(String(row.topic_key || "")) !== "ready") {
    kickChallengePoolSweep();
    return "pooled";
  }
  const warmed = await warmStudentChallenge(userId, challengeId, { poolOnly: true });
  return warmed === "warmed" ? "warmed" : "pooled";
}

/** The same student always gets the same cut of a topic's bank. */
function poolSeed(userId: string, row: ChallengeRow) {
  return [userId, row.course_id, row.subject_slug, row.topic_key].map(String).join(":");
}

/**
 * Up to `limit` items, a window that starts at a place fixed by `seed` and wraps,
 * returned in the bank's own order. A topic with a deep bank therefore shows
 * different students different questions — and the exam, which excludes what a
 * student was shown worked, differs with them — while one student reopening it
 * sees the same list every time.
 */
function rotatedSelection<T>(items: T[], seed: string, limit: number): T[] {
  if (items.length <= limit) return [...items];
  const offset = createHash("sha1").update(seed).digest().readUInt32BE(0) % items.length;
  return Array.from({ length: limit }, (_, index) => (offset + index) % items.length)
    .sort((left, right) => left - right)
    .map((index) => items[index]);
}

type ListedQuestion = { id?: string; text: string };

/**
 * The pooled worked answer for a listed question: joined on normalized question
 * text, as step one's list and the worked answers always are, then on the bank's
 * question id.
 */
function pooledAnswerFinder(snapshot: ChallengePoolSnapshot) {
  const answered = (snapshot.content.solved || []).filter(
    (question) => question.text?.trim() && question.solution?.trim(),
  );
  const byText = new Map(
    answered.map((question) => [normalizeQuestionText(question.text), question]),
  );
  const byId = new Map(
    answered.filter((question) => question.id).map((question) => [String(question.id), question]),
  );
  return (question: ListedQuestion) =>
    byText.get(normalizeQuestionText(question.text)) ??
    (question.id ? byId.get(String(question.id)) : undefined);
}

/**
 * The past questions a student's step one lists from a pooled bank: all of them
 * when there are ten or fewer, otherwise a per-student window — taken from the
 * questions that have a worked answer first, so the list a student reads is one
 * they can open onto its solution.
 */
function pooledListedQuestions(snapshot: ChallengePoolSnapshot, seed: string) {
  const bank = snapshot.content.past_questions || [];
  if (bank.length <= CHALLENGE_PAST_QUESTIONS) return [...bank];
  const answerFor = pooledAnswerFinder(snapshot);
  const indexed = bank.map((question, index) => ({ question, index }));
  const worked = indexed.filter(({ question }) =>
    Boolean(answerFor({ id: question.id, text: String(question.text || "") })),
  );
  const unworked = indexed.filter((entry) => !worked.includes(entry));
  const picked = rotatedSelection(worked, seed, CHALLENGE_PAST_QUESTIONS);
  if (picked.length < CHALLENGE_PAST_QUESTIONS) {
    picked.push(...rotatedSelection(unworked, seed, CHALLENGE_PAST_QUESTIONS - picked.length));
  }
  return picked.sort((left, right) => left.index - right.index).map(({ question }) => question);
}

/**
 * The worked answers a student is shown from a pooled bank: exactly the listed
 * past questions that have one, in the listed order — or, for a topic no paper
 * examined, the bank's worked examples from the notes.
 */
function pooledWorkedExamples(
  snapshot: ChallengePoolSnapshot,
  listed: ListedQuestion[],
  seed: string,
): ChallengeSolvedExample[] {
  if (listed.length) {
    const answerFor = pooledAnswerFinder(snapshot);
    return listed.flatMap((question) => {
      const answer = answerFor(question);
      // Filed under the listed text, so step one shows one row for the question
      // and its solution even when the join was on the id.
      return answer ? [{ ...solvedExample(answer), question: question.text }] : [];
    });
  }
  const answered = (snapshot.content.solved || []).filter(
    (question) => question.text?.trim() && question.solution?.trim(),
  );
  return rotatedSelection(answered, seed, CHALLENGE_SOLVED_QUESTIONS).map(solvedExample);
}

/** A pooled reading in the shape the reading route returns it. */
function pooledReading(
  snapshot: ChallengePoolSnapshot,
  row: ChallengeRow,
): TeacherChallengeLearnResponse | null {
  const reading = snapshot.content.reading;
  if (!reading || !String(reading.content || "").trim()) return null;
  return {
    collection: "",
    subject: String(row.subject_name || ""),
    subject_slug: String(row.subject_slug || ""),
    topics: snapshot.content.topics || [],
    reading,
    served_from: "pool",
    warnings: [],
  };
}

/**
 * A student's challenge content, cut from the pooled bank: up to ten past
 * questions (a per-student window of a deeper bank), the worked answers for
 * exactly those, and the reading. Everything but the paper — `contentStatus`
 * stays `pending`, and the background pass issues the exam excluding the worked
 * questions. Null when the bank has nothing a challenge could be built on.
 */
function contentFromPoolSnapshot(
  userId: string,
  row: ChallengeRow,
  snapshot: ChallengePoolSnapshot,
): StudentChallengeContent | null {
  const seed = poolSeed(userId, row);
  const bank = snapshot.content;
  const listed = pooledListedQuestions(snapshot, seed);
  const examples = pooledWorkedExamples(
    snapshot,
    listed
      .map((question) => ({ id: question.id, text: String(question.text || "").trim() }))
      .filter((question) => question.text),
    seed,
  );
  if (!listed.length && !examples.length) return null;
  const topics = bank.topics?.length
    ? bank.topics
    : [
        {
          topic_key: String(row.topic_key || ""),
          title: snapshot.topicTitle || String(row.topic_title || ""),
          order_index: 0,
        },
      ];
  const topicTitle = topics[0]?.title || String(row.topic_title || "this topic");
  const lesson = challengeLessonContent(
    {
      collection: "",
      subject: String(row.subject_name || ""),
      subject_slug: String(row.subject_slug || ""),
      topics,
      topic_source: "stored",
      can_start: true,
      questions: listed,
      grounded: listed.length > 0,
      blockers: [],
      warnings: [],
      note: "",
    },
    pooledReading(snapshot, row),
  );
  return {
    ...lesson,
    // Not something the pool records; nothing reads it but the console.
    pastQuestionSource: undefined,
    pooledFrom: { revision: snapshot.revision, preparedAt: snapshot.preparedAt },
    solvedExamples: examples,
    solvedWarning:
      !listed.length && examples.length
        ? `No past question in this course's question bank is matched to ${topicTitle}, so these worked examples were prepared from the course notes.`
        : null,
  };
}

/** The row's topic from the global pool, when it is ready there. Never throws. */
function poolSnapshotForRow(row: ChallengeRow) {
  if (!row.course_id || isSourceDocumentChallengeRow(row) || CHALLENGE_FRESH_CONTENT) {
    return Promise.resolve(null);
  }
  return readyPoolSnapshot(
    String(row.course_id),
    String(row.subject_slug || ""),
    String(row.topic_key || ""),
  );
}

/** A challenge's content cut from the global pool, or null to build it per student. */
async function pooledChallengeContent(userId: string, row: ChallengeRow) {
  const snapshot = await poolSnapshotForRow(row);
  return snapshot ? contentFromPoolSnapshot(userId, row, snapshot) : null;
}

/**
 * The worked answers (and, if missing, the reading) for a completion, from the
 * global pool — so the background pass issues only the paper.
 *
 * A row cut from the pool already carries its answers. A row built per student
 * whose topic has since become ready in the pool takes the pooled answers for
 * the questions it lists; if none of them match, null, and the course API is
 * asked the old way.
 */
async function pooledCompletionContent(
  userId: string,
  row: ChallengeRow,
  pending: StudentChallengeContent,
): Promise<StudentChallengeContent | null> {
  if (pending.pooledFrom) return pending;
  const snapshot = await poolSnapshotForRow(row);
  if (!snapshot) return null;
  const listed = (pending.pastQuestions || [])
    .map((question) => ({ id: question.id || undefined, text: question.question.trim() }))
    .filter((question) => question.text);
  const examples = pooledWorkedExamples(snapshot, listed, poolSeed(userId, row));
  if (!examples.length) return null;
  const withAnswers: StudentChallengeContent = {
    ...pending,
    pooledFrom: { revision: snapshot.revision, preparedAt: snapshot.preparedAt },
    solvedExamples: examples,
    solvedWarning: null,
  };
  const reading = pooledReading(snapshot, row);
  return !withAnswers.lesson?.content?.length && reading
    ? contentWithReading(withAnswers, reading)
    : withAnswers;
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
  const pending = detail.content;
  // Another process may have finished it between the schedule and this run.
  if (!pending || pending.contentStatus !== "pending") return detail;

  const access = await requireChallengeAccess(userId, row);
  const lane = await resolveChallengeLane(userId, row, access);
  const topicKeys = pending.topicKeys?.length
    ? pending.topicKeys
    : [String(row.topic_key || "")].filter(Boolean);
  const topicTitle = String(row.topic_title || detail.topicTitle || "this topic");

  /**
   * THE READING IS WRITTEN AFTER THE STUDENT IS SERVED, NEVER BEFORE.
   *
   * `/start` no longer fetches it, so this lesson is always empty here — and it
   * used to be fetched in a `Promise.all` with the worked examples, which made
   * `contentStatus: "ready"` wait for BOTH. On a cold topic the reading is the
   * slowest call in the whole build (a long-form write-up, ten to twenty minutes
   * on the live collection), and the challenge screen does not render it: it is
   * kept for Revision Docs. So the worked examples and the paper the student
   * was actually waiting for sat behind a document they would never see there.
   *
   * It is now attached by `scheduleChallengeReading` once this pass has written
   * everything the student needs.
   */
  const needsReading = !pending.lesson?.content?.length;
  const settings = await challengeSettingsForCourse(row.course_id ? String(row.course_id) : null);
  try {
    /**
     * THE QUESTIONS STEP ONE LISTED ARE THE ONES ANSWERED.
     *
     * Step one shows up to ten past questions; this call used to ask for five of
     * its own, drawn independently, so a listed question could come back "not
     * worked" while an answer was written for one the student never saw. Naming
     * the listed texts answers exactly those. A topic with no past questions
     * still gets its five worked examples from the notes.
     */
    const listed = (pending.pastQuestions || [])
      .map((question) => question.question.trim())
      .filter(Boolean);
    // THE GLOBAL POOL FIRST. A topic it holds ready already has its worked
    // answers — and usually its reading — so the only call left is the paper.
    // AN MCQ COMMUNITY STUDIES FROM THE CONCEPTS AND ANSWERS MCQs — nothing else.
    // Its screen shows no past questions and no worked answers, so writing them
    // would be model spend on work nobody reads.
    const mcqOnly = settings.format === "mcq";
    let withSolved = mcqOnly
      ? { ...pending, solvedExamples: [], solvedWarning: null }
      : await pooledCompletionContent(userId, row, pending);
    let worked = (withSolved?.solvedExamples || []).map((example) => example.question);
    if (!withSolved) {
      const solved = await getTeacherChallengeSolvedQuestions(lane.collectionKey, {
        subject: lane.subject,
        topics: topicKeys,
        limit: CHALLENGE_SOLVED_QUESTIONS,
        ...(listed.length ? { questions: listed } : {}),
      });
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
      withSolved = contentWithSolved(pending, solved, practiceTopics, topicTitle);
      worked = (solved.questions || []).map((question) => question.text);
    }
    const paper = await issueFormattedChallengeExam({
      format: settings.format,
      mcqCount: settings.mcqCount,
      negativePercent: settings.negativePercent,
      challengeId,
      collectionKey: lane.collectionKey,
      subject: lane.subject,
      topicKeys,
      topicTitle,
      durationMinutes: number(row.duration_minutes) || 20,
      attemptNumber: number(row.attempt_count) + 1,
      exclude: worked,
    });
    const content: StudentChallengeContent = {
      ...contentWithExam(withSolved, paper, number(row.attempt_count) + 1),
      contentStatus: "ready",
      contentPendingSince: undefined,
      contentError: null,
    };
    const now = new Date().toISOString();
    const { data, error } = await admin
      .from("student_challenges")
      .update({
        external_paper_id: paper.externalPaperId,
        content,
        total_marks: paper.totalMarks,
        pass_marks: paper.passMarks,
        duration_minutes: paper.durationMinutes,
        // The clock the student sees starts when the paper exists, not when the
        // lesson did — otherwise every second spent building this ate into the
        // twenty minutes they are given to sit it.
        started_at: now,
        updated_at: now,
      })
      .eq("id", challengeId)
      .eq("user_id", userId)
      // ONLY OVER A ROW STILL WAITING FOR ITS PAPER. Two runs of this build (the
      // stale re-kick on another worker, a retry) each issue a paper; the second
      // one landing used to swap the questions out from under a student already
      // answering the first, and every pick then failed "not on your paper".
      .eq("content->>contentStatus", "pending")
      .select("*")
      .maybeSingle();
    if (error) throw error;
    if (!data) return (await getStudentChallenge(userId, challengeId)) ?? detail;
    // A pooled reading may have arrived with the answers.
    if (needsReading && !content.lesson?.content?.length) {
      scheduleChallengeReading(userId, challengeId, lane.collectionKey, {
        subject: lane.subject,
        topics: topicKeys,
      });
    }
    // The student has everything they are waiting for; the next challenge is
    // prepared behind this one's reading, which their step one is showing.
    const reading = readingsInFlight.get(challengeId);
    if (reading) void reading.then(() => scheduleNextChallengePreparation(userId, row));
    else scheduleNextChallengePreparation(userId, row);
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
          contentError: studentFacingBuildError(message),
        } satisfies StudentChallengeContent,
        updated_at: new Date().toISOString(),
      })
      .eq("id", challengeId)
      .eq("user_id", userId)
      // A run that did finish must not be knocked back to pending by this one.
      .eq("content->>contentStatus", "pending")
      .select("*")
      .maybeSingle();
    return data ? toDetail(data as ChallengeRow) : ((await getStudentChallenge(userId, challengeId)) ?? detail);
  } finally {
    completionsInFlight.delete(challengeId);
  }
}

const answerTopUpsInFlight = new Map<string, Promise<void>>();

function scheduleChallengeAnswerTopUp(userId: string, challengeId: string, access: ChallengeAccess) {
  if (answerTopUpsInFlight.has(challengeId) || completionsInFlight.has(challengeId)) return;
  const task = topUpChallengeAnswers(userId, challengeId, access)
    .catch(() => undefined)
    .finally(() => {
      answerTopUpsInFlight.delete(challengeId);
    });
  answerTopUpsInFlight.set(challengeId, task);
  try {
    after(() => task);
  } catch {
    // Not in a request scope. The work is under way regardless.
  }
}

/**
 * Answer the listed past questions a finished challenge left unanswered.
 *
 * Step one lists up to ten past questions and the build used to answer an
 * independent five, so a challenge built before the two were joined shows
 * listed questions as "not worked" — for good, since a ready row is never
 * rebuilt on a reopen. Only questions the row itself lists are asked for and
 * kept; anything the route hands back beyond them is dropped. A question on the
 * student's own paper is never answered here: the old build excluded only the
 * five it answered from the exam, so a listed-but-unanswered question can be
 * one they are about to sit.
 */
async function topUpChallengeAnswers(userId: string, challengeId: string, access: ChallengeAccess) {
  const admin = createSupabaseAdminClient();
  const { data: raw, error } = await admin
    .from("student_challenges")
    .select("*")
    .eq("id", challengeId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error || !raw) return;
  const row = raw as ChallengeRow;
  const content = toDetail(row).content;
  if (!content || content.contentStatus !== "ready") return;

  const answered = new Set(
    (content.solvedExamples || [])
      .filter((example) => example.solution)
      .map((example) => normalizeQuestionText(example.question)),
  );
  const onThePaper = new Set(
    (content.examQuestions || []).map((question) => normalizeQuestionText(question.question)),
  );
  const missing = (content.pastQuestions || [])
    .map((question) => question.question.trim())
    .filter((text) => {
      const key = normalizeQuestionText(text);
      return text && !answered.has(key) && !onThePaper.has(key);
    });
  if (!missing.length) return;

  const lane = await resolveChallengeLane(userId, row, access);
  const topicKeys = content.topicKeys?.length
    ? content.topicKeys
    : [String(row.topic_key || "")].filter(Boolean);
  const solved = await getTeacherChallengeSolvedQuestions(lane.collectionKey, {
    subject: lane.subject,
    topics: topicKeys,
    limit: CHALLENGE_SOLVED_QUESTIONS,
    questions: missing,
  });
  const wanted = new Set(missing.map(normalizeQuestionText));
  const fresh = (solved.questions || [])
    .map(solvedExample)
    .filter((example) => example.solution && wanted.has(normalizeQuestionText(example.question)));
  if (!fresh.length) return;

  let write = admin
    .from("student_challenges")
    .update({
      content: { ...content, solvedExamples: [...(content.solvedExamples || []), ...fresh] },
    })
    .eq("id", challengeId)
    .eq("user_id", userId);
  // Onto the row as it was read, as the reading attach does: a submit that
  // lands in between wins, and the answers are asked for again next open.
  if (row.updated_at) write = write.eq("updated_at", String(row.updated_at));
  await write;
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
    // The reading the completion hands off is awaited here too, so a serverless
    // runtime keeps the process alive until it has landed on the row.
    after(async () => {
      await task;
      await readingsInFlight.get(challengeId);
      await nextPreparationsInFlight.get(challengeId);
    });
  } catch {
    // Not in a request scope. The work is under way regardless.
  }
}

/**
 * Write a challenge's reading onto its row once the student already has
 * everything they are waiting for — see `runChallengeContentCompletion`.
 *
 * Fetched outside `completionsInFlight` on purpose: a completion still marked
 * in flight holds off `scheduleChallengeExamRefresh`, and a reading that takes
 * twenty minutes must not stop an expired paper being reissued.
 */
function scheduleChallengeReading(
  userId: string,
  challengeId: string,
  collectionKey: string,
  request: { subject: string; topics: string[] },
) {
  if (readingsInFlight.has(challengeId)) return;
  const task = attachChallengeReading(userId, challengeId, collectionKey, request)
    .catch((cause) => recordReadingError(userId, challengeId, cause))
    .catch(() => undefined)
    .finally(() => {
      readingsInFlight.delete(challengeId);
    });
  readingsInFlight.set(challengeId, task);
}

/** Park why the reading failed on the row, so a waiting screen can stop waiting. */
async function recordReadingError(userId: string, challengeId: string, cause: unknown) {
  const message =
    cause instanceof Error && cause.message
      ? cause.message
      : "The concepts reading could not be written from the course material.";
  const admin = createSupabaseAdminClient();
  const { data: raw } = await admin
    .from("student_challenges")
    .select("*")
    .eq("id", challengeId)
    .eq("user_id", userId)
    .maybeSingle();
  if (!raw) return;
  const row = raw as ChallengeRow;
  const content = toDetail(row).content;
  if (!content || content.lesson?.content?.length) return;
  let write = admin
    .from("student_challenges")
    .update({ content: { ...content, readingError: message } satisfies StudentChallengeContent })
    .eq("id", challengeId)
    .eq("user_id", userId);
  // As the reading attach does: onto the row as read, `updated_at` untouched.
  if (row.updated_at) write = write.eq("updated_at", String(row.updated_at));
  await write;
}

/**
 * EVERY CHALLENGE GETS ITS CONCEPTS READING.
 *
 * The reading is written after a challenge is `ready`, behind everything the
 * student waits for — so a pass that died after `ready` (a deploy, a timeout, an
 * upstream failure) left a challenge that never shows its Concepts card, and a
 * ready row is never rebuilt on a reopen. Rows built before the reading moved
 * behind `ready` are the same. Any open, poll or Revision view of such a row asks
 * for it again here.
 *
 * At most once per `READING_RETRY_MS` per challenge in a process: the screen
 * polls every few seconds, and a topic whose material cannot produce a reading
 * must not be asked for on every poll. True while a reading is being written or
 * was asked for recently — what a screen says "a moment" about.
 */
const READING_RETRY_MS = 3 * 60_000;
const readingRequestedAt = new Map<string, number>();

export function readingMissing(row: ChallengeRow) {
  const content = toDetail(row).content;
  return Boolean(
    content &&
      // Still building: the completion writes the reading itself.
      content.contentStatus !== "pending" &&
      !content.lesson?.content?.length &&
      !isSourceDocumentChallengeRow(row) &&
      (content.topicKeys?.length || row.topic_key),
  );
}

export function scheduleChallengeReadingBackfill(
  userId: string,
  row: ChallengeRow,
  access?: ChallengeAccess,
): boolean {
  if (!readingMissing(row)) return false;
  const challengeId = String(row.id);
  if (readingsInFlight.has(challengeId)) return true;
  const now = Date.now();
  if (now - (readingRequestedAt.get(challengeId) ?? 0) < READING_RETRY_MS) {
    return !toDetail(row).content?.readingError;
  }
  if (readingRequestedAt.size > 2_000) {
    for (const [id, at] of readingRequestedAt) {
      if (now - at >= READING_RETRY_MS) readingRequestedAt.delete(id);
    }
  }
  readingRequestedAt.set(challengeId, now);
  const content = toDetail(row).content as StudentChallengeContent;
  const task = (async () => {
    const lane = await resolveChallengeLane(userId, row, access ?? (await requireChallengeAccess(userId, row)));
    scheduleChallengeReading(userId, challengeId, lane.collectionKey, {
      subject: lane.subject,
      topics: content.topicKeys?.length ? content.topicKeys : [String(row.topic_key || "")],
    });
    await readingsInFlight.get(challengeId);
  })().catch(() => undefined);
  try {
    after(() => task);
  } catch {
    // Not in a request scope. The work is under way regardless.
  }
  return true;
}

async function attachChallengeReading(
  userId: string,
  challengeId: string,
  collectionKey: string,
  request: { subject: string; topics: string[] },
) {
  const learning = await getTeacherChallengeReading(collectionKey, request);
  const admin = createSupabaseAdminClient();
  const { data: raw, error } = await admin
    .from("student_challenges")
    .select("*")
    .eq("id", challengeId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error || !raw) return;
  const row = raw as ChallengeRow;
  const content = toDetail(row).content;
  // Something else wrote a lesson while this was being fetched — a restart, or
  // another process's pass. Theirs is newer; this one is dropped.
  if (!content || content.lesson?.content?.length) return;
  let write = admin
    .from("student_challenges")
    .update({ content: contentWithReading(content, learning) })
    .eq("id", challengeId)
    .eq("user_id", userId);
  // Only onto the row as it was read: a submit or a restart that lands between
  // the read and this write carries content this merge has never seen, and the
  // reading is the one to lose, not their write. `updated_at` is deliberately
  // not bumped — nothing the student is looking at has changed.
  if (row.updated_at) write = write.eq("updated_at", String(row.updated_at));
  await write;
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
  const access = await requireChallengeAccess(userId, row);
  const detail = toDetail(row);
  if (detail.content) {
    restartStaleContentCompletion(userId, challengeId, detail.content, options.retry);
  }
  scheduleChallengeReadingBackfill(userId, row, access);
  if (detail.status === "completed") return withLatestAttemptReview(userId, row, detail);
  return detail;
}

/**
 * The Roman Nepali's own style, in the hash beside the English. Bump it with the
 * course API's `TRANSLATION_SHAPE` so translations kept on rows under an older
 * style are written again. v2: casual, English-heavy, no bookish Nepali.
 */
const ROMAN_NEPALI_STYLE = "rn-v2";

function romanNepaliSourceHash(reading: string[], solutions: string[]) {
  return createHash("sha1")
    .update(JSON.stringify([ROMAN_NEPALI_STYLE, reading, solutions]))
    .digest("hex");
}

/**
 * The challenge's reading and worked answers in Roman Nepali.
 *
 * Written from the English already on the row — the course API translates and
 * does not re-derive, holding the maths, code and tables to come back exactly —
 * and kept on the row once complete, so switching language again is a read. A
 * partial translation is served but not kept, so the missing parts are tried
 * again next time. Every translation is also pooled upstream per text, so a
 * topic is paid for once across every student who reads it in Roman Nepali.
 */
export async function getStudentChallengeRomanNepali(
  userId: string,
  challengeId: string,
): Promise<ChallengeRomanNepali | null> {
  const admin = createSupabaseAdminClient();
  const { data: raw, error } = await admin
    .from("student_challenges")
    .select("*")
    .eq("id", challengeId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  if (!raw) return null;
  const row = raw as ChallengeRow;
  const access = await requireChallengeAccess(userId, row);
  const content = toDetail(row).content;
  const reading = content?.lesson?.content ?? [];
  const worked = (content?.solvedExamples || []).filter((example) => example.solution?.trim());
  const sourceHash = romanNepaliSourceHash(
    reading,
    worked.map((example) => example.solution),
  );
  if (content?.romanNepali?.sourceHash === sourceHash) return content.romanNepali;
  if (!content || (!reading.length && !worked.length)) {
    return { sourceHash, reading: [], solutions: {}, untranslated: 0 };
  }

  const lane = await resolveChallengeLane(userId, row, access);
  const texts = [...reading, ...worked.map((example) => example.solution)];
  const response = await translateTeacherChallengeTexts(lane.collectionKey, {
    subject: lane.subject,
    texts,
  });
  // Anything but an aligned answer is not trusted item by item.
  const aligned = response.texts?.length === texts.length;
  const out = aligned ? response.texts : texts;
  const result: ChallengeRomanNepali = {
    sourceHash,
    reading: out.slice(0, reading.length),
    solutions: Object.fromEntries(
      worked.map((example, index) => [
        normalizeQuestionText(example.question),
        out[reading.length + index],
      ]),
    ),
    untranslated: aligned
      ? (response.translated || []).filter((ok) => !ok).length
      : texts.length,
  };
  // Kept even when some parts stayed English. Those are the parts the
  // translator refuses on purpose (maths, code, tables it would change), so
  // asking again returns the same English at the price of another model call
  // on every switch — which is what math-heavy challenges were paying. A reply
  // that is not aligned is the service failing, not refusing: never filed.
  if (aligned) {
    let write = admin
      .from("student_challenges")
      .update({ content: { ...content, romanNepali: result } satisfies StudentChallengeContent })
      .eq("id", challengeId)
      .eq("user_id", userId);
    // Onto the row as read, `updated_at` untouched — as the reading attach does.
    if (row.updated_at) write = write.eq("updated_at", String(row.updated_at));
    await write;
  }
  return result;
}

/** Reopens a completed challenge with a fresh sitting; prior attempts remain durable. */
export async function restartStudentChallenge(userId: string, challengeId: string) {
  const detail = await getStudentChallenge(userId, challengeId);
  if (!detail) return null;
  // `restart` on BOTH paths. An unfinished challenge used to be sent through the
  // ordinary open, which is the one that short-circuits on content already sitting
  // on the row — so pressing restart on the challenge a student is actually
  // looking at did nothing at all, no call left the app, and the reading they
  // wanted rebuilt came straight back. Finished or not, a restart means "build
  // this again from the course material".
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
  const settings = await challengeSettingsForCourse(detail.courseId);
  const paper = await issueFormattedChallengeExam({
    format: settings.format,
    mcqCount: settings.mcqCount,
    negativePercent: settings.negativePercent,
    challengeId,
    collectionKey: lane.collectionKey,
    subject: lane.subject,
    topicKeys: detail.content.topicKeys?.length
      ? detail.content.topicKeys
      : [String(row.topic_key || "")].filter(Boolean),
    topicTitle: detail.topicTitle,
    durationMinutes: detail.durationMinutes,
    attemptNumber: detail.attemptCount + 1,
    // A retake must not be handed the worked examples as its paper. The pool
    // serves least-served-first, so this mostly matters on a thin topic.
    exclude: (detail.content.solvedExamples || []).map((example) => example.question),
  });
  if (!paper.externalPaperId || !paper.questions.length) {
    throw new Error("The course API could not issue a fresh challenge exam.");
  }
  const content = contentWithExam(detail.content, paper, detail.attemptCount + 1);
  const now = new Date().toISOString();
  const { data, error } = await admin
    .from("student_challenges")
    .update({
      status: "started",
      external_paper_id: paper.externalPaperId,
      content,
      total_marks: paper.totalMarks,
      pass_marks: paper.passMarks,
      duration_minutes: paper.durationMinutes,
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
  // A finished topic moves the student's frontier: the three after it are
  // queued in the global pool (a priority bump if starting it already did).
  if (row && (row as ChallengeRow).status === "completed") {
    void scheduleChallengePoolAhead(row as ChallengeRow);
  }
  return row ? toDetail(row as ChallengeRow) : null;
}

export type ChallengeFigureResult = {
  challenge: StudentChallengeDetail | null;
  /** The example's solution as it now stands, for a screen that holds only it. */
  solution: string | null;
  /** Why nothing was drawn, when nothing was. */
  reason?: "not_found" | "nothing_missing" | "unavailable";
};

/** The renderer's own verdict: not drawn, and nothing drawing or about to. */
async function figureIsDead(digest: string): Promise<boolean> {
  try {
    const response = await proxyMedia(`/api/figure/${digest}/status`);
    if (!response.ok) return false;
    const state = (await response.json()) as { ready?: boolean; working?: boolean };
    return state.ready === false && state.working === false;
  } catch {
    return false;
  }
}

/**
 * Draw the picture a worked solution promised and lost, and file it on the row.
 *
 * `lib/answer-figures.ts` explains how solutions came to say "### Diagram" over
 * nothing. The screen that shows one asks here once; the render service names
 * the figure straight away and draws it behind the response, and the image
 * markdown is written into the solution so every later view — the challenge,
 * its revision doc, another device — already has it and nothing asks again.
 *
 * Found by question text rather than position: the screen shows past questions
 * and worked examples merged into one list (`mergeLearnQuestions`), so it holds
 * the question, not the example's index.
 */
export async function drawMissingChallengeFigure(
  userId: string,
  challengeId: string,
  question: string,
  /** A figure already on this solution that the renderer gave up on: replace it. */
  deadFigureUrl?: string,
): Promise<ChallengeFigureResult> {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("student_challenges")
    .select("*")
    .eq("id", challengeId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return { challenge: null, solution: null, reason: "not_found" };
  const row = data as ChallengeRow;
  const access = await requireChallengeAccess(userId, row);

  const content = toDetail(row).content;
  const examples = content?.solvedExamples ?? [];
  const wanted = normalizeQuestionText(question);
  const index = examples.findIndex((example) => normalizeQuestionText(example.question) === wanted);
  const example = examples[index];
  if (!content || !example) {
    return { challenge: await withLatestAttemptReview(userId, row), solution: null, reason: "not_found" };
  }
  // A redraw starts from the solution without the dead picture — but only a
  // picture this solution really holds, and that the renderer itself says is
  // not coming: a browser cannot talk the server into re-billing a figure that
  // is merely slow, or into removing one that is fine.
  const deadDigest = deadFigureUrl ? drawnFigureDigest(deadFigureUrl) : null;
  let base = example.solution;
  if (deadFigureUrl && deadDigest && base.includes(`](${deadFigureUrl})`)) {
    if (await figureIsDead(deadDigest)) base = withoutFigure(base, deadFigureUrl);
  }
  const redrawOf = base !== example.solution ? deadDigest ?? undefined : undefined;
  const section = emptyFigureSection(base, example.question);
  if (!section) {
    // Already drawn — by another tab, or an earlier visit this one's cache missed.
    return {
      challenge: await withLatestAttemptReview(userId, row),
      solution: example.solution,
      reason: "nothing_missing",
    };
  }

  const lane = await resolveChallengeLane(userId, row, access);
  const reply = await requestTeacherMediaImage(lane.collectionKey, {
    brief: figureBrief(example.question, section, redrawOf),
    alt: section.heading,
  });
  if (!reply.url) {
    return {
      challenge: await withLatestAttemptReview(userId, row),
      solution: example.solution,
      reason: "unavailable",
    };
  }

  const solution = withFigure(base, section, reply.url);
  const next: StudentChallengeContent = {
    ...content,
    solvedExamples: examples.map((entry, position) =>
      position === index ? { ...entry, solution } : entry,
    ),
  };
  let write = admin
    .from("student_challenges")
    .update({ content: next })
    .eq("id", challengeId)
    .eq("user_id", userId);
  // Only onto the row as it was read, as the reading's late write does: a submit
  // or a restart that lands in between carries content this merge never saw.
  // The picture is the one to lose — the next view asks for it again, and the
  // render service hands back the same figure for the same brief.
  if (row.updated_at) write = write.eq("updated_at", String(row.updated_at));
  const { error: writeError } = await write;
  if (writeError) throw writeError;

  return {
    challenge: await withLatestAttemptReview(userId, { ...row, content: next }),
    solution,
  };
}
