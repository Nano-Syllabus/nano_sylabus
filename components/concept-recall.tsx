"use client";

import { useId } from "react";
import { useConceptStudy } from "@/components/use-concept-study";

const button =
  "rounded-lg border border-border px-3 py-2 text-sm font-semibold text-text-primary hover:bg-bg-tertiary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:opacity-50";

export function ConceptRecall({
  title,
  storageKey,
  covered,
  onCover,
  onRate,
}: {
  title: string;
  storageKey: string;
  covered: boolean;
  onCover: (cover: boolean) => void;
  onRate: (rating: "review" | "ready") => void;
}) {
  const [work, update] = useConceptStudy(storageKey);
  const id = useId();
  return (
    <aside
      className="my-5 rounded-xl border border-blue-500/30 bg-bg-secondary p-4 font-sans sm:p-5"
      data-concept-recall
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-blue-600 dark:text-blue-400">
          Recall from your notes
        </p>
        {work.confidence !== "unrated" && (
          <span
            className={`text-xs font-semibold ${work.confidence === "ready" ? "text-green-700 dark:text-green-400" : "text-amber-700 dark:text-amber-400"}`}
          >
            {work.confidence === "ready" ? "Self-checked" : "Revisit this section"}
          </span>
        )}
      </div>
      <p className="mt-2 text-sm text-text-secondary">
        Explain {title.replace(/^\d+[.)]\s*/, "")} from memory. Include the reasoning, relation or
        conditions you need.
      </p>
      <button
        type="button"
        className={`${button} mt-3`}
        aria-pressed={covered}
        onClick={() => onCover(!covered)}
      >
        {covered ? "Show notes to compare" : "Cover notes and try"}
      </button>
      <label htmlFor={id} className="mt-4 block text-sm font-medium text-text-primary">
        Your explanation
      </label>
      <textarea
        id={id}
        rows={3}
        maxLength={12000}
        value={work.answer}
        onChange={(event) => update({ answer: event.target.value, confidence: "unrated" })}
        placeholder="Write what you remember, then compare it with the notes above…"
        className="mt-2 w-full resize-y rounded-lg border border-border bg-bg-primary p-3 text-sm leading-relaxed text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
      />
      {work.answer.trim() && !covered && (
        <>
          <p className="mt-3 text-xs text-text-muted">
            Compare your explanation with the original notes. Check the idea, the working and the
            conditions. This is your self-assessment.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              className={button}
              onClick={() => {
                update({ confidence: "review" });
                onRate("review");
              }}
            >
              I need another pass
            </button>
            <button
              type="button"
              className={`${button} border-green-600/40 text-green-700 dark:text-green-400`}
              onClick={() => {
                update({ confidence: "ready" });
                onRate("ready");
              }}
            >
              I can explain this
            </button>
          </div>
        </>
      )}
      {!work.answer.trim() && (
        <p className="mt-2 text-xs text-text-muted">
          Your draft stays on this browser. Use paper if you prefer, then jot down the key point
          here.
        </p>
      )}
    </aside>
  );
}
