import { NextResponse } from "next/server";
import { studentExamHistorySchema } from "@/lib/practice-history";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const UNDEFINED_TABLE = "42P01";

function splitEvaluation(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { evaluation: null, history: null };
  }
  const { attempt_history: history, ...evaluation } = value as Record<string, unknown>;
  return { evaluation, history };
}

async function readNormalizedDetails(input: {
  admin: ReturnType<typeof createSupabaseAdminClient>;
  attemptId: string;
  userId: string;
  subjectName: string;
  totalMarks: number;
}) {
  const { admin, attemptId, userId, subjectName, totalMarks } = input;
  const { data: paper, error: paperError } = await admin
    .from("student_practice_attempt_papers")
    .select(
      "external_exam_id, title, exam_kind, duration_minutes, pass_marks, student_name, handed_in_at",
    )
    .eq("attempt_id", attemptId)
    .eq("user_id", userId)
    .maybeSingle();

  if (paperError?.code === UNDEFINED_TABLE || !paper) return null;
  if (paperError) throw paperError;

  const [
    { data: questions, error: questionError },
    { data: answers, error: answerError },
    { data: answerSheet, error: answerSheetError },
  ] = await Promise.all([
      admin
        .from("student_practice_attempt_questions")
        .select(
          "id, external_question_id, position, response_type, question_type, topic, prompt, marks, options, expected_choice, marking_scheme",
        )
        .eq("attempt_id", attemptId)
        .eq("user_id", userId)
        .order("position", { ascending: true }),
      admin
        .from("student_practice_attempt_answers")
        .select("question_id, answer_text, score, feedback")
        .eq("attempt_id", attemptId)
        .eq("user_id", userId),
      admin
        .from("student_practice_answer_sheets")
        .select("storage_path, original_name, mime_type, size_bytes")
        .eq("attempt_id", attemptId)
        .eq("user_id", userId)
        .maybeSingle(),
    ]);
  if (questionError) throw questionError;
  if (answerError) throw answerError;
  if (answerSheetError) throw answerSheetError;

  const rawExam = {
    id: String(paper.external_exam_id || `history_${attemptId}`),
    subject: subjectName || "Practice",
    title: String(paper.title || `${subjectName || "Practice"} practice`),
    kind: String(paper.exam_kind || "practice-history"),
    counts: false,
    marks: totalMarks,
    ...(paper.pass_marks === null || paper.pass_marks === undefined
      ? {}
      : { passMarks: Number(paper.pass_marks) }),
    minutes: Number(paper.duration_minutes ?? 0),
    attempts: null,
    window: "done" as const,
    windowLabel: "Completed",
    questions: (questions ?? []).map((question) => ({
      id: String(question.external_question_id),
      type: question.response_type,
      ...(question.question_type ? { questionType: String(question.question_type) } : {}),
      marks: Number(question.marks ?? 0),
      topic: String(question.topic ?? ""),
      prompt: String(question.prompt ?? ""),
      ...(Array.isArray(question.options)
        ? { options: question.options.map((option) => String(option)) }
        : {}),
      ...(question.expected_choice === null || question.expected_choice === undefined
        ? {}
        : { answer: Number(question.expected_choice) }),
      ...(Array.isArray(question.marking_scheme)
        ? { marking: question.marking_scheme }
        : {}),
    })),
  };
  const parsedExam = studentExamHistorySchema.safeParse(rawExam);
  if (!parsedExam.success) return null;

  const answerByQuestion = new Map(
    (answers ?? []).map((answer) => [String(answer.question_id), answer]),
  );

  let storedSheet = null;
  if (answerSheet?.storage_path) {
    const { data: signed, error: signedError } = await admin.storage
      .from("student-practice-answer-sheets")
      .createSignedUrl(String(answerSheet.storage_path), 60 * 15);
    if (signedError) throw signedError;
    storedSheet = {
      name: String(answerSheet.original_name || "Answer sheet"),
      mimeType: String(answerSheet.mime_type || "application/octet-stream"),
      sizeBytes: Number(answerSheet.size_bytes ?? 0),
      url: signed.signedUrl,
    };
  }

  return {
    exam: parsedExam.data,
    lines: parsedExam.data.questions.map((question, index) => {
      const storedQuestion = questions?.[index];
      const answer = storedQuestion
        ? answerByQuestion.get(String(storedQuestion.id))
        : undefined;
      return {
        question,
        got: Number(answer?.score ?? 0),
        note: String(answer?.feedback ?? "No feedback returned."),
        answer: String(answer?.answer_text ?? ""),
      };
    }),
    handedInAt: String(paper.handed_in_at ?? ""),
    studentName: paper.student_name ? String(paper.student_name) : undefined,
    answerSheet: storedSheet,
  };
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ attemptId: string }> },
) {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { attemptId } = await params;
    const admin = createSupabaseAdminClient();
    const { data: row, error } = await admin
      .from("student_practice_attempts")
      .select("id, subject_name, source, total_score, total_marks, evaluation, created_at")
      .eq("id", attemptId)
      .eq("user_id", user.id)
      .maybeSingle();

    if (error) throw error;
    if (!row) return NextResponse.json({ error: "Practice result not found." }, { status: 404 });

    const { evaluation, history } = splitEvaluation(row.evaluation);
    const normalized = await readNormalizedDetails({
      admin,
      attemptId: String(row.id),
      userId: user.id,
      subjectName: String(row.subject_name ?? "Practice"),
      totalMarks: Number(row.total_marks ?? 0),
    });

    if (normalized) {
      return NextResponse.json({
        result: {
          exam: normalized.exam,
          score: Number(row.total_score ?? 0),
          outOf: Number(row.total_marks ?? 0),
          lines: normalized.lines,
          evaluation,
          handedInAt: normalized.handedInAt || String(row.created_at ?? ""),
          studentName: normalized.studentName,
          answerSheet: normalized.answerSheet,
        },
        detailsAvailable: true,
      });
    }

    const historyRecord =
      history && typeof history === "object" && !Array.isArray(history)
        ? (history as Record<string, unknown>)
        : null;
    const parsedExam = studentExamHistorySchema.safeParse(historyRecord?.exam);
    const storedResults = Array.isArray(historyRecord?.results) ? historyRecord.results : [];
    const exam = parsedExam.success
      ? parsedExam.data
      : {
          id: `history_${row.id}`,
          subject: String(row.subject_name ?? "Practice"),
          title: `${String(row.subject_name ?? "Practice")} practice`,
          kind: "practice-history",
          counts: false,
          marks: Number(row.total_marks ?? 0),
          minutes: 0,
          attempts: null,
          window: "done" as const,
          windowLabel: "Completed",
          questions: [],
        };

    const resultByQuestion = new Map(
      storedResults
        .filter((item): item is Record<string, unknown> =>
          Boolean(item && typeof item === "object"),
        )
        .map((item) => [String(item.question_id ?? ""), item]),
    );

    return NextResponse.json({
      result: {
        exam,
        score: Number(row.total_score ?? 0),
        outOf: Number(row.total_marks ?? 0),
        lines: exam.questions.map((question) => {
          const graded = resultByQuestion.get(question.id);
          return {
            question,
            got: Number(graded?.score ?? 0),
            note: String(graded?.feedback ?? "No feedback returned."),
            answer: String(graded?.student_answer ?? ""),
          };
        }),
        evaluation,
        handedInAt: String(historyRecord?.handedInAt ?? row.created_at ?? ""),
        studentName: historyRecord?.studentName ? String(historyRecord.studentName) : undefined,
      },
      detailsAvailable: parsedExam.success,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not load this practice result." },
      { status: 502 },
    );
  }
}
