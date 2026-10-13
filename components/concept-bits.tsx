"use client";

import { Markdown } from "@/components/markdown";
import { useConceptStudy } from "@/components/use-concept-study";
import type { ConceptActivity } from "@/lib/concept-activities";
import type { ConceptActivityProps } from "@/components/concept-activity";

export function ConceptBits({
  activity,
  storageKey,
  onComplete,
  onReview,
}: ConceptActivityProps & { activity: Extract<ConceptActivity, { kind: "bits" }> }) {
  const [work, update] = useConceptStudy(storageKey);
  const limit = 2 ** activity.bit_width;
  const unsigned = Math.min(
    limit - 1,
    Math.max(0, Math.round(work.values.unsigned ?? activity.initial)),
  );
  const signed = unsigned >= limit / 2 ? unsigned - limit : unsigned;
  const target = activity.target_value < 0 ? limit + activity.target_value : activity.target_value;
  return (
    <>
      <p className="mb-3 text-sm text-text-secondary">
        Build <strong>{activity.target_value}</strong> in {activity.bit_width}-bit{" "}
        {activity.interpretation === "unsigned" ? "unsigned binary" : "two’s complement"}. Select a
        bit to toggle it.
      </p>
      <div className="flex flex-wrap gap-2" role="group" aria-label="Binary bit controls">
        {Array.from({ length: activity.bit_width }, (_, index) => {
          const position = activity.bit_width - 1 - index;
          const set = Boolean(unsigned & (2 ** position));
          return (
            <button
              type="button"
              key={position}
              aria-label={`Bit ${position}${position === activity.bit_width - 1 && activity.interpretation === "twos-complement" ? " (sign bit)" : ""}`}
              aria-pressed={set}
              onClick={() =>
                update({ values: { unsigned: unsigned ^ (2 ** position) }, correct: null })
              }
              className={`flex min-h-14 min-w-11 flex-col items-center justify-center rounded-lg border px-3 py-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${set ? "border-blue-500 bg-blue-500/10 text-blue-600 dark:text-blue-400" : "border-border bg-bg-primary text-text-primary"}`}
            >
              <span className="font-mono text-lg font-bold">{set ? 1 : 0}</span>
              <span className="text-[10px] text-text-muted">
                {position === activity.bit_width - 1 &&
                activity.interpretation === "twos-complement"
                  ? "−"
                  : ""}
                2^{position}
              </span>
            </button>
          );
        })}
      </div>
      <dl aria-live="polite" className="mt-4 grid grid-cols-2 gap-3 rounded-xl bg-bg-primary p-4">
        <div>
          <dt className="text-xs text-text-muted">Unsigned decimal</dt>
          <dd className="text-xl font-semibold text-text-primary">{unsigned}</dd>
        </div>
        {activity.interpretation === "twos-complement" && (
          <div>
            <dt className="text-xs text-text-muted">Signed decimal</dt>
            <dd className="text-xl font-semibold text-text-primary">{signed}</dd>
          </div>
        )}
        <div>
          <dt className="text-xs text-text-muted">Hexadecimal</dt>
          <dd className="font-mono text-xl font-semibold text-text-primary">
            {unsigned
              .toString(16)
              .toUpperCase()
              .padStart(Math.ceil(activity.bit_width / 4), "0")}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-text-muted">Bit pattern</dt>
          <dd className="break-all font-mono text-sm font-semibold text-text-primary">
            {unsigned.toString(2).padStart(activity.bit_width, "0")}
          </dd>
        </div>
      </dl>
      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          className="rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-700 focus-visible:ring-2 focus-visible:ring-blue-500"
          onClick={() => {
            const correct = unsigned === target;
            update({ correct, attempts: work.attempts + 1 });
            if (correct) onComplete();
            else onReview?.();
          }}
        >
          Check bit pattern
        </button>
        <button
          type="button"
          className="rounded-lg border border-border px-3 py-2 text-sm font-semibold text-text-primary hover:bg-bg-tertiary focus-visible:ring-2 focus-visible:ring-blue-500"
          onClick={() => update({ values: { unsigned: activity.initial }, correct: null })}
        >
          Reset bits
        </button>
      </div>
      {work.correct !== null && (
        <div aria-live="polite" className="mt-3">
          <p
            className={`text-sm font-semibold ${work.correct ? "text-green-700 dark:text-green-400" : "text-amber-700 dark:text-amber-400"}`}
          >
            {work.correct
              ? "Correct bit pattern."
              : "Not quite. Compare the bit weights with the decimal value and try again."}
          </p>
          {work.correct && <Markdown text={activity.explanation} />}
        </div>
      )}
    </>
  );
}
