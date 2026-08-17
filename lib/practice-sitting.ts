export type StudentExamQuestion = {
  id: string;
  type: "choice" | "short" | "long";
  /** The tenant's own question classification, such as theory or numerical. */
  questionType?: string;
  marks: number;
  topic: string;
  prompt: string;
  options?: string[];
  answer?: number;
  marking?: Array<{ label: string; marks: number }>;
};

/** One sitting in progress — a teacher assignment or an ephemeral practice paper. */
export type StudentExam = {
  id: string;
  subject: string;
  title: string;
  kind: string;
  counts: boolean;
  marks: number;
  /** The generated paper's saved threshold, when the tenant supplied one. */
  passMarks?: number;
  minutes: number;
  attempts: number | null;
  window: "before" | "open" | "done" | "practice";
  windowLabel: string;
  questions: StudentExamQuestion[];
};

export type Answer = { choice?: number; text?: string };

/**
 * A practice sitting lives on the tenant for two hours and nowhere else, so the
 * paper in progress is kept on the device. Without this a refresh loses every
 * answer the student has typed.
 */
export const SITTING_KEY = "nano:practice:sitting";

export type SavedSitting = {
  exam: StudentExam;
  sessionId: string;
  /** Older saved sittings omit this and are treated as quick sessions. */
  practiceKind?: "session" | "paper" | "mcq";
  /** Personal paper grading guidance must survive a refresh with the sitting. */
  gradingInstruction?: string;
  /** Personal papers can be typed in-app or submitted as one handwritten sheet. */
  answerMode?: "type" | "upload";
  subject: string;
  answers: Record<string, Answer>;
  questionIndex: number;
  /** Epoch ms — the sitting is dropped once this passes. */
  deadline: number;
};

export function readSavedSitting(): SavedSitting | null {
  try {
    const raw = window.localStorage.getItem(SITTING_KEY);
    if (!raw) return null;

    const saved = JSON.parse(raw) as SavedSitting;
    if (!saved?.sessionId || !saved.exam?.questions?.length) return null;
    if (!saved.deadline || saved.deadline <= Date.now()) {
      window.localStorage.removeItem(SITTING_KEY);
      return null;
    }

    return saved;
  } catch {
    return null;
  }
}

export function clearSavedSitting() {
  try {
    window.localStorage.removeItem(SITTING_KEY);
  } catch {
    // Ignore storage failures — the sitting simply will not resume.
  }
}

export function countAnswered(answers: Record<string, Answer>) {
  return Object.values(answers).filter(
    (answer) => answer.choice !== undefined || answer.text?.trim(),
  ).length;
}
