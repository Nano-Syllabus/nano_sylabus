"use client";

import { Flame } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { ChallengeSubject, StudentChallengeDashboard } from "@/lib/data/student-challenge-dashboard";
import type {
  StudentChallengeDetail,
  StudentChallengeSummary,
} from "@/lib/data/student-challenges";

function percent(value: number | null) {
  return value === null ? "—" : `${Math.round(value)}%`;
}

function subjectInitials(name: string) {
  return name
    .split(/\s+/)
    .map((word) => word[0])
    .join("")
    .slice(0, 2)
    .toUpperCase() || "CH";
}

function scoreChange(value: number | null) {
  if (value === null) return "Challenge score · first week";
  const rounded = Math.round(value);
  return `Challenge score · ${rounded >= 0 ? "+" : ""}${rounded} pts`;
}

function ChallengeCard({
  challenge,
  subject,
  busy,
  onOpen,
}: {
  challenge: StudentChallengeSummary;
  subject?: ChallengeSubject;
  busy: boolean;
  onOpen: () => void;
}) {
  const status =
    challenge.status === "completed"
      ? "Completed"
      : challenge.status === "started"
        ? "Continue"
        : "Recommended";
  return (
    <div className="mb-[25px]">
      <div className="mb-[10px] flex items-center justify-between border-b border-border px-[2px] pb-[10px]">
        <div>
          <div className="text-[17px] font-[750] text-text-primary">{challenge.subjectName}</div>
          <div className="mt-1 text-[12px] text-text-muted">
            {!subject || subject.readiness === null ? "No graded topic yet" : `${Math.round(subject.readiness)}% ready`}
            {" · "}
            {subject?.weakTopics ?? 0} weak topic{subject?.weakTopics === 1 ? "" : "s"}
          </div>
        </div>
        <div className="text-[20px] font-[750] text-blue-600 dark:text-blue-400">
          {percent(subject?.readiness ?? null)}
        </div>
      </div>

      <button
        type="button"
        onClick={onOpen}
        disabled={busy}
        className="grid min-h-20 w-full grid-cols-[48px_1fr] items-center gap-4 rounded-[16px] border border-border bg-card p-[19px_20px] text-left transition-[border-color,box-shadow] duration-150 hover:border-blue-500/50 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 focus-visible:ring-offset-bg-primary sm:grid-cols-[48px_1fr_auto]"
      >
        <span className="grid h-[48px] w-[48px] place-items-center rounded-[14px] bg-blue-500/10 text-[15px] font-[800] text-blue-600 dark:text-blue-400">
          {subjectInitials(challenge.topicTitle)}
        </span>
        <span className="min-w-0">
          <span className="mb-[5px] block truncate text-[17px] font-[720] text-text-primary">
            {challenge.title}
          </span>
          <span className="flex flex-wrap items-center gap-2.5 text-[13px] text-text-muted">
            <span className="rounded-[7px] bg-bg-secondary px-2 py-1 text-[12px] text-text-secondary">
              {status}
            </span>
            <span className="line-clamp-1">{challenge.recommendationReason}</span>
          </span>
        </span>
        <span className="col-start-2 flex items-center justify-end sm:col-start-auto">
          <span className="mr-3 text-[13px] text-text-muted">~{challenge.durationMinutes} min</span>
          <span className="rounded-[22px] bg-text-primary px-4 py-2 text-[13px] font-[700] text-text-inverse">
            {busy ? "Building…" : challenge.status === "assigned" ? "Start →" : "Open →"}
          </span>
        </span>
      </button>
    </div>
  );
}

function CompletedChallengeCard({
  challenge,
  busy,
  onOpen,
}: {
  challenge: StudentChallengeSummary;
  busy: boolean;
  onOpen: () => void;
}) {
  const score = challenge.lastTotalMarks && challenge.lastScore !== null
    ? `${challenge.lastScore} / ${challenge.lastTotalMarks}`
    : "Passed";

  return (
    <button
      type="button"
      onClick={onOpen}
      disabled={busy}
      className="grid w-full grid-cols-[44px_1fr_auto] items-center gap-3 rounded-[14px] border border-border bg-card p-4 text-left transition-colors hover:border-blue-500/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:opacity-60"
    >
      <span className="grid h-11 w-11 place-items-center rounded-xl bg-success/10 text-sm font-extrabold text-success">
        ✓
      </span>
      <span className="min-w-0">
        <span className="block truncate text-sm font-semibold text-text-primary">{challenge.title}</span>
        <span className="mt-1 block truncate text-xs text-text-muted">
          {challenge.subjectName} · {score} · {challenge.date}
        </span>
      </span>
      <span className="text-xs font-semibold text-text-secondary">
        {busy ? "Opening…" : "Review →"}
      </span>
    </button>
  );
}

type GradeResult = {
  question_id: string;
  score: number;
  marks: number;
  feedback: string;
};

async function apiJson<T>(response: Response): Promise<T> {
  const payload = (await response.json().catch(() => ({}))) as T & { error?: string };
  if (!response.ok) throw new Error(payload.error || "Request failed.");
  return payload;
}

function ChallengeDetail({
  challenge,
  onBack,
  onChange,
}: {
  challenge: StudentChallengeDetail;
  onBack: () => void;
  onChange: (challenge: StudentChallengeDetail) => void;
}) {
  const router = useRouter();
  const [savingStep, setSavingStep] = useState<"lesson" | "examples" | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [results, setResults] = useState<GradeResult[]>([]);
  const [score, setScore] = useState<{ earned: number; total: number; passed: boolean } | null>(null);
  const [clock, setClock] = useState(() => Date.now());
  const content = challenge.content;

  useEffect(() => {
    if (challenge.status === "completed" || !content?.examExpiresAt) return;
    const timer = window.setInterval(() => setClock(Date.now()), 1_000);
    return () => window.clearInterval(timer);
  }, [challenge.status, content?.examExpiresAt]);

  if (!content) return null;

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
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not save progress.");
    } finally {
      setSavingStep(null);
    }
  };

  const submit = async () => {
    setSubmitting(true);
    setError("");
    try {
      const response = await fetch(`/api/student/challenges/${challenge.id}/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          answers: content.examQuestions.map((question) => ({
            questionId: question.id,
            answerText: answers[question.id]?.trim() || "",
          })),
        }),
      });
      const payload = (await response.json().catch(() => ({}))) as {
        challenge: StudentChallengeDetail;
        results: GradeResult[];
        totalScore: number;
        totalMarks: number;
        passed: boolean;
        error?: string;
      };
      if (!response.ok) {
        if (payload.challenge) {
          setAnswers({});
          onChange(payload.challenge);
        }
        throw new Error(payload.error || "Could not grade the challenge.");
      }
      setResults(payload.results);
      setScore({ earned: payload.totalScore, total: payload.totalMarks, passed: payload.passed });
      if (!payload.passed) setAnswers({});
      onChange(payload.challenge);
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not grade the challenge.");
    } finally {
      setSubmitting(false);
    }
  };

  const readyForExam = challenge.lessonRead && challenge.examplesReviewed;
  const allAnswered = content.examQuestions.every((question) => answers[question.id]?.trim());
  const expiresAt = Date.parse(content.examExpiresAt || "");
  const remainingSeconds = Number.isFinite(expiresAt)
    ? Math.max(0, Math.ceil((expiresAt - clock) / 1_000))
    : null;
  const examExpired = remainingSeconds === 0;
  const timeRemaining = remainingSeconds === null
    ? null
    : `${Math.floor(remainingSeconds / 60)}:${String(remainingSeconds % 60).padStart(2, "0")}`;

  const refreshExam = async () => {
    setSubmitting(true);
    setError("");
    try {
      const payload = await apiJson<{ challenge: StudentChallengeDetail }>(
        await fetch(`/api/student/challenges/${challenge.id}/start`, { method: "POST" }),
      );
      setAnswers({});
      setResults([]);
      setScore(null);
      setClock(Date.now());
      onChange(payload.challenge);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not issue a fresh exam.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="min-h-screen w-full bg-bg-primary text-text-primary">
      <div className="mx-auto max-w-[1160px] px-4 py-8 pb-20 sm:px-8">
        <button type="button" onClick={onBack} className="mb-5 text-sm text-text-muted hover:text-text-primary">
          ← Back to challenges
        </button>
        <p className="text-sm font-semibold uppercase tracking-wide text-blue-600 dark:text-blue-400">
          Challenge · {challenge.subjectName}
        </p>
        <h1 className="mt-2 font-display text-3xl font-semibold tracking-tight">{challenge.title}</h1>
        <p className="mt-2 text-sm text-text-muted">{challenge.recommendationReason}</p>

        <section className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[
            ["1", "Check prerequisites", true],
            ["2", "Learn", challenge.lessonRead],
            ["3", "Study worked questions", challenge.examplesReviewed],
            ["4", "Pass the exam", challenge.status === "completed"],
          ].map(([number, label, done]) => (
            <div key={String(number)} className="rounded-[15px] border border-border bg-card p-4">
              <span className={`grid h-7 w-7 place-items-center rounded-full text-xs font-bold ${done ? "bg-success/15 text-success" : "bg-bg-secondary"}`}>
                {done ? "✓" : number}
              </span>
              <p className="mt-3 text-sm font-semibold">{label}</p>
            </div>
          ))}
        </section>

        <section className="mt-4 rounded-[18px] border border-border bg-card p-6">
          <p className="text-xs font-semibold uppercase tracking-wide text-blue-600 dark:text-blue-400">Step 1 · Prerequisites</p>
          <h2 className="mt-2 text-xl font-semibold">Before this topic</h2>
          {content.prerequisites?.length ? (
            <ul className="mt-4 space-y-2">
              {content.prerequisites.map((prerequisite) => (
                <li key={prerequisite.topicKey} className="flex items-start justify-between gap-4 rounded-xl border border-border bg-bg-secondary/50 p-4 text-sm">
                  <span>
                    <strong className="text-text-primary">{prerequisite.title}</strong>
                    {prerequisite.reason ? <span className="mt-1 block text-text-muted">{prerequisite.reason}</span> : null}
                  </span>
                  <span className={prerequisite.taught ? "text-success" : "text-warning"}>
                    {prerequisite.taught ? "Available" : "Notes missing"}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-3 text-sm text-text-muted">The syllabus does not place an earlier topic before this one.</p>
          )}
        </section>

        <section className="mt-4 rounded-[18px] border border-border bg-card p-6">
          <p className="text-xs font-semibold uppercase tracking-wide text-blue-600 dark:text-blue-400">Step 2 · Read</p>
          <h2 className="mt-2 text-xl font-semibold">{content.lesson.title}</h2>
          {content.lesson.content.map((paragraph) => (
            <p key={paragraph} className="mt-3 max-w-prose text-sm leading-7 text-text-secondary">{paragraph}</p>
          ))}
          <p className="mt-3 max-w-prose text-sm leading-7 text-text-secondary"><strong>Focus:</strong> {content.lesson.focus}</p>
          {content.lesson.sources?.length ? (
            <div className="mt-4 rounded-xl border border-border bg-bg-secondary/50 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-text-muted">Grounded in</p>
              <ul className="mt-2 space-y-2 text-sm text-text-secondary">
                {content.lesson.sources.map((source, index) => (
                  <li key={`${source.source}-${index}`}>
                    <strong className="text-text-primary">{source.title}</strong>
                    <span className="text-text-muted"> · {source.source}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          <button
            type="button"
            disabled={challenge.lessonRead || savingStep !== null}
            onClick={() => void markStep("lesson")}
            className="mt-4 rounded-full bg-text-primary px-4 py-2 text-sm font-semibold text-text-inverse disabled:opacity-60"
          >
            {challenge.lessonRead ? "Lesson read ✓" : savingStep === "lesson" ? "Saving…" : "I’ve read this"}
          </button>
        </section>

        <section className="mt-4 rounded-[18px] border border-border bg-card p-6">
          <p className="text-xs font-semibold uppercase tracking-wide text-blue-600 dark:text-blue-400">Step 3 · Worked questions</p>
          <h2 className="mt-2 text-xl font-semibold">Study these worked examples</h2>
          <div className="mt-4 space-y-3">
            {content.solvedExamples.map((example, index) => (
              <article key={`${example.question}-${index}`} className="rounded-xl border border-border bg-bg-secondary/50 p-4">
                <p className="text-xs text-text-muted">
                  {example.grounded === false || example.source === "generated_from_notes"
                    ? "Worked example from course notes"
                    : example.year
                      ? `Past question · ${example.year}`
                      : "Past question"}
                  {" · "}{example.marks} marks
                </p>
                <p className="mt-2 text-sm font-semibold leading-6">{example.question}</p>
                <p className="mt-3 border-t border-border pt-3 text-sm leading-6 text-text-secondary"><strong>Solution:</strong> {example.solution}</p>
              </article>
            ))}
          </div>
          <button
            type="button"
            disabled={!challenge.lessonRead || challenge.examplesReviewed || savingStep !== null}
            onClick={() => void markStep("examples")}
            className="mt-4 rounded-full bg-text-primary px-4 py-2 text-sm font-semibold text-text-inverse disabled:opacity-60"
          >
            {challenge.examplesReviewed ? "Examples reviewed ✓" : savingStep === "examples" ? "Saving…" : "I’ve studied both"}
          </button>
        </section>

        <section className="mt-4 rounded-[18px] border border-blue-500/40 bg-blue-500/5 p-6">
          <p className="text-xs font-semibold uppercase tracking-wide text-blue-600 dark:text-blue-400">Step 4 · Prove it</p>
          <h2 className="mt-2 text-xl font-semibold">Take the challenge exam</h2>
          <p className="mt-2 text-sm text-text-muted">
            {content.examQuestions.length} unseen questions · {challenge.durationMinutes} minutes · {Math.round((challenge.passMarks / Math.max(1, challenge.totalMarks)) * 100)}% required
            {timeRemaining && challenge.status !== "completed" ? ` · ${timeRemaining} remaining` : ""}
          </p>
          {!readyForExam ? <p className="mt-4 text-sm text-text-muted">Complete the reading and worked questions to unlock the exam.</p> : null}
          {readyForExam ? (
            <div className="mt-5 space-y-5">
              {content.examQuestions.map((question, index) => (
                <label key={question.id} className="block">
                  <span className="text-sm font-semibold">{index + 1}. {question.question} <span className="text-text-muted">({question.marks} marks)</span></span>
                  <textarea
                    rows={5}
                    value={answers[question.id] ?? ""}
                    disabled={challenge.status === "completed" || submitting}
                    onChange={(event) => setAnswers((current) => ({ ...current, [question.id]: event.target.value }))}
                    className="mt-2 w-full rounded-xl border border-border bg-bg-primary p-3 text-sm outline-none focus:border-blue-500"
                    placeholder="Write your answer without looking at the solved examples…"
                  />
                </label>
              ))}
              {challenge.status !== "completed" ? (
                <button
                  type="button"
                  disabled={(!examExpired && !allAnswered) || submitting}
                  onClick={() => void (examExpired ? refreshExam() : submit())}
                  className="rounded-full bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 focus-visible:ring-offset-bg-primary disabled:opacity-50"
                >
                  {submitting
                    ? examExpired ? "Issuing…" : "Grading…"
                    : examExpired
                      ? "Get a fresh exam"
                      : challenge.attemptCount ? "Submit another attempt" : "Submit for grading"}
                </button>
              ) : null}
            </div>
          ) : null}
          {score ? (
            <div className={`mt-5 rounded-xl border p-4 ${score.passed ? "border-success/40 bg-success/10" : "border-warning/40 bg-warning/10"}`}>
              <p className="font-semibold">{score.earned} / {score.total} · {score.passed ? "Challenge completed ✓" : "Not passed yet"}</p>
              <div className="mt-3 space-y-2 text-sm text-text-secondary">
                {results.map((result) => <p key={result.question_id}>{result.feedback}</p>)}
              </div>
            </div>
          ) : challenge.status === "completed" ? (
            <p className="mt-5 rounded-xl border border-success/40 bg-success/10 p-4 font-semibold text-success">Challenge completed ✓</p>
          ) : null}
        </section>
        {content.warning ? <p className="mt-4 text-xs text-warning">{content.warning}</p> : null}
        {error ? <p className="mt-4 rounded-xl border border-destructive/40 p-3 text-sm text-destructive">{error}</p> : null}
      </div>
    </main>
  );
}

export function ChallengesDashboardClient({ dashboard }: { dashboard: StudentChallengeDashboard }) {
  const [selected, setSelected] = useState<StudentChallengeDetail | null>(null);
  const [openingId, setOpeningId] = useState("");
  const [openError, setOpenError] = useState("");
  const leaderboard = dashboard.leaderboard;
  const streakCopy = dashboard.todayCompleted
    ? "is complete for today."
    : dashboard.currentStreak > 0
      ? `keeps your ${dashboard.currentStreak}-day streak alive.`
      : "starts your consistency streak.";
  const platformBest = leaderboard?.platformBestStreak ?? 0;
  const comparisonCopy = !leaderboard
    ? "Leaderboard is being prepared"
    : platformBest === 0
      ? "Pass the first challenge to set the pace"
      : dashboard.currentStreak > 0 && leaderboard.daysFromBest === 0
        ? "You’ve matched the all-time best streak"
        : `${leaderboard.daysFromBest} ${leaderboard.daysFromBest === 1 ? "day" : "days"} from the all-time best streak`;

  const openChallenge = async (challenge: StudentChallengeSummary) => {
    setOpeningId(challenge.id);
    setOpenError("");
    try {
      const payload = await apiJson<{ challenge: StudentChallengeDetail }>(
        await fetch(`/api/student/challenges/${challenge.id}/start`, { method: "POST" }),
      );
      setSelected(payload.challenge);
    } catch (cause) {
      setOpenError(cause instanceof Error ? cause.message : "Could not open this challenge.");
    } finally {
      setOpeningId("");
    }
  };

  if (selected) {
    return <ChallengeDetail challenge={selected} onBack={() => setSelected(null)} onChange={setSelected} />;
  }

  return (
    <main className="min-h-screen w-full bg-bg-primary text-text-primary">
      <div className="mx-auto max-w-[1160px] px-4 py-8 pb-20 sm:px-8">
        <section className="mb-[30px] flex flex-col items-start justify-between gap-5 rounded-[15px] border border-border bg-bg-secondary p-[17px_20px] sm:flex-row sm:items-center">
          <div>
            <h1 className="mb-1 text-[15px] font-[750] text-text-primary">Today&apos;s minimum</h1>
            <p className="text-[13px] text-text-secondary">
              <strong className="font-semibold text-text-primary">1 challenge</strong> {streakCopy}
            </p>
          </div>
          <div className="w-full sm:w-[190px]">
            <span className="mb-[5px] block text-right text-[12px] text-text-muted">
              {dashboard.todayCompleted ? "1 / 1" : "0 / 1"}
            </span>
            <div className="h-[7px] overflow-hidden rounded-full bg-bg-tertiary" aria-hidden="true">
              <span
                className="block h-full rounded-full bg-blue-500 transition-[width] duration-500 motion-reduce:transition-none"
                style={{ width: dashboard.todayCompleted ? "100%" : "0%" }}
              />
            </div>
          </div>
        </section>

        <section className="mb-6 grid grid-cols-1 gap-[18px] lg:grid-cols-[1.55fr_.9fr]">
          <article className="rounded-[18px] border border-border bg-card p-[25px_27px]">
            <h2 className="mb-[5px] text-[18px] font-[730] text-text-primary">Exam readiness</h2>
            <p className="text-[14px] text-text-muted">Across all your subjects</p>
            <p className="mt-5 text-[40px] font-[760] tracking-[-1.5px] text-text-primary">
              {percent(dashboard.readiness)}
            </p>
            <div className="my-[9px_12px] h-[12px] overflow-hidden rounded-full bg-bg-secondary" aria-hidden="true">
              <span
                className="block h-full rounded-full bg-blue-500"
                style={{ width: `${Math.max(0, Math.min(100, dashboard.readiness ?? 0))}%` }}
              />
            </div>
            <div className="flex flex-wrap justify-between gap-2 text-[13px] text-text-muted">
              <span>{dashboard.practicedTopics} of {dashboard.totalTopics} topics practised</span>
              <span className="font-medium text-blue-600 dark:text-blue-400">
                {scoreChange(dashboard.practiceScoreChange)}
              </span>
            </div>
            <div className="mt-[18px] border-t border-border pt-[15px]">
              {dashboard.subjects.length ? (
                dashboard.subjects.slice(0, 5).map((subject) => (
                  <div key={subject.scopeKey} className="my-[9px] grid grid-cols-[minmax(100px,145px)_1fr_40px] items-center gap-[10px] text-[12px] text-text-secondary">
                    <span className="truncate">{subject.name}</span>
                    <div className="h-[6px] overflow-hidden rounded-full bg-bg-secondary" aria-hidden="true">
                      <span
                        className="block h-full rounded-full bg-blue-400 dark:bg-blue-500"
                        style={{ width: `${Math.max(0, Math.min(100, subject.readiness ?? 0))}%` }}
                      />
                    </div>
                    <strong className="text-right text-[12px] font-bold text-text-primary">
                      {percent(subject.readiness)}
                    </strong>
                  </div>
                ))
              ) : (
                <p className="text-[13px] text-text-muted">Join a course to calculate readiness.</p>
              )}
            </div>
          </article>

          <article className="flex flex-col justify-between rounded-[18px] border border-border bg-gradient-to-br from-bg-primary via-bg-primary to-blue-500/5 p-[25px_27px] dark:to-blue-950/20">
            <div>
              <div className="flex items-start justify-between">
                <div>
                  <h2 className="mb-[5px] text-[18px] font-[730] text-text-primary">Consistency streak</h2>
                  <p className="mt-3 text-[39px] font-[760] tracking-[-1.5px] text-text-primary">
                    {dashboard.currentStreak} {dashboard.currentStreak === 1 ? "day" : "days"}
                  </p>
                  <p className="text-[14px] text-text-muted">You · current streak</p>
                </div>
                <Flame className="h-8 w-8 text-text-secondary" aria-hidden="true" />
              </div>
              <div className="mt-[14px] flex items-center justify-between border-t border-border pt-[10px] text-[13px] text-text-muted">
                <span>Your rank</span>
                <strong className="font-bold text-text-primary">
                  {leaderboard?.currentStreakRank ? `#${leaderboard.currentStreakRank}` : "—"}
                </strong>
              </div>
              <div className="mt-2 flex items-center justify-between border-t border-border pt-[10px] text-[13px] text-text-muted">
                <span>Platform all-time best</span>
                <strong className="font-bold text-text-primary">
                  {leaderboard
                    ? `${platformBest} ${platformBest === 1 ? "day" : "days"} · #1`
                    : "—"}
                </strong>
              </div>
            </div>
            <div className="mt-[17px] inline-flex w-fit items-center gap-[7px] rounded-[20px] border border-blue-500/30 bg-card p-[7px_11px] text-[12px] font-bold text-blue-600 dark:text-blue-400">
              {comparisonCopy}
            </div>
          </article>
        </section>

        <section className="mb-7 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <article className="rounded-[15px] border border-border bg-card p-[18px_20px]">
            <p className="mb-[7px] text-[13px] font-medium tracking-wide text-text-muted">YOUR CHALLENGES / DAY</p>
            <p className="text-[24px] font-[750] text-text-primary">{dashboard.practicePerDay.toFixed(1)}</p>
            <p className="mt-1 text-[12px] text-text-muted">7-day average · Rank {leaderboard?.practicePerDayRank ? `#${leaderboard.practicePerDayRank}` : "—"}</p>
          </article>
          <article className="rounded-[15px] border border-blue-500/30 bg-blue-500/5 p-[18px_20px] dark:bg-blue-950/20">
            <p className="mb-[7px] text-[13px] font-medium tracking-wide text-blue-600 dark:text-blue-400">TOP CHALLENGES / DAY</p>
            <p className="text-[24px] font-[750] text-text-primary">{leaderboard ? leaderboard.topPracticePerDay.toFixed(1) : "—"}</p>
            <p className="mt-1 text-[12px] text-text-muted">Current #1 · 7-day average</p>
          </article>
          <article className="rounded-[15px] border border-border bg-card p-[18px_20px]">
            <p className="mb-[7px] text-[13px] font-medium tracking-wide text-text-muted">CHALLENGES PASSED</p>
            <p className="text-[24px] font-[750] text-text-primary">{dashboard.passedThisMonth}</p>
            <p className="mt-1 text-[12px] text-text-muted">This month · {dashboard.passedThisWeek} this week</p>
          </article>
          <article className="rounded-[15px] border border-border bg-card p-[18px_20px]">
            <p className="mb-[7px] text-[13px] font-medium tracking-wide text-text-muted">CHALLENGE PASS RATE</p>
            <p className="text-[24px] font-[750] text-text-primary">{percent(dashboard.passRateLast30Days)}</p>
            <p className="mt-1 text-[12px] text-text-muted">Last 30 days</p>
          </article>
        </section>

        <section>
          <div className="mb-[14px] mt-[30px] flex items-end justify-between">
            <div>
              <h2 className="m-0 text-[22px] font-[750] tracking-[-.5px] text-text-primary">Today&apos;s challenges</h2>
              <p className="mb-0 mt-1.5 text-[13px] text-text-muted">Passing one brings the next eligible course topic to the top.</p>
            </div>
          </div>

          {dashboard.challenges.length ? (
            dashboard.challenges.map((challenge) => (
              <ChallengeCard
                key={challenge.id}
                challenge={challenge}
                subject={dashboard.subjects.find(
                  (subject) =>
                    subject.slug === challenge.subjectSlug &&
                    subject.courseId === challenge.courseId,
                )}
                busy={openingId === challenge.id}
                onOpen={() => void openChallenge(challenge)}
              />
            ))
          ) : (
            <div className="rounded-[14px] border border-dashed border-border bg-bg-secondary/40 p-6 text-center">
              <p className="text-[15px] font-semibold text-text-primary">No challenges yet</p>
              <p className="mt-1 text-[13px] text-text-muted">Join a course and its real topics will appear here.</p>
              <Link
                href="/app/courses"
                className="mt-4 inline-flex min-h-10 items-center rounded-[22px] bg-text-primary px-4 text-[13px] font-[700] text-text-inverse focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 focus-visible:ring-offset-bg-primary"
              >
                Browse courses
              </Link>
            </div>
          )}
          {openError ? <p className="mt-4 rounded-xl border border-destructive/40 p-3 text-sm text-destructive">{openError}</p> : null}
        </section>

        {dashboard.completedChallengeTotal > 0 ? (
          <section id="completed-challenges" className="mt-10 border-t border-border pt-8">
            <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
              <div>
                <h2 className="text-[20px] font-[750] tracking-[-.4px] text-text-primary">Completed challenges</h2>
                <p className="mt-1 text-[13px] text-text-muted">
                  {dashboard.completedChallengeTotal} passed challenge{dashboard.completedChallengeTotal === 1 ? "" : "s"}, newest first.
                </p>
              </div>
              {dashboard.completedChallengeTotalPages > 1 ? (
                <p className="text-xs text-text-muted">
                  Page {dashboard.completedChallengePage} of {dashboard.completedChallengeTotalPages}
                </p>
              ) : null}
            </div>

            <div className="space-y-3">
              {dashboard.completedChallenges.map((challenge) => (
                <CompletedChallengeCard
                  key={challenge.id}
                  challenge={challenge}
                  busy={openingId === challenge.id}
                  onOpen={() => void openChallenge(challenge)}
                />
              ))}
            </div>

            {dashboard.completedChallengeTotalPages > 1 ? (
              <nav className="mt-5 flex items-center justify-between" aria-label="Completed challenges pagination">
                {dashboard.completedChallengePage > 1 ? (
                  <Link
                    href={`/app/today?completedPage=${dashboard.completedChallengePage - 1}#completed-challenges`}
                    className="rounded-full border border-border px-4 py-2 text-sm font-semibold hover:border-blue-500/40"
                  >
                    ← Previous
                  </Link>
                ) : <span />}
                {dashboard.completedChallengePage < dashboard.completedChallengeTotalPages ? (
                  <Link
                    href={`/app/today?completedPage=${dashboard.completedChallengePage + 1}#completed-challenges`}
                    className="rounded-full border border-border px-4 py-2 text-sm font-semibold hover:border-blue-500/40"
                  >
                    Next →
                  </Link>
                ) : <span />}
              </nav>
            ) : null}
          </section>
        ) : null}
      </div>
    </main>
  );
}
