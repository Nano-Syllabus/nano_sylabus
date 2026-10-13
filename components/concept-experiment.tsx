"use client";

import { useId } from "react";
import { Markdown } from "@/components/markdown";
import { useConceptStudy } from "@/components/use-concept-study";
import { evaluateConceptExpression, type ConceptActivity } from "@/lib/concept-activities";
import { observedTrend } from "@/lib/concept-study";
import type { ConceptActivityProps } from "@/components/concept-activity";

const button =
  "rounded-lg border border-border px-3 py-2 text-sm font-semibold text-text-primary hover:bg-bg-tertiary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:opacity-50";
const primary = `${button} bg-blue-600 text-white hover:bg-blue-700`;
const format = (value: number | null) =>
  value === null
    ? "Outside model range"
    : Number(value.toPrecision(5)).toLocaleString(undefined, { maximumSignificantDigits: 5 });
const directions = {
  increase: "Increases",
  decrease: "Decreases",
  same: "Stays the same",
} as const;

export function ConceptExperiment({
  activity,
  storageKey,
  onComplete,
  onReview,
}: ConceptActivityProps & { activity: Extract<ConceptActivity, { kind: "experiment" }> }) {
  const [work, update] = useConceptStudy(storageKey);
  const prefix = useId();
  const initial = Object.fromEntries(activity.parameters.map((p) => [p.id, p.initial]));
  const values = Object.fromEntries(
    activity.parameters.map((p) => [
      p.id,
      Math.max(p.min, Math.min(p.max, work.values[p.id] ?? p.initial)),
    ]),
  );
  const parameter =
    activity.parameters.find((p) => p.id === work.parameter) || activity.parameters[0];
  const output = activity.outputs[0];
  const baseline = Object.fromEntries(
    activity.parameters.map((p) => [p.id, work.baseline[p.id] ?? values[p.id]]),
  );
  const before = evaluateConceptExpression(output.expression, baseline);
  const current = evaluateConceptExpression(output.expression, values);
  const trend =
    before === null || current === null
      ? null
      : observedTrend(before, current, baseline[parameter.id], values[parameter.id]);
  const samples = Array.from({ length: 41 }, (_, i) => {
    const x = parameter.min + ((parameter.max - parameter.min) * i) / 40;
    return { x, y: evaluateConceptExpression(output.expression, { ...values, [parameter.id]: x }) };
  });
  const ys = samples.flatMap((p) => (p.y === null ? [] : [p.y]));
  const minY = Math.min(...ys),
    maxY = Math.max(...ys),
    range = maxY - minY || 1;
  const points = samples
    .map((p, i) =>
      p.y === null
        ? ""
        : `${i === 0 || samples[i - 1].y === null ? "M" : "L"}${40 + i * 10},${180 - ((p.y - minY) / range) * 140}`,
    )
    .join(" ");
  return (
    <>
      <label
        htmlFor={`${prefix}-parameter`}
        className="mb-2 block text-sm font-semibold text-text-primary"
      >
        Choose what to investigate
      </label>
      <select
        id={`${prefix}-parameter`}
        className="mb-4 w-full rounded-lg border border-border bg-bg-primary px-3 py-2 text-sm text-text-primary"
        value={parameter.id}
        onChange={(event) =>
          update({
            parameter: event.target.value,
            committed: false,
            correct: null,
            prediction: null,
            baseline: {},
          })
        }
      >
        {activity.parameters.map((p) => (
          <option key={p.id} value={p.id}>
            {p.label}
          </option>
        ))}
      </select>
      <fieldset className="mb-4 rounded-xl border border-blue-500/30 bg-bg-primary p-4">
        <legend className="px-1 text-sm font-semibold text-text-primary">
          Predict before experimenting
        </legend>
        <p className="mb-3 text-sm text-text-secondary">
          As {parameter.label.toLowerCase()} increases, what happens to {output.label.toLowerCase()}
          ? Hold the other values constant.
        </p>
        <div className="flex flex-wrap gap-2">
          {Object.entries(directions).map(([direction, label]) => (
            <button
              key={direction}
              type="button"
              disabled={work.committed}
              className={`${button} ${work.prediction === direction ? "border-blue-500 bg-blue-500/10" : ""}`}
              aria-pressed={work.prediction === direction}
              onClick={() => update({ prediction: direction as keyof typeof directions })}
            >
              {label}
            </button>
          ))}
        </div>
        {!work.committed ? (
          <button
            type="button"
            disabled={!work.prediction}
            className={`${primary} mt-3`}
            onClick={() => update({ committed: true, baseline: values, correct: null })}
          >
            Record prediction
          </button>
        ) : (
          <p className="mt-3 text-sm text-text-secondary">
            Prediction recorded: <strong>{work.prediction && directions[work.prediction]}</strong>.
            Move the {parameter.label.toLowerCase()} slider to test it.
          </p>
        )}
      </fieldset>
      <div className="grid gap-5 sm:grid-cols-2">
        <div className="space-y-4">
          {activity.parameters.map((p) => (
            <div key={p.id}>
              <label
                htmlFor={`${prefix}-${p.id}`}
                className="flex justify-between gap-2 text-sm font-semibold text-text-primary"
              >
                <span>{p.label}</span>
                <span>
                  {format(values[p.id])} {p.unit}
                </span>
              </label>
              <input
                id={`${prefix}-${p.id}`}
                type="range"
                min={p.min}
                max={p.max}
                step={p.step}
                value={values[p.id]}
                disabled={work.committed ? p.id !== parameter.id : true}
                className="mt-2 w-full accent-blue-600 disabled:opacity-40"
                onChange={(event) =>
                  update({
                    values: { ...values, [p.id]: Number(event.target.value) },
                    correct: null,
                  })
                }
              />
            </div>
          ))}
        </div>
        <dl aria-live="polite" className="space-y-3 rounded-xl bg-bg-primary p-4">
          {activity.outputs.map((o) => (
            <div key={o.label}>
              <dt className="text-xs text-text-secondary">{o.label}</dt>
              <dd className="mt-1 text-xl font-semibold tabular-nums text-text-primary">
                {format(evaluateConceptExpression(o.expression, values))} {o.unit}
              </dd>
            </div>
          ))}
        </dl>
      </div>
      {work.committed && (
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            className={primary}
            disabled={!trend}
            onClick={() => {
              const correct = work.prediction === trend;
              update({ correct, attempts: work.attempts + 1 });
              if (correct) onComplete();
              else onReview?.();
            }}
          >
            Compare prediction
          </button>
          <button
            type="button"
            className={button}
            onClick={() =>
              update({
                committed: false,
                prediction: null,
                correct: null,
                baseline: {},
                values: initial,
              })
            }
          >
            Try a new prediction
          </button>
        </div>
      )}
      {work.correct !== null && (
        <div aria-live="polite" className="mt-4 rounded-xl border border-border bg-bg-primary p-4">
          <p
            className={`text-sm font-semibold ${work.correct ? "text-green-700 dark:text-green-400" : "text-amber-700 dark:text-amber-400"}`}
          >
            {work.correct
              ? "Your prediction matches the observation."
              : "The observation differs from your prediction. Revisit the relation and test again."}
          </p>
          <p className="mt-2 text-sm text-text-secondary">
            {parameter.label}: {format(baseline[parameter.id])} → {format(values[parameter.id])}{" "}
            {parameter.unit}. {output.label}: {format(before)} → {format(current)} {output.unit}.
          </p>
          <Markdown text={activity.explanation} />
        </div>
      )}
      {work.correct !== null && ys.length > 1 && (
        <figure className="mt-4 rounded-xl border border-border bg-bg-primary p-3">
          <svg
            viewBox="0 0 480 220"
            role="img"
            aria-label={`${output.label} against ${parameter.label}, other values held constant`}
            className="w-full text-blue-600 dark:text-blue-400"
          >
            <path d="M40 30V180H450" fill="none" stroke="currentColor" opacity=".35" />
            <path d={points} fill="none" stroke="currentColor" strokeWidth="2.5" />
            {current !== null && (
              <circle
                cx={
                  40 +
                  ((values[parameter.id] - parameter.min) / (parameter.max - parameter.min)) * 400
                }
                cy={180 - ((current - minY) / range) * 140}
                r="5"
                fill="currentColor"
              />
            )}
            <g fill="currentColor" fontSize="11">
              <text x="40" y="200">
                {format(parameter.min)}
              </text>
              <text x="415" y="200">
                {format(parameter.max)}
              </text>
              <text x="40" y="22">
                {output.label}: {format(minY)} – {format(maxY)} {output.unit}
              </text>
            </g>
          </svg>
          <figcaption className="text-center text-xs text-text-muted">
            {parameter.label} ({parameter.unit || "value"}) · other values held constant
          </figcaption>
        </figure>
      )}
      <details className="mt-3 text-sm">
        <summary className="cursor-pointer font-semibold text-text-secondary">
          Model assumptions and explanation
        </summary>
        <Markdown text={activity.explanation} />
      </details>
    </>
  );
}
