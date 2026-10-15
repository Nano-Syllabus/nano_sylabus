"use client";

import { useEffect } from "react";
import { Markdown } from "@/components/markdown";
import { useConceptStudy } from "@/components/use-concept-study";
import type { ConceptActivityProps } from "@/components/concept-activity";
import type { ConceptActivity } from "@/lib/concept-activities";
import { cn } from "@/lib/utils";
import { svgSubscripts } from "@/lib/label-subscripts";

type Figure = Extract<ConceptActivity, { kind: "figure" }>;
type Item = Figure["items"][number];

/*
 * A labelled figure the student explores part by part, like the micro-book's
 * motor cross-section: the drawing on one side, what the selected part is and
 * does on the other. Everything is drawn from data (lines, arrows, shapes,
 * labels) on a 600 x 360 canvas; nothing the model wrote is ever run as markup.
 */

const strokeTone: Record<Item["tone"], string> = {
  ink: "stroke-text-primary",
  accent: "stroke-red-600 dark:stroke-red-400",
  blue: "stroke-blue-600 dark:stroke-blue-400",
  muted: "stroke-text-muted",
  fill: "stroke-text-primary",
};
const fillTone: Record<Item["tone"], string> = {
  ink: "fill-text-primary",
  accent: "fill-red-600 dark:fill-red-400",
  blue: "fill-blue-600 dark:fill-blue-400",
  muted: "fill-text-muted",
  fill: "fill-text-primary",
};

const LABEL_SIZE = 18;

type Box = { x: number; y: number; w: number; h: number };

/** The straight segments an element draws, which a label must not sit on. */
function segments(item: Item): Array<[number, number, number, number]> {
  if (item.type === "line" || item.type === "arrow") return [[item.x1, item.y1, item.x2, item.y2]];
  if (item.type === "rect") {
    const [l, r] = [Math.min(item.x1, item.x2), Math.max(item.x1, item.x2)];
    const [t, b] = [Math.min(item.y1, item.y2), Math.max(item.y1, item.y2)];
    return [[l, t, r, t], [r, t, r, b], [r, b, l, b], [l, b, l, t]];
  }
  if (item.type === "circle") {
    return Array.from({ length: 12 }, (_, i) => {
      const a = (i / 12) * 2 * Math.PI;
      const c = ((i + 1) / 12) * 2 * Math.PI;
      return [item.x1 + item.x2 * Math.cos(a), item.y1 + item.x2 * Math.sin(a), item.x1 + item.x2 * Math.cos(c), item.y1 + item.x2 * Math.sin(c)];
    });
  }
  if (item.type === "polyline") {
    const pts = item.points.trim().split(/\s+/).map((pt) => pt.split(",").map(Number));
    return pts.slice(1).map((p, i) => [pts[i][0], pts[i][1], p[0], p[1]]);
  }
  return [];
}

function crosses(box: Box, [x1, y1, x2, y2]: [number, number, number, number]) {
  // Sample along the segment: plenty for label-sized boxes on a 600 px canvas.
  for (let t = 0; t <= 1; t += 1 / 24) {
    const x = x1 + (x2 - x1) * t;
    const y = y1 + (y2 - y1) * t;
    if (x > box.x - 3 && x < box.x + box.w + 3 && y > box.y - 3 && y < box.y + box.h + 3) return true;
  }
  return false;
}

/**
 * Labels moved off whatever they were printed on. For each label, in drawing
 * order, the first nearby position (as placed, then above, below, right, left,
 * then further out) that clears every line, shape and earlier label wins; if
 * none does, the label stays where the model put it. Width is estimated from the
 * character count, which is plenty to stop "rigid body" sitting on an arrow.
 */
export function spreadLabels(items: Item[]): Item[] {
  const obstacles = items.flatMap(segments);
  const placed: Box[] = [];
  const boxAt = (item: Item, x: number, y: number): Box => ({
    x,
    y: y - LABEL_SIZE * 0.62,
    w: item.text.length * LABEL_SIZE * 0.62,
    h: LABEL_SIZE * 1.15,
  });
  const clear = (box: Box) =>
    box.x >= 2 &&
    box.x + box.w <= 598 &&
    box.y >= 2 &&
    box.y + box.h <= 358 &&
    !obstacles.some((segment) => crosses(box, segment)) &&
    !placed.some((b) => box.x < b.x + b.w && b.x < box.x + box.w && box.y < b.y + b.h && b.y < box.y + box.h);
  // Candidate nudges, nearest first: up to 100 px sideways, three lines up or down.
  const offsets: Array<[number, number]> = [];
  for (const dx of [0, 20, -20, 40, -40, 70, -70, 100, -100])
    for (const dy of [0, -1, 1, -2, 2, -3, 3].map((k) => k * LABEL_SIZE * 1.1)) offsets.push([dx, dy]);
  offsets.sort((a, b) => Math.hypot(a[0], a[1] * 1.3) - Math.hypot(b[0], b[1] * 1.3));

  return items.map((item) => {
    if (item.type !== "text") return item;
    const width = item.text.length * LABEL_SIZE * 0.62;
    const x0 = Math.max(4, Math.min(item.x1, 596 - width));
    for (const [dx, dy] of offsets) {
      const box = boxAt(item, x0 + dx, item.y1 + dy);
      if (clear(box)) {
        placed.push(box);
        return { ...item, x1: x0 + dx, y1: item.y1 + dy };
      }
    }
    placed.push(boxAt(item, x0, item.y1));
    return { ...item, x1: x0 };
  });
}

function arrowHead(item: Item) {
  const angle = Math.atan2(item.y2 - item.y1, item.x2 - item.x1);
  const size = 11;
  const point = (offset: number) =>
    `${item.x2 - size * Math.cos(angle + offset)},${item.y2 - size * Math.sin(angle + offset)}`;
  return `${item.x2},${item.y2} ${point(0.45)} ${point(-0.45)}`;
}

function Shape({ item, selected }: { item: Item; selected: boolean }) {
  const stroke = cn(
    selected ? "stroke-blue-600 dark:stroke-blue-400" : strokeTone[item.tone],
    "fill-none",
  );
  const width = selected ? 3.5 : item.tone === "accent" || item.type === "arrow" ? 2.5 : 1.75;
  const dash = item.dashed ? "6 4" : undefined;
  switch (item.type) {
    case "line":
      return (
        <line
          x1={item.x1}
          y1={item.y1}
          x2={item.x2}
          y2={item.y2}
          className={stroke}
          strokeWidth={width}
          strokeDasharray={dash}
          strokeLinecap="round"
        />
      );
    case "arrow":
      return (
        <g>
          <line
            x1={item.x1}
            y1={item.y1}
            x2={item.x2}
            y2={item.y2}
            className={stroke}
            strokeWidth={width}
            strokeDasharray={dash}
            strokeLinecap="round"
          />
          <polygon
            points={arrowHead(item)}
            className={selected ? "fill-blue-600 dark:fill-blue-400" : fillTone[item.tone]}
          />
        </g>
      );
    case "rect": {
      const x = Math.min(item.x1, item.x2);
      const y = Math.min(item.y1, item.y2);
      return (
        <rect
          x={x}
          y={y}
          width={Math.abs(item.x2 - item.x1)}
          height={Math.abs(item.y2 - item.y1)}
          rx="3"
          className={cn(stroke, item.tone === "fill" && "fill-blue-500/15")}
          strokeWidth={width}
          strokeDasharray={dash}
        />
      );
    }
    case "circle":
      return (
        <circle
          cx={item.x1}
          cy={item.y1}
          r={item.x2}
          className={cn(stroke, item.tone === "fill" && "fill-blue-500/15")}
          strokeWidth={width}
          strokeDasharray={dash}
        />
      );
    case "polyline":
      return (
        <polyline
          points={item.points}
          className={cn(stroke, item.tone === "fill" && "fill-blue-500/15")}
          strokeWidth={width}
          strokeDasharray={dash}
          strokeLinejoin="round"
        />
      );
    case "text":
      return (
        <text
          x={item.x1}
          y={item.y1}
          fontSize={LABEL_SIZE}
          fontWeight="600"
          dominantBaseline="middle"
          paintOrder="stroke"
          className={cn(
            selected ? "fill-blue-700 dark:fill-blue-300" : fillTone[item.tone],
            "stroke-bg-primary",
          )}
          strokeWidth="4"
          strokeLinejoin="round"
        >
          {svgSubscripts(item.text)}
        </text>
      );
  }
}

export function ConceptFigure({
  activity,
  onComplete,
  storageKey,
}: ConceptActivityProps & { activity: Figure }) {
  const [work, update] = useConceptStudy(storageKey);
  const parts = activity.figure_parts;
  const selected = parts[work.selected]?.id ?? "";
  const seen = work.seen.filter((id) => parts.some((part) => part.id === id));
  const open = (id: string) => {
    const next = Array.from(new Set([...seen, id]));
    update({ selected: parts.findIndex((part) => part.id === id), seen: next });
    if (next.length === parts.length) onComplete();
  };
  const items = spreadLabels(activity.items);
  const loose = items.filter((item) => !item.part);
  // Text last within each group, so a label is never painted over by a line.
  const ordered = (items: Item[]) =>
    [...items].sort((a, b) => Number(a.type === "text") - Number(b.type === "text"));
  const current = parts.find((part) => part.id === selected);
  // A figure with nothing to explore is done once it has been seen.
  const nothingToExplore = parts.length === 0;
  useEffect(() => {
    if (nothingToExplore) onComplete();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nothingToExplore]);

  return (
    <div className="grid items-start gap-4">
      {/* On a phone the canvas keeps a readable size and scrolls sideways in its
          own frame, rather than shrinking its labels to a few pixels. */}
      <div className="overflow-x-auto rounded-xl border border-border bg-bg-primary">
        <svg
          viewBox="0 0 600 360"
          role="group"
          aria-label={activity.title}
          className="w-full min-w-[520px]"
        >
          <g aria-hidden="true">
            {ordered(loose).map((item, index) => (
              <Shape key={`loose-${index}`} item={item} selected={false} />
            ))}
          </g>
          {parts.map((part) => (
            <g
              key={part.id}
              role="button"
              tabIndex={0}
              aria-label={`Explore ${part.label}`}
              aria-pressed={selected === part.id}
              className="cursor-pointer outline-none focus-visible:opacity-80 [&:hover_*]:opacity-80"
              onClick={() => open(part.id)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  open(part.id);
                }
              }}
            >
              {ordered(items.filter((item) => item.part === part.id)).map((item, index) => (
                <Shape key={`${part.id}-${index}`} item={item} selected={selected === part.id} />
              ))}
            </g>
          ))}
        </svg>
      </div>
      <p className="-mt-2 text-xs text-text-muted sm:hidden">Swipe to see the whole figure.</p>
      {parts.length > 0 && (
        <div aria-live="polite" className="rounded-xl bg-bg-primary p-4">
          {current ? (
            <>
              <p className="text-base font-semibold text-text-primary">{current.label}</p>
              <Markdown text={current.description} className="mt-1 text-[15px]" />
            </>
          ) : (
            <p className="text-sm text-text-muted">
              Select a part of the figure to see what it is and why it matters.
            </p>
          )}
          <div
            className="mt-3 flex flex-wrap gap-1.5"
            role="group"
            aria-label="Parts of the figure"
          >
            {parts.map((part) => (
              <button
                key={part.id}
                type="button"
                aria-pressed={selected === part.id}
                onClick={() => open(part.id)}
                className={cn(
                  "rounded-full border px-2.5 py-1 text-xs font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500",
                  selected === part.id
                    ? "border-blue-600 bg-blue-500/10 text-blue-700 dark:text-blue-300"
                    : "border-border text-text-secondary hover:bg-bg-tertiary",
                )}
              >
                {seen.includes(part.id) ? "✓ " : ""}
                {part.label}
              </button>
            ))}
          </div>
          <p className="mt-3 text-xs text-text-muted">
            Parts explored: {seen.length} of {parts.length}
          </p>
        </div>
      )}
      {activity.explanation && (
        <Markdown text={activity.explanation} className="text-sm text-text-secondary" />
      )}
    </div>
  );
}
