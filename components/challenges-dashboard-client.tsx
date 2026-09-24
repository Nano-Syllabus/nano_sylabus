"use client";

import { unitShownAlone } from "@/lib/unit-numbering";
import {
  AlertTriangle,
  FileCheck2,
  Check,
  ChevronDown,
  FileText,
  LoaderCircle,
  Maximize2,
  Minimize2,
  Pencil,
  Sparkles,
  Target,
  Upload,
  X,
  Zap,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";
import { AppShellContext } from "@/components/app-shell-context";
import { ChallengeMcqPage } from "@/components/challenge-mcq-page";
import { AwaitedConceptsCard, ConceptsCard } from "@/components/concepts-reading";
import {
  StudyLanguageSwitch,
  inStudyLanguage,
  useRomanNepali,
  isTranslating,
  useStudyLanguage,
} from "@/components/study-language";
import {
  hubContainerClass,
  hubListCardClass,
  hubListHeaderClass,
  hubMainClass,
  hubMetricCardClass,
  hubMetricsClass,
  hubRowActionsClass,
  hubRowClass,
  hubRowMainClass,
  hubRowSubjectClass,
  hubRowsClass,
  hubTitleClass,
} from "@/components/challenge-hub-frame";
import { StarterChallengeBanner } from "@/components/starter-challenge-banner";
import { Markdown } from "@/components/markdown";
import { WorkedSolution } from "@/components/worked-solution";
import {
  WorkedExampleCard,
  paperTextClass,
  workedAnswerClass,
} from "@/components/worked-example-card";
import { AnswerFontPicker, answerFontStyle, useAnswerFont } from "@/components/answer-font-picker";
import {
  ChallengeFeedbackModal,
  type ChallengeFeedbackChoice,
} from "@/components/challenge-feedback-modal";
import { mergeLearnQuestions } from "@/lib/challenge-learn-questions";
import { academicNumberLabel } from "@/lib/academic";
import type { StudentChallengeDashboard } from "@/lib/data/student-challenge-dashboard";
import type {
  StudentChallengeDetail,
  StudentChallengeSummary,
} from "@/lib/data/student-challenges";
import type { PracticeEvaluation } from "@/lib/tenant/client";
import { useAppRefresh } from "@/lib/query/refresh";
import { useDashboardPatch } from "@/lib/query/dashboard";
import { applyChallengeAdded, applyChallengePassed, applyChallengeState } from "@/lib/challenges/local-updates";

const WEEKLY_CHALLENGE_TARGET = 15;
/** What the shell's top bar says when no challenge is open. Shared with the
 *  server page's own `SetAppShell`, so the two cannot disagree. */
export const CHALLENGE_HUB_TITLE = "Micro-Topics Hub";

/** "18/20", or "" when the challenge carries no mark. */
function scoreText(challenge: StudentChallengeSummary) {
  if (challenge.lastScore === null || !challenge.lastTotalMarks) return "";
  const format = (value: number) => (Number.isInteger(value) ? String(value) : value.toFixed(1));
  return `${format(challenge.lastScore)}/${format(challenge.lastTotalMarks)}`;
}

/**
 * The hub's rows: one per subject. Today's finished challenges ride on the open
 * card that followed them in the same subject; one stands as its own row only
 * while its subject has nothing open yet. Exported for tests.
 */
export function hubRows(challenges: StudentChallengeSummary[]) {
  const subjectKey = (challenge: StudentChallengeSummary) =>
    `${challenge.courseId ?? "owner-private"}:${challenge.subjectSlug.trim().toLowerCase()}`;
  const open = challenges.filter((challenge) => challenge.status !== "completed");
  const openSubjects = new Set(open.map(subjectKey));
  const doneBySubject = new Map<string, StudentChallengeSummary[]>();
  for (const challenge of challenges) {
    if (challenge.status !== "completed") continue;
    const key = subjectKey(challenge);
    doneBySubject.set(key, [...(doneBySubject.get(key) ?? []), challenge]);
  }
  const standing = challenges.filter(
    (challenge) => challenge.status === "completed" && !openSubjects.has(subjectKey(challenge)),
  );
  return [
    ...open.map((challenge) => ({
      challenge,
      // The first open card of a subject carries its wins; any later one does not.
      doneToday:
        open.find((item) => subjectKey(item) === subjectKey(challenge)) === challenge
          ? (doneBySubject.get(subjectKey(challenge)) ?? [])
          : [],
    })),
    ...standing.map((challenge) => ({ challenge, doneToday: [] as StudentChallengeSummary[] })),
  ];
}

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
 * TWO STEPS: LEARN, THEN PRACTISE.
 *
 * The challenge used to be walked as six (prerequisites, reading, worked
 * example, practice question, submit, result), then as three (see the past
 * questions, learn, practise). It is two, and the second of those collapses is
 * the one that matters.
 *
 *   1  Learn    this topic's past questions, each opening onto its answer
 *   2  Practise, hand in, and read the marking
 *
 * STEP ONE IS THE QUESTION LIST, AND NOTHING ELSE.
 *
 * It used to be three stacked sections: the worked examples, then the past
 * questions that were not worked, then a written concept reading. The first two
 * were the same rows printed twice — a worked example IS a past question with a
 * solution on it — and the third was a page of prose ahead of the only evidence
 * that it mattered. What a student sitting this exam wants is the paper's own
 * questions on this subtopic, with the answer one tap under each; that is now
 * the whole of step one, collapsed so repeat appearances read as one question
 * carrying its years rather than as three near-identical rows.
 *
 * The reading did not stop being written — Revision Docs is built from it — it
 * stopped being on this screen, and stopped being something `/start` waits for.
 *
 * Progress is still recorded at the old granularity — `lessonRead` and
 * `examplesReviewed` are separate columns and separate API calls — because the
 * server's record of what a student has done should not be coarsened to match a
 * layout decision.
 */
type ChallengeStep = 1 | 2;
type PracticeStage = "questions" | "upload" | "result";

export function initialChallengeStep(challenge: StudentChallengeDetail): ChallengeStep {
  if (challenge.status === "completed") return 2;
  // `examplesReviewed` is the far edge of the learning step, and it is the only
  // one that moves a student off it. `lessonRead` alone no longer advances
  // anything: it is one of two rows both written when the question list is left
  // behind, not a section of its own that a student can stop halfway through.
  if (challenge.examplesReviewed) return 2;
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
  // A challenge always OPENS on step one, whatever step it was left on: the
  // worked past questions are what a student reads before sitting the paper.
  const incomingStep: ChallengeStep = 1;
  const isCompletedChallenge = challenge.status === "completed";
  // Pressing Start opens the challenge straight into focus mode; the way out is
  // the Exit button in the top-left corner.
  const [focusMode, setFocusMode] = useState(true);
  const [activeStep, setActiveStep] = useState<ChallengeStep>(() => incomingStep);
  /**
   * Practice is three screens, one at a time: the questions, the upload, the
   * result. No step indicator — the footer moves between them. A finished
   * challenge lands on its result.
   */
  const [practiceStage, setPracticeStage] = useState<PracticeStage>(() =>
    challenge.status === "completed" ? "result" : "questions",
  );
  const [savingStep, setSavingStep] = useState<"lesson" | "examples" | null>(null);
  const [scanFile, setScanFile] = useState<File | null>(null);
  /** Multiple-choice picks on an MCQ or hybrid paper: question id → option key. */
  const [choices, setChoices] = useState<Record<string, string>>({});
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
  /** The two questions asked while a sheet is graded — once per sitting. */
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const feedbackAskedRef = useRef(new Set<string>());
  const content = challenge.content;
  /**
   * `pending` means the solutions and the exam are still being built. It is a
   * fact about what is under the questions, never about the whole screen — the
   * questions themselves come back with `/start` and are already on it.
   */
  const contentPending = content?.contentStatus;
  const buildingRest = contentPending === "pending" && !content?.contentError;
  /** An MCQ community's challenge: concepts and MCQs on one page, no steps. */
  const mcqPage = content?.examFormat === "mcq";
  const buildFailed = contentPending === "pending" ? content?.contentError || "" : "";
  /** English or Roman Nepali for the reading and the worked answers — see
   *  `components/study-language.tsx`. Fetched only once Roman Nepali is chosen. */
  const [studyLanguage, setStudyLanguage] = useStudyLanguage();
  const romanNepali = useRomanNepali(
    challenge.id,
    `${content?.lesson?.content?.length ?? 0}:${(content?.solvedExamples || []).filter((example) => example.solution).length}`,
    studyLanguage === "rn" && Boolean(content),
    content?.romanNepali,
    // Filed on the cached challenge too, so reopening it is instant.
    (romanNepaliData) =>
      content && onChange({ ...challenge, content: { ...content, romanNepali: romanNepaliData } }),
  );
  const translating = isTranslating(studyLanguage, romanNepali);
  /** The face worked answers are written in — the reader's, shared with Revision. */
  const [answerFont, setAnswerFont] = useAnswerFont();
  /** The single list step one renders — see `mergeLearnQuestions` for why the
   *  two content fields are one list on screen. */
  const learnQuestions = useMemo(
    () =>
      mergeLearnQuestions({
        pastQuestions: content?.pastQuestions,
        solvedExamples: content?.solvedExamples,
      }),
    [content?.pastQuestions, content?.solvedExamples],
  );

  useEffect(() => {
    setSidebarSuppressed(focusMode);
    return () => setSidebarSuppressed(false);
  }, [focusMode, setSidebarSuppressed]);

  useEffect(() => {
    if (focusMode) exitFocusButtonRef.current?.focus();
  }, [focusMode]);

  useEffect(() => {
    if (!focusMode) return;
    // Escape is the Exit button's shortcut, so it leaves the same way: back to
    // the challenge hub, not into a half-open copy of the challenge.
    const exitOnEscape = (event: KeyboardEvent) => {
      // An Escape something open on top already used — the concepts sheet
      // closing — is not also a request to leave the challenge.
      if (event.key === "Escape" && !event.defaultPrevented) onBack();
    };
    window.addEventListener("keydown", exitOnEscape);
    return () => window.removeEventListener("keydown", exitOnEscape);
  }, [focusMode, onBack]);

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
      // Widening, because the cost of a poll is the same whether or not anything
      // has changed and the odds of it having changed fall as the wait goes on.
      // Measured on the dev server, the old 1.5s beat ran eleven ~400ms requests
      // to catch one build; four spread over the same window catch it just as
      // well and leave the tab alone afterwards.
      const delay = attempt < 3 ? 2_000 : attempt < 8 ? 4_000 : 8_000;
      timer = window.setTimeout(() => void tick(), delay);
    };
    const tick = async () => {
      attempt += 1;
      try {
        const response = await fetch(`/api/student/challenges/${challenge.id}/content`);
        // `{status: "pending"}` is the whole body while the build is running —
        // the route does not serialise a challenge to say "not yet".
        const payload = (await response.json().catch(() => ({}))) as {
          challenge?: StudentChallengeDetail;
          status?: string;
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
    setPracticeStage(isCompletedChallenge ? "result" : "questions");
    setScanFile(null);
    setChoices({});
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

  // Provenance notes — how much of a reading the notes support, values no source
  // printed, which examples came from notes rather than the bank. They are for
  // whoever maintains the course material, not for a student mid-challenge, so
  // they go to the console instead of the page.
  const activeWarning = !content
    ? ""
    : activeStep === 1
      ? // The questions and their solutions are one step, so their warnings are
        // one line. The reading's warning is still collected: it is not rendered
        // as a section any more, but a course whose material could not be read
        // is the same fact about this topic either way.
        [
          ...(content.pastQuestionBlockers || []),
          ...(content.pastQuestionWarnings || []),
          content.learningWarning,
          content.solvedWarning || content.warning,
        ]
          .filter(Boolean)
          .join(" ")
      : content.examWarning || "";
  useEffect(() => {
    if (activeWarning) console.info(`[challenge ${challenge.id}] ${activeWarning}`);
  }, [activeWarning, challenge.id]);

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

  /** A marked sitting, whichever way it was handed in. */
  type GradedPayload = {
    challenge: StudentChallengeDetail;
    results: GradeResult[];
    evaluation?: PracticeEvaluation;
    totalScore: number;
    totalMarks: number;
    passed: boolean;
    error?: string;
    nextInSubject?: StudentChallengeSummary | null;
  };
  const applyGrade = (payload: GradedPayload) => {
    setResults(payload.results);
    setEvaluation(payload.evaluation ?? null);
    setScore({ earned: payload.totalScore, total: payload.totalMarks, passed: payload.passed });
    setScanFile(null);
    setChoices({});
    onChange(payload.challenge);
    setActiveStep(2);
    setPracticeStage("result");
    // See the note in `submitScan`: the dashboard's numbers move in this tick.
    if (payload.passed) {
      dashboardPatch.completed({ challengeId: payload.challenge?.id });
      onHubPatch((d) => applyChallengePassed(d, payload.challenge?.id, payload.nextInSubject));
    } else {
      dashboardPatch.attempted();
      onHubPatch((d) => applyChallengeState(d, payload.challenge));
    }
  };

  /** An all-MCQ paper: marked on the server from the picks, no scan. */
  const submitChoices = async () => {
    setSubmitting(true);
    setError("");
    try {
      const response = await fetch(`/api/student/challenges/${challenge.id}/submit-choices`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ answers: choices }),
      });
      const payload = (await response.json().catch(() => ({}))) as GradedPayload;
      if (!response.ok) {
        if (payload.challenge) {
          setChoices({});
          onChange(payload.challenge);
        }
        throw new Error(payload.error || "Could not mark your answers.");
      }
      applyGrade(payload);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not mark your answers.");
    } finally {
      setSubmitting(false);
    }
  };

  const submitScan = async () => {
    if (!scanFile) return;
    setSubmitting(true);
    setError("");
    // Asked while the sheet is read and graded — the minute a student would
    // otherwise spend on a spinner, and the only time "what do you expect to
    // score?" comes before they know. One ask per sitting.
    const sitting = `${challenge.id}:${challenge.attemptCount}`;
    if (!feedbackAskedRef.current.has(sitting)) {
      feedbackAskedRef.current.add(sitting);
      setFeedbackOpen(true);
    }
    try {
      const form = new FormData();
      form.set("file", scanFile);
      // A hybrid paper's multiple-choice part is handed in with the scan.
      if (choiceQuestions.length) form.set("choices", JSON.stringify(choices));
      const response = await fetch(`/api/student/challenges/${challenge.id}/submit-file`, {
        method: "POST",
        body: form,
      });
      const payload = (await response.json().catch(() => ({}))) as GradedPayload;
      if (!response.ok) {
        if (payload.challenge) onChange(payload.challenge);
        throw new Error(payload.error || "Could not grade the handwritten answer.");
      }
      applyGrade(payload);
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
       * would have them disagree for as long as the refresh took. (`applyGrade`
       * does it, for this path and the MCQ one alike.)
       */
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
      setChoices({});
      setClock(Date.now());
      onChange(payload.challenge);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not issue a fresh exam.");
    } finally {
      setSubmitting(false);
    }
  };

  /** The row's current paper, for an MCQ screen painted from an older one. */
  const reloadPaper = async () => {
    try {
      const response = await fetch(`/api/student/challenges/${challenge.id}/content`);
      const payload = (await response.json().catch(() => ({}))) as { challenge?: StudentChallengeDetail };
      if (response.ok && payload.challenge) onChange(payload.challenge);
    } catch {
      // The next open reads the row again.
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
      setActiveStep(1);
      setPracticeStage("questions");
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
      // Never record examples the student was not shown, whatever the button did.
      if (buildingRest) return;
      // One step to the student, two rows to the server. Both are recorded on
      // the way out, in order, and a failure on either leaves the student where
      // they are rather than advancing on a half-saved record.
      if (!challenge.lessonRead && !(await markStep("lesson"))) return;
      if (!challenge.examplesReviewed && !(await markStep("examples"))) return;
      setActiveStep(2);
      setPracticeStage(challenge.status === "completed" ? "result" : "questions");
    }
  };

  const finishFeedback = (choice: ChallengeFeedbackChoice) => {
    setFeedbackOpen(false);
    // Behind the student's back and never in their way: a failed save is not
    // worth an error on the screen where their marks are about to appear.
    void fetch(`/api/student/challenges/${challenge.id}/feedback`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(choice),
    }).catch(() => undefined);
  };

  const goBack = () => {
    if (activeStep === 1) return;
    if (practiceStage === "questions") setActiveStep(1);
    else setPracticeStage("questions");
  };

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
  /**
   * The paper's shape, read off its questions rather than a stored label: a
   * question with options is answered on screen, one without is written on
   * paper. The community's creator chose which (QnA, MCQ or hybrid).
   */
  const choiceQuestions = content.examQuestions.filter((question) => question.options?.length);
  const writtenQuestions = content.examQuestions.filter((question) => !question.options?.length);
  const allChoice = choiceQuestions.length > 0 && writtenQuestions.length === 0;
  const answeredChoices = choiceQuestions.filter((question) => choices[question.id]).length;
  const resultReady = activeStep === 2 && Boolean(score && challenge.status === "completed");

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

  /** "Unit 1 · Computer Programming" — where this topic sits in the course. */
  const challengeEyebrow = [
    unitShownAlone(challenge.unitNumber) ? `Unit ${challenge.unitNumber}` : "",
    challenge.subjectName,
  ]
    .filter(Boolean)
    .join(" · ");

  const focusToggle = (
    <button
      ref={focusMode ? exitFocusButtonRef : enterFocusButtonRef}
      type="button"
      // A toggle only on the way IN. In focus mode it is a plain Exit button,
      // so it carries no pressed state to announce.
      aria-pressed={focusMode ? undefined : false}
      aria-label={focusMode ? "Exit the challenge" : "Enter focus mode"}
      title={focusMode ? "Exit the challenge (Esc)" : "Enter focus mode"}
      // Exit is the way OUT, not a layout switch: it closes the challenge and
      // lands the student back on the challenge hub they opened it from.
      onClick={() => (focusMode ? onBack() : setFocusMode(true))}
      className={`${focusButtonClass} inline-flex items-center justify-center gap-2 border border-border bg-card px-3 text-text-primary hover:bg-bg-secondary`}
    >
      {focusMode ? (
        <Minimize2 className="size-4" aria-hidden="true" />
      ) : (
        <Maximize2 className="size-4" aria-hidden="true" />
      )}
      {focusMode ? <span>Exit</span> : <span className="hidden md:inline">Focus mode</span>}
    </button>
  );

  return (
    <main
      className={
        focusMode
          ? "fixed inset-0 z-[60] w-full overflow-y-auto overscroll-contain bg-bg-primary text-text-primary"
          : "min-h-screen w-full bg-bg-secondary text-text-primary"
      }
    >
      {/*
        FOCUS MODE HAS ONE BAR, AND THE PAGE.
        -------------------------------------
        A sticky top bar in the app's navbar style carries everything that is
        not the reading: Exit on the left, the topic in the middle, the clock on
        the right. Below it is the same centred column the page uses outside
        focus mode, and the Previous / next bar is sticky at the foot.
      */}
      {focusMode ? (
        // A top bar in the app's own navbar style — the way out on the left,
        // what this is in the middle, the clock on the right — sticky, so the
        // clock and the exit stay in reach however far the answers run.
        <header
          aria-label="Challenge"
          className="sticky top-0 z-30 grid min-h-[53px] grid-cols-[minmax(0,1fr)_minmax(0,auto)_minmax(0,1fr)] items-center gap-3 border-b border-border bg-bg-secondary/95 px-4 backdrop-blur md:px-6"
        >
          <div className="flex min-w-0 items-center">{focusToggle}</div>
          <div className="min-w-0 max-w-[min(56vw,720px)] text-center">
            <p className="truncate text-xs text-text-muted">{challengeEyebrow}</p>
            <p className="truncate font-sans text-sm font-semibold text-text-primary">
              {challenge.topicTitle || challenge.title}
            </p>
          </div>
          <div className="flex min-w-0 items-center justify-end">{timerBox}</div>
        </header>
      ) : null}

      <div
        className={
          focusMode
            ? // The same column as outside focus mode, under the bar.
              "mx-auto flex min-h-[calc(100dvh-53px)] max-w-5xl flex-col px-4 pt-6 sm:px-8"
            : // Outside focus mode it fills the app's scroll area, which no longer
              // has a 53px top bar above it to subtract.
              "mx-auto flex min-h-full max-w-5xl flex-col px-4 pt-6 sm:px-8"
        }
      >
        <div className="flex flex-1 flex-col">
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
              <p className="mt-5 text-xs text-text-muted">{challengeEyebrow}</p>
              <h1 className="mt-1 font-display text-xl font-semibold">{challenge.title}</h1>
            </>
          ) : null}

          <section
            className={`mt-6 bg-card p-5 sm:p-8 ${focusMode ? "rounded-xl" : "rounded-2xl border border-border"}`}
          >
            {mcqPage ? (
              <div>
                <StudyLanguageSwitch
                  className="mb-4"
                  value={studyLanguage}
                  onChange={setStudyLanguage}
                  translation={romanNepali}
                />
                {content?.lesson?.content?.length ? (
                  <ConceptsCard
                    key={challenge.id}
                    translating={translating}
                    source={{
                      id: challenge.id,
                      title: challenge.title,
                      subjectName: challenge.subjectName,
                      reading: inStudyLanguage(studyLanguage, romanNepali, (data) => data.reading, content.lesson.content),
                    }}
                  />
                ) : content ? (
                  <AwaitedConceptsCard
                    key={challenge.id}
                    waiting={content.contentStatus === "pending" && !content.contentError}
                    readingError={content.readingError}
                    source={{ id: challenge.id, title: challenge.title, subjectName: challenge.subjectName, reading: [] }}
                    onReading={(reading) =>
                      onChange({
                        ...challenge,
                        content: { ...content, lesson: { ...content.lesson, content: reading } },
                      })
                    }
                  />
                ) : null}
                <ChallengeMcqPage
                  challenge={challenge}
                  building={buildingRest}
                  buildFailed={buildFailed}
                  onGraded={({ challenge: updated, passed, nextInSubject }) => {
                    onChange(updated);
                    if (passed) {
                      dashboardPatch.completed({ challengeId: updated.id });
                      onHubPatch((d) => applyChallengePassed(d, updated.id, nextInSubject));
                    } else {
                      dashboardPatch.attempted();
                      onHubPatch((d) => applyChallengeState(d, updated));
                    }
                  }}
                  onRetake={() => void refreshExam()}
                  onStalePaper={reloadPaper}
                  onNext={() => void openNextChallenge()}
                  nextLabel={openingNext ? "Opening…" : noNextAvailable ? "All challenges complete" : "Next challenge →"}
                  nextDisabled={noNextAvailable || openingNext}
                />
              </div>
            ) : activeStep === 1 ? (
              <div>
                {content ? (
                  <StudyLanguageSwitch
                    className="mb-4"
                    value={studyLanguage}
                    onChange={setStudyLanguage}
                    translation={romanNepali}
                  />
                ) : null}
                {/* The concepts reading, as a card that opens it in a sheet — the
                    same card Revision shows. It leads step 1 because it is what a
                    student reads before working through the past questions. */}
                {content?.lesson?.content?.length ? (
                  <ConceptsCard
                    key={challenge.id}
                    className="mb-6"
                    translating={translating}
                    source={{
                      id: challenge.id,
                      title: challenge.title,
                      subjectName: challenge.subjectName,
                      reading: inStudyLanguage(
                        studyLanguage,
                        romanNepali,
                        (data) => data.reading,
                        content.lesson.content,
                      ),
                    }}
                  />
                ) : content ? (
                  /* Every challenge gets its reading; this one's is on its way.
                     While the build runs, the poll above brings it in; after,
                     the card asks for it itself — see `AwaitedConceptsCard`. */
                  <AwaitedConceptsCard
                    key={challenge.id}
                    className="mb-6"
                    waiting={content.contentStatus === "pending" && !content.contentError}
                    readingError={content.readingError}
                    source={{
                      id: challenge.id,
                      title: challenge.title,
                      subjectName: challenge.subjectName,
                      reading: [],
                    }}
                    onReading={(reading) =>
                      onChange({
                        ...challenge,
                        content: { ...content, lesson: { ...content.lesson, content: reading } },
                      })
                    }
                  />
                ) : null}
                {/* No fundamentals check here (removed, user 2026-09-24): step 1
                    is the reading and the past questions. The component stays
                    for its video explainer, which the MCQ paper uses. */}
                {learnQuestions.length ? (
                  // The same ruled sheets as Revision's worked examples, and the
                  // same face picker: a worked answer looks the same wherever it
                  // is read. Each still opens on the question alone.
                  <section style={answerFontStyle(answerFont)}>
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <h2 className="type-student-section-title">Worked examples</h2>
                      <AnswerFontPicker value={answerFont} onChange={setAnswerFont} />
                    </div>
                    <ol className="mt-3 space-y-4">
                      {learnQuestions.map((item, index) => (
                        <li key={item.key}>
                          <WorkedExampleCard
                            collapsible
                            // Only what a real paper printed: the sessions it
                            // was set in, the marks it carried, and how often
                            // it came back. Nothing is inferred.
                            label={
                              <>
                                Example {index + 1}
                                {item.years.length ? (
                                  ` · Asked ${item.years.join(", ")}`
                                ) : !item.fromPastPaper ? (
                                  // Written from the notes, so there is no year to
                                  // give — said plainly rather than left blank,
                                  // where it read as a past question missing one.
                                  <span title="Not from a past paper: written from your notes because no past question covers this topic yet.">
                                    {" · Practice question"}
                                  </span>
                                ) : (
                                  " · Past paper, year not recorded"
                                )}
                                {item.marks.length
                                  ? ` · ${item.marks.map((mark) => displayNumber(mark)).join(" or ")} marks`
                                  : ""}
                                {item.appearances > 1 ? (
                                  <span className="text-success"> · ★ Repeated ×{item.appearances}</span>
                                ) : null}
                              </>
                            }
                            // Typeset when the solver has written it:
                            // "$x\frac{d^2y}{dx^2}$", not "x(d^2y/dx^2)".
                            question={item.displayQuestion || item.question}
                          >
                            {item.solution ? (
                              <WorkedSolution
                                challengeId={challenge.id}
                                question={item.question}
                                solution={item.solution}
                                // A solution that lost its diagram asks for
                                // it once; the drawn one is filed on the
                                // challenge, and patched into the cache here.
                                onDrawn={(drawn) => onChange(drawn.challenge)}
                                translating={translating}
                                text={inStudyLanguage(
                                  studyLanguage,
                                  romanNepali,
                                  (data) => data.solutions[item.key],
                                  item.solution,
                                )}
                                className={workedAnswerClass}
                              />
                            ) : buildingRest ? (
                              <div className="pl-[var(--paper-inset)] pr-4 pt-2">
                                <ChallengeBuildingNotice label="Working this question…" lines={3} />
                              </div>
                            ) : (
                              <div className={paperTextClass}>
                                <p>
                                  This one is not worked. Try it on paper — step two sets questions
                                  like it.
                                </p>
                              </div>
                            )}
                          </WorkedExampleCard>
                        </li>
                      ))}
                    </ol>
                  </section>
                ) : buildingRest ? (
                  <ChallengeBuildingNotice label="Finding this topic's past questions…" lines={3} />
                ) : buildFailed ? (
                  <ChallengeBuildFailure
                    message={buildFailed}
                    retrying={retryingContent}
                    onRetry={() => void retryContentBuild()}
                  />
                ) : (
                  <div className="mt-6 rounded-xl border border-border bg-bg-secondary p-5">
                    <p className="inline-flex items-center gap-2 text-sm font-semibold text-text-primary">
                      <AlertTriangle className="size-4 text-warning" aria-hidden="true" />
                      No past question on this topic yet
                    </p>
                    <p className="mt-1 max-w-prose text-sm leading-6 text-text-secondary">
                      Nothing in this course&apos;s question bank has been set on it. The exam in
                      step two still runs from the course notes.
                    </p>
                  </div>
                )}
              </div>
            ) : null}

            {activeStep === 2 ? (
              <div>
                {practiceStage === "questions" ? (
                  <>
                    {/* The instruction IS the heading. "Your Turn" sat above a line
                        that said the only thing a student needs here, so the section
                        now leads with that line instead of naming itself. */}
                    <h2 className="text-xl font-semibold">
                      📝{" "}
                      {challenge.status === "completed"
                        ? "Review the questions and feedback from your completed attempt."
                        : allChoice
                          ? "Choose the correct answer for each question."
                          : choiceQuestions.length
                            ? "Pick the multiple-choice answers here, then write the rest on paper."
                            : "Write your answers on paper."}
                    </h2>
                    {challenge.status === "completed" && !challenge.latestAttempt ? (
                      <div className="mt-5 rounded-xl border border-warning/40 bg-warning/10 p-4 text-sm text-text-secondary">
                        This result is saved, but its answer details are unavailable for review.
                      </div>
                    ) : null}
                    {content.examQuestions.length ? (
                      <div className="mt-6 space-y-5">
                        {[...choiceQuestions, ...writtenQuestions].map((question) => {
                          const options = question.options ?? [];
                          // Written questions are numbered on their own: the
                          // answer sheet labels them 1, 2… and is read that way.
                          const label = options.length
                            ? `Question ${choiceQuestions.indexOf(question) + 1} · Multiple choice`
                            : `${choiceQuestions.length ? "Written question" : "Question"} ${writtenQuestions.indexOf(question) + 1}`;
                          return (
                            <article key={question.id} className="rounded-xl bg-bg-secondary p-5">
                              <p className="text-xs font-semibold uppercase tracking-wide text-text-muted">
                                {label} · {question.marks} marks
                              </p>
                              <Markdown
                                text={question.question}
                                className="mt-2 text-sm font-semibold leading-6"
                              />
                              {options.length ? (
                                <div
                                  className="mt-4 grid gap-2"
                                  role="radiogroup"
                                  aria-label={`${label} options`}
                                >
                                  {options.map((option) => {
                                    const picked = choices[question.id] === option.key;
                                    const locked = challenge.status === "completed" || submitting || examExpired;
                                    return (
                                      <button
                                        key={option.key}
                                        type="button"
                                        role="radio"
                                        aria-checked={picked}
                                        disabled={locked}
                                        onClick={() =>
                                          setChoices((current) => ({ ...current, [question.id]: option.key }))
                                        }
                                        className={`flex min-h-11 items-start gap-3 rounded-lg border px-3 py-2.5 text-left text-sm transition-colors disabled:cursor-default ${
                                          picked
                                            ? "border-blue-600 bg-blue-500/10"
                                            : "border-border bg-card hover:bg-bg-secondary"
                                        }`}
                                      >
                                        <span
                                          className={`flex size-6 shrink-0 items-center justify-center rounded-full border text-xs font-semibold ${
                                            picked ? "border-blue-600 bg-blue-600 text-white" : "border-border"
                                          }`}
                                        >
                                          {option.key}
                                        </span>
                                        <Markdown text={option.text} className="min-w-0 flex-1 leading-6" />
                                      </button>
                                    );
                                  })}
                                </div>
                              ) : null}
                            </article>
                          );
                        })}
                        {allChoice && examExpired && challenge.status !== "completed" ? (
                          <div className="rounded-xl border border-warning/40 bg-warning/10 p-5">
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
                  </>
                ) : null}

                {/* The clock is in the corner; it is not repeated here. */}
                {practiceStage === "upload" && challenge.status !== "completed" ? (
                  <div>
                    <h2 className="text-xl font-semibold">📤 Submit Your Answer Sheet</h2>
                    <p className="mt-2 text-sm text-text-muted">
                      {choiceQuestions.length
                        ? `Upload one clear PDF or photo of your written answer. Your ${answeredChoices} of ${choiceQuestions.length} multiple-choice answers are handed in with it.`
                        : "Upload one clear PDF or photo containing all numbered answers."}
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

                {practiceStage === "result" ? (
                  <div>
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
                                    {resultEvaluation.chapters.length === 1
                                      ? "chapter"
                                      : "chapters"}{" "}
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
                ) : null}
              </div>
            ) : null}
          </section>

          {error ? (
            <p
              role="alert"
              className="mt-4 rounded-xl border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive"
            >
              {error}
            </p>
          ) : null}

          {/* Grows to fill a short page, so the bar sits at the foot of the
              screen rather than under the last card; never less than a gap. */}
          <div aria-hidden="true" className="min-h-8 flex-1" />
          {mcqPage ? null : (
          <footer
            className={`sticky bottom-0 z-20 -mx-4 flex items-center justify-between gap-4 border-t border-border px-4 py-3 backdrop-blur sm:-mx-8 sm:px-8 ${
              focusMode ? "bg-bg-primary/95" : "bg-bg-secondary/95"
            }`}
          >
            <button
              type="button"
              disabled={activeStep === 1 || submitting || savingStep !== null}
              onClick={goBack}
              className={`${focusButtonClass} border border-border bg-card text-text-primary`}
            >
              ← Previous
            </button>
            {activeStep < 2 ? (
              <button
                type="button"
                /* Leaving the learn step records its worked examples as reviewed.
                   While they are still being built the student has not seen them,
                   so the step cannot be left yet — the same gate main put on the
                   old step three, moved to where that section now lives. */
                disabled={savingStep !== null || submitting || buildingRest}
                onClick={() => void goNext()}
                className={`${focusButtonClass} bg-blue-600 text-white`}
              >
                {savingStep
                  ? "Saving…"
                  : buildingRest
                    ? "Working the past questions…"
                    : "Start practising →"}
              </button>
            ) : practiceStage === "questions" && challenge.status !== "completed" && allChoice ? (
              <button
                type="button"
                aria-busy={submitting}
                disabled={!answeredChoices || submitting || examExpired}
                onClick={() => void submitChoices()}
                className={`${focusButtonClass} bg-blue-600 text-white`}
              >
                {submitting
                  ? "Marking…"
                  : answeredChoices < choiceQuestions.length
                    ? `Submit ${answeredChoices} of ${choiceQuestions.length} answers`
                    : "Submit answers"}
              </button>
            ) : practiceStage === "questions" && challenge.status !== "completed" ? (
              <button
                type="button"
                disabled={!content.examQuestions.length}
                onClick={() => setPracticeStage("upload")}
                className={`${focusButtonClass} bg-blue-600 text-white`}
              >
                {choiceQuestions.length ? "Upload written answer →" : "Upload answers →"}
              </button>
            ) : practiceStage === "questions" && challenge.status === "completed" ? (
              <button
                type="button"
                onClick={() => setPracticeStage("result")}
                className={`${focusButtonClass} bg-blue-600 text-white`}
              >
                See result →
              </button>
            ) : resultReady && practiceStage === "result" ? (
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
          )}
        </div>
      </div>
      {feedbackOpen ? (
        <ChallengeFeedbackModal grading={submitting} onDone={finishFeedback} />
      ) : null}
    </main>
  );
}

/** A non-negative whole count, or 0 for anything that is not a finite number. */
function count(value: unknown) {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? Math.max(0, Math.floor(parsed)) : 0;
}

/**
 * How much of a subject the student has worked through, as one filling bar.
 *
 * Counted in subtopics — the unit a challenge is set on — so "12 of 38" means
 * twelve subtopics have a COMPLETED challenge, out of everything the
 * subject's syllabus lists. A subject whose catalogue has not been read yet has
 * no denominator, and says so rather than drawing an empty bar that reads as
 * "you have done nothing".
 */
/** Exported for tests. */
export function SubjectCoverage({ progress }: { progress?: { covered: number; total: number } }) {
  // Counts are read defensively: a row from a payload that predates a field — a
  // tab left open across a deploy, a stale server module in dev — arrives with
  // `undefined`, and `Math.min(undefined, 44)` is what printed "NaN of 44".
  const total = count(progress?.total);
  if (!progress || total <= 0) {
    return <p className="flex-1 min-w-0 text-[13px] text-text-muted">Topics not mapped yet</p>;
  }
  const covered = Math.min(count(progress.covered), total);
  const percent = Math.round((covered / total) * 100);
  return (
    <div className="flex-1 min-w-0 max-w-[340px]">
      <div className="flex items-baseline justify-between gap-3 text-[12px]">
        <span className="text-text-muted">
          {covered} of {total} subtopics completed
        </span>
        <span className="font-semibold tabular-nums text-text-secondary">{percent}%</span>
      </div>
      {/* An outlined track with the fill inset inside it. The track is tinted
          from the fill's own blue rather than a surface token: on the dark card
          `bg-bg-secondary` is the card's own colour, and the bar vanished. */}
      <div
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
        aria-label={`${percent}% of this subject's challenges completed`}
        className="mt-2 h-3 w-full overflow-hidden rounded-full border border-[#2563eb]/40 bg-[#2563eb]/[0.08] p-[2px]"
      >
        <div
          className="h-full rounded-full bg-[#2563eb] transition-[width] duration-500 ease-out motion-reduce:transition-none"
          // A nub even at 0%: a round dot at the start of the track, so it reads
          // as a bar that has begun and is waiting to fill. In pixels, not
          // percent — a percent floor is a dot on a phone and a dash on a desktop.
          style={{ width: `${percent}%`, minWidth: 6 }}
        />
      </div>
    </div>
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
  /**
   * Each subject's own progress, under the key the server already gave it.
   * `scopeKey` is `${courseId ?? "owner-private"}:${slug}` — the same string a
   * challenge row resolves to below, so the two cannot drift apart.
   */
  const subjectProgress = useMemo(() => {
    const byKey = new Map<string, { covered: number; total: number }>();
    for (const subject of dashboard.subjects) {
      // Completed CHALLENGES only. `practicedTopics` also counts practice sets,
      // MCQ checks and exams, which is not what this bar says it measures.
      byKey.set(subject.scopeKey, { covered: subject.completedTopics, total: subject.totalTopics });
    }
    return byKey;
  }, [dashboard.subjects]);
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

  /**
   * Save the running semester and reload the queue it scopes.
   *
   * The same write the Library used to make (`PATCH …/membership`), and a full
   * refresh after it rather than a patch: which subjects the queue draws from,
   * which challenges are assigned and every count above them all change with
   * the semester, so there is no smaller update that would be true.
   */
  /**
   * The chosen semester, named, when it has nothing in it. A picked semester is
   * never widened to the rest of the programme (see `subjectsInCurrentTerm`), so
   * an empty one has to say so rather than look like a broken hub.
   */
  const emptySemesterLabel = (() => {
    const termId = dashboard.community?.currentTermId;
    if (!termId || dashboard.subjects.length) return "";
    const term = dashboard.community?.terms.find((item) => item.id === termId);
    return term ? academicNumberLabel(term.semesterNumber, "Semester") : "";
  })();
  const [runningTermId, setRunningTermId] = useState(dashboard.community?.currentTermId ?? "");
  const [savingSemester, setSavingSemester] = useState(false);
  const [semesterError, setSemesterError] = useState("");
  const changeRunningSemester = async (termId: string) => {
    const community = dashboard.community;
    if (!community || !termId || termId === runningTermId || savingSemester) return;
    const previous = runningTermId;
    setRunningTermId(termId);
    setSavingSemester(true);
    setSemesterError("");
    try {
      const response = await fetch(
        `/api/communities/${encodeURIComponent(community.slug)}/membership`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json", Accept: "application/json" },
          body: JSON.stringify({ termId }),
        },
      );
      const payload = (await response.json().catch(() => ({}))) as {
        currentTermId?: string;
        error?: string;
      };
      if (!response.ok || payload.currentTermId !== termId) {
        throw new Error(payload.error || "Could not save your running semester.");
      }
      // Drop any subject filter: it named a subject of the old semester.
      router.replace(`/app/challenges?community=${encodeURIComponent(community.slug)}`);
      router.refresh();
    } catch (cause) {
      setRunningTermId(previous);
      setSemesterError(
        cause instanceof Error ? cause.message : "Could not save your running semester.",
      );
    } finally {
      setSavingSemester(false);
    }
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

  /**
   * From a finished subject's row to its next topic: the server tops the
   * subject's queue up (the same path as the in-challenge Next button), the new
   * card joins the list, and it opens.
   */
  const openNextInSubject = async (done: StudentChallengeSummary) => {
    setOpeningId(done.id);
    setOpenError("");
    try {
      const query = done.courseId
        ? `?${new URLSearchParams({ courseId: done.courseId, subject: done.subjectSlug })}`
        : "";
      const payload = await apiJson<{ challenge: StudentChallengeDetail }>(
        await fetch(`/api/student/challenges/${done.id}/next${query}`, { method: "POST" }),
      );
      patchHub((d) => applyChallengeAdded(d, payload.challenge));
      setSelected(payload.challenge);
    } catch (cause) {
      setOpenError(cause instanceof Error ? cause.message : "Could not open the next topic.");
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

  // Back to the hub — and the hub's URL. A challenge opened from a link keeps
  // `?challenge=<id>` in the address bar, and left there a refresh reopens the
  // challenge the student just exited. Dropped with replaceState, not a router
  // navigation, so leaving does not refetch the page. Stable, because the detail
  // view registers its Escape handler against it.
  const closeChallenge = useCallback(() => {
    setSelected(null);
    const url = new URL(window.location.href);
    if (url.searchParams.has("challenge")) {
      url.searchParams.delete("challenge");
      window.history.replaceState(
        window.history.state,
        "",
        `${url.pathname}${url.search}${url.hash}`,
      );
    }
  }, []);

  if (selected) {
    const nextChallenge = nextAvailableChallenge(dashboard.challenges, selected);
    return (
      <ChallengeDetail
        challenge={selected}
        onBack={closeChallenge}
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
    <main className={hubMainClass}>
      <div className={hubContainerClass}>
        <h1 className={hubTitleClass}>Micro-Topics Hub</h1>

        <StarterChallengeBanner dashboard={dashboard} />

        {/* 3 Metrics Cards */}
        <section
          className={`${hubMetricsClass} challenge-hub-reveal challenge-hub-reveal-delay-1`}
          aria-label="Challenge summary metrics"
        >
          {/* Card 1: Today's Quota */}
          <article className={hubMetricCardClass}>
            <p className="type-student-eyebrow text-[#6b7280] dark:text-text-muted">
              TODAY&apos;S QUOTA
            </p>
            <div className="mt-2 flex items-baseline gap-1.5">
              <span className="type-student-metric text-text-primary">
                {dashboard.todayCompletedCount ??
                  (dashboard.passedThisWeek > 0 ? dashboard.passedThisWeek : 0)}
              </span>
              <span className="type-student-metric text-[#84cc16]">/ 5</span>
            </div>
            <div
              className="mt-3.5 h-1.5 w-full overflow-hidden rounded-full bg-[#f1f3f5] dark:bg-bg-tertiary"
              aria-hidden="true"
            >
              <div
                className="h-full rounded-full bg-[#2563eb] transition-[width] duration-300 motion-reduce:transition-none"
                style={{
                  width: `${Math.min(
                    100,
                    Math.max(
                      ((dashboard.todayCompletedCount ??
                        (dashboard.passedThisWeek > 0 ? dashboard.passedThisWeek : 0)) /
                        5) *
                        100,
                      dashboard.todayCompletedCount || dashboard.passedThisWeek ? 14 : 0,
                    ),
                  )}%`,
                }}
              />
            </div>
          </article>

          {/* Card 2: Daily Target */}
          <article className={hubMetricCardClass}>
            <p className="type-student-eyebrow text-[#6b7280] dark:text-text-muted">DAILY TARGET</p>
            <p className="type-student-metric mt-2 text-text-primary">5</p>
          </article>

          {/* Card 3: 7-Day Average */}
          <article className={hubMetricCardClass}>
            <p className="type-student-eyebrow text-[#6b7280] dark:text-text-muted">
              7-DAY AVERAGE
            </p>
            <p className="type-student-metric mt-2 text-text-primary">
              {dashboard.practicePerDay > 0
                ? dashboard.practicePerDay.toFixed(1)
                : dashboard.averageTestScore !== null
                  ? `${dashboard.averageTestScore.toFixed(1)}%`
                  : "0.0"}
            </p>
          </article>
        </section>

        {/* Available Challenges Section */}
        <section className={`${hubListCardClass} challenge-hub-reveal challenge-hub-reveal-delay-2`}>
          <div className={hubListHeaderClass}>
            <div>
              <h2 className="type-student-section-title text-text-primary">Available challenges</h2>
              {dashboard.scope ? (
                <p className="mt-0.5 text-xs text-text-muted">
                  Showing {dashboard.scope.subjectName} challenges only.
                </p>
              ) : null}
            </div>

            {/* The running semester lives here now, not in the Library: it is the
                thing that decides which subjects this queue draws from, so it
                belongs next to the queue it changes. */}
            {dashboard.community && dashboard.community.terms.length ? (
              <div className="flex flex-col gap-1.5 sm:items-end">
                <div className="flex items-center gap-3">
                  <label
                    htmlFor="running-semester"
                    className="whitespace-nowrap text-[13px] font-medium text-[#6b7280] dark:text-text-muted"
                  >
                    Running Semester
                  </label>
                  <select
                    id="running-semester"
                    value={runningTermId}
                    onChange={(event) => void changeRunningSemester(event.target.value)}
                    disabled={savingSemester}
                    className="min-h-9 cursor-pointer rounded-xl border border-[#e5e7eb] dark:border-border bg-white dark:bg-bg-primary px-3.5 py-1 text-[13px] font-medium text-text-primary shadow-2xs transition-colors duration-100 hover:border-text-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:cursor-wait disabled:opacity-60"
                  >
                    {runningTermId ? null : <option value="">Choose a semester</option>}
                    {dashboard.community.terms.map((term) => (
                      <option key={term.id} value={term.id}>
                        {academicNumberLabel(term.semesterNumber, "Semester")}
                      </option>
                    ))}
                  </select>
                </div>
                {semesterError ? (
                  <p role="alert" className="text-xs text-destructive">
                    {semesterError}
                  </p>
                ) : null}
              </div>
            ) : null}
          </div>

          {dashboard.challenges.length ? (
            <div className={hubRowsClass}>
              {hubRows(dashboard.challenges).map(({ challenge, doneToday }) => {
                const completed = challenge.status === "completed";
                const started = challenge.status === "started";
                const coverage = (
                  <SubjectCoverage
                    progress={subjectProgress.get(
                      `${challenge.courseId ?? "owner-private"}:${challenge.subjectSlug.trim().toLowerCase()}`,
                    )}
                  />
                );
                if (completed) {
                  // A subject whose card is done and has nothing queued after it
                  // yet: today's win, and the one way on from it.
                  const score = scoreText(challenge);
                  return (
                    // The same row as an open challenge — a passed one is not a
                    // banner. What changed is said in words: a tick and the score
                    // where the next step would be, and the way on as a quiet button.
                    <div key={challenge.id} className={hubRowClass}>
                      <div className={hubRowMainClass}>
                        <div className={hubRowSubjectClass}>
                          <p className="font-bold text-[15px] sm:text-[16px] text-text-primary truncate">
                            {challenge.subjectName}
                          </p>
                          <p className="mt-1 text-[14px] sm:text-[15px] leading-6 text-[#4b5563] dark:text-text-secondary line-clamp-2">
                            {challenge.topicTitle}
                          </p>
                        </div>
                        {coverage}
                      </div>
                      <div className={hubRowActionsClass}>
                        <span className="w-[88px] shrink-0 text-right leading-tight">
                          <span className="inline-flex items-center gap-1 text-[14px] font-medium text-success">
                            <Check className="size-4" strokeWidth={2.5} aria-hidden="true" />
                            Passed
                          </span>
                          {score ? (
                            <span className="block text-[11px] tabular-nums text-text-muted">{score}</span>
                          ) : null}
                        </span>
                        <button
                          type="button"
                          onClick={() => void openNextInSubject(challenge)}
                          disabled={openingId === challenge.id}
                          aria-busy={openingId === challenge.id}
                          className="inline-flex min-h-9 w-[104px] shrink-0 items-center justify-center whitespace-nowrap rounded-[10px] border border-border bg-bg-primary px-3 text-[14px] font-semibold text-text-primary transition-colors hover:bg-bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:opacity-60"
                        >
                          {openingId === challenge.id ? "Opening…" : "Next topic"}
                        </button>
                      </div>
                    </div>
                  );
                }
                return (
                  <div key={challenge.id} className={`${hubRowClass} hover:bg-bg-secondary/40`}>
                    <div className={hubRowMainClass}>
                      {/* The subject, and under it the subtopic this challenge
                          is on — the thing a student actually decides by. */}
                      <div className={hubRowSubjectClass}>
                        <p className="font-bold text-[15px] sm:text-[16px] text-text-primary truncate">
                          {challenge.subjectName}
                        </p>
                        <p className="mt-1 text-[14px] sm:text-[15px] leading-6 text-[#4b5563] dark:text-text-secondary line-clamp-2">
                          {challenge.topicTitle}
                        </p>
                        {doneToday.length ? (
                          // What the student finished in this subject today, kept
                          // on the card that replaced it rather than as a row of
                          // its own: the subject reads "done that, doing this".
                          <p className="mt-1.5 flex flex-wrap items-center gap-1.5">
                            {doneToday.map((done) => {
                              const score = scoreText(done);
                              return (
                                <span
                                  key={done.id}
                                  className="inline-flex items-center gap-1 rounded-full bg-success/12 px-2 py-0.5 text-[12px] font-medium text-success"
                                >
                                  <Check className="size-3.5" strokeWidth={3} aria-hidden="true" />
                                  {done.topicTitle}
                                  {score ? ` · ${score}` : ""}
                                </span>
                              );
                            })}
                          </p>
                        ) : null}
                      </div>
                      {coverage}
                    </div>

                    <div className={hubRowActionsClass}>
                      {/* Fixed widths, so the estimates line up and "Continue" and
                          "Start" share an edge down the list. */}
                      <span
                        className="w-[88px] shrink-0 text-right leading-tight"
                        title={
                          challenge.estimatedMinutes
                            ? `Read ${challenge.pastQuestionCount ?? 0} worked past question${challenge.pastQuestionCount === 1 ? "" : "s"}, then answer ${challenge.practiceQuestionCount ?? 2} on paper`
                            : undefined
                        }
                      >
                        {challenge.estimatedMinutes ? (
                          <>
                            <span className="block text-[14px] text-[#6b7280] dark:text-text-muted">
                              ~{challenge.estimatedMinutes} min
                            </span>
                            <span className="block text-[11px] text-text-muted">
                              {challenge.practiceQuestionCount ?? 2} question
                              {challenge.practiceQuestionCount === 1 ? "" : "s"}
                            </span>
                          </>
                        ) : null}
                      </span>
                      <button
                        type="button"
                        onClick={() => void openChallenge(challenge)}
                        disabled={openingId === challenge.id}
                        aria-busy={openingId === challenge.id}
                        className={`inline-flex min-h-9 w-[104px] shrink-0 items-center justify-center rounded-[10px] bg-[#2563eb] px-4 text-[14px] font-semibold text-white shadow-[0_1px_2px_rgba(37,99,235,0.2)] transition-colors hover:bg-[#1d4ed8] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 disabled:opacity-60 ${
                          !started ? "challenge-start-attention" : ""
                        }`}
                      >
                        {openingId === challenge.id ? "Opening…" : started ? "Continue" : "Start"}
                      </button>
                    </div>
                  </div>
                );
              })}
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
                {emptySemesterLabel
                  ? `No ${emptySemesterLabel} subjects yet`
                  : dashboard.scope
                    ? "No challenge is ready for this subject yet"
                    : "No challenges yet"}
              </p>
              <p className="mt-2 text-sm text-text-muted">
                {emptySemesterLabel && dashboard.community
                  ? `${dashboard.community.name} has not published any ${emptySemesterLabel} subjects. If that is not the semester you are in, pick yours above.`
                  : dashboard.scope
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
                <h2 className="type-student-section-title">Completed Challenges</h2>
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
