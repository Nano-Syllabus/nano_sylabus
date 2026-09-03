import type { SupabaseClient } from "@supabase/supabase-js";

export type StudyAnswer = {
  questionIndex: number;
  optionIndex: number;
  text: string;
};

export type StudyAnswers = Record<number, StudyAnswer>;
export const PENDING_STUDY_ANSWERS_KEY = "nano-pending-study-answers";

/** Recognizes the existing signup metadata, not a browser-only completion flag. */
export function hasCompletedStudyDiagnostic(value: unknown): value is StudyAnswers {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const answers = value as Record<string, unknown>;
  return [1, 2, 3, 4, 5, 6].every((questionIndex) => {
    const answer = answers[questionIndex] as Partial<StudyAnswer> | undefined;
    return Boolean(
      answer &&
        answer.questionIndex === questionIndex &&
        Number.isInteger(answer.optionIndex) &&
        answer.optionIndex! >= 0 &&
        answer.optionIndex! < (questionIndex === 5 ? 2 : 3) &&
        typeof answer.text === "string" &&
        answer.text.trim().length > 0,
    );
  });
}

export function studyFlowDestination(community?: string) {
  return community && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(community)
    ? `/app/communities/${community}`
    : "/app/today";
}

/** Preserve a previously completed account profile, including after signing in. */
export async function saveStudyDiagnostic(
  supabase: Pick<SupabaseClient, "auth">,
  answers: unknown,
) {
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError) throw authError;
  if (!user) throw new Error("Please sign in to save your study answers.");
  if (hasCompletedStudyDiagnostic(user.user_metadata?.study_answers)) return true;
  if (!hasCompletedStudyDiagnostic(answers)) return false;

  const { error } = await supabase.auth.updateUser({ data: { study_answers: answers } });
  if (error) throw error;
  return true;
}

export function readPendingStudyAnswers(raw: string | null, now = Date.now()): StudyAnswers | null {
  if (!raw) return null;
  try {
    const pending = JSON.parse(raw);
    return typeof pending?.expiresAt === "number" && pending.expiresAt > now &&
      hasCompletedStudyDiagnostic(pending.answers) ? pending.answers : null;
  } catch {
    return null;
  }
}
