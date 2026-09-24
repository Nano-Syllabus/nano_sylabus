"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  challengeQuestionFormatLabels,
  challengeQuestionFormats,
  isChallengeQuestionFormat,
  type ChallengeQuestionFormat,
} from "@/lib/challenge-format";
import { cn } from "@/lib/utils";

type FormatState = { format: ChallengeQuestionFormat; confirmed: boolean; available: boolean };

async function putFormat(slug: string, format: ChallengeQuestionFormat): Promise<FormatState> {
  const response = await fetch(`/api/communities/${encodeURIComponent(slug)}/challenge-format`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ format }),
  });
  const payload = (await response.json().catch(() => ({}))) as Partial<FormatState> & { error?: string };
  if (!response.ok) throw new Error(payload.error || "Could not save the challenge question type.");
  return {
    format: isChallengeQuestionFormat(payload.format) ? payload.format : format,
    confirmed: payload.confirmed !== false,
    available: payload.available !== false,
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
        };
        setSaved(state);
        setDraft(state.confirmed ? state.format : null);
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
      const next = await putFormat(slug, draft);
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

  const unchanged = Boolean(saved?.confirmed && draft === saved.format);

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
