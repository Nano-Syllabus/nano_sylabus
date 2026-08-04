"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { cn } from "@/lib/utils";

type ExamTab = "take" | "history" | "map";
type ExamStage = "configure" | "started" | "submission" | "submitted" | "result";
type AnswerMode = "upload" | "type";
type TopicLevel = "uncovered" | "weak" | "mid" | "strong";
type PaperStyle = "balanced" | "theory" | "numerical" | "diagram" | "custom";

export type ExamSubjectOption = {
  name: string;
  namespace: string;
  chunkCount: number;
};

type GeneratedQuestion = {
  id: string;
  number: number;
  subject: string;
  topic: string;
  questionType?: string;
  bandLabel?: string;
  marks: number;
  prompt: string;
  referenceAnswer?: string;
};

type EvaluationRow = {
  questionId: string;
  obtained: number;
  feedback: string;
  correction: string;
  studentAnswer: string;
};

type ApiTeacherQuestion = {
  id: string;
  chapter?: string;
  band_label?: string;
  question_type?: string;
  marks: number;
  text: string;
  reference_answer?: string;
};

type ApiTeacherPaper = {
  id: string;
  title?: string;
  subject?: string;
  university?: string;
  pass_marks?: number;
  total_marks: number;
  warning?: string;
  questions: ApiTeacherQuestion[];
};

type ApiGradeResult = {
  question_id: string;
  chapter?: string;
  question: string;
  marks: number;
  score: number;
  feedback: string;
};

type ApiGrade = {
  submission_id?: string;
  results: ApiGradeResult[];
  total_score: number;
  total_marks: number;
};

type ExamAttempt = {
  id: string;
  title: string;
  subject: string;
  marks: number;
  obtained: number;
  date: string;
  questions: GeneratedQuestion[];
  evaluation: EvaluationRow[];
};

type BlueprintBand = {
  id: string;
  label: string;
  questionType: string;
  count: number;
  marksEach: number;
};

const MARK_OPTIONS = ["20", "40", "60", "80", "100"] as const;

function getDurationForMarks(marks: string) {
  switch (marks) {
    case "20": return 30;
    case "40": return 60;
    case "60": return 90;
    case "80": return 180;
    case "100": return 180;
    default: return 60;
  }
}

function formatDuration(minutes: number) {
  if (minutes === 30) return "30m";
  if (minutes === 60) return "1h";
  if (minutes === 90) return "1.5h";
  if (minutes === 180) return "3h";
  return `${minutes}m`;
}

const PAPER_STYLES: Array<{
  id: PaperStyle;
  label: string;
  description: string;
}> = [
  {
    id: "balanced",
    label: "Mixed",
    description: "Theory, numerical, and diagram questions.",
  },
  {
    id: "theory",
    label: "Theory",
    description: "Definition and explanation-heavy paper.",
  },
  {
    id: "numerical",
    label: "Numerical",
    description: "Problem-solving and calculation-focused paper.",
  },
  {
    id: "diagram",
    label: "Diagram",
    description: "Circuit, block, and figure-based questions.",
  },
  {
    id: "custom",
    label: "Custom",
    description: "Choose the exact sections yourself.",
  },
];

function questionText(count: number) {
  return `${count} question${count === 1 ? "" : "s"}`;
}

function createTypeBands(totalMarks: number, questionType: string, label: string): BlueprintBand[] {
  const marks = Math.max(1, totalMarks);
  const tenMarkQuestions = Math.floor(marks / 10);
  const remainder = marks - tenMarkQuestions * 10;
  const bands: BlueprintBand[] = [];

  if (tenMarkQuestions > 0) {
    bands.push(
      createBand({
        label: `${questionText(tenMarkQuestions)} of 10 marks`,
        questionType,
        count: tenMarkQuestions,
        marksEach: 10,
      }),
    );
  }

  if (remainder > 0) {
    bands.push(
      createBand({
        label: `1 question of ${remainder} marks`,
        questionType,
        count: 1,
        marksEach: remainder,
      }),
    );
  }

  if (!bands.length) {
    bands.push(createBand({ label, questionType }));
  }

  return bands.map((band) => ({ ...band, label: band.label || label }));
}

function buildBlueprint(marks: number, style: PaperStyle = "balanced"): BlueprintBand[] {
  const fullMarks = Math.max(5, marks);

  if (style === "theory") return createTypeBands(fullMarks, "theory", "Theory");
  if (style === "numerical") return createTypeBands(fullMarks, "numerical", "Numerical");
  if (style === "diagram") return createTypeBands(fullMarks, "diagram", "Diagram");

  if (fullMarks < 15) return createTypeBands(fullMarks, "theory", "Theory");

  let theoryMarks = Math.max(5, Math.round((fullMarks * 0.35) / 5) * 5);
  let numericalMarks = Math.max(5, Math.round((fullMarks * 0.25) / 5) * 5);
  let diagramMarks = fullMarks - theoryMarks - numericalMarks;
  if (diagramMarks < 5) {
    const shortage = 5 - diagramMarks;
    theoryMarks = Math.max(5, theoryMarks - shortage);
    diagramMarks = fullMarks - theoryMarks - numericalMarks;
  }

  return [
    ...createTypeBands(theoryMarks, "theory", "Theory"),
    ...createTypeBands(numericalMarks, "numerical", "Numerical"),
    ...createTypeBands(diagramMarks, "diagram", "Diagram"),
  ].map((band) => {
    const typeLabel =
      band.questionType === "numerical"
        ? "Numerical"
        : band.questionType === "diagram"
          ? "Diagram"
          : "Theory";
    return {
      ...band,
      label: `${typeLabel} · ${band.label}`,
    };
  });
}

function createBand(overrides: Partial<BlueprintBand> = {}): BlueprintBand {
  return {
    id: `band-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    label: "Theory",
    questionType: "theory",
    count: 1,
    marksEach: 5,
    ...overrides,
  };
}

function mapApiQuestion(
  question: ApiTeacherQuestion,
  index: number,
  subject: string,
): GeneratedQuestion {
  return {
    id: question.id,
    number: index + 1,
    subject,
    topic: question.chapter ?? "",
    questionType: question.question_type,
    bandLabel: question.band_label,
    marks: question.marks,
    prompt: question.text,
    referenceAnswer: question.reference_answer,
  };
}

function formatMark(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(1).replace(/\.0$/, "");
}

function positiveInteger(value: string, fallback: number) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function questionMetadata(question: GeneratedQuestion) {
  return [question.questionType, question.bandLabel, question.topic].filter(Boolean).join(" · ");
}

function gradeTypedAnswers(
  paperId: string,
  questions: GeneratedQuestion[],
  typedAnswers: Record<string, string>,
  studentName: string,
  instruction: string,
) {
  return fetch(`/api/exams/${encodeURIComponent(paperId)}/grade`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      student_name: studentName.trim() || "Student",
      instruction,
      answers: questions.map((question) => ({
        question_id: question.id,
        answer_text: typedAnswers[question.id] ?? "",
      })),
    }),
  });
}

function gradeUploadedAnswer(
  paperId: string,
  uploadedFile: File | null,
  studentName: string,
  instruction: string,
) {
  if (!uploadedFile) {
    throw new Error("Upload an answer sheet before checking.");
  }

  const formData = new FormData();
  formData.append("file", uploadedFile);
  formData.append("student_name", studentName.trim() || "Student");
  formData.append("instruction", instruction);

  return fetch(`/api/exams/${encodeURIComponent(paperId)}/grade-file`, {
    method: "POST",
    body: formData,
  });
}

function levelForScore(score: number, total: number): TopicLevel {
  if (total === 0) return "uncovered";
  const ratio = score / total;
  if (ratio >= 0.75) return "strong";
  if (ratio >= 0.45) return "mid";
  return "weak";
}

function levelClasses(level: TopicLevel) {
  if (level === "strong") return "border-success/40 bg-note-green text-success";
  if (level === "mid") return "border-warning/50 bg-note-yellow text-warning";
  if (level === "weak") return "border-destructive/40 bg-note-red text-destructive";
  return "border-border bg-bg-secondary text-text-muted";
}

function formatTime(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(remainingSeconds).padStart(2, "0")}`;
}

function Icon({
  name,
  className,
}: {
  name:
    | "exam"
    | "history"
    | "map"
    | "upload"
    | "check"
    | "spark"
    | "clock"
    | "arrow"
    | "print"
    | "refresh"
    | "file"
    | "edit"
    | "plus"
    | "trash";
  className?: string;
}) {
  const paths = {
    exam: (
      <>
        <path d="M6 3h9l3 3v15H6z" />
        <path d="M15 3v4h4" />
        <path d="M9 11h6" />
        <path d="M9 15h6" />
      </>
    ),
    history: (
      <>
        <path d="M3 12a9 9 0 1 0 3-6.7" />
        <path d="M3 4v5h5" />
        <path d="M12 7v5l3 2" />
      </>
    ),
    map: (
      <>
        <path d="M3 6l6-3 6 3 6-3v15l-6 3-6-3-6 3z" />
        <path d="M9 3v15" />
        <path d="M15 6v15" />
      </>
    ),
    upload: (
      <>
        <path d="M12 16V4" />
        <path d="M7 9l5-5 5 5" />
        <path d="M5 20h14" />
      </>
    ),
    check: <path d="M20 6 9 17l-5-5" />,
    spark: (
      <>
        <path d="M12 3l1.6 5.2L19 10l-5.4 1.8L12 17l-1.6-5.2L5 10l5.4-1.8z" />
        <path d="M19 15l.7 2.3L22 18l-2.3.7L19 21l-.7-2.3L16 18l2.3-.7z" />
      </>
    ),
    clock: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v5l3 2" />
      </>
    ),
    arrow: (
      <>
        <path d="M5 12h14" />
        <path d="m14 7 5 5-5 5" />
      </>
    ),
    print: (
      <>
        <path d="M6 9V3h12v6" />
        <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
        <path d="M6 14h12v7H6z" />
      </>
    ),
    refresh: (
      <>
        <path d="M20 7v5h-5" />
        <path d="M4 17v-5h5" />
        <path d="M6.1 9a7 7 0 0 1 11.2-2L20 12" />
        <path d="M4 12l2.7 5a7 7 0 0 0 11.2-2" />
      </>
    ),
    file: (
      <>
        <path d="M6 3h9l3 3v15H6z" />
        <path d="M15 3v4h4" />
      </>
    ),
    edit: (
      <>
        <path d="M12 20h9" />
        <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4z" />
      </>
    ),
    plus: (
      <>
        <path d="M12 5v14" />
        <path d="M5 12h14" />
      </>
    ),
    trash: (
      <>
        <path d="M3 6h18" />
        <path d="M8 6V4h8v2" />
        <path d="M6 6l1 15h10l1-15" />
        <path d="M10 11v6" />
        <path d="M14 11v6" />
      </>
    ),
  } as const;

  return (
    <svg
      aria-hidden="true"
      className={cn("h-4 w-4 shrink-0", className)}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {paths[name]}
    </svg>
  );
}

const STAGE_STEPS = [
  { id: "configure", label: "Set paper" },
  { id: "started", label: "Write" },
  { id: "submission", label: "Submit" },
  { id: "result", label: "Result" },
] as const;

function stageIndex(stage: ExamStage) {
  if (stage === "submitted") return 2;
  return STAGE_STEPS.findIndex((step) => step.id === stage);
}

const EXAM_SESSION_KEY = "exam-practice-session";

interface ExamSession {
  stage: ExamStage;
  subject: string;
  title: string;
  instruction: string;
  marksOption: string;
  paperStyle: PaperStyle;
  answerMode: AnswerMode;
  blueprint: BlueprintBand[];
  questions: GeneratedQuestion[];
  paperId: string;
  paperWarning: string;
  typedAnswers: Record<string, string>;
  /** epoch ms when the timer expires */
  timerDeadline: number;
  submissionWasLate: boolean;
  evaluation: EvaluationRow[];
  submissionId: string;
  obtainedMarks: number;
  gradingError: string;
}

function saveSession(data: ExamSession) {
  try {
    sessionStorage.setItem(EXAM_SESSION_KEY, JSON.stringify(data));
  } catch {}
}

function loadSession(): ExamSession | null {
  try {
    const raw = sessionStorage.getItem(EXAM_SESSION_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as ExamSession;
  } catch {
    return null;
  }
}

function clearSession() {
  try {
    sessionStorage.removeItem(EXAM_SESSION_KEY);
  } catch {}
}

export function ExamPracticeClient({
  subjects,
  subjectLoadError,
}: {
  subjects: ExamSubjectOption[];
  subjectLoadError?: string;
}) {
  const router = useRouter();

  // ---------- restore persisted session (runs once) ----------
  const saved = useMemo(() => loadSession(), []);

  const [tab, setTab] = useState<ExamTab>("take");
  const [stage, setStage] = useState<ExamStage>(saved?.stage ?? "configure");
  const [subject, setSubject] = useState(saved?.subject ?? subjects[0]?.name ?? "");
  const [title, setTitle] = useState(saved?.title ?? "");
  const [instruction, setInstruction] = useState(saved?.instruction ?? "");
  const [marksOption, setMarksOption] = useState<(typeof MARK_OPTIONS)[number]>(
    (saved?.marksOption as (typeof MARK_OPTIONS)[number]) ?? "20",
  );
  const [paperStyle, setPaperStyle] = useState<PaperStyle>(saved?.paperStyle ?? "balanced");
  const [customPatternOpen, setCustomPatternOpen] = useState(false);
  const [blueprint, setBlueprint] = useState<BlueprintBand[]>(
    () => saved?.blueprint ?? buildBlueprint(20, "balanced"),
  );
  const [questions, setQuestions] = useState<GeneratedQuestion[]>(saved?.questions ?? []);
  const [paperId, setPaperId] = useState(saved?.paperId ?? "");
  const [paperWarning, setPaperWarning] = useState(saved?.paperWarning ?? "");
  const [isGenerating, setIsGenerating] = useState(false);
  const [generateElapsed, setGenerateElapsed] = useState(0);
  const [generateError, setGenerateError] = useState("");
  const [answerMode, setAnswerMode] = useState<AnswerMode>(saved?.answerMode ?? "upload");
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [typedAnswers, setTypedAnswers] = useState<Record<string, string>>(
    saved?.typedAnswers ?? {},
  );
  const [evaluation, setEvaluation] = useState<EvaluationRow[]>(saved?.evaluation ?? []);
  const [isChecking, setIsChecking] = useState(false);
  const [gradingError, setGradingError] = useState(saved?.gradingError ?? "");
  const [submissionId, setSubmissionId] = useState(saved?.submissionId ?? "");
  const [history, setHistory] = useState<ExamAttempt[]>([]);
  const [secondsLeft, setSecondsLeft] = useState(() => {
    if (saved?.timerDeadline) {
      const remaining = Math.max(0, Math.round((saved.timerDeadline - Date.now()) / 1000));
      return remaining;
    }
    return getDurationForMarks(marksOption) * 60;
  });
  const [timerDeadline, setTimerDeadline] = useState<number | null>(saved?.timerDeadline ?? null);
  const [submissionWasLate, setSubmissionWasLate] = useState(saved?.submissionWasLate ?? false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const generateAbortRef = useRef<AbortController | null>(null);
  const generateCancelledRef = useRef(false);

  // ---------- derived ----------
  const requestedMarks = Number(marksOption);
  const totalMarks = blueprint.reduce((sum, band) => sum + band.count * band.marksEach, 0);
  const generatedMarks = questions.reduce((total, question) => total + question.marks, 0);
  const obtainedMarks = evaluation.reduce((total, row) => total + row.obtained, 0);
  const currentSubject = subjects.find((item) => item.name === subject);
  const blueprintValid =
    totalMarks > 0 &&
    blueprint.every(
      (band) =>
        band.label.trim().length > 0 &&
        band.questionType.trim().length > 0 &&
        Number.isInteger(band.count) &&
        band.count > 0 &&
        Number.isFinite(band.marksEach) &&
        band.marksEach > 0,
    );
  const blueprintError = !blueprintValid
    ? "Every blueprint row needs a label, question type, count, and marks each."
    : "";
  const generateDisabledReason = !subject
    ? "Choose a subject before generating."
    : blueprintError;
  const currentStep = stageIndex(stage);
  const navigableSteps = useMemo(() => {
    const steps = [0];
    if (questions.length > 0) {
      steps.push(1);
    }
    if (stage === "submission" || stage === "submitted" || stage === "result" || evaluation.length > 0) {
      steps.push(2);
    }
    if (stage === "result" || evaluation.length > 0) {
      steps.push(3);
    }
    return steps;
  }, [stage, questions.length, evaluation.length]);

  // ---------- persist to sessionStorage on key state changes ----------
  useEffect(() => {
    saveSession({
      stage,
      subject,
      title,
      instruction,
      marksOption,
      paperStyle,
      answerMode,
      blueprint,
      questions,
      paperId,
      paperWarning,
      typedAnswers,
      timerDeadline: timerDeadline ?? (Date.now() + secondsLeft * 1000),
      submissionWasLate,
      evaluation,
      submissionId,
      obtainedMarks,
      gradingError,
    });
  }, [
    stage, subject, title, instruction, marksOption, paperStyle, answerMode,
    blueprint, questions, paperId, paperWarning, typedAnswers, secondsLeft,
    submissionWasLate, evaluation, submissionId, obtainedMarks, gradingError, timerDeadline,
  ]);

  // ---------- countdown timer ----------
  useEffect(() => {
    if (questions.length === 0 || stage === "submission" || stage === "submitted" || stage === "result") return;
    if (!timerDeadline) return;

    const timer = window.setInterval(() => {
      const remaining = Math.max(0, Math.round((timerDeadline - Date.now()) / 1000));
      setSecondsLeft(remaining);

      if (remaining <= 0) {
        window.clearInterval(timer);
        setSubmissionWasLate(true);
        setStage("submission");
      }
    }, 1000);
    return () => window.clearInterval(timer);
  }, [stage, questions.length, timerDeadline]);

  useEffect(() => {
    if (!isGenerating) {
      setGenerateElapsed(0);
      return;
    }
    const startedAt = Date.now();
    const timer = window.setInterval(() => {
      setGenerateElapsed(Math.floor((Date.now() - startedAt) / 1000));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [isGenerating]);

  const topicScores = useMemo(() => {
    const result = new Map<string, { obtained: number; total: number }>();
    history.forEach((attempt) => {
      attempt.questions.forEach((question) => {
        const row = attempt.evaluation.find((item) => item.questionId === question.id);
        const current = result.get(question.topic) ?? { obtained: 0, total: 0 };
        current.obtained += row?.obtained ?? 0;
        current.total += question.marks;
        result.set(question.topic, current);
      });
    });
    return result;
  }, [history]);

  const subjectTopics = Array.from(
    new Set(
      history
        .filter((attempt) => attempt.subject === subject)
        .flatMap((attempt) => attempt.questions.map((question) => question.topic))
        .filter((topic) => topic.trim().length > 0),
    ),
  );
  const coveredTopics = subjectTopics.filter(
    (topic) => (topicScores.get(topic)?.total ?? 0) > 0,
  ).length;
  const strongTopics = subjectTopics.filter((topic) => {
    const score = topicScores.get(topic);
    return score ? levelForScore(score.obtained, score.total) === "strong" : false;
  }).length;

  async function handleGenerate() {
    if (isGenerating) return;
    if (!subject) return;
    if (!blueprintValid) {
      setGenerateError(blueprintError || "Check the paper blueprint before generating.");
      return;
    }
    const namespace = currentSubject?.namespace || "Tribhuvan University";

    setIsGenerating(true);
    setGenerateElapsed(0);
    setGenerateError("");
    setPaperWarning("");

    let timeout: number | undefined;
    let controller: AbortController | null = null;
    try {
      controller = new AbortController();
      const activeController = controller;
      generateAbortRef.current = activeController;
      generateCancelledRef.current = false;
      timeout = window.setTimeout(() => activeController.abort(), 90000);
      const response = await fetch("/api/exams/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: activeController.signal,
        body: JSON.stringify({
          namespaces: [namespace],
          subject,
          bands: blueprint.map((band) => ({
            label: band.label.trim(),
            question_type: band.questionType,
            count: band.count,
            marks_each: band.marksEach,
          })),
          title: title.trim() || `${subject} practice set`,
          ...(instruction.trim() ? { instruction: instruction.trim() } : {}),
          university: namespace,
          pass_marks: Math.ceil(totalMarks * 0.4),
        }),
      });

      const payload = (await response.json()) as { paper?: ApiTeacherPaper; error?: string };
      if (!response.ok || !payload.paper) {
        throw new Error(payload.error || "The teacher API could not generate a paper.");
      }

      const paper = payload.paper;
      setPaperId(paper.id);
      setPaperWarning(paper.warning ?? "");
      setQuestions(
        paper.questions.map((question, index) => mapApiQuestion(question, index, subject)),
      );
      setEvaluation([]);
      setUploadedFile(null);
      setTypedAnswers({});
      setSubmissionId("");
      setGradingError("");
      const duration = getDurationForMarks(marksOption) * 60;
      setSecondsLeft(duration);
      setTimerDeadline(Date.now() + duration * 1000);
      setSubmissionWasLate(false);
      setStage("started");
    } catch (error) {
      setGenerateError(
        error instanceof DOMException && error.name === "AbortError"
          ? generateCancelledRef.current
            ? "Generation cancelled. You can adjust the paper and try again."
            : "The teacher API is taking too long for this paper. Try again, or generate a smaller/custom paper."
          : error instanceof Error
            ? error.message
            : "The teacher API could not generate a paper.",
      );
    } finally {
      if (timeout) window.clearTimeout(timeout);
      if (generateAbortRef.current === controller) {
        generateAbortRef.current = null;
      }
      generateCancelledRef.current = false;
      setIsGenerating(false);
    }
  }

  function handleCancelGenerate() {
    generateCancelledRef.current = true;
    generateAbortRef.current?.abort();
  }

  function handleSubmitAnswer() {
    if (secondsLeft === 0) {
      setSubmissionWasLate(true);
    }
    setStage("submitted");
  }

  async function handleCheckAnswers() {
    if (!paperId) {
      setGradingError("Generate a question paper before checking answers.");
      return;
    }

    setIsChecking(true);
    setGradingError("");

    try {
      const instruction = submissionWasLate
        ? "This submission was late. Grade normally, but keep the late status in mind for feedback tone."
        : "Grade this practice exam answer according to the marks assigned to each question.";
      const response =
        answerMode === "upload"
          ? await gradeUploadedAnswer(paperId, uploadedFile, "", instruction)
          : await gradeTypedAnswers(paperId, questions, typedAnswers, "", instruction);
      const payload = (await response.json()) as { grade?: ApiGrade; error?: string };

      if (!response.ok || !payload.grade) {
        throw new Error(payload.error || "The teacher API could not check this answer.");
      }

      const grade = payload.grade;
      const nextEvaluation = questions.map((question) => {
        const row = grade.results.find((item) => item.question_id === question.id);
        return {
          questionId: question.id,
          obtained: row?.score ?? 0,
          feedback: row?.feedback ?? "No feedback returned for this question.",
          correction: question.referenceAnswer || "No reference answer returned by the API.",
          studentAnswer: answerMode === "upload" ? "Answer sheet uploaded." : (typedAnswers[question.id] || "No typed answer provided."),
        };
      });
      const nextObtained = nextEvaluation.reduce((total, row) => total + row.obtained, 0);
      const nextAttempt: ExamAttempt = {
        id: grade.submission_id || `attempt-${Date.now()}`,
        title: title.trim() || `${subject} practice set`,
        subject,
        marks: grade.total_marks || generatedMarks,
        obtained: nextObtained,
        date: submissionWasLate ? "Today · late" : "Today",
        questions,
        evaluation: nextEvaluation,
      };

      setSubmissionId(grade.submission_id ?? "");
      setEvaluation(nextEvaluation);
      setHistory((current) => [nextAttempt, ...current]);
      setStage("result");
    } catch (error) {
      setGradingError(
        error instanceof Error ? error.message : "The teacher API could not check this answer.",
      );
    } finally {
      setIsChecking(false);
    }
  }

  function resetExam() {
    setStage("configure");
    setQuestions([]);
    setPaperId("");
    setPaperWarning("");
    setGenerateError("");
    setUploadedFile(null);
    setTypedAnswers({});
    setEvaluation([]);
    setGradingError("");
    setSubmissionId("");
    setSubmissionWasLate(false);
    setTimerDeadline(null);
    setMarksOption("20");
    setPaperStyle("balanced");
    setCustomPatternOpen(false);
    setBlueprint(buildBlueprint(20, "balanced"));
    setInstruction("");
    clearSession();
  }

  function viewAttempt(attempt: ExamAttempt) {
    setSubject(attempt.subject);
    setQuestions(attempt.questions);
    setEvaluation(attempt.evaluation);
    setTitle(attempt.title);
    setStage("result");
    setTab("take");
  }

  function updateBlueprintBand(id: string, patch: Partial<Omit<BlueprintBand, "id">>) {
    setBlueprint((current) =>
      current.map((band) => (band.id === id ? { ...band, ...patch } : band)),
    );
  }

  function handleMarksOptionChange(value: string) {
    const nextOption = MARK_OPTIONS.includes(value as (typeof MARK_OPTIONS)[number])
      ? (value as (typeof MARK_OPTIONS)[number])
      : "20";
    const nextMarks = Number(nextOption);
    setMarksOption(nextOption);
    if (paperStyle !== "custom") {
      setBlueprint(buildBlueprint(nextMarks, paperStyle));
    }
  }

  function handlePaperStyleChange(style: PaperStyle) {
    setPaperStyle(style);
    if (style === "custom") {
      setCustomPatternOpen(true);
      return;
    }
    setCustomPatternOpen(false);
    setBlueprint(buildBlueprint(requestedMarks, style));
  }

  function addBlueprintBand() {
    setBlueprint((current) => [...current, createBand()]);
  }

  function removeBlueprintBand(id: string) {
    setBlueprint((current) =>
      current.length > 1 ? current.filter((band) => band.id !== id) : current,
    );
  }

  const hasTypedAnswer = Object.values(typedAnswers).some((answer) => answer.trim().length > 0);
  const canSubmit = answerMode === "upload" ? Boolean(uploadedFile) : hasTypedAnswer;

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col px-4 pb-16 pt-3 sm:px-6 lg:px-8">
      <header className="flex flex-col gap-4 border-b border-border pb-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-medium uppercase tracking-wider text-text-muted">
            Exam practice
          </p>
          <h1 className="mt-1 font-display text-2xl font-semibold text-text-primary">
            Practice under real exam conditions
          </h1>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-text-secondary">
            Generate from indexed subjects, write on paper, upload your answer sheet, and get API
            grading instantly.
          </p>
        </div>
        <nav
          aria-label="Exam views"
          className="grid grid-cols-3 rounded-lg border border-border bg-bg-secondary p-1"
        >
          {[
            { id: "take", label: "Take exam", icon: "exam" },
            { id: "history", label: "History", icon: "history" },
            { id: "map", label: "Syllabus", icon: "map" },
          ].map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setTab(item.id as ExamTab)}
              className={cn(
                "inline-flex min-h-10 items-center justify-center gap-2 rounded-md px-3 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-strong",
                tab === item.id
                  ? "bg-bg-primary text-text-primary shadow-sm"
                  : "text-text-secondary hover:text-text-primary",
              )}
            >
              <Icon name={item.icon as "exam" | "history" | "map"} />
              <span>{item.label}</span>
            </button>
          ))}
        </nav>
      </header>

      {tab === "take" ? (
        <main className="mt-5">
          <ExamProgress
            currentStep={currentStep}
            onStepSelect={(step) => {
              if (step === 0) {
                setStage("configure");
              } else if (step === 1 && questions.length) {
                setStage("started");
              } else if (step === 2 && questions.length) {
                setStage("submission");
              } else if (step === 3 && evaluation.length) {
                setStage("result");
              }
            }}
            navigableSteps={navigableSteps}
          />

          {stage === "configure" ? (
            <section className="mx-auto mt-6 max-w-4xl">
              <div className="border-b border-border pb-4">
                <h2 className="text-lg font-semibold">Build your question paper</h2>
                <p className="mt-1 text-sm text-text-secondary">
                  Choose an indexed subject and a realistic paper structure.
                </p>
              </div>

              {subjectLoadError ? (
                <div className="mt-5 flex flex-col gap-3 rounded-lg border border-destructive/40 bg-note-red p-4 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-sm font-semibold text-destructive">
                      Could not load tenant subjects
                    </p>
                    <p className="mt-1 text-sm text-text-secondary">{subjectLoadError}</p>
                  </div>
                  <Button type="button" variant="outline" onClick={() => router.refresh()}>
                    <Icon name="refresh" />
                    Try again
                  </Button>
                </div>
              ) : null}

              {generateError ? (
                <div className="mt-5 rounded-lg border border-destructive/40 bg-note-red p-4 text-sm">
                  <p className="font-semibold text-destructive">Could not generate paper</p>
                  <p className="mt-1 text-text-secondary">{generateError}</p>
                </div>
              ) : null}

              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  handleGenerate();
                }}
                className="mt-5 space-y-6"
              >
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field
                    label="Paper title"
                    hint="Optional. We will use the subject name if left empty."
                  >
                    <Input
                      value={title}
                      onChange={(event) => setTitle(event.target.value)}
                      placeholder="Digital Logic practice exam"
                      autoComplete="off"
                    />
                  </Field>
                  <Field label="Subject">
                    <Select
                      value={subject}
                      onChange={(event) => setSubject(event.target.value)}
                      disabled={!subjects.length}
                    >
                      {subjects.length ? (
                        subjects.map((item) => (
                          <option key={item.name} value={item.name}>
                            {item.name}
                          </option>
                        ))
                      ) : (
                        <option value="">No subjects available</option>
                      )}
                    </Select>
                  </Field>
                  <Field label="Answer mode" hint="How will you answer the exam?">
                    <Select
                      value={answerMode}
                      onChange={(event) => setAnswerMode(event.target.value as AnswerMode)}
                    >
                      <option value="upload">Upload written paper</option>
                      <option value="type">Type answers directly</option>
                    </Select>
                  </Field>
                </div>

                <section
                  aria-labelledby="paper-pattern-title"
                  className="space-y-5 border-t border-border pt-5"
                >
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                    <div>
                      <h3 id="paper-pattern-title" className="text-base font-semibold">
                        Question paper pattern
                      </h3>
                      <p className="mt-1 text-sm text-text-secondary">
                        Pick the marks and question mix. We send the matching sections to the API.
                      </p>
                    </div>
                    <div className="rounded-md border border-border bg-bg-secondary px-3 py-2 text-sm font-semibold">
                      Total {totalMarks} marks
                    </div>
                  </div>

                  <div className="grid gap-4 sm:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
                    <fieldset>
                      <legend className="mb-2 text-xs font-medium uppercase tracking-wider text-text-muted">
                        Full marks
                      </legend>
                      <div className="grid grid-cols-3 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                        {MARK_OPTIONS.map((item) => {
                          const selected = marksOption === item;
                          return (
                            <button
                              key={item}
                              type="button"
                              onClick={() => handleMarksOptionChange(item)}
                              className={cn(
                                "flex flex-col items-center justify-center min-h-[4.5rem] rounded-md border px-2 py-2 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-strong",
                                selected
                                  ? "border-text-primary bg-text-primary text-bg-primary"
                                  : "border-border text-text-secondary hover:bg-bg-secondary hover:text-text-primary",
                              )}
                            >
                              <span className="text-sm font-semibold">{item} marks</span>
                              <span className="text-xs opacity-80 mt-0.5">
                                {formatDuration(getDurationForMarks(item))}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    </fieldset>
                  </div>
                </section>

                {blueprintError ? (
                  <p className="rounded-lg border border-destructive/40 bg-note-red p-3 text-sm text-destructive">
                    {blueprintError}
                  </p>
                ) : null}

                <div className="flex flex-col gap-3 border-t border-border pt-5 sm:flex-row sm:items-center sm:justify-between">
                  <div className="text-sm text-text-muted">
                    <p>
                      {currentSubject
                        ? `${currentSubject.namespace} · ${currentSubject.chunkCount} indexed chunks`
                        : "Subjects are loaded from the tenant API."}
                      {paperStyle !== "custom" ? ` · ${requestedMarks} marks · ${paperStyle}` : ""}
                    </p>
                    {isGenerating ? (
                      <p className="mt-1 text-xs text-text-secondary" aria-live="polite">
                        Waiting for the teacher API
                        {generateElapsed > 0 ? ` · ${generateElapsed}s` : ""}. Larger papers can
                        take a little longer.
                      </p>
                    ) : null}
                    {!isGenerating && generateDisabledReason ? (
                      <p className="mt-1 text-xs text-destructive" aria-live="polite">
                        {generateDisabledReason}
                      </p>
                    ) : null}
                  </div>
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                    {isGenerating ? (
                      <Button
                        type="button"
                        variant="outline"
                        size="lg"
                        onClick={handleCancelGenerate}
                      >
                        Cancel request
                      </Button>
                    ) : null}
                    <Button
                      type="submit"
                      size="lg"
                      disabled={!subject || !blueprintValid || isGenerating}
                    >
                      <Icon name="spark" />
                      {isGenerating ? "Generating..." : "Generate question set"}
                    </Button>
                  </div>
                </div>
              </form>
            </section>
          ) : null}

          {stage === "started" ? (
            <ExamInProgress
              title={title.trim() || `${subject} practice set`}
              subject={subject}
              questions={questions}
              marks={generatedMarks}
              warning={paperWarning}
              secondsLeft={secondsLeft}
              answerMode={answerMode}
              typedAnswers={typedAnswers}
              onTypedAnswerChange={(questionId, value) =>
                setTypedAnswers((current) => ({ ...current, [questionId]: value }))
              }
              onFinish={() => {
                if (secondsLeft === 0) {
                  setSubmissionWasLate(true);
                }
                if (answerMode === "type") {
                  handleSubmitAnswer();
                } else {
                  setStage("submission");
                }
              }}
              onPrintQuestions={() => window.print()}
            />
          ) : null}

          {stage === "submission" ? (
            <SubmissionPanel
              answerMode={answerMode}
              uploadedFile={uploadedFile}
              onFileChange={setUploadedFile}
              fileInputRef={fileInputRef}
              canSubmit={canSubmit}
              isLate={submissionWasLate}
              onBack={() => setStage("started")}
              onSubmit={handleSubmitAnswer}
            />
          ) : null}

          {stage === "submitted" ? (
            <section className="mx-auto mt-8 max-w-xl rounded-lg border border-border bg-bg-primary p-6 text-center sm:p-8">
              <span className="mx-auto flex h-11 w-11 items-center justify-center rounded-full border border-success/40 bg-note-green text-success">
                <Icon name="check" className="h-5 w-5" />
              </span>
              <h2 className="mt-4 text-lg font-semibold">
                {submissionWasLate ? "Late submission received" : "Answer sheet submitted"}
              </h2>
              <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-text-secondary">
                Your{" "}
                {answerMode === "upload" ? (uploadedFile?.name ?? "answer sheet") : "typed answers"}{" "}
                is ready for instant evaluation.
                {submissionWasLate ? " This attempt is marked as late." : ""}
              </p>
              {gradingError ? (
                <div className="mt-5 rounded-lg border border-destructive/40 bg-note-red p-3 text-left text-sm">
                  <p className="font-semibold text-destructive">Could not check answers</p>
                  <p className="mt-1 text-text-secondary">{gradingError}</p>
                </div>
              ) : null}
              <Button
                type="button"
                size="lg"
                className="mt-6"
                disabled={isChecking}
                onClick={handleCheckAnswers}
              >
                <Icon name="spark" />
                {isChecking ? "Checking..." : "Check my answers"}
              </Button>
            </section>
          ) : null}

          {stage === "result" ? (
            <ResultPanel
              subject={subject}
              questions={questions}
              evaluation={evaluation}
              obtained={obtainedMarks}
              marks={generatedMarks}
              submissionId={submissionId}
              isLate={submissionWasLate}
              onViewMap={() => setTab("map")}
              onNewExam={resetExam}
            />
          ) : null}
        </main>
      ) : null}

      {tab === "history" ? <HistoryPanel history={history} onViewAttempt={viewAttempt} /> : null}

      {tab === "map" ? (
        <SyllabusPanel
          subjects={subjects}
          selectedSubject={subject}
          onSubjectChange={setSubject}
          topics={subjectTopics}
          topicScores={topicScores}
          coveredTopics={coveredTopics}
          strongTopics={strongTopics}
          onStartExam={() => {
            setStage("configure");
            setTab("take");
          }}
        />
      ) : null}
    </div>
  );
}

function ExamProgress({
  currentStep,
  navigableSteps,
  onStepSelect,
}: {
  currentStep: number;
  navigableSteps: number[];
  onStepSelect: (step: number) => void;
}) {
  return (
    <ol aria-label="Exam progress" className="grid grid-cols-4 border-b border-border">
      {STAGE_STEPS.map((step, index) => {
        const complete = index < currentStep;
        const current = index === currentStep;
        const navigable = navigableSteps.includes(index);
        return (
          <li key={step.id} className="relative min-w-0">
            <button
              type="button"
              disabled={!navigable}
              onClick={() => onStepSelect(index)}
              aria-current={current ? "step" : undefined}
              className={cn(
                "flex min-h-14 w-full items-center justify-center gap-2 px-2 text-center text-xs font-medium transition-colors sm:text-sm",
                current ? "text-text-primary" : complete ? "text-success" : "text-text-muted",
                navigable
                  ? "cursor-pointer hover:bg-bg-secondary hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-border-strong"
                  : "cursor-default opacity-55",
              )}
            >
              <span
                className={cn(
                  "flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-xs",
                  complete
                    ? "border-success bg-note-green"
                    : current
                      ? "border-border-strong bg-bg-primary"
                      : "border-border bg-bg-secondary",
                )}
              >
                {complete ? "✓" : index + 1}
              </span>
              <span className="hidden sm:inline">{step.label}</span>
            </button>
            {current ? (
              <span className="absolute inset-x-0 bottom-0 h-0.5 bg-text-primary" />
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}

function ExamInProgress({
  title,
  subject,
  questions,
  marks,
  warning,
  secondsLeft,
  answerMode,
  typedAnswers,
  onTypedAnswerChange,
  onFinish,
  onPrintQuestions,
}: {
  title: string;
  subject: string;
  questions: GeneratedQuestion[];
  marks: number;
  warning: string;
  secondsLeft: number;
  answerMode: AnswerMode;
  typedAnswers: Record<string, string>;
  onTypedAnswerChange: (questionId: string, value: string) => void;
  onFinish: () => void;
  onPrintQuestions: () => void;
}) {
  return (
    <section className="mx-auto mt-6 max-w-4xl">
      <div className="sticky top-0 z-10 flex items-center justify-between gap-4 border-y border-border bg-bg-primary/95 py-3 backdrop-blur">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">{title}</p>
          <p className="text-xs text-text-muted">
            {subject} · {marks} marks
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span
            className={cn(
              "inline-flex items-center gap-2 font-mono-ui text-sm",
              secondsLeft < 300 ? "text-destructive" : "text-text-primary",
            )}
          >
            <Icon name="clock" />
            {formatTime(secondsLeft)}
          </span>
          <Button type="button" variant="outline" size="sm" onClick={onPrintQuestions}>
            <Icon name="print" />
            Print
          </Button>
          <Button type="button" size="sm" onClick={onFinish}>
            Finish writing
          </Button>
        </div>
      </div>
      <div className="py-6">
        {warning ? (
          <div className="mb-5 rounded-lg border border-warning/50 bg-note-yellow p-4 text-sm text-warning">
            <p className="font-semibold">Teacher API note</p>
            <p className="mt-1 text-text-secondary">{warning}</p>
          </div>
        ) : null}
        <div className="border-b border-border pb-5 text-center">
          <p className="text-xs uppercase tracking-wider text-text-muted">Instructions</p>
          <p className="mt-2 text-sm text-text-secondary">
            Write every answer clearly on your answer sheet. Attempt all questions.
          </p>
        </div>
        <ol className="divide-y divide-border">
          {questions.map((question) => (
            <li
              key={question.id}
              className="grid gap-3 py-6 sm:grid-cols-[36px_minmax(0,1fr)_72px]"
            >
              <span className="font-mono-ui text-sm text-text-muted">
                {String(question.number).padStart(2, "0")}
              </span>
              <div>
                <p className="text-base leading-7">{question.prompt}</p>
                {questionMetadata(question) ? (
                  <p className="mt-2 text-xs text-text-muted">{questionMetadata(question)}</p>
                ) : null}
                {answerMode === "type" ? (
                  <div className="mt-4">
                    <Textarea
                      value={typedAnswers[question.id] ?? ""}
                      onChange={(event) => onTypedAnswerChange(question.id, event.target.value)}
                      rows={5}
                      placeholder="Type your answer here..."
                    />
                  </div>
                ) : null}
              </div>
              <span className="text-right text-sm font-medium">{question.marks} marks</span>
            </li>
          ))}
        </ol>
      </div>
      <div className="flex justify-end border-t border-border pt-5">
        <Button type="button" size="lg" onClick={onFinish}>
          Finish writing
          <Icon name="arrow" />
        </Button>
      </div>
    </section>
  );
}

function SubmissionPanel({
  answerMode,
  uploadedFile,
  onFileChange,
  fileInputRef,
  canSubmit,
  isLate,
  onBack,
  onSubmit,
}: {
  answerMode: AnswerMode;
  uploadedFile: File | null;
  onFileChange: (file: File | null) => void;
  fileInputRef: RefObject<HTMLInputElement | null>;
  canSubmit: boolean;
  isLate: boolean;
  onBack: () => void;
  onSubmit: () => void;
}) {
  return (
    <section className="mx-auto mt-6 max-w-4xl">
      <div className="border-b border-border pb-4">
        <h2 className="text-lg font-semibold">Submit your answers</h2>
        <p className="mt-1 text-sm text-text-secondary">
          {answerMode === "upload"
            ? "Upload a scanned answer sheet."
            : "Review your typed answers and submit."}
        </p>
      </div>

      {isLate ? (
        <div className="mt-5 rounded-lg border border-warning/50 bg-note-yellow p-4 text-sm text-warning">
          <p className="font-semibold">Late submission</p>
          <p className="mt-1 text-text-secondary">
            Time is over, but the submit portal remains open. This attempt will be marked late.
          </p>
        </div>
      ) : null}

      {answerMode === "upload" ? (
        <div className="mt-5">
          <input
            ref={fileInputRef}
            id="answer-sheet-upload"
            type="file"
            accept="application/pdf,image/*"
            className="sr-only"
            onChange={(event) => onFileChange(event.target.files?.[0] ?? null)}
          />
          <label
            htmlFor="answer-sheet-upload"
            className="flex min-h-64 cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed border-border-strong bg-bg-secondary p-6 text-center transition-colors hover:bg-bg-tertiary focus-within:ring-2 focus-within:ring-border-strong"
          >
            <span className="flex h-11 w-11 items-center justify-center rounded-full border border-border bg-bg-primary">
              <Icon name={uploadedFile ? "file" : "upload"} className="h-5 w-5" />
            </span>
            <span className="mt-4 text-sm font-semibold">
              {uploadedFile ? uploadedFile.name : "Choose PDF or scanned images"}
            </span>
            <span className="mt-1 text-xs text-text-muted">
              {uploadedFile
                ? "Ready to submit"
                : "PDF, JPG, or PNG · keep all pages clear and upright"}
            </span>
          </label>
        </div>
      ) : (
        <div className="mt-5 rounded-lg border border-border bg-bg-secondary p-5 text-center">
          <p className="text-sm font-medium">Your typed answers are saved.</p>
          <p className="mt-1 text-xs text-text-muted">If you are ready, click Submit below.</p>
        </div>
      )}

      <div className="mt-6 flex flex-col-reverse gap-3 border-t border-border pt-5 sm:flex-row sm:items-center sm:justify-between">
        <Button type="button" variant="ghost" onClick={onBack}>
          Back to paper
        </Button>
        <Button type="button" size="lg" disabled={!canSubmit} onClick={onSubmit}>
          Submit answer
          <Icon name="arrow" />
        </Button>
      </div>
    </section>
  );
}

function ResultPanel({
  subject,
  questions,
  evaluation,
  obtained,
  marks,
  submissionId,
  isLate,
  onViewMap,
  onNewExam,
}: {
  subject: string;
  questions: GeneratedQuestion[];
  evaluation: EvaluationRow[];
  obtained: number;
  marks: number;
  submissionId: string;
  isLate: boolean;
  onViewMap: () => void;
  onNewExam: () => void;
}) {
  const percentage = marks ? Math.round((obtained / marks) * 100) : 0;
  const level = levelForScore(obtained, marks);
  return (
    <section className="mx-auto mt-6 max-w-4xl">
      <div className="grid gap-5 border-b border-border pb-6 md:grid-cols-[220px_minmax(0,1fr)]">
        <div className={cn("rounded-lg border p-5", levelClasses(level))}>
          <p className="text-xs font-medium uppercase tracking-wider">Your result</p>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="font-display text-5xl font-semibold">{formatMark(obtained)}</span>
            <span className="text-sm">/ {formatMark(marks)}</span>
          </div>
          <p className="mt-3 text-sm font-medium">{percentage}% overall</p>
        </div>
        <div className="self-center">
          <p className="text-xs font-medium uppercase tracking-wider text-text-muted">{subject}</p>
          <h2 className="mt-1 text-xl font-semibold">
            {level === "strong"
              ? "Exam ready on this set"
              : level === "mid"
                ? "Good base, focused revision needed"
                : "Revise before the next attempt"}
          </h2>
          <p className="mt-2 max-w-xl text-sm leading-6 text-text-secondary">
            Your marks are mapped back to syllabus topics. Use the corrections below, then retake
            weak areas until the map turns green.
          </p>
          {submissionId || isLate ? (
            <p className="mt-2 text-xs text-text-muted">
              {submissionId ? `Submission ${submissionId}` : "Submission checked"}
              {isLate ? " · late" : ""}
            </p>
          ) : null}
          <div className="mt-4 flex flex-wrap gap-2">
            <Button type="button" onClick={onViewMap}>
              <Icon name="map" />
              View syllabus map
            </Button>
            <Button type="button" variant="outline" onClick={onNewExam}>
              <Icon name="refresh" />
              New exam
            </Button>
          </div>
        </div>
      </div>

      <div className="mt-6">
        <h3 className="text-base font-semibold">Question-by-question feedback</h3>
        <div className="mt-3 divide-y divide-border rounded-lg border border-border">
          {questions.map((question) => {
            const row = evaluation.find((item) => item.questionId === question.id);
            const rowLevel = levelForScore(row?.obtained ?? 0, question.marks);
            return (
              <article key={question.id} className="p-4 sm:p-5">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-xs font-medium uppercase tracking-wider text-text-muted">
                      Question {question.number}
                      {questionMetadata(question) ? ` · ${questionMetadata(question)}` : ""}
                    </p>
                    <p className="mt-2 text-sm leading-6">{question.prompt}</p>
                  </div>
                  <span
                    className={cn(
                      "shrink-0 rounded-md border px-2.5 py-1 text-sm font-semibold",
                      levelClasses(rowLevel),
                    )}
                  >
                    {formatMark(row?.obtained ?? 0)}/{formatMark(question.marks)}
                  </span>
                </div>
                <div className="mt-4 grid gap-3 sm:grid-cols-3">
                  <FeedbackBlock
                    label="Your Answer"
                    text={row?.studentAnswer ?? "No answer provided."}
                  />
                  <FeedbackBlock
                    label="Assessment"
                    text={row?.feedback ?? "No feedback returned by the API."}
                  />
                  <FeedbackBlock
                    label="Reference"
                    text={row?.correction ?? "No reference answer returned by the API."}
                  />
                </div>
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function FeedbackBlock({ label, text }: { label: string; text: string }) {
  return (
    <div className="rounded-md bg-bg-secondary p-3">
      <p className="text-xs font-medium uppercase tracking-wider text-text-muted">{label}</p>
      <p className="mt-1.5 text-sm leading-6 text-text-secondary">{text}</p>
    </div>
  );
}

function HistoryPanel({
  history,
  onViewAttempt,
}: {
  history: ExamAttempt[];
  onViewAttempt: (attempt: ExamAttempt) => void;
}) {
  const average = history.length
    ? Math.round(
        history.reduce((sum, attempt) => sum + (attempt.obtained / attempt.marks) * 100, 0) /
          history.length,
      )
    : 0;
  return (
    <main className="mt-6">
      <div className="grid gap-3 sm:grid-cols-3">
        <Metric label="Completed exams" value={history.length} />
        <Metric label="Average score" value={`${average}%`} />
        <Metric
          label="Latest score"
          value={
            history[0]
              ? `${formatMark(history[0].obtained)}/${formatMark(history[0].marks)}`
              : "None"
          }
        />
      </div>
      <section className="mt-6">
        <div className="border-b border-border pb-4">
          <h2 className="text-lg font-semibold">Exam history</h2>
          <p className="mt-1 text-sm text-text-secondary">
            Open any attempt to review marks and feedback.
          </p>
        </div>
        {history.length ? (
          <div className="divide-y divide-border">
            {history.map((attempt) => (
              <button
                key={attempt.id}
                type="button"
                onClick={() => onViewAttempt(attempt)}
                className="grid w-full gap-3 py-5 text-left transition-colors hover:bg-bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-strong sm:grid-cols-[minmax(0,1fr)_120px_100px_20px] sm:items-center sm:px-3"
              >
                <div>
                  <p className="font-medium">{attempt.title}</p>
                  <p className="mt-1 text-sm text-text-secondary">
                    {attempt.subject} · {attempt.questions.length} questions
                  </p>
                </div>
                <span className="text-sm text-text-muted">{attempt.date}</span>
                <span
                  className={cn(
                    "w-fit rounded-md border px-2.5 py-1 text-sm font-semibold",
                    levelClasses(levelForScore(attempt.obtained, attempt.marks)),
                  )}
                >
                  {formatMark(attempt.obtained)}/{formatMark(attempt.marks)}
                </span>
                <Icon name="arrow" className="hidden sm:block" />
              </button>
            ))}
          </div>
        ) : (
          <div className="py-16 text-center">
            <p className="font-medium">No completed exams</p>
            <p className="mt-1 text-sm text-text-secondary">
              Your checked attempts will appear here.
            </p>
          </div>
        )}
      </section>
    </main>
  );
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg border border-border bg-bg-secondary p-4">
      <p className="text-xs text-text-muted">{label}</p>
      <p className="mt-2 text-xl font-semibold">{value}</p>
    </div>
  );
}

function SyllabusPanel({
  subjects,
  selectedSubject,
  onSubjectChange,
  topics,
  topicScores,
  coveredTopics,
  strongTopics,
  onStartExam,
}: {
  subjects: ExamSubjectOption[];
  selectedSubject: string;
  onSubjectChange: (subject: string) => void;
  topics: string[];
  topicScores: Map<string, { obtained: number; total: number }>;
  coveredTopics: number;
  strongTopics: number;
  onStartExam: () => void;
}) {
  const gradedPercent = topics.length ? Math.round((coveredTopics / topics.length) * 100) : 0;
  return (
    <main className="mt-6">
      <div className="flex flex-col gap-4 border-b border-border pb-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold">Syllabus readiness</h2>
          <p className="mt-1 text-sm text-text-secondary">
            Only API-graded topics appear here. Full uncovered syllabus needs a topic-list API.
          </p>
        </div>
        <div className="w-full sm:w-64">
          <Field label="Subject">
            <Select
              value={selectedSubject}
              onChange={(event) => onSubjectChange(event.target.value)}
            >
              {subjects.map((item) => (
                <option key={item.name} value={item.name}>
                  {item.name}
                </option>
              ))}
            </Select>
          </Field>
        </div>
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-[260px_minmax(0,1fr)]">
        <aside className="space-y-4">
          <div className="rounded-lg border border-border p-4">
            <p className="text-xs font-medium uppercase tracking-wider text-text-muted">
              Graded topics
            </p>
            <p className="mt-2 text-3xl font-semibold">{gradedPercent}%</p>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-bg-tertiary">
              <div className="h-full bg-text-primary" style={{ width: `${gradedPercent}%` }} />
            </div>
            <p className="mt-3 text-sm text-text-secondary">
              {coveredTopics} of {topics.length} API-returned topics attempted
            </p>
          </div>
          <div className="rounded-lg border border-border p-4">
            <p className="text-xs font-medium uppercase tracking-wider text-text-muted">
              Exam-ready topics
            </p>
            <p className="mt-2 text-3xl font-semibold text-success">{strongTopics}</p>
            <p className="mt-1 text-sm text-text-secondary">Green topics scoring 75% or above</p>
          </div>
          <Button type="button" className="w-full" onClick={onStartExam}>
            Take another exam
          </Button>
          <div className="flex flex-wrap gap-2 text-xs">
            <Legend label="Uncovered" level="uncovered" />
            <Legend label="Weak" level="weak" />
            <Legend label="Mid" level="mid" />
            <Legend label="Strong" level="strong" />
          </div>
        </aside>

        <section
          aria-label={`${selectedSubject} topic performance`}
          className="grid content-start gap-3 sm:grid-cols-2"
        >
          {topics.length ? (
            topics.map((topic) => {
              const score = topicScores.get(topic);
              const level = levelForScore(score?.obtained ?? 0, score?.total ?? 0);
              const percent = score?.total ? Math.round((score.obtained / score.total) * 100) : 0;
              return (
                <article
                  key={topic}
                  className={cn("min-h-28 rounded-lg border p-4", levelClasses(level))}
                >
                  <div className="flex items-start justify-between gap-3">
                    <p className="text-sm font-semibold">{topic}</p>
                    <span className="text-xs font-semibold">
                      {score?.total ? `${percent}%` : "—"}
                    </span>
                  </div>
                  <p className="mt-5 text-xs">
                    {score?.total
                      ? `${formatMark(score.obtained)}/${formatMark(score.total)} marks across attempts`
                      : "Not covered in an exam yet"}
                  </p>
                </article>
              );
            })
          ) : (
            <div className="col-span-full rounded-lg border border-border p-8 text-center">
              <p className="font-medium">No syllabus topics mapped yet</p>
              <p className="mt-1 text-sm text-text-secondary">
                Complete an API-graded exam to begin building this map.
              </p>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}

function Legend({ label, level }: { label: string; level: TopicLevel }) {
  return (
    <span
      className={cn("inline-flex items-center rounded-md border px-2 py-1", levelClasses(level))}
    >
      {label}
    </span>
  );
}
