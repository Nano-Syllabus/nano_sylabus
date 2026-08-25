import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { StudentExam } from "@/lib/practice-sitting";
import type { PracticeEvaluation, PracticeTopicStatus } from "@/lib/tenant/client";

export type PracticeAttemptHistory = {
  exam: StudentExam;
  results: Array<{
    question_id: string;
    score: number;
    feedback: string;
    student_answer: string;
    selected_choice?: number;
  }>;
  studentName?: string;
  handedInAt: string;
};

export type TopicMastery = {
  subjectSlug: string;
  subjectName: string;
  topicKey: string;
  topicTitle: string;
  status: PracticeTopicStatus;
  percentage: number;
  lostWeightage: number;
  marksLost: number;
  attempts: number;
  lastAttemptedAt: string | null;
};

export type PracticeAttemptSummary = {
  subjectSlug: string;
  subjectName: string;
  source: string;
  totalScore: number;
  totalMarks: number;
  createdAt: string;
};

/**
 * How much a new sitting moves a chapter. The tenant grades each sitting in
 * isolation, so without smoothing one unlucky paper would paint a chapter red
 * and one lucky one would clear it.
 */
const NEW_RESULT_WEIGHT = 0.4;

/** Postgres `undefined_table` — the migration has not been applied yet. */
const UNDEFINED_TABLE = "42P01";

function isMissingTable(error: { code?: string } | null) {
  return error?.code === UNDEFINED_TABLE;
}

async function storePracticeAttemptDetails(input: {
  admin: ReturnType<typeof createSupabaseAdminClient>;
  attemptId: string;
  userId: string;
  history: PracticeAttemptHistory;
}) {
  const { admin, attemptId, userId, history } = input;
  const resultByQuestion = new Map(
    history.results.map((result) => [result.question_id, result]),
  );

  const { error: paperError } = await admin.from("student_practice_attempt_papers").insert({
    attempt_id: attemptId,
    user_id: userId,
    external_exam_id: history.exam.id,
    title: history.exam.title,
    exam_kind: history.exam.kind,
    duration_minutes: history.exam.minutes,
    pass_marks: history.exam.passMarks ?? null,
    student_name: history.studentName ?? "",
    handed_in_at: history.handedInAt,
  });
  // Deploying application code before its migration must not break grading.
  // The complete JSON snapshot on the parent attempt remains the fallback.
  if (isMissingTable(paperError)) return;
  if (paperError) throw paperError;

  const questionRows = history.exam.questions.map((question, position) => ({
    attempt_id: attemptId,
    user_id: userId,
    external_question_id: question.id,
    position,
    response_type: question.type,
    question_type: question.questionType ?? "",
    topic: question.topic,
    prompt: question.prompt,
    marks: question.marks,
    options: question.options ?? null,
    expected_choice: question.answer ?? null,
    marking_scheme: question.marking ?? null,
  }));

  const { data: storedQuestions, error: questionError } = await admin
    .from("student_practice_attempt_questions")
    .insert(questionRows)
    .select("id, external_question_id");
  if (questionError) throw questionError;

  const answerRows = (storedQuestions ?? []).map((question) => {
    const result = resultByQuestion.get(String(question.external_question_id));
    return {
      attempt_id: attemptId,
      question_id: question.id,
      user_id: userId,
      answer_text: result?.student_answer ?? "",
      selected_choice: result?.selected_choice ?? null,
      score: Number(result?.score ?? 0),
      feedback: result?.feedback ?? "No feedback returned.",
      grading_metadata: {},
      graded_at: history.handedInAt,
    };
  });

  if (answerRows.length) {
    const { error: answerError } = await admin
      .from("student_practice_attempt_answers")
      .insert(answerRows);
    if (answerError) throw answerError;
  }
}

function toMastery(row: Record<string, unknown>): TopicMastery {
  return {
    subjectSlug: String(row.subject_slug ?? ""),
    subjectName: String(row.subject_name ?? ""),
    topicKey: String(row.topic_key ?? ""),
    topicTitle: String(row.topic_title ?? ""),
    status: (row.status as PracticeTopicStatus) ?? "not_attempted",
    percentage: Number(row.percentage ?? 0),
    lostWeightage: Number(row.lost_weightage ?? 0),
    marksLost: Number(row.marks_lost ?? 0),
    attempts: Number(row.attempts ?? 0),
    lastAttemptedAt: row.last_attempted_at ? String(row.last_attempted_at) : null,
  };
}

export async function listTopicMastery(userId: string): Promise<TopicMastery[]> {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("student_topic_mastery")
    .select("*")
    .eq("user_id", userId);

  // Before the migration lands there is simply no history yet — Today should
  // render its empty state rather than fail.
  if (isMissingTable(error)) return [];
  if (error) throw error;
  return (data ?? []).map(toMastery);
}

export async function listPracticeAttempts(
  userId: string,
  limit = 50,
): Promise<PracticeAttemptSummary[]> {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("student_practice_attempts")
    .select("subject_slug, subject_name, source, total_score, total_marks, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (isMissingTable(error)) return [];
  if (error) throw error;

  return (data ?? []).map((row) => ({
    subjectSlug: String(row.subject_slug ?? ""),
    subjectName: String(row.subject_name ?? ""),
    source: String(row.source ?? "practice"),
    totalScore: Number(row.total_score ?? 0),
    totalMarks: Number(row.total_marks ?? 0),
    createdAt: String(row.created_at ?? ""),
  }));
}

/**
 * Folds one graded sitting into the student's knowledge graph.
 *
 * A chapter the student did not touch is reported `not_attempted` by the tenant
 * and is deliberately left alone — scoring 0 for never seeing a question should
 * not read as "weak".
 */
export async function recordPracticeEvaluation(input: {
  userId: string;
  subjectSlug: string;
  subjectName: string;
  source: "practice" | "teacher_exam" | "challenge";
  sessionId?: string;
  totalScore: number;
  totalMarks: number;
  evaluation: PracticeEvaluation;
  history?: PracticeAttemptHistory;
}) {
  const admin = createSupabaseAdminClient();
  const now = new Date().toISOString();

  const { data: attempt, error: attemptError } = await admin
    .from("student_practice_attempts")
    .insert({
      user_id: input.userId,
      subject_slug: input.subjectSlug,
      subject_name: input.subjectName,
      source: input.source,
      session_id: input.sessionId ?? "",
      total_score: input.totalScore,
      total_marks: input.totalMarks,
      evaluation: input.history
        ? { ...input.evaluation, attempt_history: input.history }
        : input.evaluation,
    })
    .select("id")
    .single();
  if (attemptError) throw attemptError;

  if (input.history) {
    await storePracticeAttemptDetails({
      admin,
      attemptId: String(attempt.id),
      userId: input.userId,
      history: input.history,
    });
  }

  const attempted = (input.evaluation.chapters ?? []).filter(
    (chapter) => chapter.status !== "not_attempted" && chapter.topic_key,
  );
  if (!attempted.length) return String(attempt.id);

  const { data: existingRows, error: existingError } = await admin
    .from("student_topic_mastery")
    .select("topic_key, percentage, attempts")
    .eq("user_id", input.userId)
    .eq("subject_slug", input.subjectSlug)
    .in(
      "topic_key",
      attempted.map((chapter) => chapter.topic_key),
    );
  if (existingError) throw existingError;

  const existingByTopic = new Map(
    (existingRows ?? []).map((row) => [
      String(row.topic_key),
      { percentage: Number(row.percentage ?? 0), attempts: Number(row.attempts ?? 0) },
    ]),
  );

  const rows = attempted.map((chapter) => {
    const previous = existingByTopic.get(chapter.topic_key);
    const blended = previous
      ? previous.percentage * (1 - NEW_RESULT_WEIGHT) + chapter.percentage * NEW_RESULT_WEIGHT
      : chapter.percentage;

    return {
      user_id: input.userId,
      subject_slug: input.subjectSlug,
      subject_name: input.subjectName,
      topic_key: chapter.topic_key,
      topic_title: chapter.chapter || chapter.topic_key,
      status: chapter.status,
      percentage: Number(blended.toFixed(4)),
      lost_weightage: chapter.lost_weightage ?? 0,
      marks_lost: chapter.marks_lost ?? 0,
      attempts: (previous?.attempts ?? 0) + 1,
      last_attempted_at: now,
      updated_at: now,
    };
  });

  const { error: upsertError } = await admin
    .from("student_topic_mastery")
    .upsert(rows, { onConflict: "user_id,subject_slug,topic_key" });
  if (upsertError) throw upsertError;

  return String(attempt.id);
}

export async function savePracticeAnswerSheet(input: {
  attemptId: string;
  userId: string;
  fileName: string;
  mimeType: string;
  buffer: Buffer;
}) {
  const admin = createSupabaseAdminClient();
  const safeName = input.fileName.replace(/[^a-zA-Z0-9._-]/g, "_") || "answer-sheet";
  const storagePath = `${input.userId}/${input.attemptId}/${crypto.randomUUID()}-${safeName}`;
  const bucket = admin.storage.from("student-practice-answer-sheets");
  const { error: uploadError } = await bucket.upload(storagePath, input.buffer, {
    contentType: input.mimeType,
    upsert: false,
  });
  if (uploadError) throw uploadError;

  const { error: saveError } = await admin.from("student_practice_answer_sheets").insert({
    attempt_id: input.attemptId,
    user_id: input.userId,
    storage_path: storagePath,
    original_name: input.fileName || "answer-sheet",
    mime_type: input.mimeType,
    size_bytes: input.buffer.byteLength,
  });
  if (saveError) {
    await bucket.remove([storagePath]);
    throw saveError;
  }
}
