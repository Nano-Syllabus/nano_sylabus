"use client";

import { useId } from "react";
import { Markdown } from "@/components/markdown";
import { useConceptStudy } from "@/components/use-concept-study";
import { evaluateConceptExpression, type ConceptActivity } from "@/lib/concept-activities";
import type { ConceptActivityProps } from "@/components/concept-activity";

/*
 * A live lab, like the micro-book's motor lab: sliders on one side, the
 * equations' outputs and a graph that redraw as they move. The graph plots one
 * output against one parameter across its whole range, the others held where the
 * sliders are, with a marker at the current setting. Moving three different
 * controls (or every control, when there are fewer) completes it.
 */

const format = (value: number | null) =>
  value === null
    ? "—"
    : Number(value.toPrecision(4)).toLocaleString(undefined, { maximumSignificantDigits: 4 });

/** Round numbers for axis ticks: 1, 2 or 5 times a power of ten. */
function ticks(min: number, max: number, count = 4) {
  const span = max - min || Math.abs(max) || 1;
  const raw = span / count;
  const power = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 5, 10].map((m) => m * power).find((s) => s >= raw) ?? raw;
  const start = Math.ceil(min / step) * step;
  const out: number[] = [];
  for (let v = start; v <= max + step * 1e-9 && out.length < 12; v += step)
    out.push(Number(v.toPrecision(12)));
  return out;
}

function Graph({
  activity,
  values,
}: {
  activity: Extract<ConceptActivity, { kind: "experiment" }>;
  values: Record<string, number>;
}) {
  const parameter =
    activity.parameters.find((p) => p.id === activity.plot.x) ?? activity.parameters[0];
  const output = activity.outputs[activity.plot.y] ?? activity.outputs[0];
  const samples = Array.from({ length: 81 }, (_, i) => {
    const x = parameter.min + ((parameter.max - parameter.min) * i) / 80;
    return { x, y: evaluateConceptExpression(output.expression, { ...values, [parameter.id]: x }) };
  });
  const ys = samples.flatMap((p) => (p.y === null ? [] : [p.y]));
  if (ys.length < 2) return null;
  let minY = Math.min(...ys, 0);
  let maxY = Math.max(...ys);
  if (maxY === minY) maxY = minY + 1;
  const pad = (maxY - minY) * 0.08;
  minY = minY < 0 ? minY - pad : minY;
  maxY += pad;

  const W = 560,
    H = 280,
    L = 70,
    R = 16,
    T = 14,
    B = 52;
  const X = (x: number) =>
    L + ((x - parameter.min) / (parameter.max - parameter.min)) * (W - L - R);
  const Y = (y: number) => T + (1 - (y - minY) / (maxY - minY)) * (H - T - B);
  const path = samples
    .map((p, i) =>
      p.y === null
        ? ""
        : `${i === 0 || samples[i - 1].y === null ? "M" : "L"}${X(p.x).toFixed(1)},${Y(p.y).toFixed(1)}`,
    )
    .join("");
  const nowX = values[parameter.id];
  const nowY = evaluateConceptExpression(output.expression, values);
  const xTitle =
    activity.plot.x_label || `${parameter.label}${parameter.unit ? ` (${parameter.unit})` : ""}`;
  const yTitle =
    activity.plot.y_label || `${output.label}${output.unit ? ` (${output.unit})` : ""}`;

  return (
    <figure className="rounded-xl border border-border bg-bg-primary p-2">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label={`${yTitle} against ${xTitle}`}
        className="w-full"
      >
        {ticks(minY, maxY).map((v) => (
          <g key={`y${v}`}>
            <line x1={L} x2={W - R} y1={Y(v)} y2={Y(v)} className="stroke-border" strokeWidth="1" />
            <text
              x={L - 8}
              y={Y(v)}
              textAnchor="end"
              dominantBaseline="middle"
              fontSize="15"
              className="fill-text-muted"
            >
              {format(v)}
            </text>
          </g>
        ))}
        {ticks(parameter.min, parameter.max).map((v) => (
          <g key={`x${v}`}>
            <line y1={T} y2={H - B} x1={X(v)} x2={X(v)} className="stroke-border" strokeWidth="1" />
            <text
              x={X(v)}
              y={H - B + 17}
              textAnchor="middle"
              fontSize="15"
              className="fill-text-muted"
            >
              {format(v)}
            </text>
          </g>
        ))}
        <line x1={L} x2={L} y1={T} y2={H - B} className="stroke-text-muted" />
        <line x1={L} x2={W - R} y1={H - B} y2={H - B} className="stroke-text-muted" />
        <path
          d={path}
          fill="none"
          strokeWidth="3"
          strokeLinejoin="round"
          className="stroke-red-600 dark:stroke-red-400"
        />
        {nowY !== null && (
          <>
            <line
              x1={X(nowX)}
              x2={X(nowX)}
              y1={Y(nowY)}
              y2={H - B}
              strokeDasharray="3 4"
              className="stroke-blue-600 dark:stroke-blue-400"
            />
            <circle
              cx={X(nowX)}
              cy={Y(nowY)}
              r="6.5"
              strokeWidth="2.5"
              className="fill-blue-600 stroke-bg-primary dark:fill-blue-400"
            />
          </>
        )}
        <text
          x={(L + W - R) / 2}
          y={H - 8}
          textAnchor="middle"
          fontSize="16"
          fontWeight="600"
          className="fill-text-secondary"
        >
          {xTitle}
        </text>
        <text
          x={18}
          y={(T + H - B) / 2}
          transform={`rotate(-90 18 ${(T + H - B) / 2})`}
          textAnchor="middle"
          fontSize="16"
          fontWeight="600"
          className="fill-text-secondary"
        >
          {yTitle}
        </text>
      </svg>
    </figure>
  );
}

export function ConceptExperiment({
  activity,
  storageKey,
  onComplete,
}: ConceptActivityProps & { activity: Extract<ConceptActivity, { kind: "experiment" }> }) {
  const [work, update] = useConceptStudy(storageKey);
  const prefix = useId();
  const values = Object.fromEntries(
    activity.parameters.map((p) => [
      p.id,
      Math.max(p.min, Math.min(p.max, work.values[p.id] ?? p.initial)),
    ]),
  );
  const needed = Math.min(3, activity.parameters.length);
  const moved = work.seen.filter((id) => activity.parameters.some((p) => p.id === id));

  return (
    <>
      <div className="grid gap-5 md:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <Graph activity={activity} values={values} />
        <div>
          <div className="space-y-4">
            {activity.parameters.map((p) => (
              <div key={p.id}>
                <label
                  htmlFor={`${prefix}-${p.id}`}
                  className="flex justify-between gap-2 text-sm font-semibold text-text-primary"
                >
                  <span>{p.label}</span>
                  <output className="tabular-nums">
                    {format(values[p.id])} {p.unit}
                  </output>
                </label>
                <input
                  id={`${prefix}-${p.id}`}
                  type="range"
                  min={p.min}
                  max={p.max}
                  step={p.step}
                  value={values[p.id]}
                  className="mt-2 w-full accent-red-600"
                  onChange={(event) => {
                    const seen = Array.from(new Set([...moved, p.id]));
                    update({ values: { ...values, [p.id]: Number(event.target.value) }, seen });
                    if (seen.length >= needed) onComplete();
                  }}
                />
              </div>
            ))}
          </div>
          <dl
            aria-live="polite"
            className="mt-4 grid grid-cols-[1fr_auto] gap-x-4 gap-y-1.5 rounded-xl bg-bg-primary px-4 py-3 text-sm"
          >
            {activity.outputs.map((o) => (
              <div key={o.label} className="contents">
                <dt className="text-text-secondary">{o.label}</dt>
                <dd className="text-right font-semibold tabular-nums text-text-primary">
                  {format(evaluateConceptExpression(o.expression, values))} {o.unit}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      </div>
      <p className="mt-3 text-xs text-text-muted" aria-live="polite">
        {moved.length >= needed
          ? "Done. Keep experimenting as long as you like."
          : `Move ${needed === 1 ? "the control" : `${needed} different controls`} to complete this activity (${moved.length} of ${needed}).`}
      </p>
      <details className="mt-2 text-sm">
        <summary className="cursor-pointer font-semibold text-blue-600 dark:text-blue-400">
          What the lab shows
        </summary>
        <Markdown text={activity.explanation} className="mt-2" />
      </details>
    </>
  );
}
