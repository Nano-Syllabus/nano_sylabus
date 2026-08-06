"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
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
};
type PracticeLength = 5 | 10;
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
  attempts?: Array<{ id: string; attemptNo: number; reviewStatus: "pending" | "reviewed" | "published"; grade?: { total_score?: number; total_marks?: number } | null; createdAt: string }>;
  reviewStatus?: "pending" | "reviewed" | "published" | null;
  spread?: ClassSpread | null;
  grade?: { total_score?: number; total_marks?: number; evaluation?: PracticeEvaluation; results?: Array<{ question_id: string; score: number; feedback: string; student_answer?: string }> } | null;
  paper: {
    id: string;
    title: string;
    subject: string;
    totalMarks: number;
    kind?: string;
    timeLimitMinutes?: number;
    attempts?: number;
    questions: Array<{ id: string; chapter?: string; questionType?: string; marks: number; text: string }>;
  };
};

const shellButton = "inline-flex min-h-10 items-center justify-center rounded-lg px-4 text-sm font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-strong focus-visible:ring-offset-2";
const primaryButton = `${shellButton} bg-text-primary text-text-inverse hover:opacity-85`;
const secondaryButton = `${shellButton} border border-border-strong hover:bg-bg-secondary`;

function Chip({ children, strong = false }: { children: React.ReactNode; strong?: boolean }) {
  return <span className={cn("inline-flex min-h-8 items-center rounded-full border px-3 text-[13px]", strong ? "border-border-strong" : "border-border text-text-secondary")}>{children}</span>;
}

function askHref(topic: string, subject: string) {
  const query = new URLSearchParams({ subject, prompt: `I have a doubt about ${topic}. Please help me understand it.` });
  return `/app/chat?${query.toString()}`;
}

function Dialog({ title, children, footer, onClose }: { title: string; children: React.ReactNode; footer: React.ReactNode; onClose: () => void }) {
  useEffect(() => {
    const close = (event: KeyboardEvent) => event.key === "Escape" && onClose();
    document.addEventListener("keydown", close);
    return () => document.removeEventListener("keydown", close);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-[100] grid place-items-center p-4">
      <button type="button" aria-label="Close dialog" className="absolute inset-0 bg-black/45" onClick={onClose} />
      <section role="dialog" aria-modal="true" aria-labelledby="exam-dialog-title" className="relative w-full max-w-lg rounded-2xl border border-border bg-bg-primary p-6 shadow-xl">
        <h2 id="exam-dialog-title" className="font-display text-2xl font-semibold">{title}</h2>
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
    .sort((left, right) => right.lostWeightage - left.lostWeightage || left.percentage - right.percentage)
    .slice(0, 3)
    .map((topic) => topic.topic_key);
}

type PracticeSessionQuestion = {
  id: string;
  topic_key: string;
  topic: string;
  marks: number;
  text: string;
};

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
    windowLabel: windowState === "open" ? assignment.classroomName : windowState === "before" ? "Not open yet" : "Closed",
    questions: assignment.paper.questions.map((question) => ({
      id: question.id,
      type: question.questionType === "numerical" ? "long" : "short",
      marks: question.marks,
      topic: question.chapter || assignment.subjectName,
      prompt: question.text,
    })),
  };
}

function PracticeDialog({
  subjects,
  subject,
  topics,
  topicsState,
  topicsError,
  selectedTopics,
  length,
  starting,
  startError,
  onSubject,
  onTopic,
  onLength,
  onClose,
  onStart,
}: {
  subjects: string[];
  subject: string;
  topics: PracticeTopic[];
  topicsState: "loading" | "ready" | "error";
  topicsError: string;
  selectedTopics: string[];
  length: PracticeLength;
  starting: boolean;
  startError: string;
  onSubject: (subject: string) => void;
  onTopic: (topicKey: string) => void;
  onLength: (length: PracticeLength) => void;
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
      <button type="button" aria-label="Close practice dialog" className="absolute inset-0 bg-black/45" onClick={onClose} />
      <section role="dialog" aria-modal="true" aria-labelledby="practice-dialog-title" className="relative max-h-[86vh] w-full max-w-[580px] overflow-y-auto rounded-2xl border border-border bg-bg-primary shadow-xl">
        <header className="flex items-center gap-3 border-b border-border px-[22px] py-[18px]">
          <h2 id="practice-dialog-title" className="font-display text-xl font-semibold">Practise</h2>
          <span className="flex-1" />
          <button ref={closeButton} type="button" className={secondaryButton} onClick={onClose}>Close</button>
        </header>

        <div className="px-[22px] py-5">
          <div className="mb-[14px] flex gap-[7px] overflow-x-auto pb-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {subjects.map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => onSubject(item)}
                className={cn(
                  "min-h-10 shrink-0 whitespace-nowrap rounded-full border px-[14px] text-[13.5px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-strong",
                  item === subject ? "border-border-strong bg-text-primary font-medium text-text-inverse" : "border-border bg-bg-primary text-text-secondary hover:border-border-strong",
                )}
              >
                {item}
              </button>
            ))}
          </div>

          <fieldset>
            <legend className="mb-2 text-[13px] text-text-muted">
              Which chapters? Leave all unticked and the most heavily examined ones are used.
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
                        selected ? "border-border-strong bg-text-primary text-text-inverse" : "border-border bg-bg-primary text-text-secondary hover:border-border-strong",
                      )}
                    >
                      <span className={cn("mr-1.5 inline-block h-2 w-2 rounded-full align-middle", TOPIC_DOT[topic.status])} aria-hidden="true" />
                      {selected ? "✓ " : ""}{topic.title}
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

          <fieldset>
            <legend className="mb-1.5 text-[13px] text-text-muted">How long?</legend>
            <div className="mb-4 inline-flex max-w-full rounded-xl border border-border bg-bg-primary p-1 shadow-sm">
              <button type="button" onClick={() => onLength(5)} className={cn("min-h-10 rounded-[9px] px-[18px] text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-strong", length === 5 ? "bg-text-primary font-semibold text-text-inverse" : "text-text-secondary")}>Quick · 5 questions</button>
              <button type="button" onClick={() => onLength(10)} className={cn("min-h-10 rounded-[9px] px-[18px] text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-strong", length === 10 ? "bg-text-primary font-semibold text-text-inverse" : "text-text-secondary")}>Full · 10 questions</button>
            </div>
          </fieldset>

          <p className="text-[13px] text-text-muted">
            Questions are drawn from your teacher&apos;s question bank and marked by the same strict
            examiner your exams use.
          </p>

          {startError ? <p className="mt-3 text-[13px] text-destructive">{startError}</p> : null}
        </div>

        <footer className="sticky bottom-0 flex justify-end gap-2 border-t border-border bg-bg-primary px-[22px] py-[15px]">
          <button type="button" className={secondaryButton} onClick={onClose} disabled={starting}>Cancel</button>
          <button type="button" className={primaryButton} disabled={starting || topicsState === "loading"} onClick={onStart}>
            {starting ? "Writing your paper…" : "Start practising"}
          </button>
        </footer>
      </section>
    </div>
  );
}

export function StudentExamsClient({ subjects, fullName }: { subjects: string[]; fullName: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const examId = searchParams.get("exam");
  const mode = searchParams.get("mode");
  const inviteCode = searchParams.get("join");
  const [practiceAttempts, setPracticeAttempts] = useState<PracticeAttempt[]>([]);
  /** True when an unfinished sitting was found on this device. */
  const [resumable, setResumable] = useState(false);
  const [listTab, setListTab] = useState<"todo" | "done">("todo");
  const [dialog, setDialog] = useState<"join" | "practice" | "writing" | "submit" | "sheet" | null>(null);
  const [joinCode, setJoinCode] = useState("");
  const [joinError, setJoinError] = useState("");
  const [attemptExam, setAttemptExam] = useState<StudentExam | null>(null);
  const [questionIndex, setQuestionIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, Answer>>({});
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [result, setResult] = useState<Result | null>(null);
  const [resultTab, setResultTab] = useState<"answers" | "summary">("answers");
  const [practiceSubject, setPracticeSubject] = useState<string>(subjects[0] ?? "");
  const [practiceTopics, setPracticeTopics] = useState<string[]>([]);
  const [practiceLength, setPracticeLength] = useState<PracticeLength>(5);
  const [availableTopics, setAvailableTopics] = useState<PracticeTopic[]>([]);
  const [topicsState, setTopicsState] = useState<"loading" | "ready" | "error">("loading");
  const [topicsError, setTopicsError] = useState("");
  const [startingPractice, setStartingPractice] = useState(false);
  const [practiceStartError, setPracticeStartError] = useState("");
  // A sitting only exists on the tenant for two hours and is graded by id, so
  // the attempt has to carry it.
  const [practiceSession, setPracticeSession] = useState<{ sessionId: string; subject: string } | null>(null);
  const [teacherAssignments, setTeacherAssignments] = useState<TeacherAssignment[]>([]);
  const [assignmentState, setAssignmentState] = useState<"loading" | "ready" | "error">("loading");
  const [assignmentError, setAssignmentError] = useState("");
  const [isJoining, setIsJoining] = useState(false);
  const [isGrading, setIsGrading] = useState(false);
  const [gradingError, setGradingError] = useState("");
  const [sheetFile, setSheetFile] = useState<File | null>(null);
  const [sheetError, setSheetError] = useState("");
  const [uploadingSheet, setUploadingSheet] = useState(false);
  const joinInput = useRef<HTMLInputElement>(null);
  const teacherExams = useMemo(() => teacherAssignments.map(assignmentExam), [teacherAssignments]);
  const selectedExam = teacherExams.find((exam) => exam.id === examId) ?? null;

  async function loadTeacherAssignments() {
    setAssignmentState("loading");
    try {
      const response = await fetch("/api/student/teacher-exams", { headers: { Accept: "application/json" } });
      const payload = await response.json() as { assignments?: TeacherAssignment[]; error?: string };
      if (!response.ok) throw new Error(payload.error || "Could not load teacher exams.");
      setTeacherAssignments(Array.isArray(payload.assignments) ? payload.assignments : []);
      setAssignmentError("");
      setAssignmentState("ready");
    } catch (error) {
      setAssignmentError(error instanceof Error ? error.message : "Could not load teacher exams.");
      setAssignmentState("error");
    }
  }

  useEffect(() => { void loadTeacherAssignments(); }, []);

  async function loadPracticeAttempts() {
    try {
      const response = await fetch("/api/student/practice/attempts", { headers: { Accept: "application/json" } });
      const payload = (await response.json()) as { attempts?: PracticeAttempt[] };
      if (response.ok) setPracticeAttempts(Array.isArray(payload.attempts) ? payload.attempts : []);
    } catch {
      // History is supporting detail — the exam list still works without it.
    }
  }

  useEffect(() => { void loadPracticeAttempts(); }, []);

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
        if (active && response.ok) setExamTopics(Array.isArray(payload.topics) ? payload.topics : []);
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
    setPracticeSession({ sessionId: saved.sessionId, subject: saved.subject });
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
        const response = await fetch(
          `/api/student/practice/topics?subject=${encodeURIComponent(practiceSubject)}`,
          { headers: { Accept: "application/json" } },
        );
        const payload = (await response.json()) as { topics?: PracticeTopic[]; error?: string };
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
  }, [practiceSubject]);

  useEffect(() => {
    if (!inviteCode) return;
    setJoinCode(inviteCode);
    setDialog("join");
  }, [inviteCode]);

  useEffect(() => {
    if (dialog === "join") joinInput.current?.focus();
  }, [dialog]);

  useEffect(() => {
    if (!attemptExam || mode !== "sit") return;
    const timer = window.setInterval(() => setSecondsLeft((value) => Math.max(0, value - 1)), 1000);
    return () => window.clearInterval(timer);
  }, [attemptExam, mode]);

  useEffect(() => {
    if (attemptExam && mode === "sit" && secondsLeft === 0) setDialog("submit");
  }, [attemptExam, mode, secondsLeft]);

  useEffect(() => {
    if (!selectedExam || mode !== "marking") return;
    const timer = window.setTimeout(() => {
      router.replace(`/app/exams?exam=${selectedExam.id}&mode=result`, { scroll: false });
    }, 2200);
    return () => window.clearTimeout(timer);
  }, [mode, router, selectedExam]);

  const answeredCount = useMemo(() => Object.values(answers).filter((answer) => answer.choice !== undefined || answer.text?.trim()).length, [answers]);
  const todoExams = useMemo(() => teacherExams.filter((exam) => teacherAssignments.find((assignment) => `teacher_${assignment.id}` === exam.id)?.canAttempt !== false), [teacherAssignments, teacherExams]);
  const doneAssignments = useMemo(() => teacherAssignments.filter((assignment) => (assignment.attemptCount || 0) > 0), [teacherAssignments]);

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
          const graded = teacherAssignment.grade?.results?.find((item) => item.question_id === question.id);
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

  /** Hands in a scan or photo of a handwritten sheet for a teacher's exam. */
  async function submitSheet() {
    if (!attemptExam || !sheetFile) return;
    const assignmentId = attemptExam.id.replace(/^teacher_/, "");

    setUploadingSheet(true);
    setSheetError("");

    try {
      const body = new FormData();
      body.append("file", sheetFile);

      const response = await fetch(
        `/api/student/teacher-exams/${encodeURIComponent(assignmentId)}/grade-file`,
        { method: "POST", body },
      );
      const payload = (await response.json().catch(() => ({}))) as { submitted?: boolean; error?: string };
      if (!response.ok || !payload.submitted) {
        throw new Error(payload.error || "Could not read that answer sheet.");
      }

      setDialog(null);
      setSheetFile(null);
      setAttemptExam(null);
      await loadTeacherAssignments();
      setListTab("done");
      router.push("/app/exams", { scroll: false });
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
        const response = await fetch(`/api/student/teacher-exams/${encodeURIComponent(assignment.id)}/grade`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Accept: "application/json" },
          body: JSON.stringify({ answers: attemptExam.questions.map((question) => ({
            questionId: question.id,
            answerText: answers[question.id]?.text || "",
          })) }),
        });
        const payload = await response.json() as { submitted?: boolean; awaitingReview?: boolean; error?: string };
        if (!response.ok || !payload.submitted) throw new Error(payload.error || "Could not submit this exam.");
        setDialog(null);
        await loadTeacherAssignments();
        setListTab("done");
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
      const response = await fetch(
        `/api/student/practice/session/${encodeURIComponent(practiceSession.sessionId)}/grade`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", Accept: "application/json" },
          body: JSON.stringify({
            subject: practiceSession.subject,
            answers: attemptExam.questions.map((question) => ({
              questionId: question.id,
              answerText: answers[question.id]?.text || "",
            })),
          }),
        },
      );
      const payload = (await response.json()) as {
        results?: Array<{ question_id: string; score: number; feedback: string; student_answer?: string }>;
        totalScore?: number;
        totalMarks?: number;
        evaluation?: PracticeEvaluation;
        error?: string;
      };

      if (!response.ok) throw new Error(payload.error || "Could not grade this practice sitting.");

      const lines = attemptExam.questions.map((question) => {
        const graded = payload.results?.find((item) => item.question_id === question.id);
        return {
          question,
          got: graded?.score ?? 0,
          note: graded?.feedback || "No feedback returned.",
          answer: graded?.student_answer ?? answers[question.id]?.text ?? "",
        };
      });

      setResult({
        exam: attemptExam,
        score: payload.totalScore ?? 0,
        outOf: payload.totalMarks ?? attemptExam.marks,
        lines,
        evaluation: payload.evaluation ?? null,
        handedInAt: new Date().toISOString(),
        studentName: fullName,
      });
      // Graded — the sitting is consumed on the tenant, so drop the local copy.
      clearSavedSitting();
      setPracticeSession(null);
      setResumable(false);
      void loadPracticeAttempts();
      router.replace(`/app/exams?exam=${attemptExam.id}&mode=result`, { scroll: false });
    } catch (error) {
      setGradingError(error instanceof Error ? error.message : "Could not grade this practice sitting.");
      router.replace(`/app/exams?exam=${attemptExam.id}&mode=sit`, { scroll: false });
    } finally {
      setIsGrading(false);
    }
  }

  function choosePracticeSubject(subject: string) {
    setPracticeSubject(subject);
    setPracticeTopics([]);
    setPracticeStartError("");
  }

  function togglePracticeTopic(topicKey: string) {
    setPracticeTopics((current) => current.includes(topicKey) ? current.filter((item) => item !== topicKey) : [...current, topicKey]);
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
          maxQuestions: practiceLength,
        }),
      });
      const payload = (await response.json()) as {
        sessionId?: string;
        questions?: PracticeSessionQuestion[];
        totalMarks?: number;
        error?: string;
      };

      if (!response.ok || !payload.sessionId) {
        throw new Error(payload.error || "Could not start practice.");
      }

      const questions: StudentExamQuestion[] = (payload.questions ?? []).map((question) => ({
        id: question.id,
        type: "long",
        marks: question.marks,
        topic: question.topic || question.topic_key,
        prompt: question.text,
      }));

      if (!questions.length) throw new Error("No questions came back for those chapters.");

      const chapters = Array.from(new Set(questions.map((question) => question.topic)));
      const exam: StudentExam = {
        id: `practice_${payload.sessionId}`,
        subject: practiceSubject,
        title: chapters.length === 1 ? `${chapters[0]} practice` : `${practiceSubject} practice`,
        kind: "practice",
        counts: false,
        marks: payload.totalMarks ?? questions.reduce((total, question) => total + question.marks, 0),
        // Roughly three minutes a mark, which is how these papers are sat.
        minutes: Math.max(10, Math.round((payload.totalMarks ?? questions.length * 5) * 3)),
        attempts: null,
        window: "practice",
        windowLabel: "Whenever you like",
        questions,
      };

      setPracticeSession({ sessionId: payload.sessionId, subject: practiceSubject });
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

  if (mode === "marking" && attemptExam) return <MarkingView exam={attemptExam} />;
  if (mode === "result" && result) return <ResultView result={result} tab={resultTab} onTab={setResultTab} />;
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
        onAnswer={(answer) => setAnswers((current) => ({ ...current, [question.id]: { ...current[question.id], ...answer } }))}
        onQuestion={setQuestionIndex}
        onSubmit={() => setDialog("submit")}
        onSheet={attemptExam.id.startsWith("teacher_") ? () => setDialog("sheet") : undefined}
      >
        {dialog === "sheet" ? (
          <Dialog
            title="Hand in your answer sheet"
            onClose={() => { setDialog(null); setSheetError(""); }}
            footer={<>
              <button type="button" className={secondaryButton} onClick={() => { setDialog(null); setSheetError(""); }} disabled={uploadingSheet}>Cancel</button>
              <button type="button" className={primaryButton} onClick={() => void submitSheet()} disabled={!sheetFile || uploadingSheet}>{uploadingSheet ? "Reading your sheet…" : "Hand it in"}</button>
            </>}
          >
            <p className="text-sm text-text-secondary">
              Photograph or scan every page you wrote on. Your handwriting is read, each answer is
              matched to its question, then marked against the paper.
            </p>
            <label className={`${secondaryButton} mt-4`}>
              {sheetFile ? "Choose a different file" : "Choose a PDF or photo"}
              <input
                type="file"
                accept="application/pdf,image/png,image/jpeg"
                className="sr-only"
                onChange={(event) => { setSheetFile(event.target.files?.[0] ?? null); setSheetError(""); }}
              />
            </label>
            {sheetFile ? <p className="mt-3 text-sm">{sheetFile.name} · {Math.max(1, Math.round(sheetFile.size / 1024))} KB</p> : null}
            <p className="mt-3 text-[13px] text-text-muted">PDF, JPG or PNG, up to 15 MB. This uses one of your attempts.</p>
            {sheetError ? <p className="mt-3 text-sm text-destructive">{sheetError}</p> : null}
          </Dialog>
        ) : null}

        {dialog === "submit" ? (
          <Dialog title={timeExpired ? "Time is up" : "Hand it in"} onClose={() => { if (!timeExpired) setDialog(null); }} footer={<>{!timeExpired ? <button type="button" className={secondaryButton} onClick={() => setDialog(null)} disabled={isGrading}>Keep working</button> : null}<button type="button" className={primaryButton} onClick={() => void markExam()} disabled={isGrading}>{isGrading ? "Grading…" : "Hand it in"}</button></>}>
            <p>{timeExpired ? <><b>The saved time limit has ended.</b> Submit the answers currently on this paper.</> : attemptExam.questions.length - answeredCount ? <><b>{attemptExam.questions.length - answeredCount} questions are still blank.</b> Blank answers get no marks.</> : "Every question has an answer."}</p>
            <div className="mt-4 rounded-xl border border-border bg-bg-secondary p-4 text-sm">Marking usually takes under a minute. {attemptExam.counts ? "Your teacher sees the result too." : "This is practice, so it stays with you."}</div>
            {gradingError ? <p className="mt-3 text-sm text-destructive" role="alert">{gradingError}</p> : null}
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
          setDialog("practice");
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
          <h1 className="mt-3 font-display text-[28px] font-semibold tracking-[-0.04em]">Exams</h1>
        </div>
        <span className="flex-1" />
        <button type="button" className={secondaryButton} onClick={() => setDialog("join")}>Join with a code</button>
        <button type="button" className={primaryButton} onClick={() => setDialog("practice")}>Practise</button>
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
            onClick={() => { clearSavedSitting(); setResumable(false); setAttemptExam(null); setPracticeSession(null); }}
          >
            Discard
          </button>
          <button
            type="button"
            className={primaryButton}
            onClick={() => router.push(`/app/exams?exam=${attemptExam.id}&mode=sit`, { scroll: false })}
          >
            Carry on
          </button>
        </section>
      ) : null}

      <div role="tablist" aria-label="Exam lists" className="mt-6 inline-flex rounded-xl border border-border p-1">
        {([['todo', 'To do', todoExams.length], ['done', 'Done', doneAssignments.length + practiceAttempts.length]] as const).map(([value, label, count]) => (
          <button key={value} type="button" role="tab" aria-selected={listTab === value} className={cn("min-h-10 rounded-lg px-5 text-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-strong", listTab === value ? "bg-text-primary text-text-inverse" : "text-text-secondary hover:bg-bg-secondary")} onClick={() => setListTab(value)}>{label} <span className="ml-1 opacity-70">{count}</span></button>
        ))}
      </div>

      {listTab === "todo" ? (
        <div className="mt-4 flex flex-wrap gap-3">
          {assignmentState === "loading" ? Array.from({ length: 2 }).map((_, index) => <div key={index} className="h-44 w-full animate-pulse rounded-[14px] bg-bg-secondary motion-reduce:animate-none sm:max-w-[395px]" />) : null}
          {assignmentState === "error" ? <section className="w-full rounded-[14px] border border-destructive/40 p-5"><h2 className="font-semibold text-destructive">Could not load teacher exams</h2><p className="mt-2 text-sm text-text-secondary">{assignmentError}</p><button type="button" className={`${secondaryButton} mt-4`} onClick={() => void loadTeacherAssignments()}>Try again</button></section> : null}
          {assignmentState === "ready" && todoExams.length === 0 ? <section className="w-full rounded-[14px] border border-border p-8 text-center"><h2 className="font-display text-lg font-semibold">No teacher exams yet</h2><p className="mt-2 text-sm text-text-secondary">Join a classroom with its code. Published exams will appear here.</p><button type="button" className={`${primaryButton} mt-4`} onClick={() => setDialog("join")}>Join with a code</button></section> : null}
          {todoExams.map((exam) => <ExamListCard key={exam.id} exam={exam} onOpen={() => showExam(exam)} onStart={() => startExam(exam)} />)}
        </div>
      ) : (
        <div className="mt-4 flex flex-wrap gap-3">
          {practiceAttempts.map((attempt) => (
            <article key={attempt.id} className="w-full rounded-[14px] border border-border p-5 sm:max-w-[395px]">
              <div className="flex items-center gap-2">
                <Chip>{attempt.subjectName}</Chip>
                <span className="flex-1" />
                <Chip>practice</Chip>
              </div>
              <h2 className="mt-3 font-display text-lg font-semibold">
                {attempt.evaluation?.chapters.length === 1
                  ? `${attempt.evaluation.chapters[0].chapter} practice`
                  : `${attempt.subjectName} practice`}
              </h2>
              <p className="mt-2 text-sm text-text-secondary">
                {new Date(attempt.createdAt).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
              </p>
              <p className="mt-5 font-display text-3xl font-semibold">
                {attempt.totalScore}
                <small className="ml-1 text-sm text-text-muted">of {attempt.totalMarks}</small>
              </p>
              {attempt.evaluation?.summary ? (
                <p className="mt-3 text-[13px] text-text-muted">{attempt.evaluation.summary}</p>
              ) : null}
              {attempt.evaluation?.chapters.length ? (
                <ul className="mt-4 space-y-1.5">
                  {attempt.evaluation.chapters.map((chapter) => (
                    <li key={chapter.topic_key} className="flex items-center gap-2 text-[13px]">
                      <span className={cn("h-2 w-2 shrink-0 rounded-full", CHAPTER_STATUS_DOT[chapter.status])} aria-hidden="true" />
                      <span className="min-w-0 flex-1 truncate">{chapter.chapter}</span>
                      <span className="text-text-muted">{chapter.score}/{chapter.marks}</span>
                    </li>
                  ))}
                </ul>
              ) : null}
            </article>
          ))}
          {doneAssignments.length ? doneAssignments.map((assignment) => <article key={assignment.id} className="w-full rounded-[14px] border border-border p-5 sm:max-w-[395px]"><div className="flex items-center gap-2"><Chip>{assignment.subjectName}</Chip><span className="flex-1" /><Chip strong>{assignment.grade ? "published" : "submitted"}</Chip></div><h2 className="mt-3 font-display text-lg font-semibold">{assignment.paper.title}</h2><p className="mt-2 text-sm text-text-secondary">{assignment.classroomName} · {assignment.attemptCount || 0} of {assignment.maxAttempts || 1} attempts used</p>{assignment.grade ? <p className="mt-5 font-display text-3xl font-semibold">{assignment.grade.total_score ?? 0}<small className="ml-1 text-sm text-text-muted">of {assignment.grade.total_marks ?? assignment.paper.totalMarks}</small></p> : <div className="mt-5 rounded-xl bg-bg-secondary p-4"><p className="font-medium">Awaiting teacher review</p><p className="mt-1 text-sm text-text-secondary">Your answers are submitted. Marks appear here after your teacher publishes them.</p></div>}<div className="mt-4 space-y-2">{(assignment.attempts || []).map((attempt) => <div key={attempt.id} className="flex items-center gap-3 rounded-lg border border-border px-3 py-2 text-sm"><span className="min-w-0 flex-1">Attempt {attempt.attemptNo}</span><span className="capitalize text-text-muted">{attempt.reviewStatus}</span>{attempt.grade ? <strong>{attempt.grade.total_score ?? 0}/{attempt.grade.total_marks ?? assignment.paper.totalMarks}</strong> : null}</div>)}</div>{assignment.canAttempt !== false ? <button type="button" className={`${primaryButton} mt-4`} onClick={() => startExam(assignmentExam(assignment))}>Try again</button> : null}</article>) : <section className="w-full rounded-[14px] border border-border p-8 text-center"><h2 className="font-display text-lg font-semibold">No completed teacher exams</h2><p className="mt-2 text-sm text-text-secondary">Your submitted classroom exams will appear here.</p></section>}
        </div>
      )}

      {dialog === "join" ? (
        <Dialog title="Join with a code" onClose={() => setDialog(null)} footer={<><button type="button" className={secondaryButton} onClick={() => setDialog(null)}>Cancel</button><button type="submit" form="join-exam-form" className={primaryButton} disabled={isJoining}>{isJoining ? "Joining…" : "Join classroom"}</button></>}>
          <form id="join-exam-form" onSubmit={submitJoin}>
            <label htmlFor="exam-code" className="text-sm font-medium">Type the code you were given</label>
            <input ref={joinInput} id="exam-code" type="text" autoComplete="one-time-code" spellCheck={false} value={joinCode} onChange={(event) => { setJoinCode(event.target.value.toUpperCase()); setJoinError(""); }} placeholder="BEI-4K2M" aria-invalid={joinError ? "true" : undefined} aria-describedby={joinError ? "exam-code-error" : undefined} className="mt-2 h-12 w-full rounded-lg border border-border bg-bg-primary px-3 font-mono text-lg uppercase tracking-widest focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-strong" />
            {joinError ? <p id="exam-code-error" className="mt-2 text-sm text-destructive">{joinError}</p> : null}
            <div className="mt-4 rounded-xl border border-border bg-bg-secondary p-4 text-sm">Your teacher shares one code for this classroom. Published exams appear here after you join.</div>
          </form>
        </Dialog>
      ) : null}

      {dialog === "practice" ? (
        <PracticeDialog
          subjects={subjects}
          subject={practiceSubject}
          topics={availableTopics}
          topicsState={topicsState}
          topicsError={topicsError}
          selectedTopics={practiceTopics}
          length={practiceLength}
          starting={startingPractice}
          startError={practiceStartError}
          onSubject={choosePracticeSubject}
          onTopic={togglePracticeTopic}
          onLength={setPracticeLength}
          onClose={() => setDialog(null)}
          onStart={() => void startPractice()}
        />
      ) : null}

      {dialog === "writing" ? (
        <Dialog title="Writing your questions" onClose={() => setDialog(null)} footer={null}>
          <b>{practiceLength} questions from {practiceTopics.length} chapter{practiceTopics.length === 1 ? "" : "s"}</b>
          <p className="mt-1 text-[13px] text-text-muted">Taken from your notes and the past papers on this subject.</p>
          <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-bg-secondary"><div className="h-full w-[70%] animate-pulse rounded-full bg-text-primary motion-reduce:animate-none" /></div>
        </Dialog>
      ) : null}
    </div>
  );
}

function ExamListCard({ exam, onOpen, onStart }: { exam: StudentExam; onOpen: () => void; onStart: () => void }) {
  const active = exam.window === "open" || exam.window === "practice";
  return (
    <article className={cn("w-full rounded-[14px] border px-4 py-4 sm:max-w-[395px] sm:basis-[395px] sm:flex-none", active ? "border-border-strong" : "border-border")}>
      <div className="flex items-center justify-between gap-2"><Chip>{exam.subject}</Chip><Chip strong={exam.counts}>{exam.counts ? "counts" : "practice"}</Chip></div>
      <h2 className="mt-3 font-display text-lg font-semibold">{exam.title}</h2>
      <p className="mt-1 text-sm text-text-secondary">{exam.marks} marks · {exam.minutes} minutes</p>
      <div className="mt-4 flex flex-wrap items-center gap-2">
        {active ? <button type="button" className={primaryButton} onClick={onStart}>Start</button> : null}
        <Chip>{exam.windowLabel}</Chip>
        <span className="flex-1" />
        <button type="button" className={secondaryButton} onClick={onOpen}>What it covers</button>
      </div>
    </article>
  );
}

function ExamOverview({ exam, onStart, onPractise, statusByChapter }: { exam: StudentExam; onStart: (exam: StudentExam) => void; onPractise: (subject: string) => void; statusByChapter: Record<string, PracticeTopic["status"]> }) {
  const topics = [...new Set(exam.questions.map((question) => question.topic))];
  const notSolid = topics.filter((topic) => (statusByChapter[topic.toLowerCase()] ?? "not_attempted") !== "strong").length;
  return (
    <div className="w-full max-w-[1240px] px-4 pb-10 pt-6 sm:px-6">
      <nav className="text-sm text-text-muted"><Link href="/app/exams" className="hover:text-text-primary">Exams</Link> / <b className="text-text-secondary">{exam.title}</b></nav>
      <div className="mt-5 flex flex-wrap items-end gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap gap-2"><Chip>{exam.subject}</Chip><Chip strong={exam.counts}>{exam.counts ? "counts towards your record" : "practice only"}</Chip></div>
          <h1 className="mt-4 font-display text-[28px] font-semibold tracking-[-0.04em]">{exam.title}</h1>
          <p className="mt-3 text-[15px] text-text-secondary">{exam.questions.length} questions · {exam.marks} marks · {exam.minutes ? `${exam.minutes} minutes once you start` : "no time limit"}</p>
        </div>
        <span className="flex-1" />
        {exam.window === "open" || exam.window === "practice" ? <button type="button" className={primaryButton} onClick={() => onStart(exam)}>Start</button> : <Chip>{exam.windowLabel}</Chip>}
      </div>
      <section className="mt-9">
        <div className="flex items-baseline gap-3"><h2 className="font-display text-xl font-semibold">What it covers</h2><span className="text-sm text-text-muted">{notSolid} not solid yet</span></div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {topics.map((topic) => (
            <article key={topic} className={cn("rounded-[14px] border px-4 py-4", (statusByChapter[topic.toLowerCase()] ?? "not_attempted") === "weak" ? "border-border-strong" : "border-border")}>
              <p className="flex items-center gap-2 text-sm text-text-muted">
                <span className={cn("h-2 w-2 rounded-full", TOPIC_DOT[statusByChapter[topic.toLowerCase()] ?? "not_attempted"])} aria-hidden="true" />
                {CHAPTER_STATUS_LABEL[statusByChapter[topic.toLowerCase()] ?? "not_attempted"]}
              </p>
              <h3 className="mt-3 font-display text-lg font-semibold">{topic}</h3>
              <div className="mt-5 flex gap-2">
                <button type="button" className={primaryButton} onClick={() => onPractise(exam.subject)}>Practise</button>
                <Link href={askHref(topic, exam.subject)} className={secondaryButton}>Ask a doubt</Link>
              </div>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}

function AttemptView({ exam, question, questionIndex, answers, answeredCount, secondsLeft, onAnswer, onQuestion, onSubmit, onSheet, children }: { exam: StudentExam; question: StudentExamQuestion; questionIndex: number; answers: Record<string, Answer>; answeredCount: number; secondsLeft: number; onAnswer: (answer: Answer) => void; onQuestion: (index: number) => void; onSubmit: () => void; onSheet?: () => void; children: React.ReactNode }) {
  const answer = answers[question.id] || {};
  const minutes = String(Math.floor(secondsLeft / 60)).padStart(2, "0");
  const seconds = String(secondsLeft % 60).padStart(2, "0");
  return <div className="w-full max-w-[1240px] px-4 pb-10 pt-6 sm:px-6">
    <nav className="text-sm text-text-muted"><Link href={`/app/exams?exam=${exam.id}`}>{exam.title}</Link> / <b className="text-text-secondary">In progress</b></nav>
    <div className="mt-5 flex flex-wrap items-start gap-4"><div><h1 className="font-display text-[28px] font-semibold">{exam.title}</h1><p className="mt-2 text-sm text-text-secondary">{exam.questions.length} questions, {exam.marks} marks. Your answers save as you go.</p></div><span className="flex-1" /><div className="min-w-36 rounded-[14px] border border-border p-4 text-right"><p className="text-xs text-text-muted">Time left</p><p className="mt-1 font-mono text-2xl font-medium">{minutes}:{seconds}</p><p className="mt-1 text-xs text-text-muted">{answeredCount} of {exam.questions.length} answered</p></div></div>
    <div className="mt-5 grid gap-3 lg:grid-cols-[1fr_240px]">
      <section className="rounded-[14px] border border-border p-5"><div className="flex flex-wrap gap-2"><Chip strong>Question {questionIndex + 1} of {exam.questions.length}</Chip><Chip>{question.marks} {question.marks === 1 ? "mark" : "marks"}</Chip></div><p className="mt-4 text-base leading-7">{question.prompt}</p>
        {question.type === "choice" ? <fieldset className="mt-4 space-y-2"><legend className="sr-only">Choose one answer</legend>{question.options?.map((option, index) => <label key={option} className={cn("flex min-h-12 cursor-pointer items-center gap-3 rounded-xl border px-4 text-sm transition", answer.choice === index ? "border-border-strong bg-bg-secondary" : "border-border hover:border-border-strong")}><input type="radio" name={question.id} checked={answer.choice === index} onChange={() => onAnswer({ choice: index })} /><span className="grid h-7 w-7 place-items-center rounded-full border border-border text-xs">{String.fromCharCode(97 + index)}</span>{option}</label>)}</fieldset> : <div className="mt-4"><label htmlFor={`answer-${question.id}`} className="sr-only">Your answer</label><textarea id={`answer-${question.id}`} value={answer.text || ""} onChange={(event) => onAnswer({ text: event.target.value })} placeholder="Write your answer here." className="min-h-44 w-full resize-y rounded-xl border border-border bg-bg-primary p-4 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-strong" /><div className="mt-3 flex flex-wrap items-center gap-2"><span className="ml-auto text-xs text-text-muted">{answer.text ? "Saved" : "Nothing saved yet"}</span></div></div>}
        {question.marking ? <div className="mt-4 text-sm text-text-muted">Marks are given for: <div className="mt-2 flex flex-wrap gap-2">{question.marking.map((item) => <Chip key={item.label}>{item.label} · {item.marks}</Chip>)}</div></div> : null}
        {onSheet ? <div className="mt-4 flex flex-wrap items-center gap-2 rounded-xl border border-border bg-bg-secondary p-3"><span className="text-[13px] text-text-secondary">Wrote it on paper?</span><button type="button" className={secondaryButton} onClick={onSheet}>Hand in a photo of your sheet</button></div> : null}
        <div className="mt-6 flex flex-wrap gap-2 border-t border-border pt-4"><button type="button" className={secondaryButton} disabled={questionIndex === 0} onClick={() => onQuestion(questionIndex - 1)}>Back</button><button type="button" className={secondaryButton} disabled={questionIndex === exam.questions.length - 1} onClick={() => onQuestion(questionIndex + 1)}>Next</button><span className="flex-1" /><button type="button" className={primaryButton} onClick={onSubmit}>Hand it in</button></div>
      </section>
      <aside className="rounded-[14px] border border-border p-4"><p className="text-sm text-text-muted">Questions</p><div className="mt-3 grid grid-cols-5 gap-2">{exam.questions.map((item, index) => <button key={item.id} type="button" aria-label={`Go to question ${index + 1}`} className={cn("h-10 rounded-lg border text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-strong", index === questionIndex ? "border-text-primary bg-text-primary text-text-inverse" : answers[item.id] ? "border-border-strong bg-bg-secondary" : "border-border")} onClick={() => onQuestion(index)}>{index + 1}</button>)}</div><p className="mt-4 border-t border-border pt-4 text-xs leading-5 text-text-muted">Filled squares are answered. Nothing goes to your teacher until you hand it in.</p></aside>
    </div>{children}
  </div>;
}

function MarkingView({ exam }: { exam: StudentExam }) {
  return <div className="w-full max-w-[900px] px-4 pb-10 pt-10 sm:px-6"><h1 className="font-display text-[28px] font-semibold">Marking your paper</h1><p className="mt-2 text-text-secondary">Reading your answers against what each question was looking for.</p><div className="mt-6 rounded-[14px] border border-border p-5"><div className="h-2 overflow-hidden rounded-full bg-bg-secondary"><div className="h-full w-3/4 animate-pulse rounded-full bg-text-primary motion-reduce:animate-none" /></div><p className="mt-3 text-sm text-text-muted">Checking each answer against the marking points…</p></div></div>;
}

function ResultView({ result, tab, onTab }: { result: Result; tab: "answers" | "summary"; onTab: (tab: "answers" | "summary") => void }) {
  const percent = Math.round((result.score / Math.max(1, result.outOf)) * 100);
  return <div className="w-full max-w-[1240px] px-4 pb-10 pt-6 sm:px-6"><nav className="text-sm text-text-muted"><Link href="/app/exams">Exams</Link> / <b className="text-text-secondary">{result.exam.title}</b></nav><div className="mt-5 flex flex-wrap items-end gap-4"><div><div className="flex flex-wrap gap-2"><Chip strong={result.exam.counts}>{result.exam.counts ? "counts towards the record" : "practice only"}</Chip><Chip>published</Chip></div><h1 className="mt-4 font-display text-[28px] font-semibold">{result.exam.title}</h1><p className="mt-2 text-sm text-text-secondary">{[result.exam.subject, result.studentName, result.handedInAt ? new Date(result.handedInAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : null].filter(Boolean).join(" · ")}</p></div><span className="flex-1" /><div className="font-display text-5xl font-semibold">{result.score}<small className="ml-1 text-base text-text-muted">of {result.outOf}</small></div></div>
    <div role="tablist" className="mt-7 flex border-b border-border"><button type="button" role="tab" aria-selected={tab === "answers"} className={cn("min-h-11 border-b-2 px-4 text-sm font-medium", tab === "answers" ? "border-text-primary" : "border-transparent text-text-muted")} onClick={() => onTab("answers")}>Answers &amp; Feedback</button><button type="button" role="tab" aria-selected={tab === "summary"} className={cn("min-h-11 border-b-2 px-4 text-sm font-medium", tab === "summary" ? "border-text-primary" : "border-transparent text-text-muted")} onClick={() => onTab("summary")}>Summary</button></div>
    {tab === "answers" ? <div className="mt-4 space-y-3">{result.lines.map((line, index) => <article key={line.question.id} className="overflow-hidden rounded-[14px] border border-border"><div className="flex flex-wrap items-center gap-2 border-b border-border p-4"><Chip>Question {index + 1}</Chip><Chip strong={line.got === line.question.marks}>{line.got} / {line.question.marks} marks</Chip><p className="basis-full pt-1 text-sm font-medium">{line.question.prompt}</p></div><div className="grid md:grid-cols-2"><div className="p-4 md:border-r md:border-border"><p className="font-mono text-[11px] uppercase tracking-widest text-text-muted">Student answer</p><p className="mt-2 whitespace-pre-wrap text-sm">{line.answer || <span className="text-text-muted">No answer given</span>}</p></div><div className="border-t border-border p-4 md:border-t-0"><p className="font-mono text-[11px] uppercase tracking-widest text-text-muted">Feedback</p><p className="mt-2 text-sm">{line.note}</p><div className="mt-3 h-2 overflow-hidden rounded-full bg-bg-secondary"><div className="h-full bg-text-primary" style={{ width: `${Math.round(line.got / Math.max(1, line.question.marks) * 100)}%` }} /></div></div></div></article>)}</div> : <ResultSummary result={result} percent={percent} />}
  </div>;
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
                    <p key={chapter.topic_key} className="mt-2 text-sm">✓ {chapter.chapter}</p>
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
              {evaluation.chapters.map((chapter) => (
                <li key={chapter.topic_key} className="flex items-center gap-2 text-sm">
                  <span
                    className={cn("h-2 w-2 shrink-0 rounded-full", CHAPTER_STATUS_DOT[chapter.status])}
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
