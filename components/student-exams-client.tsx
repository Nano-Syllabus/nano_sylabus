"use client";

import { FileText, Image as ImageIcon, Upload } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import {
  clearSavedSitting,
  readSavedSitting,
  SITTING_KEY,
  type Answer,
  type SavedSitting,
  type StudentExam,
  type StudentExamQuestion,
} from "@/lib/practice-sitting";
import type { PracticeEvaluation } from "@/lib/tenant/client";
import { cn } from "@/lib/utils";
import { McqCheckerDialog } from "@/components/mcq-checker-dialog";

type ResultLine = { question: StudentExamQuestion; got: number; note: string; answer: string };
/** How the rest of the classroom did — aggregate only, nobody is named. */
type ClassSpread = {
  count: number;
  averagePercent: number;
  bands: number[];
  myBand: number;
  below: number;
};

type Result = {
  exam: StudentExam;
  score: number;
  outOf: number;
  lines: ResultLine[];
  /** The tenant's own chapter-wise verdict, when it graded this sitting. */
  evaluation?: PracticeEvaluation | null;
  spread?: ClassSpread | null;
  handedInAt?: string;
  studentName?: string;
  detailsAvailable?: boolean;
  penalty?: number;
  answerSheet?: { name: string; mimeType: string; sizeBytes: number; url: string } | null;
};
type PracticeLength = 5 | 10;
type PracticeMode = "quick" | "mcq" | "paper" | "checker";
type PracticeSubjectOption = {
  name: string;
  slug: string;
  practiceAvailable: boolean;
};
type FullPaperMarks = 20 | 40 | 60 | 80 | 100;
type FullPaperDuration = 60 | 120 | 180;
type PaperCoverage = "full" | "weak";
type PaperAnswerMode = "type" | "upload";
type PaperStyle = "balanced" | "theory" | "numerical" | "diagram";
type CheckerResult = {
  score: number;
  marks: number;
  feedback: string;
  evaluation?: PracticeEvaluation | null;
};
type TeacherAssignment = {
  id: string;
  externalPaperId: string;
  classroomName: string;
  subjectName: string;
  opensAt?: string | null;
  closesAt?: string | null;
  submitted?: boolean;
  canAttempt?: boolean;
  attemptCount?: number;
  maxAttempts?: number;
  attempts?: Array<{
    id: string;
    attemptNo: number;
    reviewStatus: "pending" | "reviewed" | "published";
    grade?: { total_score?: number; total_marks?: number } | null;
    createdAt: string;
  }>;
  reviewStatus?: "pending" | "reviewed" | "published" | null;
  spread?: ClassSpread | null;
  grade?: {
    total_score?: number;
    total_marks?: number;
    evaluation?: PracticeEvaluation;
    results?: Array<{
      question_id: string;
      score: number;
      feedback: string;
      student_answer?: string;
    }>;
  } | null;
  paper: {
    id: string;
    title: string;
    subject: string;
    totalMarks: number;
    kind?: string;
    timeLimitMinutes?: number;
    attempts?: number;
    questions: Array<{
      id: string;
      chapter?: string;
      questionType?: string;
      marks: number;
      text: string;
    }>;
  };
};

const shellButton =
  "inline-flex min-h-10 items-center justify-center rounded-lg px-4 text-sm font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-strong focus-visible:ring-offset-2";
const primaryButton = `${shellButton} bg-text-primary text-text-inverse hover:opacity-85`;
const secondaryButton = `${shellButton} border border-border-strong hover:bg-bg-secondary`;
const DEFAULT_PAPER_INSTRUCTION =
  "Mark strictly. Award credit for correct working, but penalize missing derivations, units, and diagrams.";
const MAX_ANSWER_SHEET_BYTES = 15 * 1024 * 1024;
const ANSWER_SHEET_TYPES = new Set(["application/pdf", "image/png", "image/jpeg"]);

async function readApiJson<T>(response: Response): Promise<T> {
  const contentType = response.headers.get("content-type") || "";
  if (!contentType.toLowerCase().includes("application/json")) {
    throw new Error(
      response.status === 404
        ? "The MCQ hand-in route is not available in this deployment. Refresh after the latest deployment finishes."
        : `The server returned an invalid response while handing in (HTTP ${response.status}). Please try again.`,
    );
  }
  return response.json() as Promise<T>;
}

function submittedAnswer(question: StudentExamQuestion, answer?: Answer) {
  const selectedChoice = answer?.choice;
  return {
    answerText:
      answer?.text?.trim() ||
      (selectedChoice === undefined ? "" : question.options?.[selectedChoice] ?? String(selectedChoice)),
    ...(selectedChoice === undefined ? {} : { selectedChoice }),
  };
}

function Chip({ children, strong = false }: { children: React.ReactNode; strong?: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex min-h-8 items-center rounded-full border px-3 text-[13px]",
        strong ? "border-border-strong" : "border-border text-text-secondary",
      )}
    >
      {children}
    </span>
  );
}

function questionTypeLabel(value?: string) {
  if (!value) return null;
  const normalized = value.replace(/[_-]+/g, " ").trim();
  return normalized ? normalized.charAt(0).toUpperCase() + normalized.slice(1) : null;
}

function askHref(topic: string, subject: string) {
  const query = new URLSearchParams({
    subject,
    prompt: `I have a doubt about ${topic}. Please help me understand it.`,
  });
  return `/app/chat?${query.toString()}`;
}

function subjectUrlKey(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function Dialog({
  title,
  children,
  footer,
  onClose,
}: {
  title: string;
  children: React.ReactNode;
  footer: React.ReactNode;
  onClose: () => void;
}) {
  useEffect(() => {
    const close = (event: KeyboardEvent) => event.key === "Escape" && onClose();
    document.addEventListener("keydown", close);
    return () => document.removeEventListener("keydown", close);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-[100] grid place-items-center p-4">
      <button
        type="button"
        aria-label="Close dialog"
        className="absolute inset-0 bg-black/45"
        onClick={onClose}
      />
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="exam-dialog-title"
        className="relative w-full max-w-lg rounded-2xl border border-border bg-bg-primary p-6 shadow-xl"
      >
        <h2 id="exam-dialog-title" className="font-display text-2xl font-semibold">
          {title}
        </h2>
        <div className="mt-4">{children}</div>
        <div className="mt-6 flex flex-wrap justify-end gap-2">{footer}</div>
      </section>
    </div>
  );
}

/** A chapter as the tenant reports it, plus what this student has shown on it. */
type PracticeTopic = {
  topic_key: string;
  title: string;
  blurb?: string;
  weight: number;
  qb_question_count: number;
  status: "strong" | "developing" | "weak" | "not_attempted";
  percentage: number;
  attempts: number;
  lostWeightage: number;
};

type PracticeAttempt = {
  id: string;
  subjectName: string;
  source: string;
  totalScore: number;
  totalMarks: number;
  evaluation: PracticeEvaluation | null;
  hasDetails: boolean;
  createdAt: string;
};

const TOPIC_DOT: Record<PracticeTopic["status"], string> = {
  strong: "bg-emerald-600",
  developing: "bg-amber-500",
  weak: "bg-destructive",
  not_attempted: "bg-bg-tertiary",
};

/** What the practice dialog ticks by default: what has cost the most marks. */
function weakestTopicKeys(topics: PracticeTopic[]) {
  return topics
    .filter((topic) => topic.status === "weak" || topic.status === "developing")
    .sort(
      (left, right) =>
        right.lostWeightage - left.lostWeightage || left.percentage - right.percentage,
    )
    .slice(0, 3)
    .map((topic) => topic.topic_key);
}

function buildPaperBands(totalMarks: FullPaperMarks, style: PaperStyle) {
  const unitCount = totalMarks / 20;
  if (style === "theory") {
    return [
      { label: "Short theory", question_type: "theory", count: unitCount * 2, marks_each: 5 },
      { label: "Long theory", question_type: "theory", count: unitCount, marks_each: 10 },
    ];
  }
  if (style === "numerical") {
    return [
      { label: "Short numerical", question_type: "numerical", count: unitCount * 2, marks_each: 5 },
      { label: "Long numerical", question_type: "numerical", count: unitCount, marks_each: 10 },
    ];
  }
  if (style === "diagram") {
    return [
      {
        label: "Diagram / derivation",
        question_type: "theory",
        count: unitCount * 2,
        marks_each: 5,
      },
      {
        label: "Long diagram / derivation",
        question_type: "theory",
        count: unitCount,
        marks_each: 10,
      },
    ];
  }
  return [
    { label: "Short theory", question_type: "theory", count: unitCount, marks_each: 5 },
    {
      label: "Short numerical",
      question_type: "numerical",
      count: unitCount,
      marks_each: 5,
    },
    { label: "Long answer", question_type: "theory", count: unitCount, marks_each: 10 },
  ];
}

type PracticeSessionQuestion = {
  id: string;
  topic_key: string;
  topic: string;
  marks: number;
  question_type?: string;
  text: string;
};

type McqApiOption = string | {
  key?: string;
  text?: string;
  label?: string;
  value?: string;
};

type McqApiQuestion = {
  id?: string;
  question_id?: string;
  chapter?: string;
  topic?: string;
  marks?: number;
  text?: string;
  question?: string;
  options?: McqApiOption[];
};

function mcqOptionText(option: McqApiOption) {
  if (typeof option === "string") return option;
  return option.text || option.label || option.value || option.key || "";
}

function assignmentExam(assignment: TeacherAssignment): StudentExam {
  const now = Date.now();
  const opens = assignment.opensAt ? new Date(assignment.opensAt).getTime() : null;
  const closes = assignment.closesAt ? new Date(assignment.closesAt).getTime() : null;
  const windowState = opens && opens > now ? "before" : closes && closes < now ? "done" : "open";
  return {
    id: `teacher_${assignment.id}`,
    subject: assignment.subjectName || assignment.paper.subject,
    title: assignment.paper.title,
    kind: assignment.paper.kind || "exam",
    counts: true,
    marks: assignment.paper.totalMarks,
    minutes: Math.max(5, Math.min(300, Number(assignment.paper.timeLimitMinutes) || 60)),
    attempts: Math.max(1, Number(assignment.maxAttempts) || Number(assignment.paper.attempts) || 1),
    window: windowState,
    windowLabel:
      windowState === "open"
        ? assignment.classroomName
        : windowState === "before"
          ? "Not open yet"
          : "Closed",
    questions: assignment.paper.questions.map((question) => ({
      id: question.id,
      type: question.questionType === "numerical" ? "long" : "short",
      questionType: question.questionType,
      marks: question.marks,
      topic: question.chapter || assignment.subjectName,
      prompt: question.text,
    })),
  };
}

function PracticeDialog({
  mode,
  subjects,
  subjectUnavailable,
  subject,
  topics,
  topicsState,
  topicsError,
  selectedTopics,
  length,
  quickMarks,
  mcqOneMarkCount,
  mcqTwoMarkCount,
  mcqPerChapter,
  mcqOptionsPerQuestion,
  mcqNegativeMarks,
  mcqInstruction,
  sharedMcqSetId,
  paperMarks,
  paperDuration,
  paperCoverage,
  paperAnswerMode,
  paperStyle,
  checkerQuestion,
  checkerChapter,
  checkerMarks,
  checkerReference,
  checkerAnswer,
  checkerResult,
  checking,
  starting,
  startError,
  onMode,
  onSubject,
  onTopic,
  onLength,
  onQuickMarks,
  onMcqOneMarkCount,
  onMcqTwoMarkCount,
  onMcqPerChapter,
  onMcqOptionsPerQuestion,
  onMcqNegativeMarks,
  onMcqInstruction,
  onSharedMcqSetId,
  onOpenSharedMcq,
  onPaperMarks,
  onPaperDuration,
  onPaperCoverage,
  onPaperAnswerMode,
  onPaperStyle,
  onCheckerQuestion,
  onCheckerChapter,
  onCheckerMarks,
  onCheckerReference,
  onCheckerAnswer,
  onCheck,
  onClose,
  onStart,
}: {
  mode: PracticeMode;
  subjects: PracticeSubjectOption[];
  subjectUnavailable: boolean;
  subject: string;
  topics: PracticeTopic[];
  topicsState: "loading" | "ready" | "error";
  topicsError: string;
  selectedTopics: string[];
  length: PracticeLength;
  quickMarks: 10 | 20 | 40;
  mcqOneMarkCount: number;
  mcqTwoMarkCount: number;
  mcqPerChapter: boolean;
  mcqOptionsPerQuestion: number;
  mcqNegativeMarks: string;
  mcqInstruction: string;
  sharedMcqSetId: string;
  paperMarks: FullPaperMarks;
  paperDuration: FullPaperDuration;
  paperCoverage: PaperCoverage;
  paperAnswerMode: PaperAnswerMode;
  paperStyle: PaperStyle;
  checkerQuestion: string;
  checkerChapter: string;
  checkerMarks: 2 | 5 | 10;
  checkerReference: string;
  checkerAnswer: string;
  checkerResult: CheckerResult | null;
  checking: boolean;
  starting: boolean;
  startError: string;
  onMode: (mode: PracticeMode) => void;
  onSubject: (subject: string) => void;
  onTopic: (topicKey: string) => void;
  onLength: (length: PracticeLength) => void;
  onQuickMarks: (marks: 10 | 20 | 40) => void;
  onMcqOneMarkCount: (count: number) => void;
  onMcqTwoMarkCount: (count: number) => void;
  onMcqPerChapter: (value: boolean) => void;
  onMcqOptionsPerQuestion: (count: number) => void;
  onMcqNegativeMarks: (marks: string) => void;
  onMcqInstruction: (value: string) => void;
  onSharedMcqSetId: (value: string) => void;
  onOpenSharedMcq: () => void;
  onPaperMarks: (marks: FullPaperMarks) => void;
  onPaperDuration: (minutes: FullPaperDuration) => void;
  onPaperCoverage: (coverage: PaperCoverage) => void;
  onPaperAnswerMode: (mode: PaperAnswerMode) => void;
  onPaperStyle: (style: PaperStyle) => void;
  onCheckerQuestion: (value: string) => void;
  onCheckerChapter: (value: string) => void;
  onCheckerMarks: (value: 2 | 5 | 10) => void;
  onCheckerReference: (value: string) => void;
  onCheckerAnswer: (value: string) => void;
  onCheck: (event: FormEvent<HTMLFormElement>) => void;
  onClose: () => void;
  onStart: () => void;
}) {
  const closeButton = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    closeButton.current?.focus();
    const close = (event: KeyboardEvent) => event.key === "Escape" && onClose();
    document.addEventListener("keydown", close);
    return () => document.removeEventListener("keydown", close);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-[100] grid place-items-center p-5">
      <button
        type="button"
        aria-label="Close practice dialog"
        className="absolute inset-0 bg-black/45"
        onClick={onClose}
      />
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="practice-dialog-title"
        className="relative max-h-[90vh] w-full max-w-[760px] overflow-y-auto rounded-2xl border border-border bg-bg-primary shadow-xl"
      >
        <header className="flex items-center gap-3 border-b border-border px-[22px] py-[18px]">
          <h2 id="practice-dialog-title" className="font-display text-xl font-semibold">
            {mode === "checker" ? "Quick check" : "Practise"}
          </h2>
          <span className="flex-1" />
          <button ref={closeButton} type="button" className={secondaryButton} onClick={onClose}>
            Close
          </button>
        </header>

        <div className="px-[22px] py-5">
          {mode !== "checker" ? (
            <div
              role="tablist"
              aria-label="Practice type"
              className="mb-5 grid grid-cols-3 rounded-xl border border-border p-1"
            >
              {(
                [
                  ["quick", "Quick drill"],
                  ["mcq", "MCQ quiz"],
                  ["paper", "Full paper"],
                ] as const
              ).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  role="tab"
                  aria-selected={mode === value}
                  onClick={() => onMode(value)}
                  className={cn(
                    "min-h-10 rounded-lg px-2 text-[13px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-strong",
                    mode === value
                      ? "bg-text-primary font-medium text-text-inverse"
                      : "text-text-secondary hover:bg-bg-secondary",
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
          ) : null}

          {mode !== "checker" && subjectUnavailable ? (
            <div className="mb-4 rounded-lg border border-border bg-bg-secondary p-4">
              <p className="text-sm font-medium">Practice content is not indexed yet</p>
              <p className="mt-1 text-[13px] text-text-muted">
                This course subject has no indexed material or question bank yet. Ask the course
                creator to upload and index source files before starting practice.
              </p>
            </div>
          ) : null}

          {mode !== "checker" ? (
            subjects.length ? (
              <div className="mb-4">
                <p className="mb-2 text-[13px] text-text-muted">
                  Subject · {subjects.length} available
                </p>
                <div className="flex gap-2 overflow-x-auto pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                  {subjects.map((item) => (
                    <button
                      key={item.slug}
                      type="button"
                      onClick={() => onSubject(item.slug)}
                      className={cn(
                        "min-h-10 shrink-0 whitespace-nowrap rounded-full border px-3 text-[13px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-strong",
                        item.slug === subject
                          ? "border-border-strong bg-text-primary font-medium text-text-inverse"
                          : "border-border bg-bg-primary text-text-secondary hover:border-border-strong",
                      )}
                    >
                      {item.name}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="mb-4 rounded-lg border border-border p-4">
                <p className="text-sm font-medium">No subjects available</p>
                <p className="mt-1 text-[13px] text-text-muted">
                  Subjects appear here when the tenant subject API exposes them.
                </p>
              </div>
            )
          ) : null}

          {mode === "quick" || mode === "mcq" ? (
            <fieldset>
              <legend className="mb-2 text-[13px] text-text-muted">
                {mode === "mcq"
                  ? "Which chapters? Leave all unticked to quiz the whole subject."
                  : "Which chapters? Leave all unticked and the most heavily examined ones are used."}
              </legend>

              {topicsState === "loading" ? (
                <p className="mb-4 text-[13px] text-text-muted">Reading the syllabus…</p>
              ) : null}

              {topicsState === "error" ? (
                <p className="mb-4 text-[13px] text-destructive">{topicsError}</p>
              ) : null}

              {topicsState === "ready" && topics.length ? (
                <div className="mb-4 flex flex-wrap gap-2">
                  {topics.map((topic) => {
                    const selected = selectedTopics.includes(topic.topic_key);
                    return (
                      <button
                        key={topic.topic_key}
                        type="button"
                        aria-pressed={selected}
                        title={`${Math.round(topic.weight * 100)}% of the question bank`}
                        onClick={() => onTopic(topic.topic_key)}
                        className={cn(
                          "min-h-10 rounded-full border px-3 text-[13px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-strong",
                          selected
                            ? "border-border-strong bg-text-primary text-text-inverse"
                            : "border-border bg-bg-primary text-text-secondary hover:border-border-strong",
                        )}
                      >
                        <span
                          className={cn(
                            "mr-1.5 inline-block h-2 w-2 rounded-full align-middle",
                            TOPIC_DOT[topic.status],
                          )}
                          aria-hidden="true"
                        />
                        {selected ? "✓ " : ""}
                        {topic.title}
                        <span className="ml-1.5 opacity-60">{Math.round(topic.weight * 100)}%</span>
                      </button>
                    );
                  })}
                </div>
              ) : null}

              {topicsState === "ready" && !topics.length ? (
                <p className="mb-4 text-[13px] text-text-muted">
                  No chapters found for this subject — the whole syllabus will be used.
                </p>
              ) : null}
            </fieldset>
          ) : null}

          {mode === "quick" ? (
            <fieldset>
              <legend className="mb-1.5 text-[13px] text-text-muted">How long?</legend>
              <div className="mb-4 inline-flex max-w-full rounded-xl border border-border bg-bg-primary p-1 shadow-sm">
                <button
                  type="button"
                  onClick={() => onLength(5)}
                  className={cn(
                    "min-h-10 rounded-[9px] px-[18px] text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-strong",
                    length === 5
                      ? "bg-text-primary font-semibold text-text-inverse"
                      : "text-text-secondary",
                  )}
                >
                  Quick · 5 questions
                </button>
                <button
                  type="button"
                  onClick={() => onLength(10)}
                  className={cn(
                    "min-h-10 rounded-[9px] px-[18px] text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-strong",
                    length === 10
                      ? "bg-text-primary font-semibold text-text-inverse"
                      : "text-text-secondary",
                  )}
                >
                  Full · 10 questions
                </button>
              </div>
            </fieldset>
          ) : null}

          {mode === "quick" ? (
            <fieldset>
              <legend className="mb-1.5 text-[13px] text-text-muted">Target marks</legend>
              <div className="mb-4 inline-flex max-w-full rounded-xl border border-border bg-bg-primary p-1 shadow-sm">
                {([10, 20, 40] as const).map((marks) => (
                  <button
                    key={marks}
                    type="button"
                    onClick={() => onQuickMarks(marks)}
                    className={cn(
                      "min-h-10 rounded-[9px] px-4 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-strong",
                      quickMarks === marks
                        ? "bg-text-primary font-semibold text-text-inverse"
                        : "text-text-secondary",
                    )}
                  >
                    {marks} marks
                  </button>
                ))}
              </div>
            </fieldset>
          ) : null}

          {mode === "mcq" ? (
            <div className="space-y-4">
              <fieldset>
                <legend className="mb-2 text-[13px] text-text-muted">Question mix</legend>
                <div className="grid gap-3 sm:grid-cols-2">
                  {([
                    [1, mcqOneMarkCount, onMcqOneMarkCount],
                    [2, mcqTwoMarkCount, onMcqTwoMarkCount],
                  ] as const).map(([marks, value, change]) => (
                    <label key={marks} className="rounded-xl border border-border p-3 text-[13px] text-text-muted">
                      {marks}-mark questions
                      <input type="number" min={0} max={60} value={value} onChange={(event) => change(Math.max(0, Math.min(60, Number(event.target.value) || 0)))} className="mt-2 h-11 w-full rounded-lg border border-border bg-bg-primary px-3 text-base text-text-primary outline-none focus-visible:ring-2 focus-visible:ring-border-strong" />
                    </label>
                  ))}
                </div>
                <label className="mt-3 flex min-h-11 items-center gap-2 rounded-lg border border-border px-3 text-sm">
                  <input type="checkbox" checked={mcqPerChapter} disabled={!selectedTopics.length} onChange={(event) => onMcqPerChapter(event.target.checked)} />
                  Repeat this mix for each selected chapter
                </label>
                <p className="mt-2 text-[13px] text-text-muted">
                  {(mcqOneMarkCount + mcqTwoMarkCount) * (mcqPerChapter ? selectedTopics.length : 1)} questions · {(mcqOneMarkCount + mcqTwoMarkCount * 2) * (mcqPerChapter ? selectedTopics.length : 1)} marks
                  {((mcqOneMarkCount + mcqTwoMarkCount) * (mcqPerChapter ? selectedTopics.length : 1)) > 60 ? " · Reduce the mix to stay under 60." : ""}
                </p>
              </fieldset>

              <fieldset>
                <legend className="mb-1.5 text-[13px] text-text-muted">Options per question</legend>
                <div className="grid grid-cols-5 rounded-xl border border-border p-1">
                  {[2, 3, 4, 5, 6].map((count) => <button key={count} type="button" onClick={() => onMcqOptionsPerQuestion(count)} className={cn("min-h-10 rounded-lg text-sm", mcqOptionsPerQuestion === count ? "bg-text-primary font-semibold text-text-inverse" : "text-text-secondary")}>{count}</button>)}
                </div>
              </fieldset>

              <fieldset>
              <legend className="mb-1.5 text-[13px] text-text-muted">Wrong-answer penalty</legend>
              <div className="grid grid-cols-4 rounded-xl border border-border bg-bg-primary p-1 shadow-sm">
                {(
                  [
                    [0, "No penalty"],
                    [0.25, "−0.25 marks"],
                    [0.5, "−0.5 marks"],
                    [1, "−1 mark"],
                  ] as const
                ).map(([marks, label]) => (
                  <button
                    key={marks}
                    type="button"
                    onClick={() => onMcqNegativeMarks(String(marks))}
                    className={cn(
                      "min-h-10 rounded-[9px] px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-strong",
                      Number(mcqNegativeMarks) === marks
                        ? "bg-text-primary font-semibold text-text-inverse"
                        : "text-text-secondary",
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <label className="mt-3 block text-[13px] text-text-muted">
                Custom penalty
                <input
                  value={mcqNegativeMarks}
                  onChange={(event) => onMcqNegativeMarks(event.target.value)}
                  inputMode="decimal"
                  placeholder="0"
                  aria-label="Custom wrong-answer penalty"
                  aria-invalid={!Number.isFinite(Number(mcqNegativeMarks)) || Number(mcqNegativeMarks) < 0}
                  className="mt-1.5 h-10 w-full rounded-lg border border-border bg-bg-primary px-3 text-sm text-text-primary outline-none focus-visible:ring-2 focus-visible:ring-border-strong"
                />
              </label>
              <p className="mb-4 text-[13px] leading-5 text-text-muted">
                Unanswered questions are never penalised. Answers are checked instantly without an
                AI examiner.
              </p>
              </fieldset>

              <label className="block text-[13px] text-text-muted">Examiner instruction (optional)
                <textarea value={mcqInstruction} maxLength={1000} rows={3} onChange={(event) => onMcqInstruction(event.target.value)} placeholder="For example: Focus on conceptual traps and keep distractors plausible." className="mt-1.5 w-full resize-y rounded-lg border border-border bg-bg-primary px-3 py-2 text-sm text-text-primary outline-none focus-visible:ring-2 focus-visible:ring-border-strong" />
              </label>

              <div className="rounded-xl border border-border bg-bg-secondary p-4">
                <p className="text-sm font-medium">Open a shared quiz</p>
                <p className="mt-1 text-[13px] text-text-muted">Quiz codes work until the tenant set expires.</p>
                <div className="mt-3 flex gap-2">
                  <input value={sharedMcqSetId} onChange={(event) => onSharedMcqSetId(event.target.value)} placeholder="Paste set ID" className="h-11 min-w-0 flex-1 rounded-lg border border-border bg-bg-primary px-3 font-mono text-sm outline-none focus-visible:ring-2 focus-visible:ring-border-strong" />
                  <button type="button" disabled={!sharedMcqSetId.trim() || starting} className={secondaryButton} onClick={onOpenSharedMcq}>Open</button>
                </div>
              </div>
            </div>
          ) : null}

          {mode === "paper" ? (
            <div className="space-y-5">
              <fieldset>
                <legend className="mb-1.5 text-[13px] text-text-muted">Full marks</legend>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
                  {([20, 40, 60, 80, 100] as const).map((marks) => (
                    <button
                      key={marks}
                      type="button"
                      onClick={() => onPaperMarks(marks)}
                      className={cn(
                        "min-h-11 rounded-lg border px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-strong",
                        paperMarks === marks
                          ? "border-border-strong bg-text-primary font-semibold text-text-inverse"
                          : "border-border text-text-secondary hover:border-border-strong",
                      )}
                    >
                      {marks} marks
                    </button>
                  ))}
                </div>
              </fieldset>

              <fieldset>
                <legend className="mb-1.5 text-[13px] text-text-muted">Exam duration</legend>
                <div className="grid grid-cols-3 gap-2">
                  {([60, 120, 180] as const).map((minutes) => (
                    <button
                      key={minutes}
                      type="button"
                      onClick={() => onPaperDuration(minutes)}
                      className={cn(
                        "min-h-11 rounded-lg border px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-strong",
                        paperDuration === minutes
                          ? "border-border-strong bg-text-primary font-semibold text-text-inverse"
                          : "border-border text-text-secondary hover:border-border-strong",
                      )}
                    >
                      {minutes / 60} hour{minutes === 60 ? "" : "s"}
                    </button>
                  ))}
                </div>
              </fieldset>

              <fieldset>
                <legend className="mb-1.5 text-[13px] text-text-muted">Coverage</legend>
                <div className="grid gap-2 sm:grid-cols-2">
                  {(
                    [
                      ["full", "Full syllabus", "Balanced across the indexed subject."],
                      [
                        "weak",
                        "Weak topics",
                        "Ask the examiner to emphasize the chapters costing marks.",
                      ],
                    ] as const
                  ).map(([value, label, description]) => (
                    <button
                      key={value}
                      type="button"
                      aria-pressed={paperCoverage === value}
                      onClick={() => onPaperCoverage(value)}
                      className={cn(
                        "min-h-20 rounded-lg border p-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-strong",
                        paperCoverage === value
                          ? "border-border-strong bg-bg-secondary"
                          : "border-border hover:border-border-strong",
                      )}
                    >
                      <span className="block text-sm font-medium">{label}</span>
                      <span className="mt-1 block text-[13px] leading-5 text-text-muted">
                        {description}
                      </span>
                    </button>
                  ))}
                </div>
              </fieldset>

              <fieldset>
                <legend className="mb-1.5 text-[13px] text-text-muted">Question mix</legend>
                <div className="grid gap-2 sm:grid-cols-2">
                  {(
                    [
                      [
                        "balanced",
                        "Balanced",
                        "Theory, numericals, and longer derivation questions.",
                      ],
                      [
                        "theory",
                        "Theory & derivation",
                        "Concepts, explanations, and written derivations.",
                      ],
                      ["numerical", "Numerical focus", "Calculation-heavy questions with working."],
                      [
                        "diagram",
                        "Diagram & derivation",
                        "Draw-and-explain prompts when the indexed subject supports them.",
                      ],
                    ] as const
                  ).map(([value, label, description]) => (
                    <button
                      key={value}
                      type="button"
                      aria-pressed={paperStyle === value}
                      onClick={() => onPaperStyle(value)}
                      className={cn(
                        "min-h-20 rounded-lg border p-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-strong",
                        paperStyle === value
                          ? "border-border-strong bg-bg-secondary"
                          : "border-border hover:border-border-strong",
                      )}
                    >
                      <span className="block text-sm font-medium">{label}</span>
                      <span className="mt-1 block text-[13px] leading-5 text-text-muted">
                        {description}
                      </span>
                    </button>
                  ))}
                </div>
              </fieldset>

              <fieldset>
                <legend className="mb-1.5 text-[13px] text-text-muted">Answer method</legend>
                <div className="grid gap-2 sm:grid-cols-2">
                  {(
                    [
                      [
                        "type",
                        "Type answers",
                        "Write each answer in the exam and submit for strict grading.",
                      ],
                      [
                        "upload",
                        "Handwritten sheet",
                        "Write on paper, then upload one PDF, JPG, or PNG for grading.",
                      ],
                    ] as const
                  ).map(([value, label, description]) => (
                    <button
                      key={value}
                      type="button"
                      aria-pressed={paperAnswerMode === value}
                      onClick={() => onPaperAnswerMode(value)}
                      className={cn(
                        "min-h-20 rounded-lg border p-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-strong",
                        paperAnswerMode === value
                          ? "border-border-strong bg-bg-secondary"
                          : "border-border hover:border-border-strong",
                      )}
                    >
                      <span className="block text-sm font-medium">{label}</span>
                      <span className="mt-1 block text-[13px] leading-5 text-text-muted">
                        {description}
                      </span>
                    </button>
                  ))}
                </div>
              </fieldset>
            </div>
          ) : null}

          {mode === "checker" ? (
            <form id="answer-checker-form" onSubmit={onCheck} className="space-y-4">
              <div>
                <label htmlFor="checker-question" className="text-sm font-medium">
                  Question
                </label>
                <textarea
                  id="checker-question"
                  required
                  value={checkerQuestion}
                  onChange={(event) => onCheckerQuestion(event.target.value)}
                  placeholder="Paste or type the question."
                  className="mt-2 min-h-24 w-full resize-y rounded-lg border border-border bg-bg-primary p-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-strong"
                />
              </div>
              <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
                <div>
                  <label htmlFor="checker-chapter" className="text-sm font-medium">
                    Chapter <span className="font-normal text-text-muted">optional</span>
                  </label>
                  <select
                    id="checker-chapter"
                    value={checkerChapter}
                    onChange={(event) => onCheckerChapter(event.target.value)}
                    className="mt-2 h-11 w-full rounded-lg border border-border bg-bg-primary px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-strong"
                  >
                    <option value="">No chapter</option>
                    {topics.map((topic) => (
                      <option key={topic.topic_key} value={topic.title}>
                        {topic.title}
                      </option>
                    ))}
                  </select>
                </div>
                <fieldset>
                  <legend className="text-sm font-medium">Marks</legend>
                  <div className="mt-2 inline-flex rounded-lg border border-border p-1">
                    {([2, 5, 10] as const).map((marks) => (
                      <button
                        key={marks}
                        type="button"
                        onClick={() => onCheckerMarks(marks)}
                        className={cn(
                          "h-9 min-w-12 rounded-md text-sm",
                          checkerMarks === marks
                            ? "bg-text-primary text-text-inverse"
                            : "text-text-secondary",
                        )}
                      >
                        {marks}
                      </button>
                    ))}
                  </div>
                </fieldset>
              </div>
              <div>
                <label htmlFor="checker-answer" className="text-sm font-medium">
                  Your answer
                </label>
                <textarea
                  id="checker-answer"
                  required
                  value={checkerAnswer}
                  onChange={(event) => onCheckerAnswer(event.target.value)}
                  placeholder="Write the answer you want marked."
                  className="mt-2 min-h-32 w-full resize-y rounded-lg border border-border bg-bg-primary p-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-strong"
                />
              </div>
              <details>
                <summary className="cursor-pointer text-sm font-medium">
                  Add a reference answer
                </summary>
                <textarea
                  aria-label="Reference answer"
                  value={checkerReference}
                  onChange={(event) => onCheckerReference(event.target.value)}
                  placeholder="Optional marking reference."
                  className="mt-2 min-h-24 w-full resize-y rounded-lg border border-border bg-bg-primary p-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-strong"
                />
              </details>
              {checkerResult ? (
                <div
                  className="rounded-xl border border-border-strong bg-bg-secondary p-4"
                  role="status"
                >
                  <div className="flex items-baseline gap-1">
                    <strong className="font-display text-3xl">{checkerResult.score}</strong>
                    <span className="text-sm text-text-muted">of {checkerResult.marks}</span>
                  </div>
                  <p className="mt-2 whitespace-pre-wrap text-sm leading-6">
                    {checkerResult.feedback}
                  </p>
                  {checkerResult.evaluation?.summary ? (
                    <p className="mt-3 border-t border-border pt-3 text-[13px] leading-5 text-text-secondary">
                      {checkerResult.evaluation.summary}
                    </p>
                  ) : null}
                </div>
              ) : null}
              <p className="text-[13px] text-text-muted">
                This check stays private and does not change your chapter mastery.
              </p>
            </form>
          ) : null}

          {mode === "quick" ? (
            <p className="text-[13px] text-text-muted">
              Questions are drawn from your teacher&apos;s question bank and marked by the same
              strict examiner your exams use.
            </p>
          ) : null}

          {mode === "mcq" ? (
            <p className="text-[13px] text-text-muted">
              Options are shuffled by the server. Correct answers and explanations stay hidden
              until you submit the quiz.
            </p>
          ) : null}

          {startError ? <p className="mt-3 text-[13px] text-destructive">{startError}</p> : null}
        </div>

        <footer className="sticky bottom-0 flex justify-end gap-2 border-t border-border bg-bg-primary px-[22px] py-[15px]">
          <button
            type="button"
            className={secondaryButton}
            onClick={onClose}
            disabled={starting || checking}
          >
            Cancel
          </button>
          <button
            type={mode === "checker" ? "submit" : "button"}
            form={mode === "checker" ? "answer-checker-form" : undefined}
            className={primaryButton}
            disabled={
              starting ||
              checking ||
              (mode !== "checker" && (!subject || subjectUnavailable || topicsState === "loading")) ||
              (mode === "mcq" && (
                mcqOneMarkCount + mcqTwoMarkCount < 1 ||
                (mcqOneMarkCount + mcqTwoMarkCount) * (mcqPerChapter ? selectedTopics.length : 1) > 60 ||
                (mcqPerChapter && selectedTopics.length < 1) ||
                !Number.isFinite(Number(mcqNegativeMarks)) ||
                Number(mcqNegativeMarks) < 0
              ))
            }
            onClick={mode === "checker" ? undefined : onStart}
          >
            {checking
              ? "Checking…"
              : starting
                ? "Writing your paper…"
                : mode === "checker"
                  ? "Check my answer"
                  : mode === "paper"
                    ? "Generate paper"
                    : mode === "mcq"
                      ? "Start MCQ quiz"
                    : "Start practising"}
          </button>
        </footer>
      </section>
    </div>
  );
}

export function StudentExamsClient({
  subjects,
  fullName,
}: {
  subjects: PracticeSubjectOption[];
  fullName: string;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const examId = searchParams.get("exam");
  const attemptId = searchParams.get("attempt");
  const mode = searchParams.get("mode");
  const inviteCode = searchParams.get("join");
  const requestedPracticeSubject = searchParams.get("subject");
  const requestedPracticeTopic = searchParams.get("topic");
  const [practiceAttempts, setPracticeAttempts] = useState<PracticeAttempt[]>([]);
  const [attemptsState, setAttemptsState] = useState<"loading" | "ready" | "error">("loading");
  const [attemptsError, setAttemptsError] = useState("");
  const [openingAttemptId, setOpeningAttemptId] = useState("");
  const [historyOpenError, setHistoryOpenError] = useState("");
  /** True when an unfinished sitting was found on this device. */
  const [resumable, setResumable] = useState(false);
  const [dialog, setDialog] = useState<"join" | "practice" | "mcq-checker" | "writing" | "submit" | "sheet" | null>(
    null,
  );
  const [joinCode, setJoinCode] = useState("");
  const [joinError, setJoinError] = useState("");
  const [attemptExam, setAttemptExam] = useState<StudentExam | null>(null);
  const [questionIndex, setQuestionIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, Answer>>({});
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [result, setResult] = useState<Result | null>(null);
  const [resultTab, setResultTab] = useState<"answers" | "summary">("answers");
  const [practiceSubject, setPracticeSubject] = useState<string>(subjects[0]?.slug ?? "");
  const [practiceMode, setPracticeMode] = useState<PracticeMode>("quick");
  const [practiceTopics, setPracticeTopics] = useState<string[]>([]);
  const [practiceLength, setPracticeLength] = useState<PracticeLength>(5);
  const [quickMarks, setQuickMarks] = useState<10 | 20 | 40>(20);
  const [mcqOneMarkCount, setMcqOneMarkCount] = useState(4);
  const [mcqTwoMarkCount, setMcqTwoMarkCount] = useState(1);
  const [mcqPerChapter, setMcqPerChapter] = useState(false);
  const [mcqOptionsPerQuestion, setMcqOptionsPerQuestion] = useState(4);
  const [mcqNegativeMarks, setMcqNegativeMarks] = useState("0");
  const [mcqInstruction, setMcqInstruction] = useState("");
  const [sharedMcqSetId, setSharedMcqSetId] = useState("");
  const [paperMarks, setPaperMarks] = useState<FullPaperMarks>(40);
  const [paperDuration, setPaperDuration] = useState<FullPaperDuration>(120);
  const [paperCoverage, setPaperCoverage] = useState<PaperCoverage>("full");
  const [paperAnswerMode, setPaperAnswerMode] = useState<PaperAnswerMode>("type");
  const [paperStyle, setPaperStyle] = useState<PaperStyle>("balanced");
  const [checkerQuestion, setCheckerQuestion] = useState("");
  const [checkerChapter, setCheckerChapter] = useState("");
  const [checkerMarks, setCheckerMarks] = useState<2 | 5 | 10>(5);
  const [checkerReference, setCheckerReference] = useState("");
  const [checkerAnswer, setCheckerAnswer] = useState("");
  const [checkerResult, setCheckerResult] = useState<CheckerResult | null>(null);
  const [checkingAnswer, setCheckingAnswer] = useState(false);
  const [availableTopics, setAvailableTopics] = useState<PracticeTopic[]>([]);
  const [topicsState, setTopicsState] = useState<"loading" | "ready" | "error">("loading");
  const [topicsError, setTopicsError] = useState("");
  const [startingPractice, setStartingPractice] = useState(false);
  const [practiceStartError, setPracticeStartError] = useState("");
  // A sitting only exists on the tenant for two hours and is graded by id, so
  // the attempt has to carry it.
  const [practiceSession, setPracticeSession] = useState<{
    sessionId: string;
    subject: string;
    kind: "session" | "paper" | "mcq";
    gradingInstruction?: string;
    answerMode?: PaperAnswerMode;
    expiresAt?: string;
    warning?: string | null;
  } | null>(null);
  const [teacherAssignments, setTeacherAssignments] = useState<TeacherAssignment[]>([]);
  const [isJoining, setIsJoining] = useState(false);
  const [isGrading, setIsGrading] = useState(false);
  const [gradingError, setGradingError] = useState("");
  const [sheetFile, setSheetFile] = useState<File | null>(null);
  const [sheetDragging, setSheetDragging] = useState(false);
  const [sheetError, setSheetError] = useState("");
  const [uploadingSheet, setUploadingSheet] = useState(false);
  const joinInput = useRef<HTMLInputElement>(null);
  const handledPracticeLink = useRef("");
  const practiceSubjectOption = useMemo(
    () => subjects.find((subject) => subject.slug === practiceSubject) ?? null,
    [practiceSubject, subjects],
  );
  const practiceSubjectName = practiceSubjectOption?.name ?? "";
  const practiceSubjectUnavailable = practiceSubjectOption?.practiceAvailable === false;
  const teacherExams = useMemo(() => teacherAssignments.map(assignmentExam), [teacherAssignments]);
  const selectedExam = teacherExams.find((exam) => exam.id === examId) ?? null;

  async function loadTeacherAssignments() {
    try {
      const response = await fetch("/api/student/teacher-exams", {
        headers: { Accept: "application/json" },
      });
      const payload = (await response.json()) as {
        assignments?: TeacherAssignment[];
        error?: string;
      };
      if (!response.ok) throw new Error(payload.error || "Could not load teacher exams.");
      setTeacherAssignments(Array.isArray(payload.assignments) ? payload.assignments : []);
    } catch {
      setTeacherAssignments([]);
    }
  }

  async function loadPracticeAttempts() {
    setAttemptsState("loading");
    try {
      const response = await fetch("/api/student/practice/attempts", {
        headers: { Accept: "application/json" },
      });
      const payload = (await response.json()) as { attempts?: PracticeAttempt[]; error?: string };
      if (!response.ok) throw new Error(payload.error || "Could not load your practice history.");
      setPracticeAttempts(Array.isArray(payload.attempts) ? payload.attempts : []);
      setAttemptsError("");
      setAttemptsState("ready");
    } catch (error) {
      setAttemptsError(
        error instanceof Error ? error.message : "Could not load your practice history.",
      );
      setAttemptsState("error");
    }
  }

  const loadPracticeAttemptResult = useCallback(
    async (id: string, navigate: boolean) => {
      if (!id) return;
      setOpeningAttemptId(id);
      setHistoryOpenError("");
      try {
        const response = await fetch(`/api/student/practice/attempts/${encodeURIComponent(id)}`, {
          headers: { Accept: "application/json" },
        });
        const payload = (await response.json()) as {
          result?: Result;
          detailsAvailable?: boolean;
          error?: string;
        };
        if (!response.ok || !payload.result) {
          throw new Error(payload.error || "Could not open this practice result.");
        }
        const nextResult = {
          ...payload.result,
          detailsAvailable: payload.detailsAvailable ?? payload.result.lines.length > 0,
        };
        setResult(nextResult);
        setResultTab(nextResult.lines.length ? "answers" : "summary");
        if (navigate) {
          router.push(`/app/exams?attempt=${encodeURIComponent(id)}&mode=result`, {
            scroll: false,
          });
        }
      } catch (error) {
        setHistoryOpenError(
          error instanceof Error ? error.message : "Could not open this practice result.",
        );
      } finally {
        setOpeningAttemptId("");
      }
    },
    [router],
  );

  useEffect(() => {
    void loadPracticeAttempts();
  }, []);

  useEffect(() => {
    if (mode !== "result" || !attemptId || result || openingAttemptId) return;
    void loadPracticeAttemptResult(attemptId, false);
  }, [attemptId, loadPracticeAttemptResult, mode, openingAttemptId, result]);

  // Chapter mastery for whichever exam is open, so "What it covers" shows how
  // this student actually stands on each chapter.
  const [examTopics, setExamTopics] = useState<PracticeTopic[]>([]);
  const openExamSubject = selectedExam?.subject ?? "";

  useEffect(() => {
    if (!openExamSubject) return;

    let active = true;
    const load = async () => {
      try {
        const response = await fetch(
          `/api/student/practice/topics?subject=${encodeURIComponent(openExamSubject)}`,
          { headers: { Accept: "application/json" } },
        );
        const payload = (await response.json()) as { topics?: PracticeTopic[] };
        if (active && response.ok)
          setExamTopics(Array.isArray(payload.topics) ? payload.topics : []);
      } catch {
        // The overview still lists chapters without their status.
      }
    };

    void load();
    return () => {
      active = false;
    };
  }, [openExamSubject]);

  const statusByChapter = useMemo(() => {
    const map: Record<string, PracticeTopic["status"]> = {};
    for (const topic of examTopics) map[topic.title.toLowerCase()] = topic.status;
    return map;
  }, [examTopics]);

  // Restore a sitting the student was part way through.
  useEffect(() => {
    const saved = readSavedSitting();
    if (!saved) return;

    setAttemptExam(saved.exam);
    setPracticeSession({
      sessionId: saved.sessionId,
      subject: saved.subject,
      kind: saved.practiceKind ?? "session",
      gradingInstruction: saved.gradingInstruction,
      answerMode: saved.answerMode,
    });
    setAnswers(saved.answers ?? {});
    setQuestionIndex(saved.questionIndex ?? 0);
    setSecondsLeft(Math.max(0, Math.round((saved.deadline - Date.now()) / 1000)));
    setResumable(true);
  }, []);

  // Persist it as they work, so a refresh or a closed tab costs nothing.
  useEffect(() => {
    if (!attemptExam || !practiceSession || mode !== "sit") return;

    try {
      window.localStorage.setItem(
        SITTING_KEY,
        JSON.stringify({
          exam: attemptExam,
          sessionId: practiceSession.sessionId,
          practiceKind: practiceSession.kind,
          gradingInstruction: practiceSession.gradingInstruction,
          answerMode: practiceSession.answerMode,
          subject: practiceSession.subject,
          answers,
          questionIndex,
          deadline: Date.now() + secondsLeft * 1000,
        } satisfies SavedSitting),
      );
    } catch {
      // Ignore storage write failures.
    }
  }, [answers, attemptExam, mode, practiceSession, questionIndex, secondsLeft]);

  useEffect(() => {
    if (!practiceSubject) {
      setTopicsState("ready");
      setAvailableTopics([]);
      return;
    }

    let active = true;
    setTopicsState("loading");
    setTopicsError("");

    const loadTopics = async () => {
      try {
        const params = new URLSearchParams({
          subject: practiceSubject,
          totalMarks: String(quickMarks),
          maxQuestions: String(practiceLength),
        });
        const response = await fetch(`/api/student/practice/topics?${params.toString()}`, {
          headers: { Accept: "application/json" },
        });
        const payload = (await response.json()) as {
          topics?: PracticeTopic[];
          error?: string;
        };
        if (!active) return;
        if (!response.ok) throw new Error(payload.error || "Could not load chapters.");

        const loaded = Array.isArray(payload.topics) ? payload.topics : [];
        setAvailableTopics(loaded);
        // Tick what has been costing marks, the way the prototype did.
        setPracticeTopics(weakestTopicKeys(loaded));
        setTopicsState("ready");
      } catch (error) {
        if (!active) return;
        setTopicsError(error instanceof Error ? error.message : "Could not load chapters.");
        setAvailableTopics([]);
        setTopicsState("error");
      }
    };

    void loadTopics();
    return () => {
      active = false;
    };
  }, [practiceLength, practiceSubject, quickMarks]);

  useEffect(() => {
    if (!inviteCode) return;
    setJoinCode(inviteCode);
    setDialog("join");
  }, [inviteCode]);

  // Subject pages deep-link here. Resolve against the same published list the
  // picker displays, then open the quick drill with that subject selected.
  useEffect(() => {
    if (!requestedPracticeSubject || !subjects.length) return;

    const requestedKey = subjectUrlKey(requestedPracticeSubject);
    const matchedSubject = subjects.find(
      (subject) =>
        subjectUrlKey(subject.slug) === requestedKey || subjectUrlKey(subject.name) === requestedKey,
    );
    if (!matchedSubject) return;

    const requestKey = `${requestedKey}::${requestedPracticeTopic ?? ""}`;
    if (handledPracticeLink.current === requestKey) return;
    handledPracticeLink.current = requestKey;

    setPracticeSubject(matchedSubject.slug);
    setPracticeTopics([]);
    setPracticeMode("quick");
    setPracticeStartError("");
    setDialog("practice");
  }, [requestedPracticeSubject, requestedPracticeTopic, subjects]);

  useEffect(() => {
    if (!requestedPracticeTopic || topicsState !== "ready") return;
    const requestedKey = subjectUrlKey(requestedPracticeTopic);
    const matchedTopic = availableTopics.find(
      (topic) =>
        subjectUrlKey(topic.topic_key) === requestedKey ||
        subjectUrlKey(topic.title) === requestedKey,
    );
    if (matchedTopic) setPracticeTopics([matchedTopic.topic_key]);
  }, [availableTopics, requestedPracticeTopic, topicsState]);

  useEffect(() => {
    if (dialog === "join") joinInput.current?.focus();
  }, [dialog]);

  useEffect(() => {
    if (!attemptExam || mode !== "sit") return;
    const timer = window.setInterval(() => setSecondsLeft((value) => Math.max(0, value - 1)), 1000);
    return () => window.clearInterval(timer);
  }, [attemptExam, mode]);

  useEffect(() => {
    if (!attemptExam || mode !== "sit" || secondsLeft !== 0) return;
    const isHandwrittenPaper =
      practiceSession?.kind === "paper" && practiceSession.answerMode === "upload";
    setDialog(isHandwrittenPaper ? "sheet" : "submit");
  }, [attemptExam, mode, practiceSession, secondsLeft]);

  useEffect(() => {
    if (!selectedExam || mode !== "marking") return;
    const timer = window.setTimeout(() => {
      router.replace(`/app/exams?exam=${selectedExam.id}&mode=result`, { scroll: false });
    }, 2200);
    return () => window.clearTimeout(timer);
  }, [mode, router, selectedExam]);

  const answeredCount = useMemo(
    () =>
      Object.values(answers).filter((answer) => answer.choice !== undefined || answer.text?.trim())
        .length,
    [answers],
  );
  function openRecommendedPractice(nextMode: "quick" | "paper") {
    const latest = practiceAttempts[0];
    if (!latest) return;
    choosePracticeSubject(latest.subjectName);
    setPracticeMode(nextMode);
    if (nextMode === "paper") setPaperCoverage("weak");
    setDialog("practice");
  }

  function openPractice(nextMode: PracticeMode = "quick") {
    setPracticeMode(nextMode);
    setPracticeStartError("");
    if (nextMode === "checker") setCheckerResult(null);
    setDialog("practice");
  }

  useEffect(() => {
    if (!selectedExam || !mode) return;
    if ((mode === "sit" || mode === "marking") && attemptExam?.id !== selectedExam.id) {
      setAttemptExam(selectedExam);
      setQuestionIndex(0);
      setAnswers({});
      setSecondsLeft(selectedExam.minutes * 60);
    }
    if (mode === "result" && !result) {
      const teacherAssignment = selectedExam.id.startsWith("teacher_")
        ? teacherAssignments.find((item) => `teacher_${item.id}` === selectedExam.id)
        : null;
      if (teacherAssignment) {
        if (!teacherAssignment.grade) {
          router.replace("/app/exams", { scroll: false });
          return;
        }
        const lines = selectedExam.questions.map((question) => {
          const graded = teacherAssignment.grade?.results?.find(
            (item) => item.question_id === question.id,
          );
          return {
            question,
            got: graded?.score || 0,
            note: graded?.feedback || "No feedback returned.",
            answer: graded?.student_answer || "",
          };
        });
        setResult({
          exam: selectedExam,
          score: teacherAssignment.grade.total_score || 0,
          outOf: teacherAssignment.grade.total_marks || selectedExam.marks,
          lines,
          evaluation: teacherAssignment.grade.evaluation ?? null,
          spread: teacherAssignment.spread ?? null,
          handedInAt: teacherAssignment.attempts?.[0]?.createdAt,
          studentName: fullName,
        });
        return;
      }

      // Practice results are set by the grade call itself, so a result view
      // with nothing loaded means the sitting is gone.
      router.replace("/app/exams", { scroll: false });
    }
  }, [attemptExam?.id, fullName, mode, result, router, selectedExam, teacherAssignments]);

  function showExam(exam: StudentExam) {
    router.push(`/app/exams?exam=${exam.id}`, { scroll: false });
  }

  function startExam(exam: StudentExam) {
    setAttemptExam(exam);
    setQuestionIndex(0);
    setAnswers({});
    setSecondsLeft(exam.minutes * 60);
    router.push(`/app/exams?exam=${exam.id}&mode=sit`, { scroll: false });
  }

  function chooseSheetFile(file: File | null) {
    setSheetDragging(false);
    if (!file) return;
    if (!ANSWER_SHEET_TYPES.has(file.type)) {
      setSheetFile(null);
      setSheetError("Choose a PDF, JPG or PNG answer sheet.");
      return;
    }
    if (file.size > MAX_ANSWER_SHEET_BYTES) {
      setSheetFile(null);
      setSheetError("Answer sheets must be 15 MB or smaller.");
      return;
    }
    setSheetFile(file);
    setSheetError("");
  }

  /** Hands in a scan or photo for a teacher assignment or a personal full paper. */
  async function submitSheet() {
    if (!attemptExam || !sheetFile) return;
    const isTeacherExam = attemptExam.id.startsWith("teacher_");
    const isPersonalPaper = practiceSession?.kind === "paper";
    if (!isTeacherExam && !isPersonalPaper) return;
    if (sheetFile.size > MAX_ANSWER_SHEET_BYTES) {
      setSheetError("Answer sheets must be 15 MB or smaller.");
      return;
    }

    setUploadingSheet(true);
    setSheetError("");

    try {
      const body = new FormData();
      body.append("file", sheetFile);
      if (isPersonalPaper && practiceSession) {
        body.append("subject", practiceSession.subject);
        body.append("student_name", fullName);
        body.append("instruction", practiceSession.gradingInstruction || "");
        body.append("exam", JSON.stringify(attemptExam));
      }

      const response = await fetch(
        isTeacherExam
          ? `/api/student/teacher-exams/${encodeURIComponent(attemptExam.id.replace(/^teacher_/, ""))}/grade-file`
          : `/api/exams/${encodeURIComponent(practiceSession!.sessionId)}/grade-file`,
        { method: "POST", body },
      );
      const payload = (await response.json().catch(() => ({}))) as {
        submitted?: boolean;
        grade?: {
          results?: Array<{
            question_id: string;
            score: number;
            feedback: string;
            student_answer?: string;
          }>;
          total_score?: number;
          total_marks?: number;
          evaluation?: PracticeEvaluation;
        };
        error?: string;
      };
      if (!response.ok || (isTeacherExam ? !payload.submitted : !payload.grade)) {
        throw new Error(payload.error || "Could not read that answer sheet.");
      }

      setDialog(null);
      setSheetFile(null);
      if (isTeacherExam) {
        setAttemptExam(null);
        await loadTeacherAssignments();
        router.push("/app/exams", { scroll: false });
      } else {
        const grade = payload.grade!;
        setResult({
          exam: attemptExam,
          score: grade.total_score ?? 0,
          outOf: grade.total_marks ?? attemptExam.marks,
          lines: attemptExam.questions.map((question) => {
            const graded = grade.results?.find((item) => item.question_id === question.id);
            return {
              question,
              got: graded?.score ?? 0,
              note: graded?.feedback || "No feedback returned.",
              answer: graded?.student_answer || "Handwritten answer",
            };
          }),
          evaluation: grade.evaluation ?? null,
          handedInAt: new Date().toISOString(),
          studentName: fullName,
        });
        clearSavedSitting();
        setPracticeSession(null);
        setResumable(false);
        void loadPracticeAttempts();
        router.replace(`/app/exams?exam=${attemptExam.id}&mode=result`, { scroll: false });
      }
    } catch (error) {
      setSheetError(error instanceof Error ? error.message : "Could not read that answer sheet.");
    } finally {
      setUploadingSheet(false);
    }
  }

  async function markExam() {
    if (!attemptExam) return;
    const assignment = attemptExam.id.startsWith("teacher_")
      ? teacherAssignments.find((item) => `teacher_${item.id}` === attemptExam.id)
      : null;
    if (assignment) {
      setIsGrading(true);
      setGradingError("");
      try {
        const response = await fetch(
          `/api/student/teacher-exams/${encodeURIComponent(assignment.id)}/grade`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json", Accept: "application/json" },
            body: JSON.stringify({
              answers: attemptExam.questions.map((question) => ({
                questionId: question.id,
                ...submittedAnswer(question, answers[question.id]),
              })),
            }),
          },
        );
        const payload = (await response.json()) as {
          submitted?: boolean;
          awaitingReview?: boolean;
          error?: string;
        };
        if (!response.ok || !payload.submitted)
          throw new Error(payload.error || "Could not submit this exam.");
        setDialog(null);
        await loadTeacherAssignments();
        router.push("/app/exams", { scroll: false });
      } catch (error) {
        setGradingError(error instanceof Error ? error.message : "Could not grade this exam.");
      } finally {
        setIsGrading(false);
      }
      return;
    }
    if (!practiceSession) {
      setGradingError("This practice sitting has expired. Start a new one.");
      return;
    }

    setIsGrading(true);
    setGradingError("");
    setDialog(null);
    router.push(`/app/exams?exam=${attemptExam.id}&mode=marking`, { scroll: false });

    try {
      const isPersonalPaper = practiceSession.kind === "paper";
      const isMcq = practiceSession.kind === "mcq";
      const response = await fetch(
        isPersonalPaper
          ? `/api/exams/${encodeURIComponent(practiceSession.sessionId)}/grade`
          : isMcq
            ? "/api/student/practice/mcq/set-check"
          : `/api/student/practice/session/${encodeURIComponent(practiceSession.sessionId)}/grade`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", Accept: "application/json" },
          body: JSON.stringify({
            ...(isMcq ? { setId: practiceSession.sessionId } : {}),
            subject: practiceSession.subject,
            exam: attemptExam,
            ...(isPersonalPaper
              ? {
                  student_name: fullName,
                  instruction: practiceSession.gradingInstruction || undefined,
                }
              : {}),
            answers: isMcq
              ? attemptExam.questions.flatMap((question) => {
                  const submitted = submittedAnswer(question, answers[question.id]);
                  return submitted.selectedChoice === undefined
                    ? []
                    : [
                        {
                          questionId: question.id,
                          selected: submitted.answerText,
                          selectedChoice: submitted.selectedChoice,
                        },
                      ];
                })
              : attemptExam.questions.map((question) => {
                  const submitted = submittedAnswer(question, answers[question.id]);
                  return isPersonalPaper
                    ? {
                        question_id: question.id,
                        answer_text: submitted.answerText,
                        selected_choice: submitted.selectedChoice,
                      }
                    : { questionId: question.id, ...submitted };
                }),
          }),
        },
      );
      const payload = await readApiJson<{
        grade?: {
          results?: Array<{
            question_id: string;
            score: number;
            feedback: string;
            student_answer?: string;
          }>;
          total_score?: number;
          total_marks?: number;
          evaluation?: PracticeEvaluation;
        };
        results?: Array<{
          question_id: string;
          score: number;
          feedback: string;
          student_answer?: string;
        }>;
        totalScore?: number;
        totalMarks?: number;
        penalty?: number;
        evaluation?: PracticeEvaluation;
        error?: string;
      }>(response);

      if (!response.ok) throw new Error(payload.error || "Could not grade this practice sitting.");
      const gradedPayload =
        isPersonalPaper && payload.grade
          ? {
              results: payload.grade.results,
              totalScore: payload.grade.total_score,
              totalMarks: payload.grade.total_marks,
              evaluation: payload.grade.evaluation,
            }
          : payload;

      const lines = attemptExam.questions.map((question) => {
        const graded = gradedPayload.results?.find((item) => item.question_id === question.id);
        return {
          question,
          got: graded?.score ?? 0,
          note: graded?.feedback || "No feedback returned.",
          answer:
            graded?.student_answer ?? submittedAnswer(question, answers[question.id]).answerText,
        };
      });

      setResult({
        exam: attemptExam,
        score: gradedPayload.totalScore ?? 0,
        outOf: gradedPayload.totalMarks ?? attemptExam.marks,
        lines,
        evaluation: gradedPayload.evaluation ?? null,
        penalty: isMcq ? payload.penalty ?? 0 : 0,
        handedInAt: new Date().toISOString(),
        studentName: fullName,
      });
      // This local attempt is complete. Written sessions are consumed; MCQ sets
      // remain reusable on the tenant, but this student's saved sitting is done.
      clearSavedSitting();
      setPracticeSession(null);
      setResumable(false);
      void loadPracticeAttempts();
      router.replace(`/app/exams?exam=${attemptExam.id}&mode=result`, { scroll: false });
    } catch (error) {
      setGradingError(
        error instanceof Error ? error.message : "Could not grade this practice sitting.",
      );
      router.replace(`/app/exams?exam=${attemptExam.id}&mode=sit`, { scroll: false });
    } finally {
      setIsGrading(false);
    }
  }

  function choosePracticeSubject(subject: string) {
    const requestedKey = subjectUrlKey(subject);
    const match = subjects.find(
      (option) =>
        subjectUrlKey(option.slug) === requestedKey || subjectUrlKey(option.name) === requestedKey,
    );
    if (!match) return;
    setPracticeSubject(match.slug);
    setPracticeTopics([]);
    setPracticeStartError("");
  }

  function togglePracticeTopic(topicKey: string) {
    setPracticeTopics((current) =>
      current.includes(topicKey)
        ? current.filter((item) => item !== topicKey)
        : [...current, topicKey],
    );
  }

  /**
   * Questions come from the tenant's own question bank for this subject — the
   * app never writes them. The session is ephemeral, so its id is kept for the
   * grade call that follows.
   */
  async function startPractice() {
    if (!practiceSubject) return;

    setStartingPractice(true);
    setPracticeStartError("");
    setDialog("writing");

    try {
      const response = await fetch("/api/student/practice/session", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({
          subject: practiceSubject,
          topics: practiceTopics.length ? practiceTopics : undefined,
          totalMarks: quickMarks,
          maxQuestions: practiceLength,
        }),
      });
      const payload = (await response.json()) as {
        sessionId?: string;
        questions?: PracticeSessionQuestion[];
        totalMarks?: number;
        expiresAt?: string;
        warning?: string | null;
        error?: string;
      };

      if (!response.ok || !payload.sessionId) {
        throw new Error(payload.error || "Could not start practice.");
      }

      const questions: StudentExamQuestion[] = (payload.questions ?? []).map((question) => ({
        id: question.id,
        type: question.marks >= 10 ? "long" : "short",
        questionType: question.question_type,
        marks: question.marks,
        topic: question.topic || question.topic_key,
        prompt: question.text,
      }));

      if (!questions.length) throw new Error("No questions came back for those chapters.");

      const chapters = Array.from(new Set(questions.map((question) => question.topic)));
      const tenantSecondsLeft = payload.expiresAt
        ? Math.max(0, Math.floor((new Date(payload.expiresAt).getTime() - Date.now()) / 1000))
        : Number.POSITIVE_INFINITY;
      const requestedMinutes = Math.max(
        10,
        Math.round((payload.totalMarks ?? questions.length * 5) * 3),
      );
      const exam: StudentExam = {
        id: `practice_${payload.sessionId}`,
        subject: practiceSubjectName,
        title:
          chapters.length === 1 ? `${chapters[0]} practice` : `${practiceSubjectName} practice`,
        kind: "practice",
        counts: false,
        marks:
          payload.totalMarks ?? questions.reduce((total, question) => total + question.marks, 0),
        // The actual tenant session expiry always wins over the requested practice time.
        minutes: Math.max(1, Math.min(requestedMinutes, Math.ceil(tenantSecondsLeft / 60))),
        attempts: null,
        window: "practice",
        windowLabel: "Whenever you like",
        questions,
      };

      setPracticeSession({
        sessionId: payload.sessionId,
        subject: practiceSubject,
        kind: "session",
        expiresAt: payload.expiresAt,
        warning: payload.warning ?? null,
      });
      setResumable(true);
      setDialog(null);
      startExam(exam);
    } catch (error) {
      setPracticeStartError(error instanceof Error ? error.message : "Could not start practice.");
      setDialog("practice");
    } finally {
      setStartingPractice(false);
    }
  }

  async function startMcqQuiz() {
    if (!practiceSubject) return;

    const chapters = practiceTopics
      .map((topicKey) => availableTopics.find((topic) => topic.topic_key === topicKey)?.title)
      .filter((title): title is string => Boolean(title));

    setStartingPractice(true);
    setPracticeStartError("");
    setDialog("writing");

    try {
      const response = await fetch("/api/student/practice/mcq", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({
          subject: practiceSubject,
          chapters: chapters.length ? chapters : undefined,
          bands: [
            { marksEach: 1, count: mcqOneMarkCount },
            { marksEach: 2, count: mcqTwoMarkCount },
          ],
          perChapter: mcqPerChapter,
          optionsPerQuestion: mcqOptionsPerQuestion,
          negativeMarks: Number(mcqNegativeMarks),
          instruction: mcqInstruction.trim() || undefined,
        }),
      });
      const payload = (await response.json()) as {
        setId?: string;
        questions?: McqApiQuestion[];
        totalMarks?: number;
        expiresAt?: string;
        warning?: string | null;
        error?: string;
      };
      if (!response.ok || !payload.setId) {
        throw new Error(payload.error || "Could not start the MCQ quiz.");
      }

      const questions: StudentExamQuestion[] = (payload.questions ?? []).map((question, index) => {
        const options = (question.options ?? []).map(mcqOptionText).filter(Boolean);
        return {
          id: question.id || question.question_id || `mcq-${index + 1}`,
          type: "choice",
          questionType: "MCQ",
          marks: Number(question.marks) || 1,
          topic: question.chapter || question.topic || practiceSubjectName,
          prompt: question.text || question.question || "Question",
          options,
        };
      });
      if (!questions.length || questions.some((question) => (question.options?.length ?? 0) < 2)) {
        throw new Error("The MCQ service returned an incomplete quiz. Please try again.");
      }

      const tenantSecondsLeft = payload.expiresAt
        ? Math.max(0, Math.floor((new Date(payload.expiresAt).getTime() - Date.now()) / 1000))
        : Number.POSITIVE_INFINITY;
      const requestedMinutes = Math.max(5, questions.length);
      const exam: StudentExam = {
        id: `mcq_${payload.setId}`,
        subject: practiceSubjectName,
        title: `${practiceSubjectName} MCQ quiz`,
        kind: "practice-mcq",
        counts: false,
        marks:
          payload.totalMarks ?? questions.reduce((total, question) => total + question.marks, 0),
        minutes: Math.max(1, Math.min(requestedMinutes, Math.ceil(tenantSecondsLeft / 60))),
        attempts: null,
        window: "practice",
        windowLabel: Number(mcqNegativeMarks) ? `−${mcqNegativeMarks} for a wrong answer` : "No penalty",
        questions,
      };

      setPracticeSession({
        sessionId: payload.setId,
        subject: practiceSubject,
        kind: "mcq",
        expiresAt: payload.expiresAt,
        warning: payload.warning ?? null,
      });
      setResumable(true);
      setDialog(null);
      startExam(exam);
    } catch (error) {
      setPracticeStartError(
        error instanceof Error ? error.message : "Could not start the MCQ quiz.",
      );
      setDialog("practice");
    } finally {
      setStartingPractice(false);
    }
  }

  async function openSharedMcqQuiz() {
    if (!practiceSubject || !sharedMcqSetId.trim()) return;
    setStartingPractice(true);
    setPracticeStartError("");
    setDialog("writing");
    try {
      const response = await fetch(`/api/student/practice/mcq/${encodeURIComponent(sharedMcqSetId.trim())}?subject=${encodeURIComponent(practiceSubject)}`, { headers: { Accept: "application/json" } });
      const payload = (await response.json()) as {
        setId?: string;
        questions?: McqApiQuestion[];
        totalMarks?: number;
        negativeMarks?: number;
        expiresAt?: string;
        warning?: string | null;
        error?: string;
      };
      if (!response.ok || !payload.setId) throw new Error(payload.error || "Could not open that MCQ quiz.");
      const questions: StudentExamQuestion[] = (payload.questions ?? []).map((question, index) => ({
        id: question.id || question.question_id || `mcq-${index + 1}`,
        type: "choice",
        questionType: "MCQ",
        marks: Number(question.marks) || 1,
        topic: question.chapter || question.topic || practiceSubjectName,
        prompt: question.text || question.question || "Question",
        options: (question.options ?? []).map(mcqOptionText).filter(Boolean),
      }));
      if (!questions.length || questions.some((question) => (question.options?.length ?? 0) < 2)) throw new Error("That shared quiz is incomplete or has expired.");
      const tenantSecondsLeft = payload.expiresAt ? Math.max(0, Math.floor((new Date(payload.expiresAt).getTime() - Date.now()) / 1000)) : Number.POSITIVE_INFINITY;
      const exam: StudentExam = {
        id: `mcq_${payload.setId}`,
        subject: practiceSubjectName,
        title: `${practiceSubjectName} shared MCQ quiz`,
        kind: "practice-mcq",
        counts: false,
        marks: payload.totalMarks ?? questions.reduce((total, question) => total + question.marks, 0),
        minutes: Math.max(1, Math.min(Math.max(5, questions.length), Math.ceil(tenantSecondsLeft / 60))),
        attempts: null,
        window: "practice",
        windowLabel: payload.negativeMarks ? `−${payload.negativeMarks} for a wrong answer` : "No penalty",
        questions,
      };
      setMcqNegativeMarks(String(payload.negativeMarks ?? 0));
      setPracticeSession({ sessionId: payload.setId, subject: practiceSubject, kind: "mcq", expiresAt: payload.expiresAt, warning: payload.warning ?? null });
      setResumable(true);
      setDialog(null);
      startExam(exam);
    } catch (error) {
      setPracticeStartError(error instanceof Error ? error.message : "Could not open that MCQ quiz.");
      setDialog("practice");
    } finally {
      setStartingPractice(false);
    }
  }

  async function startFullPaper() {
    if (!practiceSubject) return;

    const bands = buildPaperBands(paperMarks, paperStyle);
    const weakTopics = availableTopics
      .filter((topic) => topic.status === "weak" || topic.status === "developing")
      .sort(
        (left, right) =>
          right.lostWeightage - left.lostWeightage || left.percentage - right.percentage,
      )
      .slice(0, 4)
      .map((topic) => topic.title);
    const focusTopics = weakTopics.length
      ? weakTopics
      : [...availableTopics]
          .sort((left, right) => right.weight - left.weight)
          .slice(0, 4)
          .map((topic) => topic.title);
    const coverageInstruction =
      paperCoverage === "weak" && focusTopics.length
        ? `Prioritize these chapters where appropriate: ${focusTopics.join(", ")}. Keep the paper balanced across the indexed syllabus and IOE exam style.`
        : "Use the full indexed syllabus, balanced across its chapters, and keep questions IOE exam style.";
    const examinerInstruction = [coverageInstruction, DEFAULT_PAPER_INSTRUCTION]
      .concat(
        paperStyle === "balanced"
          ? "Mix conceptual, numerical, and diagram/derivation prompts whenever the indexed subject material supports them."
          : paperStyle === "diagram"
            ? "Prioritize draw-and-explain, labelled diagram, and derivation prompts when the indexed material supports them. Return textual prompts; do not invent diagram assets."
            : "Keep every question in the selected paper style while staying grounded in indexed material.",
      )
      .filter(Boolean)
      .join(" ");

    setStartingPractice(true);
    setPracticeStartError("");
    setDialog("writing");

    try {
      const response = await fetch("/api/exams/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({
          subject: practiceSubject,
          bands,
          title: `${practiceSubjectName} ${paperMarks}-mark mock exam`,
          instruction: examinerInstruction,
          pass_marks: paperMarks * 0.4,
        }),
      });
      const payload = (await response.json()) as {
        paper?: {
          id: string;
          title?: string;
          total_marks: number;
          pass_marks?: number;
          warning?: string;
          questions?: Array<{
            id: string;
            chapter?: string;
            question_type?: string;
            marks: number;
            text: string;
          }>;
        };
        error?: string;
      };
      if (!response.ok || !payload.paper?.id) {
        throw new Error(payload.error || "Could not generate your paper.");
      }

      const questions: StudentExamQuestion[] = (payload.paper.questions ?? []).map((question) => ({
        id: question.id,
        type: question.marks >= 10 ? "long" : "short",
        questionType: question.question_type,
        marks: question.marks,
        topic: question.chapter || practiceSubjectName,
        prompt: question.text,
      }));
      if (!questions.length) throw new Error("The paper came back without any questions.");

      const totalMarks =
        payload.paper.total_marks || questions.reduce((sum, question) => sum + question.marks, 0);
      const exam: StudentExam = {
        id: `paper_${payload.paper.id}`,
        subject: practiceSubjectName,
        title: payload.paper.title || `${practiceSubjectName} ${paperMarks}-mark mock exam`,
        kind: "practice-paper",
        counts: false,
        marks: totalMarks,
        passMarks: payload.paper.pass_marks ?? paperMarks * 0.4,
        minutes: paperDuration,
        attempts: null,
        window: "practice",
        windowLabel: "Personal paper",
        questions,
      };

      setPracticeSession({
        sessionId: payload.paper.id,
        subject: practiceSubject,
        kind: "paper",
        gradingInstruction: examinerInstruction,
        answerMode: paperAnswerMode,
        warning: payload.paper.warning ?? null,
      });
      setResumable(true);
      setDialog(null);
      startExam(exam);
    } catch (error) {
      setPracticeStartError(
        error instanceof Error ? error.message : "Could not generate your paper.",
      );
      setDialog("practice");
    } finally {
      setStartingPractice(false);
    }
  }

  async function checkAnswer(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setCheckingAnswer(true);
    setPracticeStartError("");
    setCheckerResult(null);

    try {
      const response = await fetch("/api/student/practice/grade", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({
          question: checkerQuestion,
          chapter: checkerChapter || undefined,
          marks: checkerMarks,
          referenceAnswer: checkerReference || undefined,
          studentAnswer: checkerAnswer,
        }),
      });
      const payload = (await response.json()) as {
        result?: { score: number; marks: number; feedback: string };
        totalScore?: number;
        totalMarks?: number;
        evaluation?: PracticeEvaluation | null;
        error?: string;
      };
      if (!response.ok || !payload.result)
        throw new Error(payload.error || "Could not check this answer.");
      setCheckerResult({
        score: payload.totalScore ?? payload.result.score,
        marks: payload.totalMarks ?? payload.result.marks,
        feedback: payload.result.feedback,
        evaluation: payload.evaluation ?? null,
      });
    } catch (error) {
      setPracticeStartError(
        error instanceof Error ? error.message : "Could not check this answer.",
      );
    } finally {
      setCheckingAnswer(false);
    }
  }

  if (mode === "marking" && attemptExam) return <MarkingView exam={attemptExam} />;
  if (mode === "result" && result)
    return <ResultView result={result} tab={resultTab} onTab={setResultTab} />;
  if (mode === "result" && attemptId) {
    return (
      <div className="w-full max-w-[760px] px-4 pb-10 pt-10 sm:px-6">
        <Link href="/app/exams" className="text-sm text-text-muted hover:text-text-primary">
          Back to practice
        </Link>
        <div className="mt-5 rounded-lg border border-border p-6">
          <h1 className="font-display text-xl font-semibold">
            {historyOpenError ? "Could not open this result" : "Opening your result"}
          </h1>
          <p className="mt-2 text-sm text-text-secondary">
            {historyOpenError || "Loading the paper, your answers, and marker feedback…"}
          </p>
          {historyOpenError ? (
            <button
              type="button"
              className={`${secondaryButton} mt-5`}
              onClick={() => void loadPracticeAttemptResult(attemptId, false)}
            >
              Try again
            </button>
          ) : (
            <div className="mt-5 h-2 overflow-hidden rounded-full bg-bg-secondary">
              <div className="h-full w-2/3 animate-pulse rounded-full bg-text-primary motion-reduce:animate-none" />
            </div>
          )}
        </div>
      </div>
    );
  }
  if (mode === "sit" && attemptExam) {
    const question = attemptExam.questions[questionIndex];
    const timeExpired = secondsLeft === 0;
    return (
      <AttemptView
        exam={attemptExam}
        question={question}
        questionIndex={questionIndex}
        answers={answers}
        answeredCount={answeredCount}
        secondsLeft={secondsLeft}
        onAnswer={(answer) =>
          setAnswers((current) => ({
            ...current,
            [question.id]: { ...current[question.id], ...answer },
          }))
        }
        onQuestion={setQuestionIndex}
        onSubmit={() => setDialog("submit")}
        answerMode={
          practiceSession?.kind === "paper" ? (practiceSession.answerMode ?? "type") : "type"
        }
        sessionWarning={practiceSession?.warning ?? null}
        shareCode={practiceSession?.kind === "mcq" ? practiceSession.sessionId : undefined}
        onSheet={
          attemptExam.id.startsWith("teacher_") ||
          (practiceSession?.kind === "paper" && practiceSession.answerMode === "upload")
            ? () => setDialog("sheet")
            : undefined
        }
      >
        {dialog === "sheet" ? (
          <Dialog
            title="Upload your answer sheet"
            onClose={() => {
              setDialog(null);
              setSheetError("");
              setSheetDragging(false);
            }}
            footer={
              <>
                <button
                  type="button"
                  className={secondaryButton}
                  onClick={() => {
                    setDialog(null);
                    setSheetError("");
                    setSheetDragging(false);
                  }}
                  disabled={uploadingSheet}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className={primaryButton}
                  onClick={() => void submitSheet()}
                  disabled={!sheetFile || uploadingSheet}
                  aria-busy={uploadingSheet}
                >
                  {uploadingSheet ? "Reading your sheet…" : "Hand it in"}
                </button>
              </>
            }
          >
            <p className="text-sm text-text-secondary">
              Upload one PDF containing every page, or one clear JPG or PNG. Your handwriting is
              read, matched to each question, and marked against this paper.
            </p>
            {sheetFile ? (
              <div className="mt-5 flex flex-col gap-4 rounded-lg border border-border bg-bg-secondary p-4 sm:flex-row sm:items-center">
                <span className="grid h-12 w-12 shrink-0 place-items-center rounded-lg border border-border bg-bg-primary text-text-secondary">
                  {sheetFile.type === "application/pdf" ? (
                    <FileText className="h-6 w-6" aria-hidden="true" />
                  ) : (
                    <ImageIcon className="h-6 w-6" aria-hidden="true" />
                  )}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium" title={sheetFile.name}>
                    {sheetFile.name}
                  </p>
                  <p className="mt-1 text-xs text-text-muted">
                    {Math.max(1, Math.round(sheetFile.size / 1024))} KB · Ready to hand in
                  </p>
                </div>
                <label className={secondaryButton} htmlFor="answer-sheet-file-replace">
                  Change file
                  <input
                    id="answer-sheet-file-replace"
                    type="file"
                    accept="application/pdf,image/png,image/jpeg"
                    className="sr-only"
                    onChange={(event) => chooseSheetFile(event.target.files?.[0] ?? null)}
                  />
                </label>
              </div>
            ) : (
              <label
                htmlFor="answer-sheet-file"
                className={cn(
                  "mt-5 flex min-h-56 cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed px-6 py-8 text-center transition-colors duration-100 focus-within:outline-none focus-within:ring-2 focus-within:ring-border-strong focus-within:ring-offset-2",
                  sheetDragging
                    ? "border-border-strong bg-bg-secondary"
                    : "border-border hover:border-border-strong hover:bg-bg-secondary",
                )}
                onDragEnter={(event) => {
                  event.preventDefault();
                  setSheetDragging(true);
                }}
                onDragOver={(event) => {
                  event.preventDefault();
                  setSheetDragging(true);
                }}
                onDragLeave={(event) => {
                  event.preventDefault();
                  const nextTarget = event.relatedTarget;
                  if (!(nextTarget instanceof Node) || !event.currentTarget.contains(nextTarget)) {
                    setSheetDragging(false);
                  }
                }}
                onDrop={(event) => {
                  event.preventDefault();
                  chooseSheetFile(event.dataTransfer.files?.[0] ?? null);
                }}
              >
                <input
                  id="answer-sheet-file"
                  type="file"
                  accept="application/pdf,image/png,image/jpeg"
                  className="sr-only"
                  aria-describedby={sheetError ? "answer-sheet-error" : "answer-sheet-hint"}
                  aria-invalid={sheetError ? "true" : undefined}
                  onChange={(event) => chooseSheetFile(event.target.files?.[0] ?? null)}
                />
                <span className="grid h-14 w-14 place-items-center rounded-full border border-border bg-bg-primary text-text-secondary">
                  <Upload className="h-7 w-7" aria-hidden="true" />
                </span>
                <p className="mt-4 font-medium">
                  {sheetDragging ? "Drop your file here" : "Drop your answer sheet here"}
                </p>
                <p className="mt-1 text-sm text-text-secondary">or click to browse your device</p>
                <p id="answer-sheet-hint" className="mt-3 text-xs text-text-muted">
                  PDF, JPG or PNG · Maximum 15 MB
                </p>
              </label>
            )}
            <p className="mt-3 text-xs text-text-muted">
              {attemptExam.counts
                ? "Submitting this uses one of your attempts."
                : "This is personal practice and stays private."}
            </p>
            {sheetError ? (
              <p id="answer-sheet-error" className="mt-3 text-sm text-destructive" role="alert">
                {sheetError}
              </p>
            ) : null}
          </Dialog>
        ) : null}

        {dialog === "submit" ? (
          <Dialog
            title={timeExpired ? "Time is up" : "Hand it in"}
            onClose={() => {
              if (!timeExpired) setDialog(null);
            }}
            footer={
              <>
                {!timeExpired ? (
                  <button
                    type="button"
                    className={secondaryButton}
                    onClick={() => setDialog(null)}
                    disabled={isGrading}
                  >
                    Keep working
                  </button>
                ) : null}
                <button
                  type="button"
                  className={primaryButton}
                  onClick={() => void markExam()}
                  disabled={isGrading}
                >
                  {isGrading ? "Grading…" : "Hand it in"}
                </button>
              </>
            }
          >
            <p>
              {timeExpired ? (
                <>
                  <b>The saved time limit has ended.</b> Submit the answers currently on this paper.
                </>
              ) : attemptExam.questions.length - answeredCount ? (
                <>
                  <b>{attemptExam.questions.length - answeredCount} questions are still blank.</b>{" "}
                  Blank answers get no marks.
                </>
              ) : (
                "Every question has an answer."
              )}
            </p>
            <div className="mt-4 rounded-xl border border-border bg-bg-secondary p-4 text-sm">
              Marking usually takes under a minute.{" "}
              {attemptExam.counts
                ? "Your teacher sees the result too."
                : "This is practice, so it stays with you."}
            </div>
            {gradingError ? (
              <p className="mt-3 text-sm text-destructive" role="alert">
                {gradingError}
              </p>
            ) : null}
          </Dialog>
        ) : null}
      </AttemptView>
    );
  }

  if (selectedExam) {
    return (
      <ExamOverview
        exam={selectedExam}
        onStart={startExam}
        onPractise={(subject) => {
          if (subject) choosePracticeSubject(subject);
          openPractice("quick");
        }}
        statusByChapter={statusByChapter}
      />
    );
  }

  async function submitJoin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!joinCode.trim()) {
      setJoinError("Type the code you were given.");
      return;
    }
    setIsJoining(true);
    // Confirm on the join page rather than enrolling straight from the dialog.
    router.push(`/app/join/${encodeURIComponent(joinCode.trim().toUpperCase())}`);
  }

  return (
    <div className="w-full max-w-[1240px] px-4 pb-10 pt-6 sm:px-6">
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <p className="text-sm font-medium text-text-secondary">Exams</p>
          <h1 className="mt-3 font-display text-[28px] font-semibold tracking-[-0.04em]">
            Practice
          </h1>
          <p className="mt-2 max-w-xl text-sm text-text-secondary">
            Build a quick drill or a full paper, then track every result here.
          </p>
        </div>
        <span className="flex-1" />
        {/* <button type="button" className={secondaryButton} onClick={() => setDialog("join")}>
          Join with a code
        </button> */}
        <button type="button" className={secondaryButton} onClick={() => openPractice("checker")}>
          Quick check
        </button>
        <button type="button" className={secondaryButton} onClick={() => setDialog("mcq-checker")}>
          MCQ checker
        </button>
        <button type="button" className={primaryButton} onClick={() => openPractice("quick")}>
          Practise
        </button>
      </div>

      {resumable && attemptExam && practiceSession && mode !== "sit" ? (
        <section className="mt-5 flex flex-wrap items-center gap-3 rounded-[14px] border border-border-strong p-4">
          <div className="min-w-0">
            <p className="font-display text-[16.5px] font-semibold">{attemptExam.title}</p>
            <p className="mt-1 text-[13px] text-text-muted">
              Half done · {answeredCount} of {attemptExam.questions.length} answered ·{" "}
              {Math.max(0, Math.floor(secondsLeft / 60))} min left
            </p>
          </div>
          <span className="flex-1" />
          <button
            type="button"
            className={secondaryButton}
            onClick={() => {
              clearSavedSitting();
              setResumable(false);
              setAttemptExam(null);
              setPracticeSession(null);
            }}
          >
            Discard
          </button>
          <button
            type="button"
            className={primaryButton}
            onClick={() =>
              router.push(`/app/exams?exam=${attemptExam.id}&mode=sit`, { scroll: false })
            }
          >
            Carry on
          </button>
        </section>
      ) : null}

      <section className="mt-8" aria-labelledby="practice-history-title">
        <div className="flex items-baseline gap-3">
          <h2 id="practice-history-title" className="font-display text-xl font-semibold">
            Your practice
          </h2>
          {attemptsState === "ready" && practiceAttempts.length ? (
            <span className="text-sm text-text-muted">
              {practiceAttempts.length} {practiceAttempts.length === 1 ? "result" : "results"}
            </span>
          ) : null}
        </div>

        {attemptsState === "loading" ? (
          <div
            className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3"
            aria-label="Loading practice history"
          >
            {Array.from({ length: 3 }).map((_, index) => (
              <div
                key={index}
                className="h-52 animate-pulse rounded-lg bg-bg-secondary motion-reduce:animate-none"
              />
            ))}
          </div>
        ) : null}

        {attemptsState === "error" ? (
          <div className="mt-4 rounded-lg border border-destructive/40 p-5">
            <h3 className="font-semibold text-destructive">Could not load your practice</h3>
            <p className="mt-2 text-sm text-text-secondary">{attemptsError}</p>
            <button
              type="button"
              className={`${secondaryButton} mt-4`}
              onClick={() => void loadPracticeAttempts()}
            >
              Try again
            </button>
          </div>
        ) : null}

        {attemptsState === "ready" && practiceAttempts.length ? (
          <>
            <PracticeReadiness
              attempts={practiceAttempts}
              onQuick={() => openRecommendedPractice("quick")}
              onPaper={() => openRecommendedPractice("paper")}
            />
            {historyOpenError ? (
              <p className="mt-4 rounded-lg border border-destructive/40 px-4 py-3 text-sm text-destructive">
                {historyOpenError}
              </p>
            ) : null}
            <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {practiceAttempts.map((attempt) => {
                const percentage = Math.round(
                  (attempt.totalScore / Math.max(1, attempt.totalMarks)) * 100,
                );
                const opening = openingAttemptId === attempt.id;
                return (
                  <button
                    key={attempt.id}
                    type="button"
                    className="flex min-h-[210px] w-full flex-col rounded-lg border border-border p-5 text-left transition-colors hover:bg-bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-text-primary"
                    aria-label={`Open ${attempt.subjectName} practice result`}
                    disabled={Boolean(openingAttemptId)}
                    onClick={() => void loadPracticeAttemptResult(attempt.id, true)}
                  >
                    <div className="flex items-center gap-2">
                      <Chip>{attempt.subjectName}</Chip>
                      <span className="flex-1" />
                      <span className="text-xs text-text-muted">
                        {new Date(attempt.createdAt).toLocaleDateString("en-GB", {
                          day: "numeric",
                          month: "short",
                        })}
                      </span>
                    </div>
                    <h2 className="mt-3 font-display text-lg font-semibold">
                      {attempt.evaluation?.chapters.length === 1
                        ? `${attempt.evaluation.chapters[0].chapter} practice`
                        : `${attempt.subjectName} practice`}
                    </h2>
                    <p className="mt-4 font-display text-3xl font-semibold">
                      {attempt.totalScore}
                      <small className="ml-1 text-sm text-text-muted">
                        of {attempt.totalMarks}
                      </small>
                    </p>
                    <p className="mt-1 text-sm text-text-muted">{percentage}% scored</p>
                    {attempt.evaluation?.summary ? (
                      <p className="mt-3 line-clamp-2 text-[13px] leading-5 text-text-muted">
                        {attempt.evaluation.summary}
                      </p>
                    ) : null}
                    <span className="mt-auto pt-4 text-sm font-medium">
                      {opening
                        ? "Opening…"
                        : attempt.hasDetails
                          ? "View full result →"
                          : "View summary →"}
                    </span>
                  </button>
                );
              })}
            </div>
          </>
        ) : null}

        {attemptsState === "ready" && practiceAttempts.length === 0 ? (
          <div className="mt-4 rounded-lg border border-border px-6 py-12 text-center">
            <h3 className="font-display text-lg font-semibold">No practice results yet</h3>
            <p className="mx-auto mt-2 max-w-md text-sm text-text-secondary">
              Start a quick drill or generate a full paper. Your score and chapter feedback will
              appear here after grading.
            </p>
            <div className="mt-5 flex flex-wrap justify-center gap-2">
              <button
                type="button"
                className={secondaryButton}
                onClick={() => openPractice("checker")}
              >
                Quick check
              </button>
              <button type="button" className={secondaryButton} onClick={() => setDialog("mcq-checker")}>
                MCQ checker
              </button>
              <button type="button" className={primaryButton} onClick={() => openPractice("quick")}>
                Start practising
              </button>
            </div>
          </div>
        ) : null}
      </section>

      {/* dialog === "join" commented out
      {dialog === "join" ? (
        <Dialog
          title="Join with a code"
          onClose={() => setDialog(null)}
          footer={
            <>
              <button type="button" className={secondaryButton} onClick={() => setDialog(null)}>
                Cancel
              </button>
              <button
                type="submit"
                form="join-exam-form"
                className={primaryButton}
                disabled={isJoining}
              >
                {isJoining ? "Joining…" : "Join classroom"}
              </button>
            </>
          }
        >
          <form id="join-exam-form" onSubmit={submitJoin}>
            <label htmlFor="exam-code" className="text-sm font-medium">
              Type the code you were given
            </label>
            <input
              ref={joinInput}
              id="exam-code"
              type="text"
              autoComplete="one-time-code"
              spellCheck={false}
              value={joinCode}
              onChange={(event) => {
                setJoinCode(event.target.value.toUpperCase());
                setJoinError("");
              }}
              placeholder="BEI-4K2M"
              aria-invalid={joinError ? "true" : undefined}
              aria-describedby={joinError ? "exam-code-error" : undefined}
              className="mt-2 h-12 w-full rounded-lg border border-border bg-bg-primary px-3 font-mono text-lg uppercase tracking-widest focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-strong"
            />
            {joinError ? (
              <p id="exam-code-error" className="mt-2 text-sm text-destructive">
                {joinError}
              </p>
            ) : null}
            <div className="mt-4 rounded-xl border border-border bg-bg-secondary p-4 text-sm">
              Your teacher shares one code for this classroom. Published exams appear here after you
              join.
            </div>
          </form>
        </Dialog>
      ) : null}
      */}

      {dialog === "practice" ? (
        <PracticeDialog
          mode={practiceMode}
          subjects={subjects}
          subjectUnavailable={practiceSubjectUnavailable}
          subject={practiceSubject}
          topics={availableTopics}
          topicsState={topicsState}
          topicsError={topicsError}
          selectedTopics={practiceTopics}
          length={practiceLength}
          quickMarks={quickMarks}
          mcqOneMarkCount={mcqOneMarkCount}
          mcqTwoMarkCount={mcqTwoMarkCount}
          mcqPerChapter={mcqPerChapter}
          mcqOptionsPerQuestion={mcqOptionsPerQuestion}
          mcqNegativeMarks={mcqNegativeMarks}
          mcqInstruction={mcqInstruction}
          sharedMcqSetId={sharedMcqSetId}
          paperMarks={paperMarks}
          paperDuration={paperDuration}
          paperCoverage={paperCoverage}
          paperAnswerMode={paperAnswerMode}
          paperStyle={paperStyle}
          checkerQuestion={checkerQuestion}
          checkerChapter={checkerChapter}
          checkerMarks={checkerMarks}
          checkerReference={checkerReference}
          checkerAnswer={checkerAnswer}
          checkerResult={checkerResult}
          checking={checkingAnswer}
          starting={startingPractice}
          startError={practiceStartError}
          onMode={(nextMode) => {
            setPracticeMode(nextMode);
            setPracticeStartError("");
            setCheckerResult(null);
          }}
          onSubject={choosePracticeSubject}
          onTopic={togglePracticeTopic}
          onLength={setPracticeLength}
          onQuickMarks={setQuickMarks}
          onMcqOneMarkCount={setMcqOneMarkCount}
          onMcqTwoMarkCount={setMcqTwoMarkCount}
          onMcqPerChapter={setMcqPerChapter}
          onMcqOptionsPerQuestion={setMcqOptionsPerQuestion}
          onMcqNegativeMarks={setMcqNegativeMarks}
          onMcqInstruction={setMcqInstruction}
          onSharedMcqSetId={setSharedMcqSetId}
          onOpenSharedMcq={() => void openSharedMcqQuiz()}
          onPaperMarks={setPaperMarks}
          onPaperDuration={setPaperDuration}
          onPaperCoverage={setPaperCoverage}
          onPaperAnswerMode={setPaperAnswerMode}
          onPaperStyle={setPaperStyle}
          onCheckerQuestion={(value) => {
            setCheckerQuestion(value);
            setCheckerResult(null);
            setPracticeStartError("");
          }}
          onCheckerChapter={(value) => {
            setCheckerChapter(value);
            setCheckerResult(null);
          }}
          onCheckerMarks={(value) => {
            setCheckerMarks(value);
            setCheckerResult(null);
          }}
          onCheckerReference={(value) => {
            setCheckerReference(value);
            setCheckerResult(null);
          }}
          onCheckerAnswer={(value) => {
            setCheckerAnswer(value);
            setCheckerResult(null);
            setPracticeStartError("");
          }}
          onCheck={(event) => void checkAnswer(event)}
          onClose={() => setDialog(null)}
          onStart={() =>
            void (practiceMode === "paper"
              ? startFullPaper()
              : practiceMode === "mcq"
                ? startMcqQuiz()
                : startPractice())
          }
        />
      ) : null}

      {dialog === "mcq-checker" ? <McqCheckerDialog onClose={() => setDialog(null)} /> : null}

      {dialog === "writing" ? (
        <Dialog
          title={practiceMode === "mcq" ? "Building your MCQ quiz" : "Writing your questions"}
          onClose={() => setDialog(null)}
          footer={null}
        >
          <b>
            {practiceMode === "paper"
              ? `${paperMarks} mark personal paper · ${paperDuration / 60} hour${paperDuration === 60 ? "" : "s"}`
              : practiceMode === "mcq"
                ? `${(mcqOneMarkCount + mcqTwoMarkCount) * (mcqPerChapter ? practiceTopics.length : 1)} MCQs · ${Number(mcqNegativeMarks) ? `−${mcqNegativeMarks} wrong-answer penalty` : "no penalty"}`
              : `${practiceLength} questions from ${practiceTopics.length} chapter${practiceTopics.length === 1 ? "" : "s"}`}
          </b>
          <p className="mt-1 text-[13px] text-text-muted">
            Taken from your notes and the past papers on this subject.
          </p>
          <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-bg-secondary">
            <div className="h-full w-[70%] animate-pulse rounded-full bg-text-primary motion-reduce:animate-none" />
          </div>
        </Dialog>
      ) : null}
    </div>
  );
}

function ExamListCard({
  exam,
  onOpen,
  onStart,
}: {
  exam: StudentExam;
  onOpen: () => void;
  onStart: () => void;
}) {
  const active = exam.window === "open" || exam.window === "practice";
  return (
    <article
      className={cn(
        "w-full rounded-[14px] border px-4 py-4 sm:max-w-[395px] sm:basis-[395px] sm:flex-none",
        active ? "border-border-strong" : "border-border",
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <Chip>{exam.subject}</Chip>
        <Chip strong={exam.counts}>{exam.counts ? "counts" : "practice"}</Chip>
      </div>
      <h2 className="mt-3 font-display text-lg font-semibold">{exam.title}</h2>
      <p className="mt-1 text-sm text-text-secondary">
        {exam.marks} marks · {exam.minutes} minutes
      </p>
      <div className="mt-4 flex flex-wrap items-center gap-2">
        {active ? (
          <button type="button" className={primaryButton} onClick={onStart}>
            Start
          </button>
        ) : null}
        <Chip>{exam.windowLabel}</Chip>
        <span className="flex-1" />
        <button type="button" className={secondaryButton} onClick={onOpen}>
          What it covers
        </button>
      </div>
    </article>
  );
}

function PracticeReadiness({
  attempts,
  onQuick,
  onPaper,
}: {
  attempts: PracticeAttempt[];
  onQuick: () => void;
  onPaper: () => void;
}) {
  const average = Math.round(
    (attempts.reduce(
      (total, attempt) => total + attempt.totalScore / Math.max(1, attempt.totalMarks),
      0,
    ) /
      attempts.length) *
      100,
  );
  const latest = attempts[0];
  const weakTopics = latest.evaluation?.weak_topics.slice(0, 3) ?? [];

  return (
    <section
      className="mt-4 border-y border-border py-5"
      aria-labelledby="practice-readiness-title"
    >
      <div className="flex flex-wrap items-end gap-4">
        <div>
          <p className="text-sm font-medium text-text-secondary">Practice readiness</p>
          <h2 id="practice-readiness-title" className="mt-1 font-display text-2xl font-semibold">
            {average}% average across {attempts.length} marked paper
            {attempts.length === 1 ? "" : "s"}
          </h2>
        </div>
        <span className="flex-1" />
        <button type="button" className={secondaryButton} onClick={onQuick}>
          Drill weak topics
        </button>
        <button type="button" className={primaryButton} onClick={onPaper}>
          Build a weak-topic mock
        </button>
      </div>
      {weakTopics.length ? (
        <div className="mt-4 flex flex-wrap gap-2">
          {weakTopics.map((topic) => (
            <Chip key={topic.topic_key}>
              {topic.chapter} · lost {Math.round(topic.lost_weightage * 100)}%
            </Chip>
          ))}
        </div>
      ) : (
        <p className="mt-4 text-sm text-text-muted">
          Finish another marked paper to get a sharper chapter recommendation.
        </p>
      )}
    </section>
  );
}

function ExamOverview({
  exam,
  onStart,
  onPractise,
  statusByChapter,
}: {
  exam: StudentExam;
  onStart: (exam: StudentExam) => void;
  onPractise: (subject: string) => void;
  statusByChapter: Record<string, PracticeTopic["status"]>;
}) {
  const topics = [...new Set(exam.questions.map((question) => question.topic))];
  const notSolid = topics.filter(
    (topic) => (statusByChapter[topic.toLowerCase()] ?? "not_attempted") !== "strong",
  ).length;
  return (
    <div className="w-full max-w-[1240px] px-4 pb-10 pt-6 sm:px-6">
      <nav className="text-sm text-text-muted">
        <Link href="/app/exams" className="hover:text-text-primary">
          Exams
        </Link>{" "}
        / <b className="text-text-secondary">{exam.title}</b>
      </nav>
      <div className="mt-5 flex flex-wrap items-end gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap gap-2">
            <Chip>{exam.subject}</Chip>
            <Chip strong={exam.counts}>
              {exam.counts ? "counts towards your record" : "practice only"}
            </Chip>
          </div>
          <h1 className="mt-4 font-display text-[28px] font-semibold tracking-[-0.04em]">
            {exam.title}
          </h1>
          <p className="mt-3 text-[15px] text-text-secondary">
            {exam.questions.length} questions · {exam.marks} marks ·{" "}
            {exam.minutes ? `${exam.minutes} minutes once you start` : "no time limit"}
          </p>
        </div>
        <span className="flex-1" />
        {exam.window === "open" || exam.window === "practice" ? (
          <button type="button" className={primaryButton} onClick={() => onStart(exam)}>
            Start
          </button>
        ) : (
          <Chip>{exam.windowLabel}</Chip>
        )}
      </div>
      <section className="mt-9">
        <div className="flex items-baseline gap-3">
          <h2 className="font-display text-xl font-semibold">What it covers</h2>
          <span className="text-sm text-text-muted">{notSolid} not solid yet</span>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {topics.map((topic) => (
            <article
              key={topic}
              className={cn(
                "rounded-[14px] border px-4 py-4",
                (statusByChapter[topic.toLowerCase()] ?? "not_attempted") === "weak"
                  ? "border-border-strong"
                  : "border-border",
              )}
            >
              <p className="flex items-center gap-2 text-sm text-text-muted">
                <span
                  className={cn(
                    "h-2 w-2 rounded-full",
                    TOPIC_DOT[statusByChapter[topic.toLowerCase()] ?? "not_attempted"],
                  )}
                  aria-hidden="true"
                />
                {CHAPTER_STATUS_LABEL[statusByChapter[topic.toLowerCase()] ?? "not_attempted"]}
              </p>
              <h3 className="mt-3 font-display text-lg font-semibold">{topic}</h3>
              <div className="mt-5 flex gap-2">
                <button
                  type="button"
                  className={primaryButton}
                  onClick={() => onPractise(exam.subject)}
                >
                  Practise
                </button>
                <Link href={askHref(topic, exam.subject)} className={secondaryButton}>
                  Ask a doubt
                </Link>
              </div>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}

function HandwrittenAttemptView({
  exam,
  questionIndex,
  secondsLeft,
  sessionWarning,
  onQuestion,
  onSheet,
  children,
}: {
  exam: StudentExam;
  questionIndex: number;
  secondsLeft: number;
  sessionWarning?: string | null;
  onQuestion: (index: number) => void;
  onSheet: () => void;
  children: React.ReactNode;
}) {
  const questionsPerPage = 2;
  const pageIndex = Math.floor(questionIndex / questionsPerPage);
  const pageCount = Math.ceil(exam.questions.length / questionsPerPage);
  const firstQuestionIndex = pageIndex * questionsPerPage;
  const visibleQuestions = exam.questions.slice(
    firstQuestionIndex,
    firstQuestionIndex + questionsPerPage,
  );
  const lastQuestionIndex = firstQuestionIndex + visibleQuestions.length - 1;
  const visibleMarks = visibleQuestions.reduce((total, question) => total + question.marks, 0);
  const isLastPage = pageIndex === pageCount - 1;
  const minutes = String(Math.floor(secondsLeft / 60)).padStart(2, "0");
  const seconds = String(secondsLeft % 60).padStart(2, "0");

  return (
    <div className="w-full max-w-[1240px] px-4 pb-10 pt-6 sm:px-6">
      <nav className="text-sm text-text-muted">
        <Link href={`/app/exams?exam=${exam.id}`}>{exam.title}</Link> /{" "}
        <b className="text-text-secondary">In progress</b>
      </nav>

      <header className="mt-5 flex flex-wrap items-start gap-4">
        <div>
          <h1 className="font-display text-[28px] font-semibold">{exam.title}</h1>
          <p className="mt-2 text-sm text-text-secondary">
            {exam.questions.length} questions, {exam.marks} marks. Write on paper and number every
            answer clearly.
          </p>
          {sessionWarning ? (
            <p className="mt-2 rounded-lg border border-border bg-bg-secondary px-3 py-2 text-[13px] text-text-secondary">
              {sessionWarning}
            </p>
          ) : null}
        </div>
        <span className="flex-1" />
        <div className="min-w-36 rounded-lg border border-border p-4 text-right">
          <p className="text-xs text-text-muted">Time left</p>
          <p className="mt-1 font-mono text-2xl font-medium tabular-nums" aria-live="off">
            {minutes}:{seconds}
          </p>
          <p className="mt-1 text-xs text-text-muted">
            Page {pageIndex + 1} of {pageCount}
          </p>
        </div>
      </header>

      <div className="mt-5 grid gap-3 lg:grid-cols-[1fr_240px]">
        <section className="overflow-hidden rounded-lg border border-border">
          <div className="flex flex-wrap items-center gap-2 border-b border-border bg-bg-secondary px-5 py-4">
            <Chip strong>
              Questions {firstQuestionIndex + 1}
              {lastQuestionIndex > firstQuestionIndex ? `–${lastQuestionIndex + 1}` : ""} of{" "}
              {exam.questions.length}
            </Chip>
            <Chip>{visibleMarks} marks on this page</Chip>
            <span className="flex-1" />
            <span className="text-xs text-text-muted">Write both answers on your sheet</span>
          </div>

          <div className="divide-y divide-border">
            {visibleQuestions.map((question, offset) => {
              const absoluteIndex = firstQuestionIndex + offset;
              return (
                <article key={question.id} className="px-5 py-6 sm:px-6 sm:py-8">
                  <div className="flex items-baseline justify-between gap-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-semibold">Question {absoluteIndex + 1}</p>
                      {questionTypeLabel(question.questionType) ? (
                        <Chip>{questionTypeLabel(question.questionType)}</Chip>
                      ) : null}
                    </div>
                    <p className="shrink-0 text-sm text-text-muted">
                      {question.marks} {question.marks === 1 ? "mark" : "marks"}
                    </p>
                  </div>
                  <p className="mt-3 max-w-prose text-base leading-7">{question.prompt}</p>
                  {question.type === "choice" && question.options?.length ? (
                    <ol className="mt-4 grid gap-2 sm:grid-cols-2">
                      {question.options.map((option, optionIndex) => (
                        <li key={option} className="flex gap-3 text-sm leading-6">
                          <span className="font-medium">
                            {String.fromCharCode(65 + optionIndex)}.
                          </span>
                          <span>{option}</span>
                        </li>
                      ))}
                    </ol>
                  ) : null}
                </article>
              );
            })}
          </div>

          <div className="flex flex-wrap items-center gap-2 border-t border-border px-5 py-4">
            <button
              type="button"
              className={secondaryButton}
              disabled={pageIndex === 0}
              onClick={() => onQuestion((pageIndex - 1) * questionsPerPage)}
            >
              Back
            </button>
            <span className="flex-1" />
            {isLastPage ? (
              <button type="button" className={primaryButton} onClick={onSheet}>
                Finish &amp; upload
              </button>
            ) : (
              <button
                type="button"
                className={primaryButton}
                onClick={() => onQuestion((pageIndex + 1) * questionsPerPage)}
              >
                Next questions
              </button>
            )}
          </div>
        </section>

        <aside className="rounded-lg border border-border p-4 lg:self-start">
          <p className="text-sm text-text-muted">Questions</p>
          <div className="mt-3 grid grid-cols-5 gap-2">
            {exam.questions.map((question, index) => {
              const isVisible = index >= firstQuestionIndex && index <= lastQuestionIndex;
              return (
                <button
                  key={question.id}
                  type="button"
                  aria-label={`Show question ${index + 1}`}
                  aria-current={isVisible ? "step" : undefined}
                  className={cn(
                    "h-10 rounded-lg border text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-strong",
                    isVisible
                      ? "border-text-primary bg-text-primary text-text-inverse"
                      : "border-border hover:border-border-strong",
                  )}
                  onClick={() => onQuestion(index)}
                >
                  {index + 1}
                </button>
              );
            })}
          </div>
          <p className="mt-4 border-t border-border pt-4 text-xs leading-5 text-text-muted">
            Two questions are shown at a time. Upload the complete answer sheet after the final
            page.
          </p>
        </aside>
      </div>
      {children}
    </div>
  );
}

function AttemptView({
  exam,
  question,
  questionIndex,
  answers,
  answeredCount,
  secondsLeft,
  onAnswer,
  onQuestion,
  onSubmit,
  answerMode,
  sessionWarning,
  shareCode,
  onSheet,
  children,
}: {
  exam: StudentExam;
  question: StudentExamQuestion;
  questionIndex: number;
  answers: Record<string, Answer>;
  answeredCount: number;
  secondsLeft: number;
  onAnswer: (answer: Answer) => void;
  onQuestion: (index: number) => void;
  onSubmit: () => void;
  answerMode: PaperAnswerMode;
  sessionWarning?: string | null;
  shareCode?: string;
  onSheet?: () => void;
  children: React.ReactNode;
}) {
  if (answerMode === "upload" && onSheet) {
    return (
      <HandwrittenAttemptView
        exam={exam}
        questionIndex={questionIndex}
        secondsLeft={secondsLeft}
        sessionWarning={sessionWarning}
        onQuestion={onQuestion}
        onSheet={onSheet}
      >
        {children}
      </HandwrittenAttemptView>
    );
  }

  const answer = answers[question.id] || {};
  const minutes = String(Math.floor(secondsLeft / 60)).padStart(2, "0");
  const seconds = String(secondsLeft % 60).padStart(2, "0");
  return (
    <div className="w-full max-w-[1240px] px-4 pb-10 pt-6 sm:px-6">
      <nav className="text-sm text-text-muted">
        <Link href={`/app/exams?exam=${exam.id}`}>{exam.title}</Link> /{" "}
        <b className="text-text-secondary">In progress</b>
      </nav>
      <div className="mt-5 flex flex-wrap items-start gap-4">
        <div>
          <h1 className="font-display text-[28px] font-semibold">{exam.title}</h1>
          <p className="mt-2 text-sm text-text-secondary">
            {exam.questions.length} questions, {exam.marks} marks. Your answers save as you go.
          </p>
          {sessionWarning ? (
            <p className="mt-2 rounded-lg border border-border bg-bg-secondary px-3 py-2 text-[13px] text-text-secondary">
              {sessionWarning}
            </p>
          ) : null}
          {shareCode ? (
            <button type="button" className="mt-2 inline-flex min-h-10 items-center rounded-lg border border-border px-3 font-mono text-xs hover:bg-bg-secondary" onClick={() => void navigator.clipboard.writeText(shareCode)} title="Copy this quiz code for another enrolled student">
              Quiz code · {shareCode} · Copy
            </button>
          ) : null}
        </div>
        <span className="flex-1" />
        <div className="min-w-36 rounded-[14px] border border-border p-4 text-right">
          <p className="text-xs text-text-muted">Time left</p>
          <p className="mt-1 font-mono text-2xl font-medium">
            {minutes}:{seconds}
          </p>
          <p className="mt-1 text-xs text-text-muted">
            {answeredCount} of {exam.questions.length} answered
          </p>
        </div>
      </div>
      <div className="mt-5 grid gap-3 lg:grid-cols-[1fr_240px]">
        <section className="rounded-[14px] border border-border p-5">
          <div className="flex flex-wrap gap-2">
            <Chip strong>
              Question {questionIndex + 1} of {exam.questions.length}
            </Chip>
            <Chip>
              {question.marks} {question.marks === 1 ? "mark" : "marks"}
            </Chip>
            {questionTypeLabel(question.questionType) ? (
              <Chip>{questionTypeLabel(question.questionType)}</Chip>
            ) : null}
          </div>
          <p className="mt-4 text-base leading-7">{question.prompt}</p>
          {question.type === "choice" ? (
            <fieldset className="mt-4 space-y-2">
              <legend className="sr-only">Choose one answer</legend>
              {question.options?.map((option, index) => (
                <label
                  key={option}
                  className={cn(
                    "flex min-h-12 cursor-pointer items-center gap-3 rounded-xl border px-4 text-sm transition",
                    answer.choice === index
                      ? "border-border-strong bg-bg-secondary"
                      : "border-border hover:border-border-strong",
                  )}
                >
                  <input
                    type="radio"
                    name={question.id}
                    checked={answer.choice === index}
                    onChange={() => onAnswer({ choice: index })}
                  />
                  <span className="grid h-7 w-7 place-items-center rounded-full border border-border text-xs">
                    {String.fromCharCode(65 + index)}
                  </span>
                  {option}
                </label>
              ))}
            </fieldset>
          ) : answerMode === "type" ? (
            <div className="mt-4">
              <label htmlFor={`answer-${question.id}`} className="sr-only">
                Your answer
              </label>
              <textarea
                id={`answer-${question.id}`}
                value={answer.text || ""}
                onChange={(event) => onAnswer({ text: event.target.value })}
                placeholder="Write your answer here."
                className="min-h-44 w-full resize-y rounded-xl border border-border bg-bg-primary p-4 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-strong"
              />
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <span className="ml-auto text-xs text-text-muted">
                  {answer.text ? "Saved" : "Nothing saved yet"}
                </span>
              </div>
            </div>
          ) : (
            <div className="mt-4 rounded-xl border border-border bg-bg-secondary p-4">
              <p className="font-medium">Write this answer on your paper</p>
              <p className="mt-1 text-sm text-text-secondary">
                Keep the question number clear. Upload the completed PDF, JPG, or PNG when you
                finish.
              </p>
            </div>
          )}
          {question.marking ? (
            <div className="mt-4 text-sm text-text-muted">
              Marks are given for:{" "}
              <div className="mt-2 flex flex-wrap gap-2">
                {question.marking.map((item) => (
                  <Chip key={item.label}>
                    {item.label} · {item.marks}
                  </Chip>
                ))}
              </div>
            </div>
          ) : null}
          {onSheet ? (
            <div className="mt-4 flex flex-wrap items-center gap-2 rounded-xl border border-border bg-bg-secondary p-3">
              <span className="text-[13px] text-text-secondary">Wrote it on paper?</span>
              <button type="button" className={secondaryButton} onClick={onSheet}>
                Hand in a photo of your sheet
              </button>
            </div>
          ) : null}
          <div className="mt-6 flex flex-wrap gap-2 border-t border-border pt-4">
            <button
              type="button"
              className={secondaryButton}
              disabled={questionIndex === 0}
              onClick={() => onQuestion(questionIndex - 1)}
            >
              Back
            </button>
            <button
              type="button"
              className={secondaryButton}
              disabled={questionIndex === exam.questions.length - 1}
              onClick={() => onQuestion(questionIndex + 1)}
            >
              Next
            </button>
            <span className="flex-1" />
            <button
              type="button"
              className={primaryButton}
              onClick={answerMode === "upload" && onSheet ? onSheet : onSubmit}
            >
              {answerMode === "upload" ? "Upload answer sheet" : "Hand it in"}
            </button>
          </div>
        </section>
        <aside className="rounded-[14px] border border-border p-4">
          <p className="text-sm text-text-muted">Questions</p>
          <div className="mt-3 grid grid-cols-5 gap-2">
            {exam.questions.map((item, index) => (
              <button
                key={item.id}
                type="button"
                aria-label={`Go to question ${index + 1}`}
                className={cn(
                  "h-10 rounded-lg border text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-strong",
                  index === questionIndex
                    ? "border-text-primary bg-text-primary text-text-inverse"
                    : answers[item.id]
                      ? "border-border-strong bg-bg-secondary"
                      : "border-border",
                )}
                onClick={() => onQuestion(index)}
              >
                {index + 1}
              </button>
            ))}
          </div>
          <p className="mt-4 border-t border-border pt-4 text-xs leading-5 text-text-muted">
            Filled squares are answered. Nothing goes to your teacher until you hand it in.
          </p>
        </aside>
      </div>
      {children}
    </div>
  );
}

function MarkingView({ exam }: { exam: StudentExam }) {
  const isMcq = exam.kind === "practice-mcq";
  return (
    <div className="w-full max-w-[900px] px-4 pb-10 pt-10 sm:px-6">
      <h1 className="font-display text-[28px] font-semibold">
        {isMcq ? "Checking your quiz" : "Marking your paper"}
      </h1>
      <p className="mt-2 text-text-secondary">
        {isMcq
          ? "Comparing your selections with the protected answer key."
          : "Reading your answers against what each question was looking for."}
      </p>
      <div className="mt-6 rounded-[14px] border border-border p-5">
        <div className="h-2 overflow-hidden rounded-full bg-bg-secondary">
          <div className="h-full w-3/4 animate-pulse rounded-full bg-text-primary motion-reduce:animate-none" />
        </div>
        <p className="mt-3 text-sm text-text-muted">
          {isMcq
            ? "Scoring every selection…"
            : "Checking each answer against the marking points…"}
        </p>
      </div>
    </div>
  );
}

function ResultView({
  result,
  tab,
  onTab,
}: {
  result: Result;
  tab: "answers" | "summary";
  onTab: (tab: "answers" | "summary") => void;
}) {
  const percent = Math.round((result.score / Math.max(1, result.outOf)) * 100);
  return (
    <div className="w-full max-w-[1240px] px-4 pb-10 pt-6 sm:px-6">
      <nav className="text-sm text-text-muted">
        <Link href="/app/exams">Exams</Link> /{" "}
        <b className="text-text-secondary">{result.exam.title}</b>
      </nav>
      <div className="mt-5 flex flex-wrap items-end gap-4">
        <div>
          <div className="flex flex-wrap gap-2">
            <Chip strong={result.exam.counts}>
              {result.exam.counts ? "counts towards the record" : "practice only"}
            </Chip>
            <Chip>published</Chip>
            {result.penalty ? <Chip>−{result.penalty} penalty</Chip> : null}
          </div>
          <h1 className="mt-4 font-display text-[28px] font-semibold">{result.exam.title}</h1>
          <p className="mt-2 text-sm text-text-secondary">
            {[
              result.exam.subject,
              result.studentName,
              result.handedInAt
                ? new Date(result.handedInAt).toLocaleDateString("en-GB", {
                    day: "numeric",
                    month: "short",
                    year: "numeric",
                  })
                : null,
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
        </div>
        <span className="flex-1" />
        <div className="font-display text-5xl font-semibold">
          {result.score}
          <small className="ml-1 text-base text-text-muted">of {result.outOf}</small>
        </div>
      </div>
      <div role="tablist" className="mt-7 flex border-b border-border">
        {result.lines.length ? (
          <button
            type="button"
            role="tab"
            aria-selected={tab === "answers"}
            className={cn(
              "min-h-11 border-b-2 px-4 text-sm font-medium",
              tab === "answers" ? "border-text-primary" : "border-transparent text-text-muted",
            )}
            onClick={() => onTab("answers")}
          >
            Answers &amp; Feedback
          </button>
        ) : null}
        <button
          type="button"
          role="tab"
          aria-selected={tab === "summary"}
          className={cn(
            "min-h-11 border-b-2 px-4 text-sm font-medium",
            tab === "summary" ? "border-text-primary" : "border-transparent text-text-muted",
          )}
          onClick={() => onTab("summary")}
        >
          Summary
        </button>
      </div>
      {result.detailsAvailable === false ? (
        <p className="mt-4 rounded-lg border border-border bg-bg-secondary px-4 py-3 text-sm text-text-secondary">
          This older attempt was saved before detailed answer history was available, so only its
          score and chapter summary can be shown.
        </p>
      ) : null}
      {result.answerSheet ? (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-bg-secondary px-4 py-3">
          <div className="min-w-0">
            <p className="text-sm font-medium">Submitted answer sheet</p>
            <p className="truncate text-xs text-text-muted">{result.answerSheet.name}</p>
          </div>
          <a
            className={secondaryButton}
            href={result.answerSheet.url}
            target="_blank"
            rel="noreferrer"
          >
            Open answer sheet
          </a>
        </div>
      ) : null}
      {tab === "answers" && result.lines.length ? (
        <div className="mt-4 space-y-3">
          {result.lines.map((line, index) => {
            const scorePercent = Math.round((line.got / Math.max(1, line.question.marks)) * 100);
            const typeLabel = questionTypeLabel(line.question.questionType);

            return (
              <article
                key={line.question.id}
                className="overflow-hidden rounded-[14px] border border-border bg-bg-primary"
              >
                <div className="border-b border-border p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <Chip strong>Question {index + 1}</Chip>
                    <Chip strong={line.got === line.question.marks}>
                      {line.got} / {line.question.marks} marks
                    </Chip>
                    <Chip>{scorePercent}%</Chip>
                    {line.question.topic ? <Chip>{line.question.topic}</Chip> : null}
                    {typeLabel ? <Chip>{typeLabel}</Chip> : null}
                  </div>
                  <p className="mt-3 max-w-[78ch] text-sm font-medium leading-6">
                    {line.question.prompt}
                  </p>
                </div>
                <div className="grid gap-0 md:grid-cols-[minmax(0,1fr)_minmax(280px,0.82fr)]">
                  <section className="p-4 md:border-r md:border-border">
                    <p className="font-mono text-[11px] uppercase tracking-widest text-text-muted">
                      Your answer
                    </p>
                    <div className="mt-3 rounded-lg border border-border bg-bg-secondary p-4">
                      <p className="whitespace-pre-wrap text-sm leading-6">
                        {line.answer || <span className="text-text-muted">No answer given</span>}
                      </p>
                    </div>
                  </section>
                  <section className="border-t border-border p-4 md:border-t-0">
                    <div className="flex items-baseline gap-2">
                      <p className="font-mono text-[11px] uppercase tracking-widest text-text-muted">
                        Marker feedback
                      </p>
                      <span className="text-xs text-text-muted">
                        {line.got} of {line.question.marks}
                      </span>
                    </div>
                    <p className="mt-3 text-sm leading-6 text-text-secondary">{line.note}</p>
                    <div
                      className="mt-4 h-2 overflow-hidden rounded-full bg-bg-secondary"
                      aria-label={`Question ${index + 1} score ${scorePercent}%`}
                    >
                      <div
                        className="h-full bg-text-primary"
                        style={{ width: `${scorePercent}%` }}
                      />
                    </div>
                  </section>
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <ResultSummary result={result} percent={percent} />
      )}
    </div>
  );
}

const CHAPTER_STATUS_LABEL: Record<string, string> = {
  strong: "Solid",
  developing: "Getting there",
  weak: "Struggling",
  not_attempted: "Not attempted",
};

const CHAPTER_STATUS_DOT: Record<string, string> = {
  strong: "bg-emerald-600",
  developing: "bg-amber-500",
  weak: "bg-destructive",
  not_attempted: "bg-bg-tertiary",
};

/**
 * Everything here is the tenant's own breakdown of this paper. When it did not
 * return one, the marks are shown on their own rather than invented.
 */
function ResultSummary({ result, percent }: { result: Result; percent: number }) {
  const evaluation = result.evaluation;

  return (
    <div className="mt-4 grid gap-3 md:grid-cols-2">
      <article className="rounded-[14px] border border-border p-5">
        <h2 className="font-display text-lg font-semibold">What the marker said</h2>
        {evaluation ? (
          <>
            <p className="mt-4 text-sm leading-6">{evaluation.summary}</p>
            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <div>
                <p className="text-sm text-text-muted">Went well</p>
                {evaluation.strong_topics.length ? (
                  evaluation.strong_topics.map((chapter) => (
                    <p key={chapter.topic_key} className="mt-2 text-sm">
                      ✓ {chapter.chapter}
                    </p>
                  ))
                ) : (
                  <p className="mt-2 text-sm text-text-muted">Nothing came out strong this time.</p>
                )}
              </div>
              <div>
                <p className="text-sm text-text-muted">Cost marks</p>
                {evaluation.weak_topics.length ? (
                  evaluation.weak_topics.map((chapter) => (
                    <p key={chapter.topic_key} className="mt-2 text-sm">
                      → {chapter.chapter} ({Math.round(chapter.lost_weightage * 100)}% of the paper)
                    </p>
                  ))
                ) : (
                  <p className="mt-2 text-sm text-text-muted">Nothing stood out as weak.</p>
                )}
              </div>
            </div>
          </>
        ) : (
          <p className="mt-4 text-sm leading-6 text-text-secondary">
            No chapter breakdown came back for this paper. The per-question feedback is under
            Answers &amp; Feedback.
          </p>
        )}
      </article>

      <article className="rounded-[14px] border border-border p-5">
        <h2 className="font-display text-lg font-semibold">The number</h2>
        <p className="mt-5 text-sm text-text-muted">Percentage</p>
        <p className="font-display text-4xl font-semibold">{percent}%</p>
        {result.exam.passMarks !== undefined ? (
          <p className="mt-2 text-sm font-medium">
            {result.score >= result.exam.passMarks ? "Passed" : "Below pass mark"}
            <span className="font-normal text-text-muted">
              {" "}
              · {result.exam.passMarks} marks required
            </span>
          </p>
        ) : null}
        <div className="mt-4 h-2 overflow-hidden rounded-full bg-bg-secondary">
          <div className="h-full bg-text-primary" style={{ width: `${percent}%` }} />
        </div>

        {result.spread ? (
          <div className="mt-6">
            <p className="text-sm text-text-muted">
              How the group did · average {Math.round(result.spread.averagePercent * 100)}%
            </p>
            <div className="mt-3 flex h-16 items-end gap-1.5">
              {result.spread.bands.map((count, index) => {
                const tallest = Math.max(...result.spread!.bands, 1);
                return (
                  <div key={index} className="flex flex-1 flex-col items-center gap-1">
                    <div
                      className={cn(
                        "w-full rounded-t bg-text-primary",
                        index === result.spread!.myBand ? "opacity-100" : "opacity-25",
                      )}
                      style={{ height: `${Math.max(6, (count / tallest) * 100)}%` }}
                    />
                    <span className="text-[10px] text-text-muted">
                      {index * 20}–{index * 20 + 19}
                    </span>
                  </div>
                );
              })}
            </div>
            <p className="mt-3 text-[13px] text-text-muted">
              Ahead of {result.spread.below} of the other {result.spread.count - 1}.
            </p>
          </div>
        ) : null}

        {evaluation?.chapters.length ? (
          <div className="mt-6">
            <p className="text-sm text-text-muted">Chapter by chapter</p>
            <ul className="mt-3 space-y-2">
              {evaluation.chapters.map((chapter, index) => (
                <li
                  key={`${chapter.topic_key || chapter.chapter || "chapter"}-${index}`}
                  className="flex items-center gap-2 text-sm"
                >
                  <span
                    className={cn(
                      "h-2 w-2 shrink-0 rounded-full",
                      CHAPTER_STATUS_DOT[chapter.status],
                    )}
                    aria-hidden="true"
                  />
                  <span className="min-w-0 flex-1 truncate">{chapter.chapter}</span>
                  <span className="text-text-muted">
                    {chapter.score}/{chapter.marks}
                  </span>
                  <span className="w-24 shrink-0 text-right text-xs text-text-muted">
                    {CHAPTER_STATUS_LABEL[chapter.status] ?? chapter.status}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </article>
    </div>
  );
}
