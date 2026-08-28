"use client";

import { useId, useState } from "react";
import { formatMetric } from "@/lib/admin-analytics";
import { activityDate, chartCeiling } from "@/lib/admin-analytics-presentation";

export type ChartSeries = { label: string; values: number[]; secondary?: boolean };

/** Exact daily values, zero-based axes, no smoothing or invented intermediate points. */
export function AdminActivityChart({
  dates,
  series,
  label,
}: {
  dates: string[];
  series: ChartSeries[];
  label: string;
}) {
  const id = useId();
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const selected = Math.max(0, dates.indexOf(selectedDate ?? dates[dates.length - 1]));
  const ceiling = chartCeiling(series.flatMap((item) => item.values));
  const plot = { x: 38, y: 12, width: 622, height: 148 };
  const slot = plot.width / dates.length;
  const barWidth = Math.min(26, (slot * 0.68) / series.length);
  const hasActivity = series.some((item) => item.values.some((value) => value > 0));

  return (
    <div>
      <div className="relative mt-5">
        <svg
          viewBox="0 0 680 194"
          className="block w-full overflow-visible"
          role="img"
          aria-labelledby={`${id}-title ${id}-description`}
          onPointerMove={(event) => {
            const bounds = event.currentTarget.getBoundingClientRect();
            const x = ((event.clientX - bounds.left) / bounds.width) * 680;
            const index = Math.max(0, Math.min(dates.length - 1, Math.floor((x - plot.x) / slot)));
            setSelectedDate(dates[index]);
          }}
        >
          <title id={`${id}-title`}>{label}</title>
          <desc id={`${id}-description`}>
            Daily counts from {activityDate(dates[0])} to {activityDate(dates[dates.length - 1])},
            on a zero-based axis. Select a date below for exact values. All values are also
            available in the daily ledger.
          </desc>
          {[0, 1, 2, 3, 4].map((tick) => {
            const y = plot.y + plot.height - (tick / 4) * plot.height;
            return (
              <g key={tick}>
                <line
                  x1={plot.x}
                  x2={plot.x + plot.width}
                  y1={y}
                  y2={y}
                  stroke="var(--border)"
                  strokeDasharray={tick ? "3 5" : undefined}
                />
                <text
                  x={plot.x - 10}
                  y={y + 4}
                  textAnchor="end"
                  fontSize="12"
                  fill="var(--muted-foreground)"
                >
                  {formatMetric((ceiling * tick) / 4)}
                </text>
              </g>
            );
          })}
          <rect
            x={plot.x + selected * slot}
            y={plot.y}
            width={slot}
            height={plot.height}
            fill="var(--muted)"
            rx="3"
          />
          {dates.map((date, index) =>
            series.map((item, seriesIndex) => {
              const height = (item.values[index] / ceiling) * plot.height;
              return height > 0 ? (
                <rect
                  key={`${date}-${item.label}`}
                  x={plot.x + (index + 0.5) * slot + (seriesIndex - series.length / 2) * barWidth}
                  y={plot.y + plot.height - height}
                  width={Math.max(1, barWidth - 2)}
                  height={height}
                  rx="2"
                  fill={
                    item.secondary
                      ? "var(--muted-foreground)"
                      : "var(--foreground, var(--text-primary))"
                  }
                  opacity={item.secondary ? 0.55 : 1}
                />
              ) : null;
            }),
          )}
          {[0, Math.floor((dates.length - 1) / 2), dates.length - 1].map((index) => (
            <text
              key={index}
              x={plot.x + (index + 0.5) * slot}
              y="184"
              textAnchor={index === 0 ? "start" : index === dates.length - 1 ? "end" : "middle"}
              fontSize="12"
              fill="var(--muted-foreground)"
            >
              {activityDate(dates[index])}
            </text>
          ))}
        </svg>
        {!hasActivity && (
          <p className="absolute inset-x-8 top-1/3 text-center text-sm text-muted-foreground">
            No activity in this period
          </p>
        )}
      </div>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-t border-border pt-3">
        <label
          className="flex min-h-10 items-center gap-2 text-xs text-muted-foreground"
          htmlFor={`${id}-date`}
        >
          Inspect
          <select
            id={`${id}-date`}
            value={dates[selected]}
            onChange={(event) => setSelectedDate(event.target.value)}
            className="min-h-10 max-w-36 rounded-md border border-border bg-background px-2 text-xs text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            {dates.map((date) => (
              <option key={date} value={date}>
                {activityDate(date)}
              </option>
            ))}
          </select>
        </label>
        <div className="flex flex-wrap gap-3 text-xs" aria-live="polite">
          {series.map((item) => (
            <span key={item.label} className="flex items-center gap-1.5">
              <span
                aria-hidden="true"
                className={`h-2 w-2 rounded-sm ${item.secondary ? "bg-muted-foreground/55" : "bg-foreground"}`}
              />
              {item.label}{" "}
              <strong className="font-mono tabular-nums">
                {formatMetric(item.values[selected])}
              </strong>
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
