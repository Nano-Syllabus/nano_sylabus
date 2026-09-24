"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  CHALLENGE_MCQ_COUNT_MAX,
  CHALLENGE_MCQ_COUNT_MIN,
  CHALLENGE_MCQ_EXAM_QUESTIONS,
  challengeNegativeMarkingOptions,
  challengeQuestionFormatLabels,
  challengeQuestionFormats,
  clampMcqCount,
  isChallengeQuestionFormat,
  negativeMarkingPercent,
  type ChallengeQuestionFormat,
} from "@/lib/challenge-format";
import { cn } from "@/lib/utils";

type FormatState = {
  format: ChallengeQuestionFormat;
  confirmed: boolean;
  available: boolean;
  mcqCount: number;
  negativePercent: number;
};

async function putFormat(
  slug: string,
  format: ChallengeQuestionFormat,
  marking: { mcqCount: number; negativePercent: number },
): Promise<FormatState> {
  const response = await fetch(`/api/communities/${encodeURIComponent(slug)}/challenge-format`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ format, ...marking }),
  });
  const payload = (await response.json().catch(() => ({}))) as Partial<FormatState> & { error?: string };
  if (!response.ok) throw new Error(payload.error || "Could not save the challenge question type.");
  return {
    format: isChallengeQuestionFormat(payload.format) ? payload.format : format,
    confirmed: payload.confirmed !== false,
    available: payload.available !== false,
    mcqCount: clampMcqCount(payload.mcqCount ?? marking.mcqCount),
    negativePercent: negativeMarkingPercent(payload.negativePercent ?? marking.negativePercent),
  };
}

/** The three formats as radio cards. `value` null means nothing is chosen yet. */
export function ChallengeFormatOptions({
  name,
  value,
  onChange,
  disabled,
  invalid,
}: {
  name: string;
  value: ChallengeQuestionFormat | null;
  onChange: (format: ChallengeQuestionFormat) => void;
  disabled?: boolean;
  invalid?: boolean;
}) {
  return (
    <div className="grid gap-2 sm:grid-cols-3" role="radiogroup">
      {challengeQuestionFormats.map((format) => {
        const selected = value === format;
        return (
          <label
            key={format}
            className={cn(
              "flex cursor-pointer items-start gap-2.5 rounded-lg border bg-bg-primary p-3 text-left transition-colors",
              selected
                ? "border-text-primary"
                : invalid
                  ? "border-destructive/60"
                  : "border-border hover:border-text-muted",
              disabled && "cursor-not-allowed opacity-60",
            )}
          >
            <input
              type="radio"
              name={name}
              value={format}
              checked={selected}
              disabled={disabled}
              onChange={() => onChange(format)}
              className="mt-0.5 accent-current"
            />
            <span className="min-w-0">
              <span className="block text-sm font-medium">{challengeQuestionFormatLabels[format].title}</span>
              <span className="mt-0.5 block text-xs leading-snug text-text-muted">
                {challengeQuestionFormatLabels[format].description}
              </span>
            </span>
          </label>
        );
      })}
    </div>
  );
}

/**
 * The community settings card: the format every student in the community gets.
 * Saving moves each student's open exam to the new format at their next sitting.
 */
export function CommunityChallengeFormatSettings({ slug }: { slug: string }) {
  const [saved, setSaved] = useState<FormatState | null>(null);
  const [draft, setDraft] = useState<ChallengeQuestionFormat | null>(null);
  const [mcqCount, setMcqCount] = useState(CHALLENGE_MCQ_EXAM_QUESTIONS);
  const [negativePercent, setNegativePercent] = useState(0);
  const [loadError, setLoadError] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/communities/${encodeURIComponent(slug)}/challenge-format`, {
      headers: { Accept: "application/json" },
      cache: "no-store",
    })
      .then(async (response) => {
        const payload = (await response.json().catch(() => ({}))) as Partial<FormatState> & { error?: string };
        if (!response.ok) throw new Error(payload.error || "Could not load the challenge question type.");
        return payload;
      })
      .then((payload) => {
        if (cancelled) return;
        const state: FormatState = {
          format: isChallengeQuestionFormat(payload.format) ? payload.format : "qna",
          confirmed: Boolean(payload.confirmed),
          available: payload.available !== false,
          mcqCount: clampMcqCount(payload.mcqCount ?? CHALLENGE_MCQ_EXAM_QUESTIONS),
          negativePercent: negativeMarkingPercent(payload.negativePercent),
        };
        setSaved(state);
        setDraft(state.confirmed ? state.format : null);
        setMcqCount(state.mcqCount);
        setNegativePercent(state.negativePercent);
      })
      .catch((caught) => {
        if (!cancelled) setLoadError(caught instanceof Error ? caught.message : "Could not load this setting.");
      });
    return () => {
      cancelled = true;
    };
  }, [slug]);

  async function save() {
    if (!draft) return;
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const next = await putFormat(slug, draft, { mcqCount, negativePercent });
      setSaved(next);
      setMessage(
        `Saved. Every student's next challenge exam will be ${challengeQuestionFormatLabels[next.format].title}.`,
      );
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not save.");
    } finally {
      setSaving(false);
    }
  }

  const unchanged = Boolean(
    saved?.confirmed &&
      draft === saved.format &&
      mcqCount === saved.mcqCount &&
      negativePercent === saved.negativePercent,
  );
  const marksMcq = draft === "mcq" || draft === "hybrid";

  return (
    <section className="mt-7 rounded-xl border border-border bg-bg-primary p-5 sm:p-6">
      <h2 className="font-display text-xl font-semibold">Challenge questions</h2>
      <p className="mb-4 mt-2 text-sm text-text-secondary">
        The type of questions every student in this community answers in their challenge exam. A change
        applies to all students from their next sitting.
      </p>
      {loadError ? (
        <p className="text-sm text-destructive">{loadError}</p>
      ) : !saved ? (
        <div className="grid gap-2 sm:grid-cols-3" aria-busy="true" aria-label="Loading">
          {[0, 1, 2].map((key) => (
            <span key={key} className="h-20 animate-pulse rounded-lg bg-border" />
          ))}
        </div>
      ) : (
        <>
          {!saved.available ? (
            <p className="mb-3 rounded-lg border border-warning/40 bg-warning/10 p-3 text-sm">
              This setting needs the latest database migration before it can be saved. Students get written
              questions until then.
            </p>
          ) : !saved.confirmed ? (
            <p className="mb-3 text-sm text-text-muted">
              Not chosen yet. Students currently get written (QnA) questions.
            </p>
          ) : null}
          <ChallengeFormatOptions
            name={`challenge-format-${slug}`}
            value={draft}
            disabled={saving || !saved.available}
            onChange={(format) => {
              setDraft(format);
              setMessage("");
              setError("");
            }}
          />
          {marksMcq ? (
            <div className="mt-4 grid gap-4 rounded-lg border border-border bg-bg-secondary p-4 sm:grid-cols-2">
              {draft === "mcq" ? (
                <label className="block text-sm">
                  <span className="font-medium">Questions per challenge</span>
                  <span className="mt-0.5 block text-xs text-text-muted">
                    {CHALLENGE_MCQ_COUNT_MIN}–{CHALLENGE_MCQ_COUNT_MAX}, answered on one page.
                  </span>
                  <input
                    type="number"
                    inputMode="numeric"
                    min={CHALLENGE_MCQ_COUNT_MIN}
                    max={CHALLENGE_MCQ_COUNT_MAX}
                    value={mcqCount}
                    disabled={saving || !saved.available}
                    onChange={(event) => setMcqCount(Number(event.target.value))}
                    onBlur={() => setMcqCount((value) => clampMcqCount(value))}
                    className="mt-2 h-10 w-28 rounded-lg border border-border bg-bg-primary px-3 text-sm"
                  />
                </label>
              ) : null}
              <label className="block text-sm">
                <span className="font-medium">Negative marking</span>
                <span className="mt-0.5 block text-xs text-text-muted">
                  Taken off for each wrong answer. Skipped questions lose nothing.
                </span>
                <select
                  value={negativePercent}
                  disabled={saving || !saved.available}
                  onChange={(event) => setNegativePercent(Number(event.target.value))}
                  className="mt-2 h-10 rounded-lg border border-border bg-bg-primary px-3 text-sm"
                >
                  {challengeNegativeMarkingOptions.map((percent) => (
                    <option key={percent} value={percent}>
                      {percent ? `${percent}% of the question's marks` : "None"}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          ) : null}
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <Button
              type="button"
              size="sm"
              disabled={!draft || unchanged || saving || !saved.available}
              onClick={() => void save()}
            >
              {saving ? "Saving…" : "Save"}
            </Button>
            {message ? <p className="text-sm text-text-muted">{message}</p> : null}
            {error ? <p className="text-sm text-destructive">{error}</p> : null}
          </div>
        </>
      )}
    </section>
  );
}
