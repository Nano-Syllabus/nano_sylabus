"use client";

import { Loader2 } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import {
  EXPECTED_SCORE_BANDS,
  EXPERIENCE_RATINGS,
  type ExpectedScoreBand,
  type ExperienceRating,
} from "@/lib/challenge-feedback";

const RATING_LABELS: Record<ExperienceRating, { face: string; label: string }> = {
  1: { face: "😞", label: "Poor" },
  2: { face: "🙁", label: "Fair" },
  3: { face: "😐", label: "Okay" },
  4: { face: "🙂", label: "Good" },
  5: { face: "😄", label: "Great" },
};

const BAND_LABELS: Record<ExpectedScoreBand, string> = {
  "0-25": "0–25%",
  "26-50": "26–50%",
  "51-75": "51–75%",
  "76-100": "76–100%",
};

export type ChallengeFeedbackChoice =
  | { skipped: true }
  | { skipped: false; experienceRating: ExperienceRating; expectedScoreBand: ExpectedScoreBand };

/**
 * Two questions, asked while the answer sheet is being graded.
 *
 * The student has just finished and has not seen their marks — the one moment
 * "what do you expect to score?" is an honest question. Both answers are
 * buttons, never text. There is deliberately no close button and Escape does
 * nothing: the way out is Skip, which is recorded as a skip, so every sitting
 * says either what the student thought or that they chose not to say.
 */
export function ChallengeFeedbackModal({
  grading,
  onDone,
}: {
  /** Whether the sheet is still being read, for the status line. */
  grading: boolean;
  onDone: (choice: ChallengeFeedbackChoice) => void;
}) {
  const [rating, setRating] = useState<ExperienceRating | null>(null);
  const [band, setBand] = useState<ExpectedScoreBand | null>(null);
  const titleId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const firstOptionRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    firstOptionRef.current?.focus();
    // Keep Tab inside the dialog: it is modal, and the page behind it is inert.
    const keepFocus = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        return;
      }
      if (event.key !== "Tab" || !dialogRef.current) return;
      const focusable = dialogRef.current.querySelectorAll<HTMLElement>(
        "button:not([disabled])",
      );
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", keepFocus);
    return () => window.removeEventListener("keydown", keepFocus);
  }, []);

  const option = (selected: boolean) =>
    `rounded-xl border px-3 py-2.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
      selected
        ? "border-blue-600 bg-blue-600 text-white"
        : "border-border bg-bg-primary text-text-primary hover:border-blue-400"
    }`;

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 p-4">
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="w-full max-w-md rounded-2xl border border-border bg-card p-6 text-text-primary shadow-xl sm:p-7"
      >
        <p className="flex items-center gap-2 text-xs text-text-muted" aria-live="polite">
          {grading ? (
            <>
              <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
              Checking your answers…
            </>
          ) : (
            "Your answers are checked."
          )}
        </p>
        <h2 id={titleId} className="mt-2 text-lg font-semibold">
          Two quick questions
        </h2>

        <fieldset className="mt-5">
          <legend className="text-sm font-medium">Rate your learning experience for this challenge.</legend>
          <div role="radiogroup" aria-label="Learning experience" className="mt-3 grid grid-cols-5 gap-2">
            {EXPERIENCE_RATINGS.map((value, index) => (
              <button
                key={value}
                ref={index === 0 ? firstOptionRef : undefined}
                type="button"
                role="radio"
                aria-checked={rating === value}
                onClick={() => setRating(value)}
                className={`${option(rating === value)} flex flex-col items-center gap-1 px-1`}
              >
                <span aria-hidden="true" className="text-xl leading-none">
                  {RATING_LABELS[value].face}
                </span>
                <span className="text-[11px]">{RATING_LABELS[value].label}</span>
              </button>
            ))}
          </div>
        </fieldset>

        <fieldset className="mt-6">
          <legend className="text-sm font-medium">What is your expected score for this challenge?</legend>
          <div role="radiogroup" aria-label="Expected score" className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {EXPECTED_SCORE_BANDS.map((value) => (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={band === value}
                onClick={() => setBand(value)}
                className={option(band === value)}
              >
                {BAND_LABELS[value]}
              </button>
            ))}
          </div>
        </fieldset>

        <div className="mt-7 flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={() => onDone({ skipped: true })}
            className="min-h-10 rounded-lg px-4 text-sm font-semibold text-text-muted hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
          >
            Skip
          </button>
          <button
            type="button"
            disabled={rating === null || band === null}
            onClick={() => {
              if (rating === null || band === null) return;
              onDone({ skipped: false, experienceRating: rating, expectedScoreBand: band });
            }}
            className="min-h-10 rounded-lg bg-blue-600 px-5 text-sm font-semibold text-white hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Submit
          </button>
        </div>
      </div>
    </div>
  );
}
