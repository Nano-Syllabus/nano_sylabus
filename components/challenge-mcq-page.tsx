"use client";

import { Check, Loader2, Minus, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Explainer } from "@/components/challenge-fundamentals";
import { Markdown } from "@/components/markdown";
import type { ExamChoiceResult } from "@/lib/data/challenge-exam-picks";
import type { StudentChallengeDetail, StudentChallengeSummary } from "@/lib/data/student-challenges";
import { cn } from "@/lib/utils";

/**
 * An MCQ community's challenge: one page, the concepts and the questions.
 *
 * The community's creator chose MCQ (`lib/challenge-format.ts`) — a licence-exam
 * community, say — so there are no past questions to write out, no worked
 * examples and no second step: the student reads the concepts above this, picks
 * an answer to each question here, and hands the page in. The result leads with
 * what they need: right, wrong, skipped, and what negative marking took off.
 */

type Outcome = "correct" | "wrong" | "skipped";

export type McqReview = {
  questionId: string;
  outcome: Outcome;
  chosen: string;
  correct: string;
  score: number;
};

export type McqResult = {
  totalScore: number;
  totalMarks: number;
  passed: boolean;
  passMarks: number;
  tally: { correct: number; wrong: number; skipped: number; earned: number; penalty: number; negativePercent: number };
  review: McqReview[];
};

type Graded = {
  challenge: StudentChallengeDetail;
  totalScore: number;
  totalMarks: number;
  passed: boolean;
  tally: McqResult["tally"];
  review: McqReview[];
  error?: string;
  nextInSubject?: StudentChallengeSummary | null;
};

function formatMarks(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(2).replace(/0$/, "");
}

/**
 * The result of an attempt this screen did not see handed in — a reload, or a
 * challenge opened from the hub after it was finished. The saved attempt keeps
 * each answer's text and its mark; a positive mark was right, a negative one
 * was penalised, and an empty answer was skipped.
 */
function savedResult(challenge: StudentChallengeDetail): McqResult | null {
  const attempt = challenge.latestAttempt;
  if (!attempt?.answers?.length || challenge.lastScore === null) return null;
  const review = attempt.answers.map((answer) => {
    const skipped = !answer.answerText || answer.answerText === "[Not answered]";
    const chosen = skipped ? "" : answer.answerText.split(".")[0]?.trim() ?? "";
    const correct = /correct answer is ([A-Z])\./.exec(answer.feedback || "")?.[1] ?? (answer.score > 0 ? chosen : "");
    const outcome: Outcome = answer.score > 0 ? "correct" : skipped ? "skipped" : "wrong";
    return { questionId: answer.questionId, outcome, chosen, correct, score: answer.score };
  });
  const tally = {
    correct: review.filter((item) => item.outcome === "correct").length,
    wrong: review.filter((item) => item.outcome === "wrong").length,
    skipped: review.filter((item) => item.outcome === "skipped").length,
    earned: review.reduce((sum, item) => sum + Math.max(0, item.score), 0),
    penalty: review.reduce((sum, item) => sum + Math.max(0, -item.score), 0),
    negativePercent: challenge.content?.examNegativePercent ?? 0,
  };
  return {
    totalScore: challenge.lastScore ?? 0,
    totalMarks: challenge.lastTotalMarks ?? challenge.totalMarks,
    passed: challenge.status === "completed",
    passMarks: challenge.passMarks,
    tally,
    review,
  };
}

export function ChallengeMcqPage({
  challenge,
  building,
  buildFailed,
  onGraded,
  onRetake,
  onStalePaper,
  onNext,
  nextLabel,
  nextDisabled,
}: {
  challenge: StudentChallengeDetail;
  /** The questions are still being set behind the concepts. */
  building: boolean;
  buildFailed: string;
  onGraded: (graded: {
    challenge: StudentChallengeDetail;
    passed: boolean;
    nextInSubject?: StudentChallengeSummary | null;
  }) => void;
  /** Swaps in the fresh paper a failed attempt was handed (see `persistStudentChallengeGrade`). */
  onRetake: () => void;
  /** The row holds a different paper from the one on screen: load the current one. */
  onStalePaper: () => Promise<void>;
  onNext: () => void;
  nextLabel: string;
  nextDisabled: boolean;
}) {
  const content = challenge.content;
  const questions = useMemo(
    () => (content?.examQuestions ?? []).filter((question) => question.options?.length),
    [content?.examQuestions],
  );
  /** Each answered question's verdict — final once made, restored on reload. */
  const [checked, setChecked] = useState<Record<string, ExamChoiceResult>>({});
  const [checking, setChecking] = useState<Record<string, string>>({});
  const [checkErrors, setCheckErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<McqResult | null>(() =>
    challenge.status === "completed" ? savedResult(challenge) : null,
  );
  /** The paper the result was for: a failed attempt's row already holds the next one. */
  const [reviewed, setReviewed] = useState<typeof questions | null>(null);

  // Another challenge opened in the same screen starts clean.
  useEffect(() => {
    setChecked({});
    setCheckErrors({});
    setError("");
    setResult(challenge.status === "completed" ? savedResult(challenge) : null);
    setReviewed(null);
    // Only when the challenge itself changes, not on each poll of its content.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [challenge.id]);

  const negativePercent = content?.examNegativePercent ?? 0;
  const marksEach = questions[0]?.marks ?? 0;
  const penaltyEach = Math.round(((marksEach * negativePercent) / 100) * 100) / 100;
  const answered = questions.filter((question) => checked[question.id]).length;
  const runningScore = questions.reduce((sum, question) => sum + (checked[question.id]?.score ?? 0), 0);

  async function check(questionId: string, selected: string) {
    setChecking((current) => ({ ...current, [questionId]: selected }));
    setCheckErrors((current) => ({ ...current, [questionId]: "" }));
    try {
      const response = await fetch(`/api/student/challenges/${challenge.id}/choices/check`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ questionId, selected }),
      });
      const payload = (await response.json().catch(() => ({}))) as {
        result?: ExamChoiceResult;
        error?: string;
        stale?: boolean;
      };
      if (payload.stale) {
        // This screen was painted from an older paper: swap in the one the row
        // holds rather than leave every option failing with the same message.
        setChecked({});
        setCheckErrors({});
        await onStalePaper();
        return;
      }
      if (!response.ok || !payload.result) throw new Error(payload.error || "That answer could not be checked.");
      setChecked((current) => ({ ...current, [questionId]: payload.result! }));
    } catch (cause) {
      setCheckErrors((current) => ({
        ...current,
        [questionId]: cause instanceof Error ? cause.message : "That answer could not be checked.",
      }));
    } finally {
      setChecking((current) => Object.fromEntries(Object.entries(current).filter(([id]) => id !== questionId)));
    }
  }

  // Picks already made on this paper (a reload, another device) come back
  // with their verdicts: checking a recorded pick reads it, it never re-picks.
  const picksKey = JSON.stringify(content?.examPicks ?? {});
  useEffect(() => {
    const picks = content?.examPicks ?? {};
    const missing = Object.entries(picks).filter(([id]) => !checked[id] && questions.some((q) => q.id === id));
    for (const [id, key] of missing) void check(id, key);
    // Only when the recorded picks or the paper change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [picksKey, questions]);
  const expiresAt = Date.parse(content?.examExpiresAt || "");
  const expired = Number.isFinite(expiresAt) && expiresAt <= Date.now();

  async function submit() {
    setSubmitting(true);
    setError("");
    const paper = questions;
    try {
      const response = await fetch(`/api/student/challenges/${challenge.id}/submit-choices`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          answers: Object.fromEntries(Object.entries(checked).map(([id, item]) => [id, item.selected])),
        }),
      });
      const payload = (await response.json().catch(() => ({}))) as Graded;
      if (!response.ok) {
        if (payload.challenge) {
          setChecked({});
          onGraded({ challenge: payload.challenge, passed: false });
        }
        throw new Error(payload.error || "Could not mark your answers.");
      }
      setReviewed(paper);
      setResult({
        totalScore: payload.totalScore,
        totalMarks: payload.totalMarks,
        passed: payload.passed,
        passMarks: challenge.passMarks,
        tally: payload.tally,
        review: payload.review,
      });
      onGraded({ challenge: payload.challenge, passed: payload.passed, nextInSubject: payload.nextInSubject });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not mark your answers.");
    } finally {
      setSubmitting(false);
    }
  }

  if (result) {
    const shown = reviewed ?? questions;
    const verdict = new Map(result.review.map((item) => [item.questionId, item]));
    const { tally } = result;
    return (
      <section aria-labelledby="mcq-result-heading" className="mt-8">
        <div
          className={cn(
            "rounded-xl border p-5",
            result.passed ? "border-success/40 bg-success/10" : "border-warning/40 bg-warning/10",
          )}
        >
          <p className="text-xs font-semibold uppercase tracking-wide text-text-muted">
            {result.passed ? "Passed" : "Not passed yet"}
          </p>
          <h2 id="mcq-result-heading" className="mt-1 font-display text-3xl font-semibold">
            {formatMarks(result.totalScore)}
            <span className="text-lg text-text-muted"> / {formatMarks(result.totalMarks)}</span>
          </h2>
          <p className="mt-1 text-sm text-text-secondary">
            Pass mark {formatMarks(result.passMarks)}.
            {tally.penalty > 0
              ? ` ${formatMarks(tally.earned)} earned − ${formatMarks(tally.penalty)} negative marking.`
              : ""}
          </p>
          <dl className="mt-4 grid grid-cols-3 gap-2 text-center">
            {(
              [
                ["Correct", tally.correct, "text-success"],
                ["Wrong", tally.wrong, "text-destructive"],
                ["Skipped", tally.skipped, "text-text-muted"],
              ] as const
            ).map(([label, value, tone]) => (
              <div key={label} className="rounded-lg bg-bg-primary px-2 py-3">
                <dt className="text-xs text-text-muted">{label}</dt>
                <dd className={cn("mt-0.5 font-display text-2xl font-semibold", tone)}>{value}</dd>
              </div>
            ))}
          </dl>
          {tally.negativePercent ? (
            <p className="mt-3 text-xs text-text-muted">
              Negative marking: {tally.negativePercent}% of a question&apos;s marks off for each wrong answer.
              Skipped questions lose nothing.
            </p>
          ) : null}
        </div>

        <ol className="mt-6 space-y-4">
          {shown.map((question, index) => {
            const item = verdict.get(question.id);
            return (
              <li key={question.id} className="rounded-xl bg-bg-secondary p-5">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-text-muted">
                    Question {index + 1}
                  </p>
                  {item ? (
                    <span
                      className={cn(
                        "inline-flex items-center gap-1 text-xs font-semibold",
                        item.outcome === "correct"
                          ? "text-success"
                          : item.outcome === "wrong"
                            ? "text-destructive"
                            : "text-text-muted",
                      )}
                    >
                      {item.outcome === "correct" ? (
                        <Check className="size-3.5" aria-hidden="true" />
                      ) : item.outcome === "wrong" ? (
                        <X className="size-3.5" aria-hidden="true" />
                      ) : (
                        <Minus className="size-3.5" aria-hidden="true" />
                      )}
                      {item.outcome === "correct" ? "Correct" : item.outcome === "wrong" ? "Wrong" : "Skipped"} ·{" "}
                      {item.score > 0 ? "+" : ""}
                      {formatMarks(item.score)}
                    </span>
                  ) : null}
                </div>
                <Markdown text={question.question} className="mt-2 text-sm font-semibold leading-6" />
                <ul className="mt-3 grid gap-2">
                  {(question.options ?? []).map((option) => {
                    const isCorrect = item?.correct === option.key;
                    const isChosenWrong = item?.chosen === option.key && !isCorrect;
                    return (
                      <li
                        key={option.key}
                        className={cn(
                          "flex items-start gap-3 rounded-lg border px-3 py-2.5 text-sm",
                          isCorrect
                            ? "border-success/60 bg-success/10"
                            : isChosenWrong
                              ? "border-destructive/60 bg-destructive/10"
                              : "border-border bg-card",
                        )}
                      >
                        <span className="flex size-6 shrink-0 items-center justify-center rounded-full border border-border text-xs font-semibold">
                          {option.key}
                        </span>
                        <Markdown text={option.text} className="min-w-0 flex-1 leading-6" />
                        {isCorrect ? <span className="sr-only">Correct answer</span> : null}
                        {isChosenWrong ? <span className="sr-only">Your answer</span> : null}
                      </li>
                    );
                  })}
                </ul>
              </li>
            );
          })}
        </ol>

        <div className="mt-6 flex flex-wrap justify-end gap-3">
          {!result.passed ? (
            <button
              type="button"
              onClick={() => {
                setResult(null);
                setReviewed(null);
                setChecked({});
                onRetake();
              }}
              className="min-h-11 rounded-lg border border-border bg-card px-4 text-sm font-semibold hover:bg-bg-secondary"
            >
              Try a fresh set
            </button>
          ) : null}
          <button
            type="button"
            disabled={nextDisabled}
            onClick={onNext}
            className="min-h-11 rounded-lg bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
          >
            {nextLabel}
          </button>
        </div>
      </section>
    );
  }

  return (
    <section aria-labelledby="mcq-heading" className="mt-8">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 id="mcq-heading" className="font-display text-xl font-semibold">
          MCQ practice
        </h2>
        {questions.length ? (
          <p className="text-xs text-text-muted">
            {questions.length} questions · {formatMarks(marksEach)} marks each
            {negativePercent ? ` · −${formatMarks(penaltyEach)} for a wrong answer` : " · no negative marking"}
          </p>
        ) : null}
      </div>

      {buildFailed ? (
        <p className="mt-4 rounded-xl border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
          {buildFailed}
        </p>
      ) : !questions.length && !building ? (
        // Built, but with no choices on the paper: the course server could not
        // set MCQs. Say so and offer another go — never an endless spinner.
        <div className="mt-4 rounded-xl border border-warning/40 bg-warning/10 p-5">
          <p className="text-sm">
            {content?.examWarning?.trim() || "The multiple-choice questions for this topic could not be set."}
          </p>
          <button
            type="button"
            onClick={onRetake}
            className="mt-4 min-h-11 rounded-lg bg-text-primary px-4 text-sm font-semibold text-text-inverse"
          >
            Try again
          </button>
        </div>
      ) : !questions.length ? (
        <div className="mt-4 rounded-xl bg-bg-secondary p-5" aria-busy="true">
          <p className="flex items-center gap-2 text-sm text-text-muted">
            <Loader2 className="size-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />
            Setting your questions from the course material…
          </p>
          <div className="mt-4 space-y-2">
            {[0, 1, 2, 3].map((row) => (
              <span key={row} className="block h-11 animate-pulse rounded-lg bg-border motion-reduce:animate-none" />
            ))}
          </div>
        </div>
      ) : (
        <>
          <ol className="mt-4 space-y-4">
            {questions.map((question, index) => {
              const result = checked[question.id];
              return (
                <li key={question.id} className="rounded-xl bg-bg-secondary p-5">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-text-muted">
                      Question {index + 1} of {questions.length}
                    </p>
                    {result ? (
                      <span
                        className={cn(
                          "text-xs font-semibold",
                          result.isCorrect ? "text-success" : result.score < 0 ? "text-destructive" : "text-text-muted",
                        )}
                      >
                        {result.score > 0 ? "+" : ""}
                        {formatMarks(result.score)}
                      </span>
                    ) : null}
                  </div>
                  <Markdown text={question.question} className="mt-2 text-sm font-semibold leading-6" />
                  <div className="mt-3 grid gap-2" role="radiogroup" aria-label={`Question ${index + 1} options`}>
                    {(question.options ?? []).map((option) => {
                      const isCorrect = result?.correct === option.key;
                      const isChosenWrong = result ? result.selected === option.key && !result.isCorrect : false;
                      const pending = checking[question.id] === option.key;
                      return (
                        <button
                          key={option.key}
                          type="button"
                          role="radio"
                          aria-checked={result?.selected === option.key}
                          // An answer is final: the key is on screen the moment it is chosen.
                          disabled={Boolean(result) || Boolean(checking[question.id]) || submitting || expired}
                          onClick={() => void check(question.id, option.key)}
                          className={cn(
                            "flex min-h-11 items-start gap-3 rounded-lg border px-3 py-2.5 text-left text-sm transition-colors disabled:cursor-default",
                            isCorrect
                              ? "border-success bg-success/10"
                              : isChosenWrong
                                ? "border-destructive bg-destructive/10"
                                : "border-border bg-card",
                            !result && !checking[question.id] ? "hover:border-blue-500/60" : "",
                            result && !isCorrect && !isChosenWrong ? "opacity-60" : "",
                            pending ? "animate-pulse motion-reduce:animate-none" : "",
                          )}
                        >
                          <span
                            className={cn(
                              "flex size-6 shrink-0 items-center justify-center rounded-full border text-xs font-semibold",
                              isCorrect
                                ? "border-success bg-success text-white"
                                : isChosenWrong
                                  ? "border-destructive bg-destructive text-white"
                                  : "border-border",
                            )}
                          >
                            {isCorrect ? (
                              <Check className="size-3.5" strokeWidth={3} aria-hidden="true" />
                            ) : isChosenWrong ? (
                              <X className="size-3.5" strokeWidth={3} aria-hidden="true" />
                            ) : (
                              option.key
                            )}
                            {isCorrect || isChosenWrong ? <span className="sr-only">{option.key}</span> : null}
                          </span>
                          <Markdown text={option.text} className="min-w-0 flex-1 leading-6" />
                          {isCorrect ? (
                            <span className="sr-only">(correct answer)</span>
                          ) : isChosenWrong ? (
                            <span className="sr-only">(your answer, incorrect)</span>
                          ) : null}
                        </button>
                      );
                    })}
                  </div>
                  {checkErrors[question.id] ? (
                    <p className="mt-2 text-sm text-destructive">{checkErrors[question.id]}</p>
                  ) : null}
                  {result ? (
                    <div className="mt-4 space-y-3" aria-live="polite">
                      {result.isCorrect ? (
                        <p className="text-sm font-semibold text-success">Correct.</p>
                      ) : (
                        <div className="rounded-lg border border-success/40 bg-success/10 p-3">
                          <p className="text-sm font-semibold text-success">Correct answer: {result.correct}</p>
                          <Markdown text={result.correctText} className="mt-0.5 text-sm" />
                          {result.explanation ? (
                            <Markdown text={result.explanation} className="mt-1.5 text-xs leading-5 text-text-secondary" />
                          ) : null}
                        </div>
                      )}
                      {result.isCorrect ? null : (
                        <Explainer
                          challengeId={challenge.id}
                          questionId={question.id}
                          selected={result.selected}
                          endpoint={`/api/student/challenges/${encodeURIComponent(challenge.id)}/choices/explain`}
                        />
                      )}
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ol>

          {error ? (
            <p role="alert" className="mt-4 text-sm text-destructive">
              {error}
            </p>
          ) : null}

          <div className="sticky bottom-0 z-10 -mx-5 mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-border bg-card/95 px-5 py-3 backdrop-blur sm:-mx-8 sm:px-8">
            <p className="text-sm text-text-muted">
              {answered} of {questions.length} answered · {formatMarks(Math.max(0, runningScore))} marks so far
              {negativePercent && answered < questions.length ? " · blanks lose nothing" : ""}
            </p>
            {expired ? (
              <button
                type="button"
                onClick={onRetake}
                className="min-h-11 rounded-lg bg-text-primary px-4 text-sm font-semibold text-text-inverse"
              >
                This set expired — get a fresh one
              </button>
            ) : (
              <button
                type="button"
                aria-busy={submitting}
                disabled={!answered || submitting}
                onClick={() => void submit()}
                className="min-h-11 rounded-lg bg-blue-600 px-5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
              >
                {submitting ? "Marking…" : answered < questions.length ? "Finish now" : "See your score"}
              </button>
            )}
          </div>
        </>
      )}
    </section>
  );
}
