import {
  choiceQuestionsOf,
  gradeChallengeChoices,
  openExplanation,
  unsealAnswer,
} from "@/lib/data/challenge-exam-format";
import type { FundamentalsExplainer } from "@/lib/data/challenge-fundamentals";
import { requestQuestionVideo } from "@/lib/data/challenge-question-video";
import { challengeUpstreamScope, type StudentChallengeContent } from "@/lib/data/student-challenges";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

/**
 * An MCQ community's paper, answered one question at a time.
 *
 * The first pick on a question is FINAL and is recorded on the row
 * (`content.examPicks`): the student is shown the correct answer the moment
 * they choose, so a pick that could be changed afterwards would let them read
 * the key off the screen and hand it in. Marking the paper reads these picks,
 * not what the browser sends. The same pattern as the fundamentals check. Each
 * question has one short video, prepared when the paper is issued.
 */

export type ExamChoiceResult = {
  questionId: string;
  selected: string;
  correct: string;
  correctText: string;
  isCorrect: boolean;
  explanation: string;
  /** Marks for this answer: + for right, − under negative marking, else 0. */
  score: number;
};

type Row = { id: string; content: StudentChallengeContent | null; updated_at: string | null; status: string };

async function readRow(userId: string, challengeId: string) {
  const { data, error } = await createSupabaseAdminClient()
    .from("student_challenges")
    .select("id,content,updated_at,status")
    .eq("id", challengeId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  return data as Row | null;
}

/** The browser is showing a paper the row no longer holds: it should reload, not retry. */
export class StalePaperError extends RangeError {}

function paperQuestion(content: StudentChallengeContent | null, questionId: string) {
  const question = choiceQuestionsOf(content?.examQuestions ?? []).find((item) => item.id === questionId);
  if (!question) throw new StalePaperError("That question is not on your current paper.");
  return question;
}

export async function checkExamChoice(
  userId: string,
  challengeId: string,
  questionId: string,
  selected: string,
): Promise<ExamChoiceResult | null> {
  // Access first: the student may still open this subject.
  if (!(await challengeUpstreamScope(userId, challengeId))) return null;
  const admin = createSupabaseAdminClient();
  // Two tries: another write to the row (a reading landing) can race the first.
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const row = await readRow(userId, challengeId);
    if (!row?.content) return null;
    const question = paperQuestion(row.content, questionId);
    const picks = row.content.examPicks ?? {};
    const wanted = selected.trim().toUpperCase();
    const chosen = picks[questionId] ?? wanted;
    if (!question.options.some((option) => option.key === chosen)) {
      throw new RangeError("Choose one of the question's options.");
    }
    if (!picks[questionId] && row.status !== "completed") {
      const now = new Date().toISOString();
      let write = admin
        .from("student_challenges")
        .update({ content: { ...row.content, examPicks: { ...picks, [questionId]: chosen } }, updated_at: now })
        .eq("id", challengeId)
        .eq("user_id", userId);
      if (row.updated_at) write = write.eq("updated_at", row.updated_at);
      const { data, error } = await write.select("id");
      if (error) throw error;
      if (!data?.length) continue; // the row moved under us: read it again
    }
    const [graded] = gradeChallengeChoices(
      challengeId,
      [question],
      { [questionId]: chosen },
      row.content.examNegativePercent ?? 0,
    );
    const correct = graded.correct_key ?? "";
    return {
      questionId,
      selected: chosen,
      correct,
      correctText: question.options.find((option) => option.key === correct)?.text ?? "",
      isCorrect: graded.outcome === "correct",
      explanation: openExplanation(question.explanationSealed),
      score: graded.score,
    };
  }
  throw new Error("Your answer could not be saved. Try again.");
}

/**
 * The video for a question on this paper whose answer is OPEN to this student —
 * picked (on the paper, right or wrong), or anything once the paper is handed in
 * (Revision). Never for an unanswered question on a live paper: the video
 * teaches the answer. `urgent`: somebody is waiting on it.
 */
export async function explainExamChoice(
  userId: string,
  challengeId: string,
  questionId: string,
): Promise<FundamentalsExplainer | null> {
  const scope = await challengeUpstreamScope(userId, challengeId);
  if (!scope) return null;
  const row = await readRow(userId, challengeId);
  if (!row?.content) return null;
  const question = paperQuestion(row.content, questionId);
  if (!row.content.examPicks?.[questionId] && row.status !== "completed") {
    throw new RangeError("Answer the question first.");
  }
  return requestQuestionVideo(
    scope,
    {
      text: question.question,
      options: question.options,
      correct: unsealAnswer(challengeId, question),
      explanation: openExplanation(question.explanationSealed),
    },
    "urgent",
  );
}
