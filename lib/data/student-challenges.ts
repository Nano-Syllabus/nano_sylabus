import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import {
  chatTenant,
  generateTeacherPaper,
  getTenantName,
  type TeacherQuestion,
} from "@/lib/tenant/client";

const UNDEFINED_TABLE = "42P01";
const POSTGREST_MISSING_TABLE = "PGRST205";
export const CHALLENGE_PASS_PERCENT = 40;

export function isMissingChallengeTable(error: { code?: string } | null) {
  return error?.code === UNDEFINED_TABLE || error?.code === POSTGREST_MISSING_TABLE;
}

export type ChallengeStatus = "assigned" | "started" | "completed";

export type ChallengeRecommendation = {
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
  year: string;
  question: string;
  solution: string;
  topic: string;
  marks: number;
};

export type ChallengeExamQuestion = {
  id: string;
  question: string;
  topic: string;
  marks: number;
  questionType: string;
};

export type StudentChallengeContent = {
  lesson: {
    title: string;
    content: string[];
    focus: string;
    sources?: Array<{ title: string; source: string; excerpt: string }>;
  };
  solvedExamples: ChallengeSolvedExample[];
  examQuestions: ChallengeExamQuestion[];
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

/** Assigns one stable daily queue. Recommendations do not reshuffle mid-day. */
export async function ensureDailyChallenges(
  userId: string,
  recommendations: ChallengeRecommendation[],
): Promise<StudentChallengeSummary[]> {
  const date = nepaliChallengeDate();
  const existing = await listDailyRows(userId, date);
  if (existing === null) return [];
  if (existing.length || !recommendations.length) return existing.map(toSummary);

  const admin = createSupabaseAdminClient();
  const rows = recommendations.slice(0, 3).map((recommendation, position) => {
    const topicTitle = studentFacingTopicTitle(
      recommendation.topicTitle,
      recommendation.subjectName,
    );
    return {
      user_id: userId,
      challenge_date: date,
      position,
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
  const { data, error } = await admin.from("student_challenges").insert(rows).select("*");
  if (error?.code === "23505") {
    return ((await listDailyRows(userId, date)) ?? []).map(toSummary);
  }
  if (error) throw error;
  return ((data ?? []) as ChallengeRow[])
    .sort((left, right) => number(left.position) - number(right.position))
    .map(toSummary);
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

function solvedExample(question: TeacherQuestion, index: number): ChallengeSolvedExample {
  return {
    year: question.band_label || `Worked example ${index + 1}`,
    question: question.text,
    solution: question.reference_answer?.trim() || "",
    topic: question.chapter || "",
    marks: number(question.marks),
  };
}

function examQuestion(question: TeacherQuestion): ChallengeExamQuestion {
  return {
    id: question.id,
    question: question.text,
    topic: question.chapter || "",
    marks: number(question.marks),
    questionType: question.question_type || "Short answer",
  };
}

/** Lazily materializes grounded content so unopened daily cards cost no AI work. */
export async function startStudentChallenge(
  userId: string,
  challengeId: string,
): Promise<StudentChallengeDetail | null> {
  const current = await getStudentChallenge(userId, challengeId);
  if (!current) return null;
  if (current.content) return current;

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
  const topicTitle = studentFacingTopicTitle(
    String(row.topic_title ?? ""),
    String(row.subject_name ?? ""),
  );
  const topicBlurb = String(row.topic_blurb ?? "").trim();
  const paperBase = {
    subject: String(row.subject_slug ?? ""),
    namespaces: [String(row.namespace ?? "")],
    bands: [
      {
        label: "Topic challenge",
        question_type: "Short answer",
        count: 2,
        marks_each: 2.5,
      },
    ],
  };
  const tenantName = await getTenantName();
  const [lessonResponse, workedPaper, examPaper] = await Promise.all([
    chatTenant({
      question: [
        `Teach the student the topic "${topicTitle}" using only the indexed course material.`,
        "Give a concise explanation of the core idea, the method or reasoning they must remember, and one common mistake.",
        "Do not invent facts and do not include an exam answer key.",
      ].join(" "),
      contextSummary: "",
      subject: String(row.subject_name ?? row.subject_slug ?? ""),
      tenant: tenantName,
      namespaces: [String(row.namespace ?? "")],
      topK: 8,
      responseLanguage: "EN",
    }),
    generateTeacherPaper({
      ...paperBase,
      title: `${topicTitle} worked examples`,
      pass_marks: 0,
      instruction: [
        `Use only the indexed course material and question bank for the topic: ${topicTitle}.`,
        "Create two representative exam-style worked examples.",
        "Every question must include a complete step-by-step reference answer.",
      ].join(" "),
    }),
    generateTeacherPaper({
      ...paperBase,
      title: `${topicTitle} challenge exam`,
      pass_marks: 2,
      instruction: [
        `Use only the indexed course material and question bank for the topic: ${topicTitle}.`,
        "Create two distinct unseen exam-style questions for the student to solve without notes.",
        "Every question must include a private reference answer for grading.",
      ].join(" "),
    }),
  ]);
  const solved = (workedPaper.questions ?? []).filter(
    (question) => question.id && question.text && question.reference_answer?.trim(),
  );
  const exam = (examPaper.questions ?? []).filter(
    (question) => question.id && question.text && question.reference_answer?.trim(),
  );
  if (solved.length < 2 || exam.length < 2) {
    throw new Error("The course API could not build the grounded challenge content.");
  }

  const content: StudentChallengeContent = {
    lesson: {
      title: "What you need to know",
      content: [
        lessonResponse.answer?.trim() ||
          topicBlurb ||
          `Review ${topicTitle} from your indexed course material before studying the worked examples.`,
      ],
      focus: `Understand the core ideas in ${topicTitle} and apply them without looking at the worked solutions.`,
      sources: (lessonResponse.sources ?? []).slice(0, 4).map((source) => ({
        title: source.title?.trim() || "Course material",
        source: source.clean_path?.trim() || source.source_path?.trim() || "Indexed source",
        excerpt: source.excerpt?.trim() || "",
      })),
    },
    solvedExamples: solved.slice(0, 2).map(solvedExample),
    // Reference answers for these unseen questions stay inside the tenant paper.
    examQuestions: exam.slice(0, 2).map(examQuestion),
    warning: [workedPaper.warning, examPaper.warning].filter(Boolean).join(" ").trim() || null,
  };
  const totalMarks = exam.slice(0, 2).reduce((sum, question) => sum + number(question.marks), 0);
  const passMarks = totalMarks * (CHALLENGE_PASS_PERCENT / 100);
  const now = new Date().toISOString();
  const { data, error } = await admin
    .from("student_challenges")
    .update({
      status: "started",
      external_paper_id: examPaper.id,
      content,
      total_marks: totalMarks,
      pass_marks: passMarks,
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
}) {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.rpc("record_student_challenge_grade", {
    target_user_id: input.userId,
    target_challenge_id: input.challengeId,
    target_attempt_id: input.attemptId,
    earned_score: input.score,
    available_marks: input.totalMarks,
  });
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  return row ? toDetail(row as ChallengeRow) : null;
}
