"use client";

import { useId, useRef, useState } from "react";
import { Markdown } from "@/components/markdown";
import { useConceptStudy } from "@/components/use-concept-study";
import { evaluateConceptExpression, type ConceptActivity } from "@/lib/concept-activities";
import type { ConceptActivityProps } from "@/components/concept-activity";
import { svgSubscripts, withSubscripts } from "@/lib/label-subscripts";
import { cn } from "@/lib/utils";

/*
 * A live lab, like the micro-book's motor lab: sliders, the equations' outputs
 * and a graph that all move together. The graph is a control too: drag along it
 * (or tap it) to set the plotted quantity, hover or touch for a crosshair with
 * exact values, switch which slider is on the horizontal axis and which output
 * is plotted, and compare against a dashed ghost of the starting curve, so moving
 * any other slider shows the whole relation shift. Moving three different
 * controls (or every control, when there are fewer) completes it.
 */

type Lab = Extract<ConceptActivity, { kind: "experiment" }>;
type Param = Lab["parameters"][number];

const format = (value: number | null) =>
  value === null
    ? "—"
    : Number(value.toPrecision(4)).toLocaleString(undefined, { maximumSignificantDigits: 4 });
const plain = (label: string) => label.replace(/_\{?([A-Za-z0-9]+)\}?/g, "$1");

/** Round numbers for axis ticks: 1, 2 or 5 times a power of ten. */
function ticks(min: number, max: number, count = 4) {
  const span = max - min || Math.abs(max) || 1;
  const raw = span / count;
  const power = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 5, 10].map((m) => m * power).find((s) => s >= raw) ?? raw;
  const start = Math.ceil(min / step) * step;
  const out: number[] = [];
  for (let v = start; v <= max + step * 1e-9 && out.length < 12; v += step) out.push(Number(v.toPrecision(12)));
  return out;
}

/** A slider value: clamped to the range and snapped to its step. */
function snap(p: Param, value: number) {
  const stepped = p.min + Math.round((value - p.min) / p.step) * p.step;
  return Number(Math.max(p.min, Math.min(p.max, stepped)).toPrecision(12));
}

const W = 560, H = 280, L = 70, R = 16, T = 14, B = 52;

function Graph({
  activity,
  values,
  initial,
  xId,
  yIndex,
  onSet,
}: {
  activity: Lab;
  values: Record<string, number>;
  initial: Record<string, number>;
  xId: string;
  yIndex: number;
  onSet: (id: string, value: number) => void;
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [hoverX, setHoverX] = useState<number | null>(null);
  const [dragging, setDragging] = useState(false);
  const parameter = activity.parameters.find((p) => p.id === xId) ?? activity.parameters[0];
  const output = activity.outputs[yIndex] ?? activity.outputs[0];
  const curve = (base: Record<string, number>) =>
    Array.from({ length: 81 }, (_, i) => {
      const x = parameter.min + ((parameter.max - parameter.min) * i) / 80;
      return { x, y: evaluateConceptExpression(output.expression, { ...base, [parameter.id]: x }) };
    });
  const live = curve(values);
  // The ghost only means something once another slider has moved the curve.
  const others = activity.parameters.filter((p) => p.id !== parameter.id);
  const shifted = others.some((p) => values[p.id] !== initial[p.id]);
  const ghost = shifted ? curve(initial) : [];
  const ys = [...live, ...ghost].flatMap((p) => (p.y === null ? [] : [p.y]));
  if (ys.length < 2) return null;
  let minY = Math.min(...ys, 0);
  let maxY = Math.max(...ys);
  if (maxY === minY) maxY = minY + 1;
  const pad = (maxY - minY) * 0.08;
  minY = minY < 0 ? minY - pad : minY;
  maxY += pad;

  const X = (x: number) => L + ((x - parameter.min) / (parameter.max - parameter.min)) * (W - L - R);
  const Y = (y: number) => T + (1 - (y - minY) / (maxY - minY)) * (H - T - B);
  const path = (points: Array<{ x: number; y: number | null }>) =>
    points
      .map((p, i) =>
        p.y === null ? "" : `${i === 0 || points[i - 1].y === null ? "M" : "L"}${X(p.x).toFixed(1)},${Y(p.y).toFixed(1)}`,
      )
      .join("");
  const nowX = values[parameter.id];
  const nowY = evaluateConceptExpression(output.expression, values);
  const xTitle = (xId === activity.plot.x && activity.plot.x_label) || `${parameter.label}${parameter.unit ? ` (${parameter.unit})` : ""}`;
  const yTitle = (yIndex === activity.plot.y && activity.plot.y_label) || `${output.label}${output.unit ? ` (${output.unit})` : ""}`;

  /** The parameter value under a pointer, from screen to canvas to data. */
  const valueAt = (clientX: number) => {
    const box = svgRef.current?.getBoundingClientRect();
    if (!box) return null;
    const canvasX = ((clientX - box.left) / box.width) * W;
    return snap(parameter, parameter.min + ((canvasX - L) / (W - L - R)) * (parameter.max - parameter.min));
  };
  const hoverY = hoverX === null ? null : evaluateConceptExpression(output.expression, { ...values, [parameter.id]: hoverX });

  return (
    <figure className="rounded-xl border border-border bg-bg-primary p-2">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label={`${plain(yTitle)} against ${plain(xTitle)}. Drag along the graph to change ${plain(parameter.label)}.`}
        className={cn("w-full touch-none select-none", dragging ? "cursor-grabbing" : "cursor-crosshair")}
        onPointerDown={(event) => {
          const v = valueAt(event.clientX);
          if (v === null) return;
          (event.target as Element).setPointerCapture?.(event.pointerId);
          setDragging(true);
          onSet(parameter.id, v);
        }}
        onPointerMove={(event) => {
          const v = valueAt(event.clientX);
          setHoverX(v);
          if (dragging && v !== null) onSet(parameter.id, v);
        }}
        onPointerUp={() => setDragging(false)}
        onPointerCancel={() => setDragging(false)}
        onPointerLeave={() => {
          if (!dragging) setHoverX(null);
        }}
      >
        {ticks(minY, maxY).map((v) => (
          <g key={`y${v}`}>
            <line x1={L} x2={W - R} y1={Y(v)} y2={Y(v)} className="stroke-border" strokeWidth="1" />
            <text x={L - 8} y={Y(v)} textAnchor="end" dominantBaseline="middle" fontSize="15" className="fill-text-muted">
              {format(v)}
            </text>
          </g>
        ))}
        {ticks(parameter.min, parameter.max).map((v) => (
          <g key={`x${v}`}>
            <line y1={T} y2={H - B} x1={X(v)} x2={X(v)} className="stroke-border" strokeWidth="1" />
            <text x={X(v)} y={H - B + 18} textAnchor="middle" fontSize="15" className="fill-text-muted">
              {format(v)}
            </text>
          </g>
        ))}
        <line x1={L} x2={L} y1={T} y2={H - B} className="stroke-text-muted" />
        <line x1={L} x2={W - R} y1={H - B} y2={H - B} className="stroke-text-muted" />
        {ghost.length > 0 && (
          <path d={path(ghost)} fill="none" strokeWidth="2" strokeDasharray="6 5" className="stroke-text-muted" />
        )}
        <path d={path(live)} fill="none" strokeWidth="3" strokeLinejoin="round" className="stroke-red-600 dark:stroke-red-400" />
        {hoverX !== null && hoverY !== null && !dragging && (
          <g pointerEvents="none">
            <line x1={X(hoverX)} x2={X(hoverX)} y1={T} y2={H - B} className="stroke-text-muted" strokeDasharray="2 4" />
            <circle cx={X(hoverX)} cy={Y(hoverY)} r="4.5" className="fill-text-muted" />
            <text
              x={Math.min(X(hoverX) + 8, W - R - 150)}
              y={Math.max(Y(hoverY) - 12, T + 12)}
              fontSize="14"
              fontWeight="600"
              paintOrder="stroke"
              strokeWidth="4"
              className="fill-text-primary stroke-bg-primary"
            >
              {format(hoverX)} → {format(hoverY)}
            </text>
          </g>
        )}
        {nowY !== null && (
          <g pointerEvents="none">
            <line x1={X(nowX)} x2={X(nowX)} y1={Y(nowY)} y2={H - B} strokeDasharray="3 4" className="stroke-blue-600 dark:stroke-blue-400" />
            <line x1={L} x2={X(nowX)} y1={Y(nowY)} y2={Y(nowY)} strokeDasharray="3 4" className="stroke-blue-600 dark:stroke-blue-400" />
            <circle cx={X(nowX)} cy={Y(nowY)} r="7.5" strokeWidth="2.5" className="fill-blue-600 stroke-bg-primary dark:fill-blue-400" />
          </g>
        )}
        <text x={(L + W - R) / 2} y={H - 8} textAnchor="middle" fontSize="16" fontWeight="600" className="fill-text-secondary">
          {svgSubscripts(xTitle)}
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
          {svgSubscripts(yTitle)}
        </text>
      </svg>
      <figcaption className="px-1 pt-1 text-xs text-text-muted">
        Drag along the graph to change {withSubscripts(parameter.label.toLowerCase())}.
        {ghost.length > 0 ? " Dashed: the curve at the starting settings." : ""}
      </figcaption>
    </figure>
  );
}

function Chips<T extends string | number>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: Array<{ value: T; text: string }>;
  value: T;
  onChange: (value: T) => void;
}) {
  if (options.length < 2) return null;
  return (
    <div className="flex flex-wrap items-center gap-1.5 text-xs" role="group" aria-label={label}>
      <span className="font-semibold text-text-muted">{label}</span>
      {options.map((option) => (
        <button
          key={String(option.value)}
          type="button"
          aria-pressed={value === option.value}
          onClick={() => onChange(option.value)}
          className={cn(
            "rounded-full border px-2.5 py-1 font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500",
            value === option.value
              ? "border-blue-600 bg-blue-500/10 text-blue-700 dark:text-blue-300"
              : "border-border text-text-secondary hover:bg-bg-tertiary",
          )}
        >
          {withSubscripts(option.text)}
        </button>
      ))}
    </div>
  );
}

export function ConceptExperiment({
  activity,
  storageKey,
  onComplete,
}: ConceptActivityProps & { activity: Lab }) {
  const [work, update] = useConceptStudy(storageKey);
  const prefix = useId();
  const initial = Object.fromEntries(activity.parameters.map((p) => [p.id, p.initial]));
  const values = Object.fromEntries(
    activity.parameters.map((p) => [p.id, Math.max(p.min, Math.min(p.max, work.values[p.id] ?? p.initial))]),
  );
  const needed = Math.min(3, activity.parameters.length);
  const moved = work.seen.filter((id) => activity.parameters.some((p) => p.id === id));
  const plotX = activity.parameters.some((p) => p.id === work.parameter)
    ? work.parameter
    : activity.plot.x || activity.parameters[0].id;
  const plotY = work.selected >= 0 && work.selected < activity.outputs.length ? work.selected : activity.plot.y;

  const set = (id: string, value: number) => {
    const seen = Array.from(new Set([...moved, id]));
    update({ values: { ...values, [id]: value }, seen });
    if (seen.length >= needed) onComplete();
  };

  return (
    <>
      <div className="mb-3 flex flex-wrap gap-x-5 gap-y-2">
        <Chips
          label="Plot against"
          options={activity.parameters.map((p) => ({ value: p.id, text: p.label }))}
          value={plotX}
          onChange={(id) => update({ parameter: id })}
        />
        <Chips
          label="Show"
          options={activity.outputs.map((o, i) => ({ value: i, text: o.label }))}
          value={plotY}
          onChange={(i) => update({ selected: i })}
        />
      </div>
      <div className="grid gap-5 md:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <Graph activity={activity} values={values} initial={initial} xId={plotX} yIndex={plotY} onSet={set} />
        <div>
          <div className="space-y-4">
            {activity.parameters.map((p) => (
              <div key={p.id}>
                <label htmlFor={`${prefix}-${p.id}`} className="flex justify-between gap-2 text-sm font-semibold text-text-primary">
                  <span>{withSubscripts(p.label)}</span>
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
                  onChange={(event) => set(p.id, Number(event.target.value))}
                />
              </div>
            ))}
          </div>
          <dl aria-live="polite" className="mt-4 grid grid-cols-[1fr_auto] gap-x-4 gap-y-1.5 rounded-xl bg-bg-secondary px-4 py-3 text-sm">
            {activity.outputs.map((o) => (
              <div key={o.label} className="contents">
                <dt className="text-text-secondary">{withSubscripts(o.label)}</dt>
                <dd className="text-right font-semibold tabular-nums text-text-primary">
                  {format(evaluateConceptExpression(o.expression, values))} {o.unit}
                </dd>
              </div>
            ))}
          </dl>
          <button
            type="button"
            className="mt-3 text-xs font-semibold text-text-muted underline underline-offset-2 hover:text-text-primary"
            onClick={() => update({ values: initial })}
          >
            Back to the starting values
          </button>
        </div>
      </div>
      <p className="mt-3 text-xs text-text-muted" aria-live="polite">
        {moved.length >= needed
          ? "Done. Keep experimenting as long as you like."
          : `Move ${needed === 1 ? "the control" : `${needed} different controls`} to complete this activity (${moved.length} of ${needed}).`}
      </p>
      <details className="mt-2 text-sm">
        <summary className="cursor-pointer font-semibold text-blue-600 dark:text-blue-400">What the lab shows</summary>
        <Markdown text={activity.explanation} className="mt-2" />
      </details>
    </>
  );
}
