"use client";

import { useEffect } from "react";
import { Markdown } from "@/components/markdown";
import { useConceptStudy } from "@/components/use-concept-study";
import type { ConceptActivityProps } from "@/components/concept-activity";
import type { ConceptActivity } from "@/lib/concept-activities";
import { cn } from "@/lib/utils";

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

/**
 * Labels the model placed on top of each other are nudged apart: each one, in
 * drawing order, slides down a line at a time until its box clears every label
 * before it. Width is estimated from the character count; good enough to stop
 * "F = 300 N" being printed through "Line of action".
 */
export function spreadLabels(items: Item[]): Item[] {
  const placed: Array<{ x: number; y: number; w: number; h: number }> = [];
  const box = (item: Item, y: number) => ({
    x: item.x1,
    y: y - LABEL_SIZE * 0.6,
    w: item.text.length * LABEL_SIZE * 0.56,
    h: LABEL_SIZE * 1.2,
  });
  const hits = (a: { x: number; y: number; w: number; h: number }) =>
    placed.some((b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h);
  return items.map((item) => {
    if (item.type !== "text") return item;
    let y = item.y1;
    for (let tries = 0; tries < 6 && hits(box(item, y)); tries++) y += LABEL_SIZE * 1.2;
    y = Math.min(y, 350);
    // Keep a label on the canvas: one that would run off the right edge starts earlier.
    const x = Math.max(4, Math.min(item.x1, 596 - item.text.length * LABEL_SIZE * 0.56));
    const moved = { ...item, x1: x, y1: y };
    placed.push(box(moved, y));
    return moved;
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
          {item.text}
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
