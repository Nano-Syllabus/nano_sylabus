"use client";

import {
  AlertTriangle,
  FileCheck2,
  Lightbulb,
  ListChecks,
  LoaderCircle,
  Maximize2,
  Minimize2,
  Target,
  Upload,
  X,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useContext, useEffect, useRef, useState, useTransition } from "react";
import { AppShellContext } from "@/components/app-shell-context";
import { Markdown } from "@/components/markdown";
import type { StudentChallengeDashboard } from "@/lib/data/student-challenge-dashboard";
import type {
  StudentChallengeDetail,
  StudentChallengeSummary,
} from "@/lib/data/student-challenges";
import type { PracticeEvaluation } from "@/lib/tenant/client";
import { useAppRefresh } from "@/lib/query/refresh";
import { useDashboardPatch } from "@/lib/query/dashboard";
import { applyChallengePassed, applyChallengeState } from "@/lib/challenges/local-updates";

const WEEKLY_CHALLENGE_TARGET = 15;
/** What the shell's top bar says when no challenge is open. Shared with the
 *  server page's own `SetAppShell`, so the two cannot disagree. */
export const CHALLENGE_HUB_TITLE = "Challenge Hub";

function challengeScore(challenge: StudentChallengeSummary) {
  if (!challenge.lastTotalMarks || challenge.lastScore === null) return null;
  return Math.max(0, Math.min(100, (challenge.lastScore / challenge.lastTotalMarks) * 100));
}

/** Advance through the daily queue in its displayed order, including a partly
 * completed challenge. Completing #1 should lead to unfinished #2, then #3. */
export function nextAvailableChallenge(
  challenges: StudentChallengeSummary[],
  currentChallenge: Pick<StudentChallengeSummary, "id" | "position">,
) {
  // A refresh removes a completed card from the dashboard list. Positions are
  // persisted with the daily queue, so they remain the reliable sequence even
  // when the just-completed card is no longer in `challenges`.
  const remaining = challenges
    .filter((challenge) => challenge.id !== currentChallenge.id && challenge.status !== "completed")
    .sort((left, right) => left.position - right.position);
  return (
    remaining.find((challenge) => challenge.position > currentChallenge.position) ??
    remaining[0] ??
    null
  );
}

type GradeResult = {
  question_id: string;
  chapter?: string;
  topic?: string;
  question?: string;
  marks: number;
  student_answer?: string;
  score: number;
  feedback: string;
};

/**
 * THREE STEPS, NOT SIX.
 *
 * The challenge used to be walked as six: prerequisites, reading, worked
 * example, practice question, submit, result. Six numbered stages to look at
 * before starting is a wall, and four of them were not decisions the student
 * makes — reading and worked examples are one act of learning, and question,
 * upload and result are one act of practising, split only by which request had
 * returned.
 *
 * So they are three, and each is a thing the student actually does:
 *
 *   1  See    what this topic gets asked
 *   2  Learn  the concepts, then the same questions worked
 *   3  Practise, hand in, and read the marking
 *
 * Progress is still recorded at the old granularity — `lessonRead` and
 * `examplesReviewed` are separate columns and separate API calls — because the
 * server's record of what a student has done should not be coarsened to match a
 * layout decision.
 */
type ChallengeStep = 1 | 2 | 3;

export function initialChallengeStep(challenge: StudentChallengeDetail): ChallengeStep {
  if (challenge.status === "completed") return 3;
  // Both halves of the learning step done: the next thing is to practise.
  if (challenge.examplesReviewed) return 3;
  // The reading is done but its worked examples are not, which is still step 2 —
  // it opens on the reading and the examples are below it.
  if (challenge.lessonRead) return 2;
  return 1;
}

function savedResults(challenge: StudentChallengeDetail): GradeResult[] {
  const questionsById = new Map(
    (challenge.content?.examQuestions ?? []).map((question) => [question.id, question]),
  );
  return (challenge.latestAttempt?.answers ?? []).map((answer) => ({
    question_id: answer.questionId,
    chapter: questionsById.get(answer.questionId)?.topic,
    topic: questionsById.get(answer.questionId)?.topic,
    question: questionsById.get(answer.questionId)?.question,
    score: answer.score,
    marks: questionsById.get(answer.questionId)?.marks ?? 0,
    student_answer: answer.answerText,
    feedback: answer.feedback,
  }));
}

function displayNumber(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(1).replace(/\.0$/, "");
}

function percentageValue(value: number) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  // The practice API reports some percentages as ratios (0..1), while older
  // responses use the already-expanded 0..100 form. Keep either shape honest.
  return Math.abs(numeric) <= 1 ? numeric * 100 : numeric;
}

function displayPercent(value: number) {
  return `${displayNumber(percentageValue(value))}%`;
}

function topicPercentage(topic: PracticeEvaluation["chapters"][number]) {
  const value =
    topic.marks > 0 ? (topic.score / topic.marks) * 100 : percentageValue(topic.percentage);
  return Math.max(0, Math.min(100, value));
}

function topicStatusLabel(status: PracticeEvaluation["chapters"][number]["status"]) {
  return status === "not_attempted"
    ? "Not attempted"
    : status === "strong"
      ? "Strong"
      : status === "weak"
        ? "Needs practice"
        : "Developing";
}

function topicStatusClass(status: PracticeEvaluation["chapters"][number]["status"]) {
  return status === "strong"
    ? "bg-success/10 text-success"
    : status === "weak"
      ? "bg-warning/10 text-warning"
      : status === "not_attempted"
        ? "bg-bg-secondary text-text-muted"
        : "bg-blue-500/10 text-blue-700 dark:text-blue-300";
}

async function apiJson<T>(response: Response): Promise<T> {
  const payload = (await response.json().catch(() => ({}))) as T & { error?: string };
  if (!response.ok) throw new Error(payload.error || "Request failed.");
  return payload;
}

/**
 * The placeholder for a step whose content is genuinely still being built.
 *
 * Only the unknown part is a skeleton — the heading, the instruction line and
 * the step rail above it are all real and stay put. The bars are `bg-border`
 * because that token reads as an absent line in both themes; `bg-bg-secondary`
 * disappears against the card it sits on.
 */
function ChallengeBuildingNotice({ label, lines = 2 }: { label: string; lines?: number }) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="mt-6 rounded-xl border border-border bg-bg-secondary p-5"
    >
      <p className="flex items-center gap-2 text-sm font-medium text-text-secondary">
        <LoaderCircle
          className="size-4 animate-spin motion-reduce:animate-none"
          aria-hidden="true"
        />
        {label}
      </p>
      <div className="mt-4 space-y-2" aria-hidden="true">
        {Array.from({ length: lines }, (_, index) => (
          <div
            key={index}
            className="h-3 animate-pulse rounded bg-border motion-reduce:animate-none"
            style={{ width: `${100 - index * 12}%` }}
          />
        ))}
      </div>
      <p className="mt-4 text-xs text-text-muted">
        Keep reading — this appears here on its own when it is ready.
      </p>
    </div>
  );
}

function ChallengeBuildFailure({
  message,
  retrying,
  onRetry,
}: {
  message: string;
  retrying: boolean;
  onRetry: () => void;
}) {
  return (
    <div className="mt-6 rounded-xl border border-warning/40 bg-warning/10 p-5">
      <p className="text-sm font-semibold">This part of the challenge could not be prepared.</p>
      <p className="mt-1 text-sm text-text-secondary">{message}</p>
      <button
        type="button"
        disabled={retrying}
        onClick={onRetry}
        className="mt-4 min-h-10 rounded-lg bg-text-primary px-5 text-sm font-semibold text-text-inverse focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 focus-visible:ring-offset-bg-secondary disabled:cursor-not-allowed disabled:opacity-50"
      >
        {retrying ? "Trying again…" : "Try again"}
      </button>
    </div>
  );
}

function ChallengeDetail({
  challenge,
  onBack,
  onChange,
  onHubPatch,
  nextChallenge,
  onNext,
  canRestart,
}: {
  challenge: StudentChallengeDetail;
  onBack: () => void;
  onChange: (challenge: StudentChallengeDetail) => void;
  /**
   * Moves the hub's own counters in place. This replaces `refreshApp()` on
   * every write path here — see lib/challenges/local-updates.ts for why a
   * refresh was too blunt an instrument.
   */
  onHubPatch: (patch: (d: StudentChallengeDashboard) => StudentChallengeDashboard) => void;
  nextChallenge: StudentChallengeSummary | null;
  onNext: () => Promise<boolean>;
  /** Resolved on the server from the restart allowlist. Drawing the button is
   *  all this decides — `POST /restart` checks the same list for itself. */
  canRestart: boolean;
}) {
  const router = useRouter();
  // Patches the cached dashboard in place, keyed the same way the page reads it.
  const dashboardPatch = useDashboardPatch();
  const { setSidebarSuppressed } = useContext(AppShellContext);
  const enterFocusButtonRef = useRef<HTMLButtonElement>(null);
  const exitFocusButtonRef = useRef<HTMLButtonElement>(null);
  const answerSheetInputRef = useRef<HTMLInputElement>(null);
  const focusModeWasActiveRef = useRef(false);
  const previousChallengeIdRef = useRef(challenge.id);
  const incomingStep = initialChallengeStep(challenge);
  const isCompletedChallenge = challenge.status === "completed";
  const [focusMode, setFocusMode] = useState(false);
  const [activeStep, setActiveStep] = useState<ChallengeStep>(() => incomingStep);
  const [savingStep, setSavingStep] = useState<"lesson" | "examples" | null>(null);
  const [scanFile, setScanFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [restarting, setRestarting] = useState(false);
  const [openingNext, setOpeningNext] = useState(false);
  const [noNextAvailable, setNoNextAvailable] = useState(false);
  const [error, setError] = useState("");
  const [results, setResults] = useState<GradeResult[]>(() => savedResults(challenge));
  const [evaluation, setEvaluation] = useState<PracticeEvaluation | null>(
    () => challenge.latestAttempt?.evaluation ?? null,
  );
  const [score, setScore] = useState<{ earned: number; total: number; passed: boolean } | null>(
    () =>
      challenge.status === "completed" && challenge.lastScore !== null && challenge.lastTotalMarks
        ? { earned: challenge.lastScore, total: challenge.lastTotalMarks, passed: true }
        : null,
  );
  const [clock, setClock] = useState(() => Date.now());
  const [retryingContent, setRetryingContent] = useState(false);
  const content = challenge.content;
  /**
   * `pending` means the worked examples and the exam are still being built. It
   * is a fact about two SECTIONS, never about the whole screen — the past
   * questions and the reading the student is looking at are finished.
   */
  const contentPending = content?.contentStatus;
  const buildingRest = contentPending === "pending" && !content?.contentError;
  const buildFailed = contentPending === "pending" ? content?.contentError || "" : "";

  useEffect(() => {
    setSidebarSuppressed(focusMode);
    return () => setSidebarSuppressed(false);
  }, [focusMode, setSidebarSuppressed]);

  useEffect(() => {
    if (!focusMode) return;
    exitFocusButtonRef.current?.focus();
    const exitOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setFocusMode(false);
    };
    window.addEventListener("keydown", exitOnEscape);
    return () => window.removeEventListener("keydown", exitOnEscape);
  }, [focusMode]);

  useEffect(() => {
    if (focusMode) {
      focusModeWasActiveRef.current = true;
      return;
    }
    if (focusModeWasActiveRef.current) {
      focusModeWasActiveRef.current = false;
      enterFocusButtonRef.current?.focus();
    }
  }, [focusMode]);

  useEffect(() => {
    if (challenge.status === "completed" || !content?.examExpiresAt) return;
    const timer = window.setInterval(() => setClock(Date.now()), 1_000);
    return () => window.clearInterval(timer);
  }, [challenge.status, content?.examExpiresAt]);

  /**
   * Wait for the half of the challenge that `/start` did not block on.
   *
   * The server hands back the lesson as soon as it is written and finishes the
   * worked examples and the exam behind the response, which is what took the
   * open from about thirty seconds down to the reading. That work lands while
   * the student is on step one or two, so this asks a row-read endpoint for it
   * rather than making them wait for a screen they are not looking at.
   *
   * It is NOT a refresh of anything already on screen: the poll stops the moment
   * the row reports `ready`, and the only thing it ever replaces is content this
   * client knows to be incomplete.
   */
  useEffect(() => {
    if (contentPending !== "pending") return;
    let cancelled = false;
    let attempt = 0;
    let timer = 0;
    // Chained timeouts rather than an interval: the delay has to widen as the
    // wait goes on, and an interval fixes its period at the moment it is armed.
    // Tight while the build is plausibly still running, slow after that, and it
    // gives up rather than polling a tab someone left open all afternoon.
    const schedule = () => {
      if (cancelled || attempt >= 40) return;
      timer = window.setTimeout(() => void tick(), attempt < 10 ? 1_500 : 5_000);
    };
    const tick = async () => {
      attempt += 1;
      try {
        const response = await fetch(`/api/student/challenges/${challenge.id}/content`);
        const payload = (await response.json().catch(() => ({}))) as {
          challenge?: StudentChallengeDetail;
        };
        if (cancelled) return;
        const next = response.ok ? payload.challenge?.content : null;
        if (next && (next.contentStatus === "ready" || next.contentError)) {
          onChange(payload.challenge as StudentChallengeDetail);
          return;
        }
      } catch {
        // A dropped poll is not worth surfacing; the next tick asks again.
      }
      schedule();
    };
    schedule();
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [challenge.id, contentPending, onChange]);

  useEffect(() => {
    if (challenge.status !== "completed" || !challenge.latestAttempt) return;
    const restoredResults = savedResults(challenge);
    if (restoredResults.length) setResults(restoredResults);
    if (challenge.latestAttempt.evaluation) setEvaluation(challenge.latestAttempt.evaluation);
    if (challenge.lastScore !== null && challenge.lastTotalMarks) {
      setScore({ earned: challenge.lastScore, total: challenge.lastTotalMarks, passed: true });
    }
  }, [challenge]);

  // The detail component remains mounted when Next changes the selected card.
  // Reset local navigation and answer state for that new challenge instead of
  // carrying the previous challenge's submission screen forward.
  useEffect(() => {
    if (previousChallengeIdRef.current === challenge.id) return;
    previousChallengeIdRef.current = challenge.id;
    setActiveStep(incomingStep);
    setScanFile(null);
    setError("");
    setClock(Date.now());
    setResults(isCompletedChallenge ? savedResults(challenge) : []);
    setEvaluation(isCompletedChallenge ? (challenge.latestAttempt?.evaluation ?? null) : null);
    setScore(
      isCompletedChallenge && challenge.lastScore !== null && challenge.lastTotalMarks
        ? { earned: challenge.lastScore, total: challenge.lastTotalMarks, passed: true }
        : null,
    );
  }, [challenge, challenge.id, incomingStep, isCompletedChallenge]);

  if (!content) return null;

  const retryContentBuild = async () => {
    setRetryingContent(true);
    setError("");
    try {
      const payload = await apiJson<{ challenge: StudentChallengeDetail }>(
        await fetch(`/api/student/challenges/${challenge.id}/content?retry=1`),
      );
      onChange(payload.challenge);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not prepare this challenge.");
    } finally {
      setRetryingContent(false);
    }
  };

  const markStep = async (step: "lesson" | "examples") => {
    setSavingStep(step);
    setError("");
    try {
      const payload = await apiJson<{ challenge: StudentChallengeDetail }>(
        await fetch(`/api/student/challenges/${challenge.id}/progress`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ step }),
        }),
      );
      onChange(payload.challenge);
      return true;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not save progress.");
      return false;
    } finally {
      setSavingStep(null);
    }
  };

  const submitScan = async () => {
    if (!scanFile) return;
    setSubmitting(true);
    setError("");
    try {
      const form = new FormData();
      form.set("file", scanFile);
      const response = await fetch(`/api/student/challenges/${challenge.id}/submit-file`, {
        method: "POST",
        body: form,
      });
      const payload = (await response.json().catch(() => ({}))) as {
        challenge: StudentChallengeDetail;
        results: GradeResult[];
        evaluation?: PracticeEvaluation;
        totalScore: number;
        totalMarks: number;
        passed: boolean;
        error?: string;
      };
      if (!response.ok) {
        if (payload.challenge) onChange(payload.challenge);
        throw new Error(payload.error || "Could not grade the handwritten answer.");
      }
      setResults(payload.results);
      setEvaluation(payload.evaluation ?? null);
      setScore({ earned: payload.totalScore, total: payload.totalMarks, passed: payload.passed });
      setScanFile(null);
      onChange(payload.challenge);
      setActiveStep(3);
      /**
       * Move the dashboard's numbers here, in this tick, with no request.
       *
       * The student has just finished the thing the dashboard measures, so the
       * streak, the "Today" count and today's calendar cell all change — and
       * this is precisely the moment they will look at them. Refetching would
       * mean a two-second reload of the whole screen to show a number this
       * client already knows.
       *
       * The hub's own copy of those numbers moves here too. Both screens show
       * the streak and today's count, so patching one and refreshing the other
       * would have them disagree for as long as the refresh took.
       */
      if (payload.passed) {
        dashboardPatch.completed({ challengeId: payload.challenge?.id });
        onHubPatch((d) => applyChallengePassed(d, payload.challenge?.id));
      } else {
        dashboardPatch.attempted();
        onHubPatch((d) => applyChallengeState(d, payload.challenge));
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not grade the handwritten answer.");
    } finally {
      setSubmitting(false);
    }
  };

  const expiresAt = Date.parse(content.examExpiresAt || "");
  const remainingSeconds = Number.isFinite(expiresAt)
    ? Math.max(0, Math.ceil((expiresAt - clock) / 1_000))
    : null;
  const examExpired = remainingSeconds === 0;
  const timeRemaining =
    remainingSeconds === null
      ? null
      : `${Math.floor(remainingSeconds / 60)}:${String(remainingSeconds % 60).padStart(2, "0")}`;

  const refreshExam = async () => {
    setSubmitting(true);
    setError("");
    try {
      const payload = await apiJson<{ challenge: StudentChallengeDetail }>(
        await fetch(`/api/student/challenges/${challenge.id}/start`, { method: "POST" }),
      );
      setResults([]);
      setEvaluation(null);
      setScore(null);
      setScanFile(null);
      setClock(Date.now());
      onChange(payload.challenge);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not issue a fresh exam.");
    } finally {
      setSubmitting(false);
    }
  };

  const restartChallenge = async () => {
    setRestarting(true);
    setError("");
    try {
      const payload = await apiJson<{ challenge: StudentChallengeDetail }>(
        await fetch(`/api/student/challenges/${challenge.id}/restart`, { method: "POST" }),
      );
      setResults([]);
      setEvaluation(null);
      setScore(null);
      setClock(Date.now());
      setActiveStep(initialChallengeStep(payload.challenge));
      onChange(payload.challenge);
      onHubPatch((d) => applyChallengeState(d, payload.challenge));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not restart this challenge.");
    } finally {
      setRestarting(false);
    }
  };

  const openNextChallenge = async () => {
    setOpeningNext(true);
    setError("");
    try {
      const opened = await onNext();
      if (!opened) setError("Could not open the next challenge. Try again.");
      else setNoNextAvailable(false);
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "Could not open the next challenge.";
      setError(message);
      if (message.includes("All currently extracted topics")) setNoNextAvailable(true);
    } finally {
      setOpeningNext(false);
    }
  };

  const goNext = async () => {
    if (activeStep === 1) {
      setActiveStep(2);
      return;
    }
    if (activeStep === 2) {
      // Never record examples the student was not shown, whatever the button did.
      if (buildingRest) return;
      // One step to the student, two rows to the server. Both are recorded on
      // the way out, in order, and a failure on either leaves the student where
      // they are rather than advancing on a half-saved record.
      if (!challenge.lessonRead && !(await markStep("lesson"))) return;
      if (!challenge.examplesReviewed && !(await markStep("examples"))) return;
      setActiveStep(3);
    }
  };

  const steps = [
    {
      number: 1,
      label: "Past Questions",
      complete: activeStep > 1 || challenge.lessonRead,
    },
    {
      number: 2,
      label: "Learn",
      complete: challenge.lessonRead && challenge.examplesReviewed,
    },
    { number: 3, label: "Practice", complete: challenge.status === "completed" },
  ] as const;

  const activeWarning =
    activeStep === 1
      ? [...(content.pastQuestionBlockers || []), ...(content.pastQuestionWarnings || [])]
          .filter(Boolean)
          .join(" ")
      : activeStep === 2
        ? // The reading and the worked examples are one step now, so their two
          // warnings are one line rather than one each on screens the student
          // never sees separately.
          [content.learningWarning, content.solvedWarning || content.warning]
            .filter(Boolean)
            .join(" ")
        : content.examWarning;

  const resultEvaluation = evaluation ?? challenge.latestAttempt?.evaluation ?? null;
  const resultPercentage =
    resultEvaluation?.percentage ??
    (score && score.total > 0 ? (score.earned / score.total) * 100 : 0);
  const resultQuestionCount =
    resultEvaluation?.questions ?? (results.length || content.examQuestions.length);
  const resultAnsweredCount =
    resultEvaluation?.questions_answered ??
    results.filter((result) => Boolean(result.student_answer?.trim())).length;
  const resultMarksLost =
    resultEvaluation?.marks_lost ?? (score ? Math.max(0, score.total - score.earned) : 0);
  const resultReady = activeStep === 3 && Boolean(score && challenge.status === "completed");

  const focusButtonClass =
    "min-h-10 rounded-lg px-5 text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 focus-visible:ring-offset-bg-secondary disabled:cursor-not-allowed disabled:opacity-50";

  // Built once and placed twice: along the top in the hub layout, and down the
  // right-hand rail in focus mode. One definition is the only way the two cannot
  // drift apart.
  const timerBox = (
    <div
      aria-label={timeRemaining ? `${timeRemaining} remaining` : "Challenge timer"}
      className="min-w-20 rounded-lg border border-border bg-card px-3 py-2 text-center font-mono text-sm font-semibold tabular-nums"
    >
      {challenge.status === "completed"
        ? "Done"
        : timeRemaining || `${challenge.durationMinutes}:00`}
    </div>
  );

  const focusToggle = (
    <button
      ref={focusMode ? exitFocusButtonRef : enterFocusButtonRef}
      type="button"
      aria-pressed={focusMode}
      aria-label={focusMode ? "Exit focus mode" : "Enter focus mode"}
      title={focusMode ? "Exit focus mode (Esc)" : "Enter focus mode"}
      onClick={() => setFocusMode((current) => !current)}
      className={`${focusButtonClass} inline-flex items-center justify-center gap-2 border border-border bg-card px-3 text-text-primary hover:bg-bg-secondary`}
    >
      {focusMode ? (
        <Minimize2 className="size-4" aria-hidden="true" />
      ) : (
        <Maximize2 className="size-4" aria-hidden="true" />
      )}
      <span className="hidden md:inline">{focusMode ? "Exit focus" : "Focus mode"}</span>
    </button>
  );

  const selectStep = (step: ChallengeStep, complete: boolean) => {
    if (step <= activeStep || complete) setActiveStep(step);
  };

  return (
    <main
      className={
        focusMode
          ? "fixed inset-0 z-[60] w-full overflow-y-auto overscroll-contain bg-bg-primary text-text-primary"
          : "min-h-screen w-full bg-bg-secondary text-text-primary"
      }
    >
      {/*
        FOCUS MODE PUTS NOTHING ABOVE THE READING.
        ------------------------------------------
        It used to open with a sticky header carrying the topic, the clock and the
        exit button — a band across the top of a screen whose entire purpose is to
        hold one column of text. Both pieces are still reachable, but they are
        overlaid at the sides now: what you are working on to the LEFT, the clock
        and the way out to the RIGHT, the reading itself in the middle with the
        full height of the window to itself.

        The rails are fixed, so they cost the reading no layout space; the content
        wrapper reserves their width with padding rather than letting them sit on
        top of the text. Below `lg` there is no room for either, so both collapse
        to small floating chips and the reading keeps the full width.
      */}
      {focusMode ? (
        <>
          <aside
            aria-label="What you are working on"
            className="fixed left-0 top-0 z-10 hidden h-full w-60 flex-col gap-3 overflow-y-auto p-4 lg:flex"
          >
            <div className="rounded-2xl border border-border bg-card/90 p-4 backdrop-blur">
              <p className="truncate text-xs font-semibold uppercase tracking-wide text-blue-600 dark:text-blue-400">
                {challenge.subjectName}
              </p>
              <h1 className="mt-1 font-display text-lg font-semibold leading-6">
                {challenge.title}
              </h1>
            </div>
            <nav
              aria-label="Challenge progress"
              className="rounded-2xl border border-border bg-card/90 p-2 backdrop-blur"
            >
              <ol className="space-y-0.5">
                {steps.map((step) => {
                  const isActive = activeStep === step.number;
                  return (
                    <li key={step.number}>
                      <button
                        type="button"
                        aria-current={isActive ? "step" : undefined}
                        onClick={() => selectStep(step.number, step.complete)}
                        className={`flex min-h-10 w-full items-center gap-2.5 rounded-lg px-2 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
                          isActive ? "bg-blue-500/10" : "hover:bg-bg-secondary"
                        }`}
                      >
                        <span
                          className={`grid size-6 shrink-0 place-items-center rounded-full text-[11px] font-bold ${
                            step.complete
                              ? "bg-success text-white"
                              : isActive
                                ? "bg-blue-600 text-white"
                                : "bg-bg-secondary text-text-muted"
                          }`}
                        >
                          {step.complete ? "✓" : step.number}
                        </span>
                        <span
                          className={`truncate text-xs font-semibold ${isActive ? "text-blue-600 dark:text-blue-400" : "text-text-muted"}`}
                        >
                          {step.label}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ol>
            </nav>
          </aside>

          <aside
            aria-label="Timer and focus mode"
            className="fixed right-0 top-0 z-10 flex flex-col items-end gap-2 p-3 sm:p-4 lg:w-52"
          >
            {timerBox}
            {focusToggle}
          </aside>

          <div className="pointer-events-none fixed left-0 top-0 z-10 max-w-[52%] p-3 lg:hidden">
            <div className="pointer-events-auto rounded-xl border border-border bg-card/90 px-3 py-2 backdrop-blur">
              <p className="truncate text-xs font-semibold text-text-primary">{challenge.title}</p>
              <p className="mt-0.5 text-[11px] text-text-muted">
                Step {activeStep} of {steps.length} · {steps[activeStep - 1]?.label}
              </p>
            </div>
          </div>
        </>
      ) : null}

      <div
        className={
          focusMode
            ? "px-4 pb-32 pt-24 sm:px-8 lg:pl-64 lg:pr-56 lg:pt-8"
            : "mx-auto max-w-5xl px-4 py-6 pb-16 sm:px-8"
        }
      >
        <div className={focusMode ? "mx-auto w-full max-w-2xl" : ""}>
          {!focusMode ? (
            <>
              <header className="flex items-start justify-between gap-4">
                <button
                  type="button"
                  onClick={onBack}
                  className={`${focusButtonClass} border border-border bg-card text-text-primary hover:bg-bg-primary`}
                >
                  ← Back
                </button>
                <div className="flex items-center justify-end gap-2">
                  {timerBox}
                  {focusToggle}
                </div>
              </header>

              {/* The topic, on its own row and nothing else.
                  It used to be the middle column of a three-column grid, so the
                  heading was capped between the Back button and the timer and
                  truncated there, and a second mobile-only copy repeated it below
                  with the subject eyebrow above both. One row under the controls is
                  the same markup at every breakpoint and has the full width to use. */}
              <h1 className="mt-5 font-display text-xl font-semibold">{challenge.title}</h1>

              <nav
                aria-label="Challenge progress"
                className="mt-6 rounded-2xl border border-border bg-card px-3 py-4 sm:px-6"
              >
                <ol className="grid grid-cols-3">
                  {steps.map((step, index) => {
                    const isActive = activeStep === step.number;
                    return (
                      <li
                        key={step.number}
                        className="relative flex min-w-0 flex-col items-center text-center"
                      >
                        {index < steps.length - 1 ? (
                          <span
                            aria-hidden="true"
                            className={`absolute left-[calc(50%+18px)] right-[calc(-50%+18px)] top-4 h-px ${step.complete ? "bg-success" : "bg-border"}`}
                          />
                        ) : null}
                        <button
                          type="button"
                          aria-current={isActive ? "step" : undefined}
                          onClick={() => selectStep(step.number, step.complete)}
                          className="relative z-10 flex min-h-10 min-w-10 flex-col items-center gap-1 rounded-lg px-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                        >
                          <span
                            className={`grid size-8 place-items-center rounded-full text-xs font-bold ${
                              step.complete
                                ? "bg-success text-white"
                                : isActive
                                  ? "bg-blue-600 text-white"
                                  : "bg-bg-secondary text-text-muted"
                            }`}
                          >
                            {step.complete ? "✓" : step.number}
                          </span>
                          <span
                            className={`hidden text-xs font-semibold sm:block ${isActive ? "text-blue-600 dark:text-blue-400" : "text-text-muted"}`}
                          >
                            {step.label}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ol>
              </nav>
            </>
          ) : null}

          <section
            className={`mt-6 bg-card p-5 sm:p-8 ${focusMode ? "rounded-xl" : "rounded-2xl border border-border"}`}
          >
            {activeStep === 1 ? (
              <div>
                <div className="flex items-start gap-3">
                  <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-400">
                    <ListChecks className="size-5" aria-hidden="true" />
                  </span>
                  <div>
                    <h2 className="text-xl font-semibold">Past Questions</h2>
                    <p className="mt-1 max-w-prose text-sm leading-6 text-text-muted">
                      What {challenge.subjectName} has actually asked on this topic. Read them first
                      — you are not meant to be able to answer them yet.
                    </p>
                  </div>
                </div>
                {content.pastQuestions?.length ? (
                  <div className="mt-6 space-y-4">
                    <ol className="space-y-3">
                      {content.pastQuestions.map((pastQuestion, index) => (
                        <li
                          key={pastQuestion.id}
                          className="rounded-xl border border-border bg-bg-secondary p-4 sm:p-5"
                        >
                          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs font-semibold uppercase tracking-wide text-text-muted">
                            <span className="text-blue-600 dark:text-blue-400">
                              Question {index + 1}
                            </span>
                            {/* Year and marks are printed only when a real paper printed
                              them. An absent year is not a gap to fill in. */}
                            {pastQuestion.year ? <span>· {pastQuestion.year}</span> : null}
                            {pastQuestion.marks ? (
                              <span>· {displayNumber(pastQuestion.marks)} marks</span>
                            ) : null}
                          </div>
                          <Markdown
                            text={pastQuestion.question}
                            className="mt-2 max-w-prose text-sm font-semibold leading-6 text-text-primary"
                          />
                        </li>
                      ))}
                    </ol>

                    <div className="rounded-xl bg-blue-500/10 p-4">
                      <p className="text-xs font-semibold uppercase tracking-wide text-blue-600 dark:text-blue-400">
                        What to do with these
                      </p>
                      <p className="mt-1 max-w-prose text-sm leading-6 text-text-secondary">
                        Notice what they keep asking for. The reading next teaches exactly that, and
                        the worked solutions come after it.
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="mt-6 rounded-xl border border-border bg-bg-secondary p-5">
                    <p className="inline-flex items-center gap-2 text-sm font-semibold text-text-primary">
                      <AlertTriangle className="size-4 text-warning" aria-hidden="true" />
                      No past question on this topic is indexed yet
                    </p>
                    <p className="mt-1 max-w-prose text-sm leading-6 text-text-secondary">
                      Nothing in this course&apos;s question bank has been set on it. Continue to
                      the concept reading — the challenge still runs from the course notes.
                    </p>
                  </div>
                )}
              </div>
            ) : null}

            {activeStep === 2 ? (
              <div>
                {/* Which topic this is, above the section label: the page heading
                    is a scroll away by the time the reading is open, and "Key
                    Concepts" alone does not say concepts of WHAT. */}
                <p className="text-sm font-semibold text-text-muted">{challenge.topicTitle}</p>
                <h2 className="mt-1 text-xl font-semibold">📘 Key Concepts</h2>
                <p className="mt-2 text-sm text-text-muted">
                  Understand the idea first, then read it applied. The worked example below makes
                  sense on its own once the concepts do.
                </p>
                {/* The one sentence the topic reduces to, given the weight it deserves:
                  it is what a student reconstructs the rest from. Absent on a reading
                  written before the concept-led rewrite, so it is never assumed. */}
                {content.lesson.bigIdea ? (
                  <div className="mt-6 flex items-start gap-3 rounded-xl border border-blue-500/30 bg-blue-500/10 p-4 sm:p-5">
                    <Lightbulb
                      className="mt-0.5 size-5 shrink-0 text-blue-600 dark:text-blue-400"
                      aria-hidden="true"
                    />
                    <div className="min-w-0">
                      <p className="text-xs font-semibold uppercase tracking-wide text-blue-600 dark:text-blue-400">
                        The idea
                      </p>
                      <Markdown
                        text={content.lesson.bigIdea}
                        className="mt-1 max-w-prose text-sm font-medium leading-6 text-text-primary"
                      />
                    </div>
                  </div>
                ) : null}
                <h3 className="mt-6 text-base font-semibold">{content.lesson.title}</h3>
                <div className="mt-3 space-y-3">
                  {content.lesson.content.map((paragraph, index) => (
                    <Markdown
                      key={`${paragraph}-${index}`}
                      text={paragraph}
                      className="max-w-prose text-sm leading-7 text-text-secondary"
                    />
                  ))}
                </div>
                {content.lesson.connections?.length ? (
                  <section className="mt-5 rounded-xl border border-border bg-bg-secondary p-4 sm:p-5">
                    <p className="text-xs font-semibold uppercase tracking-wide text-text-muted">
                      How this connects
                    </p>
                    <ul className="mt-3 space-y-2">
                      {content.lesson.connections.map((connection, index) => (
                        <li key={`${connection}-${index}`} className="flex gap-2">
                          <span aria-hidden="true" className="text-text-muted">
                            ·
                          </span>
                          <Markdown
                            text={connection}
                            className="max-w-prose text-sm leading-6 text-text-secondary"
                          />
                        </li>
                      ))}
                    </ul>
                  </section>
                ) : null}
                <div className="mt-5 rounded-xl bg-blue-500/10 p-4">
                  <p className="text-sm font-semibold">Core focus</p>
                  <Markdown
                    text={content.lesson.focus}
                    className="mt-1 text-sm leading-6 text-text-secondary"
                  />
                </div>
                {content.lesson.sources?.length ? (
                  <p className="mt-5 text-xs text-text-muted">
                    Grounded in {content.lesson.sources.length} uploaded course{" "}
                    {content.lesson.sources.length === 1 ? "source" : "sources"}.
                  </p>
                ) : null}

                <div className="mt-8 border-t border-border pt-8">
                  <h2 className="text-xl font-semibold">✅ Solved Example</h2>
                  <p className="mt-2 text-sm text-text-muted">
                    The same kind of question, worked end to end. Follow it before trying one
                    yourself.
                  </p>
                  {content.solvedExamples.length ? (
                    <div className="mt-6 space-y-4">
                      {content.solvedExamples.map((example, index) => (
                        <article
                          key={`${example.question}-${index}`}
                          className="rounded-xl border border-border bg-bg-secondary p-5"
                        >
                          <p className="text-xs font-semibold uppercase tracking-wide text-text-muted">
                            Example {index + 1} · {example.marks} marks
                          </p>
                          <Markdown
                            text={example.question}
                            className="mt-3 text-sm font-semibold leading-6"
                          />
                          <div className="mt-4 rounded-lg bg-card p-4 text-sm leading-7 text-text-secondary">
                            <strong className="text-text-primary">Solution</strong>
                            <Markdown
                              text={example.solution}
                              className="mt-1 whitespace-pre-wrap text-text-secondary"
                            />
                          </div>
                        </article>
                      ))}
                    </div>
                  ) : buildingRest ? (
                    <ChallengeBuildingNotice
                      label="Working the past questions for this topic…"
                      lines={3}
                    />
                  ) : buildFailed ? (
                    <ChallengeBuildFailure
                      message={buildFailed}
                      retrying={retryingContent}
                      onRetry={() => void retryContentBuild()}
                    />
                  ) : (
                    <div className="mt-6 rounded-xl border border-border bg-bg-secondary p-5 text-sm text-text-muted">
                      No solved example is available for this topic yet.
                    </div>
                  )}
                </div>
              </div>
            ) : null}

            {activeStep === 3 ? (
              <div>
                <h2 className="text-xl font-semibold">📝 Your Turn</h2>
                <p className="mt-2 text-sm text-text-muted">
                  {challenge.status === "completed"
                    ? "Review the questions and feedback from your completed attempt."
                    : "Answer on paper as Q1, Q2, and so on, then upload the sheet below."}
                </p>
                {challenge.status === "completed" && !challenge.latestAttempt ? (
                  <div className="mt-5 rounded-xl border border-warning/40 bg-warning/10 p-4 text-sm text-text-secondary">
                    This result is saved, but its answer details are unavailable for review.
                  </div>
                ) : null}
                {content.examQuestions.length ? (
                  <div className="mt-6 space-y-5">
                    {content.examQuestions.map((question, index) => (
                      <article key={question.id} className="rounded-xl bg-bg-secondary p-5">
                        <p className="text-xs font-semibold uppercase tracking-wide text-text-muted">
                          Question {index + 1} · {question.marks} marks
                        </p>
                        <Markdown
                          text={question.question}
                          className="mt-2 text-sm font-semibold leading-6"
                        />
                      </article>
                    ))}
                  </div>
                ) : buildingRest ? (
                  <ChallengeBuildingNotice label="Setting your questions from the course material…" />
                ) : buildFailed ? (
                  <ChallengeBuildFailure
                    message={buildFailed}
                    retrying={retryingContent}
                    onRetry={() => void retryContentBuild()}
                  />
                ) : (
                  <div className="mt-6 rounded-xl border border-border bg-bg-secondary p-5 text-sm text-text-muted">
                    No practice question is available. Go back and try another challenge.
                  </div>
                )}
                <p className="mt-5 text-sm text-text-muted">
                  💡{" "}
                  {timeRemaining
                    ? `You have ${timeRemaining} remaining.`
                    : `This challenge allows ${challenge.durationMinutes} minutes.`}
                </p>

                {/* Gone once the sitting is over: with the three sections stacked,
                    a completed challenge would otherwise carry an upload heading
                    with nothing underneath it. */}
                {challenge.status !== "completed" ? (
                  <div className="mt-8 border-t border-border pt-8">
                    <h2 className="text-xl font-semibold">📤 Submit Your Answer Sheet</h2>
                    <p className="mt-2 text-sm text-text-muted">
                      Upload one clear PDF or photo containing all numbered answers.
                    </p>
                    {examExpired ? (
                      <div className="mt-6 rounded-xl border border-warning/40 bg-warning/10 p-5">
                        <p className="text-sm font-semibold">This exam session expired.</p>
                        <button
                          type="button"
                          disabled={submitting}
                          onClick={() => void refreshExam()}
                          className={`${focusButtonClass} mt-4 bg-text-primary text-text-inverse`}
                        >
                          {submitting ? "Issuing…" : "Get a fresh exam"}
                        </button>
                      </div>
                    ) : null}
                    {!examExpired ? (
                      <div className="mt-6 space-y-4">
                        <div className="rounded-xl border-2 border-dashed border-blue-500 bg-blue-500/10 p-6 text-center sm:p-10">
                          <Upload
                            className="mx-auto size-8 text-blue-600 dark:text-blue-400"
                            aria-hidden="true"
                          />
                          <p className="mt-3 text-sm font-semibold">
                            Your complete handwritten answer sheet
                          </p>
                          <p className="mt-1 text-xs text-text-muted">
                            Number answers as Q1, Q2, and so on · PDF, JPG, PNG or WebP · maximum 20
                            MB
                          </p>
                          <input
                            ref={answerSheetInputRef}
                            id={`challenge-upload-${challenge.id}`}
                            type="file"
                            accept="application/pdf,image/jpeg,image/png,image/webp"
                            disabled={submitting}
                            onChange={(event) => {
                              const selected = event.target.files?.[0] || null;
                              if (selected && selected.size > 20 * 1024 * 1024) {
                                setScanFile(null);
                                setError("Upload an answer sheet up to 20 MB.");
                                event.currentTarget.value = "";
                                return;
                              }
                              setScanFile(selected);
                              setError("");
                            }}
                            className="sr-only"
                          />
                          {scanFile ? (
                            <div className="mx-auto mt-5 flex max-w-md items-center gap-3 rounded-xl border border-border bg-card p-3 text-left">
                              <FileCheck2
                                className="size-5 shrink-0 text-success"
                                aria-hidden="true"
                              />
                              <div className="min-w-0 flex-1">
                                <p className="truncate text-sm font-semibold">{scanFile.name}</p>
                                <p className="mt-0.5 text-xs text-text-muted">
                                  {(scanFile.size / (1024 * 1024)).toFixed(1)} MB · ready to submit
                                </p>
                              </div>
                              <button
                                type="button"
                                disabled={submitting}
                                onClick={() => {
                                  setScanFile(null);
                                  if (answerSheetInputRef.current)
                                    answerSheetInputRef.current.value = "";
                                }}
                                aria-label="Remove selected answer sheet"
                                className="inline-flex size-10 shrink-0 items-center justify-center rounded-lg text-text-muted hover:bg-bg-secondary hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                              >
                                <X className="size-4" aria-hidden="true" />
                              </button>
                            </div>
                          ) : null}
                          <button
                            type="button"
                            disabled={submitting}
                            onClick={() => {
                              if (!answerSheetInputRef.current) return;
                              answerSheetInputRef.current.value = "";
                              answerSheetInputRef.current.click();
                            }}
                            className={`${focusButtonClass} mt-5 inline-flex cursor-pointer items-center justify-center gap-2 border border-border bg-card text-text-primary hover:bg-bg-secondary`}
                          >
                            <Upload className="size-4" aria-hidden="true" />
                            {scanFile ? "Replace answer sheet" : "Choose answer sheet"}
                          </button>
                          <button
                            type="button"
                            aria-busy={submitting}
                            disabled={!scanFile || submitting}
                            onClick={() => void submitScan()}
                            className={`${focusButtonClass} mx-auto mt-3 block bg-blue-600 text-white`}
                          >
                            {submitting ? "Reading and grading…" : "Submit answer sheet"}
                          </button>
                        </div>
                      </div>
                    ) : null}
                  </div>
                ) : null}

                <div className="mt-8 border-t border-border pt-8">
                  <h2 className="text-xl font-semibold">📊 Challenge Result</h2>
                  <p className="mt-2 text-sm text-text-muted">
                    Your handwritten answer sheet has been read and graded against this challenge.
                  </p>
                  {score ? (
                    <div className="mt-6 space-y-6">
                      <div
                        className={`rounded-xl border p-5 sm:p-6 ${score.passed ? "border-success/40 bg-success/10" : "border-warning/40 bg-warning/10"}`}
                      >
                        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
                          <div>
                            <p className="text-xs font-semibold uppercase tracking-wide text-text-muted">
                              Your score
                            </p>
                            <p className="mt-1 font-mono text-4xl font-bold tabular-nums text-text-primary">
                              {displayNumber(score.earned)}{" "}
                              <span className="text-lg font-semibold text-text-muted">
                                / {displayNumber(score.total)}
                              </span>
                            </p>
                          </div>
                          <p
                            className={`text-sm font-semibold ${score.passed ? "text-success" : "text-warning"}`}
                          >
                            {score.passed ? "Challenge passed · +50 XP ✓" : "Not passed yet"}
                          </p>
                        </div>

                        <div className="mt-6 grid gap-3 border-t border-border/70 pt-5 sm:grid-cols-3">
                          <div className="rounded-lg bg-card/80 p-3">
                            <p className="text-xs font-semibold uppercase tracking-wide text-text-muted">
                              Percentage
                            </p>
                            <p className="mt-1 font-mono text-xl font-semibold tabular-nums text-text-primary">
                              {displayPercent(resultPercentage)}
                            </p>
                          </div>
                          <div className="rounded-lg bg-card/80 p-3">
                            <p className="text-xs font-semibold uppercase tracking-wide text-text-muted">
                              Questions answered
                            </p>
                            <p className="mt-1 font-mono text-xl font-semibold tabular-nums text-text-primary">
                              {resultAnsweredCount}{" "}
                              <span className="text-sm text-text-muted">
                                / {resultQuestionCount}
                              </span>
                            </p>
                          </div>
                          <div className="rounded-lg bg-card/80 p-3">
                            <p className="text-xs font-semibold uppercase tracking-wide text-text-muted">
                              Marks lost
                            </p>
                            <p className="mt-1 font-mono text-xl font-semibold tabular-nums text-text-primary">
                              {displayNumber(resultMarksLost)}
                            </p>
                          </div>
                        </div>
                      </div>

                      {resultEvaluation ? (
                        <>
                          {resultEvaluation.strong_topics.length ||
                          resultEvaluation.weak_topics.length ? (
                            <div className="grid gap-4 md:grid-cols-2">
                              {resultEvaluation.strong_topics.length ? (
                                <section className="rounded-xl border border-success/30 bg-success/5 p-5">
                                  <p className="text-xs font-semibold uppercase tracking-wide text-success">
                                    What you did well
                                  </p>
                                  <ul className="mt-3 space-y-3">
                                    {resultEvaluation.strong_topics.map((topic) => (
                                      <li
                                        key={`strong-${topic.topic_key || topic.chapter}`}
                                        className="flex items-start justify-between gap-3"
                                      >
                                        <span className="text-sm font-semibold text-text-primary">
                                          {topic.chapter}
                                        </span>
                                        <span className="shrink-0 font-mono text-xs font-semibold text-success">
                                          {displayPercent(topicPercentage(topic))}
                                        </span>
                                      </li>
                                    ))}
                                  </ul>
                                </section>
                              ) : null}

                              {resultEvaluation.weak_topics.length ? (
                                <section className="rounded-xl border border-warning/30 bg-warning/5 p-5">
                                  <p className="text-xs font-semibold uppercase tracking-wide text-warning">
                                    Focus next
                                  </p>
                                  <ul className="mt-3 space-y-3">
                                    {resultEvaluation.weak_topics.map((topic) => (
                                      <li
                                        key={`weak-${topic.topic_key || topic.chapter}`}
                                        className="flex items-start justify-between gap-3"
                                      >
                                        <span className="text-sm font-semibold text-text-primary">
                                          {topic.chapter}
                                        </span>
                                        <span className="shrink-0 text-right font-mono text-xs font-semibold text-warning">
                                          {displayNumber(topic.marks_lost)} lost
                                        </span>
                                      </li>
                                    ))}
                                  </ul>
                                </section>
                              ) : null}
                            </div>
                          ) : null}

                          {resultEvaluation.chapters.length ? (
                            <section className="rounded-xl border border-border bg-bg-secondary p-5">
                              <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
                                <div>
                                  <p className="text-xs font-semibold uppercase tracking-wide text-text-muted">
                                    Chapter performance
                                  </p>
                                  <h3 className="mt-1 text-base font-semibold text-text-primary">
                                    Where your marks went
                                  </h3>
                                </div>
                                <p className="text-xs text-text-muted">
                                  {resultEvaluation.chapters.length}{" "}
                                  {resultEvaluation.chapters.length === 1 ? "chapter" : "chapters"}{" "}
                                  analysed
                                </p>
                              </div>
                              <div className="mt-4 overflow-x-auto">
                                <table className="w-full min-w-[820px] text-left text-sm">
                                  <thead className="border-b border-border text-xs uppercase tracking-wide text-text-muted">
                                    <tr>
                                      <th className="px-3 py-3 font-semibold">Chapter</th>
                                      <th className="px-3 py-3 font-semibold">Score</th>
                                      <th className="px-3 py-3 font-semibold">Answered</th>
                                      <th className="px-3 py-3 font-semibold">Lost</th>
                                      <th className="px-3 py-3 font-semibold">Paper share</th>
                                      <th className="px-3 py-3 font-semibold">Lost share</th>
                                      <th className="px-3 py-3 font-semibold">Status</th>
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-border">
                                    {resultEvaluation.chapters.map((topic) => (
                                      <tr key={`chapter-${topic.topic_key || topic.chapter}`}>
                                        <td className="px-3 py-3 font-semibold text-text-primary">
                                          {topic.chapter}
                                        </td>
                                        <td className="px-3 py-3 font-mono tabular-nums text-text-secondary">
                                          {displayNumber(topic.score)} /{" "}
                                          {displayNumber(topic.marks)}{" "}
                                          <span className="text-xs text-text-muted">
                                            ({displayPercent(topicPercentage(topic))})
                                          </span>
                                        </td>
                                        <td className="px-3 py-3 font-mono tabular-nums text-text-secondary">
                                          {topic.questions_answered} / {topic.questions}
                                        </td>
                                        <td className="px-3 py-3 font-mono tabular-nums text-text-secondary">
                                          {displayNumber(topic.marks_lost)}
                                        </td>
                                        <td className="px-3 py-3 font-mono tabular-nums text-text-secondary">
                                          {displayPercent(topic.weightage)}
                                        </td>
                                        <td className="px-3 py-3 font-mono tabular-nums text-text-secondary">
                                          {displayPercent(topic.lost_weightage)}
                                        </td>
                                        <td className="px-3 py-3">
                                          <span
                                            className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${topicStatusClass(topic.status)}`}
                                          >
                                            {topicStatusLabel(topic.status)}
                                          </span>
                                        </td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            </section>
                          ) : null}

                          {resultEvaluation.not_attempted.length ? (
                            <section className="rounded-xl border border-border bg-bg-secondary p-5">
                              <p className="text-xs font-semibold uppercase tracking-wide text-text-muted">
                                Not attempted
                              </p>
                              <div className="mt-3 flex flex-wrap gap-2">
                                {resultEvaluation.not_attempted.map((topic) => (
                                  <span
                                    key={`not-attempted-${topic.topic_key || topic.chapter}`}
                                    className="rounded-full border border-border bg-card px-3 py-1.5 text-sm text-text-secondary"
                                  >
                                    {topic.chapter}
                                  </span>
                                ))}
                              </div>
                            </section>
                          ) : null}

                          {resultEvaluation.summary ? (
                            <section className="rounded-xl border border-blue-500/30 bg-blue-500/10 p-5">
                              <p className="text-xs font-semibold uppercase tracking-wide text-blue-700 dark:text-blue-300">
                                Grader summary
                              </p>
                              <Markdown
                                text={resultEvaluation.summary}
                                className="mt-2 text-sm leading-7 text-text-secondary"
                              />
                            </section>
                          ) : null}
                        </>
                      ) : null}

                      {results.length ? (
                        <section>
                          <div className="mb-3 flex items-end justify-between gap-3">
                            <div>
                              <p className="text-xs font-semibold uppercase tracking-wide text-text-muted">
                                Question feedback
                              </p>
                              <h3 className="mt-1 text-base font-semibold text-text-primary">
                                Review every answer
                              </h3>
                            </div>
                            <p className="text-xs text-text-muted">{results.length} graded</p>
                          </div>
                          <div className="space-y-4">
                            {results.map((result, index) => {
                              const question = content.examQuestions.find(
                                (candidate) => candidate.id === result.question_id,
                              );
                              const prompt = result.question || question?.question;
                              const marks = result.marks || question?.marks || 0;
                              return (
                                <article
                                  key={result.question_id}
                                  className="rounded-xl border border-border bg-card p-5"
                                >
                                  <div className="flex items-start justify-between gap-3">
                                    <div className="min-w-0">
                                      <p className="text-xs font-semibold uppercase tracking-wide text-text-muted">
                                        Question {index + 1}
                                        {result.chapter || result.topic
                                          ? ` · ${result.chapter || result.topic}`
                                          : ""}
                                      </p>
                                      {prompt ? (
                                        <Markdown
                                          text={prompt}
                                          className="mt-2 text-sm font-semibold leading-6 text-text-primary"
                                        />
                                      ) : null}
                                    </div>
                                    <span className="shrink-0 rounded-lg bg-bg-secondary px-2.5 py-1.5 font-mono text-sm font-semibold tabular-nums text-text-secondary">
                                      {displayNumber(result.score)} / {displayNumber(marks)}
                                    </span>
                                  </div>
                                  <div className="mt-4 rounded-lg border border-border bg-bg-secondary p-4">
                                    <p className="text-xs font-semibold uppercase tracking-wide text-text-muted">
                                      What we read from your sheet
                                    </p>
                                    {result.student_answer?.trim() ? (
                                      <Markdown
                                        text={result.student_answer.trim()}
                                        className="mt-2 whitespace-pre-wrap text-sm leading-6 text-text-secondary"
                                      />
                                    ) : (
                                      <p className="mt-2 text-sm leading-6 text-text-muted">
                                        No answer was detected for this question.
                                      </p>
                                    )}
                                  </div>
                                  <div className="mt-4 rounded-lg bg-blue-500/10 p-4">
                                    <p className="text-xs font-semibold uppercase tracking-wide text-blue-700 dark:text-blue-300">
                                      Feedback
                                    </p>
                                    {result.feedback ? (
                                      <Markdown
                                        text={result.feedback}
                                        className="mt-2 text-sm leading-6 text-text-secondary"
                                      />
                                    ) : (
                                      <p className="mt-2 text-sm leading-6 text-text-muted">
                                        No feedback was returned for this question.
                                      </p>
                                    )}
                                  </div>
                                </article>
                              );
                            })}
                          </div>
                        </section>
                      ) : (
                        <div className="rounded-xl border border-warning/40 bg-warning/10 p-5 text-sm text-text-secondary">
                          The score was saved, but per-question answer details are unavailable for
                          this sitting.
                        </div>
                      )}
                    </div>
                  ) : challenge.status === "completed" ? (
                    <div className="mt-6 rounded-xl border border-success/40 bg-success/10 p-5">
                      <p className="font-semibold text-success">Challenge completed ✓</p>
                      <p className="mt-1 text-sm text-text-secondary">
                        Your result is saved. It is now in your revision docs.
                      </p>
                    </div>
                  ) : (
                    <div className="mt-6 rounded-xl border border-border bg-bg-secondary p-5 text-sm text-text-muted">
                      Your marks, the grader&apos;s feedback and a topic-by-topic reading of where
                      they went will appear here once the sheet is submitted.
                    </div>
                  )}
                </div>
              </div>
            ) : null}
          </section>

          {activeWarning ? (
            <p className="mt-4 text-xs leading-5 text-warning">{activeWarning}</p>
          ) : null}
          {error ? (
            <p
              role="alert"
              className="mt-4 rounded-xl border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive"
            >
              {error}
            </p>
          ) : null}

          <footer
            className={
              focusMode
                ? "sticky bottom-4 z-20 mt-8 flex items-center justify-between gap-4 rounded-2xl border border-border bg-card/95 p-3 backdrop-blur"
                : "mt-6 flex items-center justify-between gap-4"
            }
          >
            <button
              type="button"
              disabled={activeStep === 1 || submitting || savingStep !== null}
              onClick={() => setActiveStep((current) => Math.max(1, current - 1) as ChallengeStep)}
              className={`${focusButtonClass} border border-border bg-card text-text-primary`}
            >
              ← Previous
            </button>
            {activeStep < 3 ? (
              <button
                type="button"
                /* Leaving the learn step records its worked examples as reviewed.
                   While they are still being built the student has not seen them,
                   so the step cannot be left yet — the same gate main put on the
                   old step three, moved to where that section now lives. */
                disabled={savingStep !== null || submitting || (activeStep === 2 && buildingRest)}
                onClick={() => void goNext()}
                className={`${focusButtonClass} bg-blue-600 text-white`}
              >
                {savingStep
                  ? "Saving…"
                  : activeStep === 2
                    ? buildingRest
                      ? "Preparing examples…"
                      : "Start practising →"
                    : "Next →"}
              </button>
            ) : resultReady ? (
              <div className="flex flex-wrap justify-end gap-3">
                {/* Re-issuing a graded challenge costs a model call and hands out
                    a second attempt at a topic already scored, so it is not a
                    control every student gets. See lib/challenge-refetch.ts. */}
                {canRestart ? (
                  <button
                    type="button"
                    disabled={restarting || openingNext}
                    onClick={() => void restartChallenge()}
                    className={`${focusButtonClass} border border-border bg-card text-text-primary hover:bg-bg-secondary`}
                  >
                    {restarting ? "Restarting…" : "Restart challenge"}
                  </button>
                ) : null}
                <button
                  type="button"
                  disabled={noNextAvailable || restarting || openingNext}
                  onClick={() => void openNextChallenge()}
                  title={
                    noNextAvailable
                      ? "All currently extracted topics already have challenges."
                      : nextChallenge
                        ? "Open the next available challenge"
                        : "Find and open the next available challenge"
                  }
                  className={`${focusButtonClass} bg-blue-600 text-white hover:bg-blue-700`}
                >
                  {openingNext
                    ? "Opening…"
                    : noNextAvailable
                      ? "All challenges complete"
                      : "Next challenge →"}
                </button>
              </div>
            ) : null}
          </footer>
        </div>
      </div>
    </main>
  );
}

export function ChallengesDashboardClient({
  dashboard: serverDashboard,
  initialChallengeId,
  canRestartChallenge = false,
}: {
  dashboard: StudentChallengeDashboard;
  /** Opened straight away, so the dashboard's starter card lands the student
   *  inside the challenge rather than on the hub they came from. */
  initialChallengeId?: string;
  /** Defaults to hidden: a caller that forgets to pass it must not hand the
   *  control to everyone. */
  canRestartChallenge?: boolean;
}) {
  const router = useRouter();
  // Re-renders the RSC payload. Only the recovery paths below use it now.
  const refreshApp = useAppRefresh();

  /**
   * THE SERVER'S COPY SEEDS IT; WRITES MOVE IT FROM HERE ON.
   *
   * Holding this in state is what lets a write patch the screen instead of
   * calling `router.refresh()`. The prop still wins whenever the server sends a
   * genuinely new one — a community switch, a recovery retry — which is the
   * documented way to reset state on a prop change: compare against the last
   * prop seen and assign during render, no effect and no extra paint.
   */
  const [dashboard, setDashboard] = useState(serverDashboard);
  const [lastServerDashboard, setLastServerDashboard] = useState(serverDashboard);
  if (serverDashboard !== lastServerDashboard) {
    setLastServerDashboard(serverDashboard);
    setDashboard(serverDashboard);
  }
  const patchHub = useCallback(
    (patch: (d: StudentChallengeDashboard) => StudentChallengeDashboard) => setDashboard(patch),
    [],
  );
  const [refreshing, startRefresh] = useTransition();
  const [retryCount, setRetryCount] = useState(0);
  const retryScope = `${dashboard.community?.id ?? "none"}:${dashboard.scope?.subjectSlug ?? "all"}`;
  const topicsUnavailable = dashboard.subjects.some((subject) => !subject.topicDataAvailable);
  const needsRecovery =
    Boolean(dashboard.community) &&
    !dashboard.challenges.length &&
    (topicsUnavailable || (dashboard.subjects.length > 0 && retryCount === 0));

  useEffect(() => {
    setRetryCount(0);
  }, [retryScope]);

  useEffect(() => {
    if (!needsRecovery || refreshing || retryCount >= 2) return;
    const timer = window.setTimeout(() => {
      setRetryCount((count) => count + 1);
      startRefresh(() => refreshApp());
    }, 1500);
    return () => window.clearTimeout(timer);
    // `refreshApp` replaces the bare `router` that used to be listed here: it is
    // what the effect actually calls, and `useAppRefresh` returns a stable
    // callback, so naming it satisfies the rule without re-running the effect.
  }, [needsRecovery, refreshing, retryCount, refreshApp]);

  const [selected, setSelected] = useState<StudentChallengeDetail | null>(null);
  const openedInitialChallengeRef = useRef("");
  const [openingId, setOpeningId] = useState("");
  const [openError, setOpenError] = useState("");
  const { setTitle } = useContext(AppShellContext);

  /**
   * The top bar names the challenge while one is open, and the hub otherwise.
   * It used to say "Challenge Hub" over a challenge the student had already
   * opened — the page's name sitting above the thing that is not the page.
   */
  useEffect(() => {
    setTitle(selected ? selected.title : CHALLENGE_HUB_TITLE);
    return () => setTitle(null);
  }, [selected, setTitle]);
  const selectedScopeKey = dashboard.scope
    ? `${dashboard.scope.courseId}:${dashboard.scope.subjectSlug.trim().toLowerCase()}`
    : "all";
  const selectedSubject = dashboard.subjectOptions.find(
    (subject) => subject.scopeKey === selectedScopeKey,
  );
  const weeklyProgress = Math.min(100, (dashboard.passedThisWeek / WEEKLY_CHALLENGE_TARGET) * 100);
  const weeklyLeaderTotal = Math.round((dashboard.leaderboard?.topPracticePerDay ?? 0) * 7);
  const challengesBehind = Math.max(0, weeklyLeaderTotal - dashboard.passedThisWeek);

  const completedPageHref = (page: number) => {
    const params = new URLSearchParams({ completedPage: String(page) });
    if (dashboard.community) params.set("community", dashboard.community.slug);
    if (dashboard.scope) {
      params.set("courseId", dashboard.scope.courseId);
      params.set("subject", dashboard.scope.subjectSlug);
    }
    return `/app/challenges?${params.toString()}#completed-challenges`;
  };

  const changePrioritySubject = (scopeKey: string) => {
    if (scopeKey === "all") {
      const communityQuery = dashboard.community
        ? `?community=${encodeURIComponent(dashboard.community.slug)}`
        : "";
      router.replace(`/app/challenges${communityQuery}`);
      return;
    }
    const subject = dashboard.subjectOptions.find((option) => option.scopeKey === scopeKey);
    if (!subject) return;
    const params = new URLSearchParams({
      courseId: subject.courseId,
      subject: subject.subjectSlug,
    });
    if (dashboard.community) params.set("community", dashboard.community.slug);
    router.replace(`/app/challenges?${params.toString()}`);
  };

  const openChallenge = async (challenge: StudentChallengeSummary) => {
    setOpeningId(challenge.id);
    setOpenError("");
    try {
      const payload = await apiJson<{ challenge: StudentChallengeDetail }>(
        await fetch(`/api/student/challenges/${challenge.id}/start`, { method: "POST" }),
      );
      setSelected(payload.challenge);
      return true;
    } catch (cause) {
      setOpenError(cause instanceof Error ? cause.message : "Could not open this challenge.");
      return false;
    } finally {
      setOpeningId("");
    }
  };

  useEffect(() => {
    if (!initialChallengeId || openedInitialChallengeRef.current === initialChallengeId) return;
    const initialChallenge = dashboard.challenges.find(
      (challenge) => challenge.id === initialChallengeId,
    );
    if (!initialChallenge) return;
    openedInitialChallengeRef.current = initialChallengeId;
    void openChallenge(initialChallenge);
  }, [dashboard.challenges, initialChallengeId]);

  if (selected) {
    const nextChallenge = nextAvailableChallenge(dashboard.challenges, selected);
    return (
      <ChallengeDetail
        challenge={selected}
        onBack={() => setSelected(null)}
        onChange={setSelected}
        onHubPatch={patchHub}
        canRestart={canRestartChallenge}
        nextChallenge={nextChallenge}
        onNext={async () => {
          if (nextChallenge) return openChallenge(nextChallenge);
          const params = new URLSearchParams();
          if (dashboard.scope) {
            params.set("courseId", dashboard.scope.courseId);
            params.set("subject", dashboard.scope.subjectSlug);
          }
          if (dashboard.community) params.set("community", dashboard.community.slug);
          const suffix = params.size ? `?${params.toString()}` : "";
          const payload = await apiJson<{ challenge: StudentChallengeDetail }>(
            await fetch(`/api/student/challenges/${selected.id}/next${suffix}`, { method: "POST" }),
          );
          setSelected(payload.challenge);
          patchHub((d) => applyChallengeState(d, payload.challenge));
          return true;
        }}
      />
    );
  }

  return (
    <main className="min-h-screen w-full bg-bg-secondary text-text-primary">
      <div className="mx-auto max-w-7xl px-4 py-8 pb-20 md:px-8">
        <header className="mb-8 grid gap-5 border-b border-border pb-6 lg:grid-cols-[minmax(0,1fr)_minmax(280px,360px)] lg:items-end">
          <div className="flex min-w-0 items-center gap-3">
            <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-blue-500/10 text-blue-700 dark:text-blue-300">
              <Target className="size-5" aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <h1 className="font-display text-2xl font-semibold tracking-tight sm:text-3xl">
                Challenge Hub
              </h1>
              <p className="mt-1 text-sm text-text-muted">
                {dashboard.community
                  ? `Showing only ${dashboard.community.name} subjects, progress, and history.`
                  : "Join a community to start its challenges and track your progress."}
              </p>
            </div>
          </div>

          <div className="min-w-0">
            <label
              htmlFor="priority-subject"
              className="text-xs font-semibold uppercase tracking-wide text-text-muted"
            >
              Priority subject
            </label>
            <select
              id="priority-subject"
              value={selectedScopeKey}
              onChange={(event) => changePrioritySubject(event.target.value)}
              className="mt-2 min-h-11 w-full cursor-pointer rounded-lg border border-border bg-card px-3 text-sm font-medium text-text-primary transition-colors duration-100 hover:border-text-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 focus-visible:ring-offset-bg-secondary motion-reduce:transition-none"
            >
              <option value="all">All subjects</option>
              {dashboard.subjectOptions.map((subject) => (
                <option key={subject.scopeKey} value={subject.scopeKey}>
                  {subject.subjectName}
                </option>
              ))}
            </select>
            <p className="mt-2 text-xs text-text-muted">
              {selectedSubject
                ? `Showing ${selectedSubject.subjectName} challenges.`
                : dashboard.community
                  ? `Showing all ${dashboard.community.name} subjects.`
                  : "No learner community is active."}
            </p>
          </div>
        </header>

        <section className="mb-6 grid gap-4 md:grid-cols-3" aria-label="Weekly challenge summary">
          <article className="rounded-xl border border-border bg-card p-6">
            <p className="text-sm text-text-muted">Weekly Target Progress</p>
            <p className="mt-1 text-2xl font-bold">
              {dashboard.passedThisWeek} / {WEEKLY_CHALLENGE_TARGET} Completed
            </p>
            <div
              className="mt-4 h-2 overflow-hidden rounded-full bg-bg-tertiary"
              aria-hidden="true"
            >
              <span
                className="block h-full rounded-full bg-blue-600 transition-[width] duration-300 motion-reduce:transition-none"
                style={{ width: `${weeklyProgress}%` }}
              />
            </div>
          </article>

          <article className="rounded-xl border border-border bg-card p-6">
            <p className="text-sm text-text-muted">Avg. Test Score</p>
            <p className="mt-1 text-2xl font-bold text-success">
              {dashboard.averageTestScore === null
                ? "—"
                : `${dashboard.averageTestScore.toFixed(1)}%`}
            </p>
            <p className="mt-1 text-xs text-text-muted">Passing threshold: 40%</p>
          </article>

          <article className="rounded-xl border border-border bg-card p-6">
            <p className="text-sm text-text-muted">Weekly Peer Leaderboard</p>
            <p className="mt-1 text-2xl font-bold">
              {dashboard.leaderboard?.practicePerDayRank
                ? `Rank #${dashboard.leaderboard.practicePerDayRank}`
                : "Not ranked yet"}
            </p>
            <p className="mt-1 text-xs font-medium text-blue-700 dark:text-blue-300">
              {challengesBehind > 0
                ? `${challengesBehind} challenge${challengesBehind === 1 ? "" : "s"} behind the weekly leader`
                : dashboard.passedThisWeek > 0
                  ? "You are level with the weekly leader"
                  : "Complete a challenge to enter the ranking"}
            </p>
          </article>
        </section>

        <section className="overflow-hidden rounded-xl border border-border bg-card">
          <div className="border-b border-border px-5 py-5 md:px-6">
            <h2 className="text-xl font-semibold">Available Daily Subtopic Challenges</h2>
            {dashboard.scope ? (
              <p className="mt-1 text-sm text-text-muted">
                Showing {dashboard.scope.subjectName} challenges only.
              </p>
            ) : null}
          </div>

          {dashboard.challenges.length ? (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[820px] border-collapse text-left text-sm">
                <thead className="bg-bg-secondary text-text-secondary">
                  <tr>
                    <th scope="col" className="w-px px-5 py-4 font-semibold md:px-6">
                      <span className="sr-only">Challenge number</span>
                      <span aria-hidden="true">#</span>
                    </th>
                    <th scope="col" className="px-5 py-4 font-semibold">
                      Subject
                    </th>
                    <th scope="col" className="px-5 py-4 font-semibold">
                      Subtopic
                    </th>
                    <th scope="col" className="px-5 py-4 font-semibold">
                      Est. Time
                    </th>
                    <th scope="col" className="px-5 py-4 font-semibold">
                      Status
                    </th>
                    <th scope="col" className="px-5 py-4 font-semibold md:px-6">
                      Action
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {dashboard.challenges.map((challenge, index) => {
                    const score = challengeScore(challenge);
                    const completed = challenge.status === "completed";
                    const started = challenge.status === "started";
                    return (
                      <tr key={challenge.id} className="border-t border-border">
                        {/* A row number, because that is what a student uses this
                            column for — "the third one" — and a 36-character UUID
                            told them nothing while costing the table the width of
                            two real columns.

                            The UUID is still the only identifier support can act
                            on, so it stays on the row: `title` surfaces it on hover
                            and it is selectable from there. Counting is per render,
                            so it renumbers when the list is filtered — which is
                            correct for a position and is exactly why the real id
                            had to stay reachable rather than be replaced. */}
                        <td className="px-5 py-4 md:px-6">
                          <span
                            title={challenge.id}
                            className="inline-flex min-w-7 justify-center whitespace-nowrap rounded bg-bg-secondary px-2 py-1 font-mono text-xs tabular-nums text-text-secondary"
                          >
                            {index + 1}
                          </span>
                        </td>
                        <td className="px-5 py-4 font-medium">{challenge.subjectName}</td>
                        <td className="max-w-xs px-5 py-4">
                          <span className="block font-medium">{challenge.topicTitle}</span>
                        </td>
                        <td className="whitespace-nowrap px-5 py-4">
                          {challenge.durationMinutes} mins
                        </td>
                        <td className="px-5 py-4">
                          <span
                            className={`inline-flex min-h-7 items-center whitespace-nowrap rounded-full px-3 text-xs font-semibold ${
                              completed
                                ? "bg-success/15 text-success"
                                : started
                                  ? "bg-blue-500/10 text-blue-700 dark:text-blue-300"
                                  : "bg-warning/15 text-warning"
                            }`}
                          >
                            {completed
                              ? `Completed${score === null ? "" : ` (${Math.round(score)}%)`}`
                              : started
                                ? "In Progress"
                                : "New Available"}
                          </span>
                        </td>
                        <td className="px-5 py-4 md:px-6">
                          <button
                            type="button"
                            onClick={() => void openChallenge(challenge)}
                            disabled={openingId === challenge.id}
                            aria-busy={openingId === challenge.id}
                            className={`inline-flex min-h-10 items-center justify-center whitespace-nowrap rounded-lg px-4 text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 focus-visible:ring-offset-bg-primary disabled:opacity-60 ${
                              completed
                                ? "border border-border bg-bg-primary text-text-primary hover:bg-bg-secondary"
                                : "bg-blue-600 text-white hover:bg-blue-700"
                            }`}
                          >
                            {openingId === challenge.id
                              ? "Opening…"
                              : completed
                                ? "View Details"
                                : started
                                  ? "Continue"
                                  : "Start Challenge"}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : refreshing || (needsRecovery && retryCount < 2) ? (
            <div
              role="status"
              aria-live="polite"
              aria-busy="true"
              className="flex flex-col items-center gap-3 px-6 py-12 text-center"
            >
              <LoaderCircle
                aria-hidden="true"
                className="size-6 animate-spin text-blue-600 motion-reduce:animate-none"
              />
              <p className="font-semibold">Loading your challenges…</p>
              <p className="text-sm text-text-muted">
                Getting the available topics for your subjects.
              </p>
            </div>
          ) : topicsUnavailable ? (
            <div role="alert" className="px-6 py-12 text-center">
              <p className="font-semibold">Challenges couldn’t be loaded</p>
              <p className="mt-2 text-sm text-text-muted">
                Please try loading your subjects again.
              </p>
              <button
                type="button"
                onClick={() => {
                  setRetryCount(0);
                  startRefresh(() => refreshApp());
                }}
                className="mt-5 inline-flex min-h-10 items-center rounded-lg bg-blue-600 px-4 text-sm font-semibold text-white"
              >
                Retry
              </button>
            </div>
          ) : (
            <div className="px-6 py-12 text-center">
              <p className="font-semibold">
                {dashboard.scope
                  ? "No challenge is ready for this subject yet"
                  : "No challenges yet"}
              </p>
              <p className="mt-2 text-sm text-text-muted">
                {dashboard.scope
                  ? "Ask the community creator to refresh this subject's extracted topics."
                  : dashboard.community
                    ? `${dashboard.community.name} has no available challenges yet. Published topics will appear here automatically.`
                    : "Join a community and its real subtopics will appear here."}
              </p>
              <Link
                href={
                  dashboard.community
                    ? `/app/chat?community=${encodeURIComponent(dashboard.community.slug)}`
                    : "/communities"
                }
                className="mt-5 inline-flex min-h-10 items-center rounded-lg bg-text-primary px-4 text-sm font-semibold text-text-inverse focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
              >
                {dashboard.community ? "Open Library" : "Browse communities"}
              </Link>
            </div>
          )}
        </section>

        {openError ? (
          <p
            role="alert"
            className="mt-4 rounded-lg border border-destructive/40 bg-card p-4 text-sm text-destructive"
          >
            {openError}
          </p>
        ) : null}

        {dashboard.completedChallengeTotal > 0 ? (
          <section
            id="completed-challenges"
            className="mt-8 overflow-hidden rounded-xl border border-border bg-card"
          >
            <div className="flex flex-wrap items-end justify-between gap-3 border-b border-border px-5 py-5 md:px-6">
              <div>
                <h2 className="text-xl font-semibold">Completed Challenges</h2>
                <p className="mt-1 text-sm text-text-muted">
                  {dashboard.completedChallengeTotal} passed, newest first.
                </p>
              </div>
              {dashboard.completedChallengeTotalPages > 1 ? (
                <p className="text-xs text-text-muted">
                  Page {dashboard.completedChallengePage} of{" "}
                  {dashboard.completedChallengeTotalPages}
                </p>
              ) : null}
            </div>
            <div className="divide-y divide-border">
              {dashboard.completedChallenges.map((challenge) => {
                const score = challengeScore(challenge);
                return (
                  <button
                    key={challenge.id}
                    type="button"
                    /* Same trade as the "#" column above: the UUID is reachable on
                       hover rather than printed under every row, where it was a
                       line of noise per entry and the topic is what a student
                       scans this list for. */
                    title={challenge.id}
                    onClick={() => void openChallenge(challenge)}
                    disabled={openingId === challenge.id}
                    className="grid min-h-16 w-full grid-cols-[1fr_auto] items-center gap-4 px-5 py-4 text-left hover:bg-bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500 disabled:opacity-60 md:px-6"
                  >
                    <span>
                      <span className="block font-medium">{challenge.topicTitle}</span>
                      <span className="mt-1 block text-xs text-text-muted">
                        {challenge.subjectName} · {challenge.date}
                      </span>
                    </span>
                    <span className="text-sm font-semibold text-text-secondary">
                      {openingId === challenge.id
                        ? "Opening…"
                        : `${score === null ? "Passed" : `${Math.round(score)}%`} · Review →`}
                    </span>
                  </button>
                );
              })}
            </div>
            {dashboard.completedChallengeTotalPages > 1 ? (
              <nav
                className="flex items-center justify-between border-t border-border px-5 py-4 md:px-6"
                aria-label="Completed challenges pagination"
              >
                {dashboard.completedChallengePage > 1 ? (
                  <Link
                    href={completedPageHref(dashboard.completedChallengePage - 1)}
                    className="inline-flex min-h-10 items-center rounded-lg border border-border px-4 text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                  >
                    ← Previous
                  </Link>
                ) : (
                  <span />
                )}
                {dashboard.completedChallengePage < dashboard.completedChallengeTotalPages ? (
                  <Link
                    href={completedPageHref(dashboard.completedChallengePage + 1)}
                    className="inline-flex min-h-10 items-center rounded-lg border border-border px-4 text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                  >
                    Next →
                  </Link>
                ) : (
                  <span />
                )}
              </nav>
            ) : null}
          </section>
        ) : null}
      </div>
    </main>
  );
}
