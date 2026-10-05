"use client";

import { useEffect, useState } from "react";
import type { PlatformTokenUsage, TaskTokenUsage, UsageRange } from "@/lib/data/admin-token-usage";
import { FORMAT_HINTS, type UsageFormat } from "@/lib/token-usage-groups";

const num = (value: number) => value.toLocaleString();

type View = "features" | "formats" | "faculties" | "teachers";
const VIEWS: Array<[View, string]> = [
  ["features", "By feature"],
  ["formats", "By question type"],
  ["faculties", "By faculty"],
  ["teachers", "By teacher"],
];
const RANGES: Array<[UsageRange, string]> = [
  ["7d", "7 days"],
  ["30d", "30 days"],
  ["all", "All time"],
];
const FORMAT_NAMES: Record<string, string> = { qna: "QnA", mcq: "MCQ", hybrid: "QnA + MCQ" };

type Row = {
  key: string;
  label: string;
  detail?: string | null;
  badge?: string | null;
  tokens: number;
  calls: number;
  muted?: boolean;
  tasks?: TaskTokenUsage[];
};

function Bar({ value, max, muted }: { value: number; max: number; muted?: boolean }) {
  return (
    <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
      <div
        className={`h-full rounded-full ${muted ? "bg-border" : "bg-blue-600"}`}
        style={{ width: `${Math.max((value / Math.max(1, max)) * 100, value ? 1 : 0)}%` }}
      />
    </div>
  );
}

/**
 * AI token spend for the whole platform: totals, then where it goes — by
 * feature (challenges, practice, chat), by question type (MCQ, written, lessons),
 * by faculty and by teacher. Rows open to show the routes inside them. Loads on
 * its own after the Overview, since it asks the backend once per teacher (cached
 * five minutes on the server).
 */
export function AdminTokenUsageCard() {
  const [usage, setUsage] = useState<PlatformTokenUsage | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<View>("features");
  const [range, setRange] = useState<UsageRange>("all");

  useEffect(() => {
    const controller = new AbortController();
    setUsage(null);
    setError(null);
    fetch(`/api/admin/token-usage?range=${range}`, { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        const body = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(body.error || "Token usage couldn’t be loaded.");
        setUsage(body as PlatformTokenUsage);
      })
      .catch((cause) => {
        if (!controller.signal.aborted) {
          setError(cause instanceof Error ? cause.message : "Token usage couldn’t be loaded.");
        }
      });
    return () => controller.abort();
  }, [range]);

  const rows: Row[] = !usage
    ? []
    : view === "features"
      ? usage.features.map((group) => ({
          key: group.key,
          label: group.label,
          tokens: group.totalTokens,
          calls: group.calls,
          muted: group.key === "other",
          tasks: group.tasks,
        }))
      : view === "formats"
        ? usage.formats.map((group) => ({
            key: group.key,
            label: group.label,
            detail: FORMAT_HINTS[group.key as UsageFormat],
            tokens: group.totalTokens,
            calls: group.calls,
            muted: group.key === "other",
            tasks: group.tasks,
          }))
        : view === "faculties"
          ? usage.faculties.map((row) => ({
              key: row.community || "untagged",
              label: row.name,
              detail: row.community
                ? null
                : "Indexing, teachers’ own work, and usage before faculty tracking",
              badge: row.challengeFormat
                ? (FORMAT_NAMES[row.challengeFormat] ?? row.challengeFormat)
                : null,
              tokens: row.totalTokens,
              calls: row.calls,
              muted: !row.community,
              tasks: row.tasks,
            }))
          : usage.teachers.map((row) => ({
              key: row.teacherId,
              label: row.name,
              detail: row.available ? row.email : "Couldn’t read this teacher’s usage",
              tokens: row.totalTokens,
              calls: row.calls,
              muted: !row.available,
            }));
  const largest = Math.max(1, ...rows.map((row) => row.tokens));
  const total = usage?.totals.totalTokens ?? 0;

  return (
    <section className="mt-6 rounded-xl border border-border bg-card">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-4">
        <div>
          <h2 className="font-semibold">AI token usage</h2>
          <p className="text-xs text-muted-foreground">
            Where the tokens go — all teachers’ collections.
          </p>
        </div>
        <div className="flex gap-1 rounded-lg bg-muted p-1" role="group" aria-label="Time range">
          {RANGES.map(([value, label]) => (
            <button
              key={value}
              type="button"
              aria-pressed={range === value}
              onClick={() => setRange(value)}
              className={`min-h-8 rounded-md px-3 text-xs font-medium ${
                range === value ? "bg-card text-foreground shadow-sm" : "text-muted-foreground"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {error ? (
        <p className="px-5 py-6 text-sm text-muted-foreground">{error}</p>
      ) : (
        <>
          <dl className="grid grid-cols-3 gap-3 px-5 py-4">
            {[
              ["Total tokens", usage?.totals.totalTokens],
              ["Input", usage?.totals.promptTokens],
              ["Output", usage?.totals.completionTokens],
            ].map(([label, value]) => (
              <div key={label as string} className="min-w-0">
                <dt className="text-xs text-muted-foreground">{label}</dt>
                <dd className="mt-1 truncate text-lg font-semibold tabular-nums sm:text-xl">
                  {typeof value === "number" ? (
                    num(value)
                  ) : (
                    <span className="inline-block h-6 w-24 animate-pulse rounded bg-border align-middle" />
                  )}
                </dd>
              </div>
            ))}
          </dl>

          <div
            className="flex flex-wrap gap-1 border-t border-border px-5 py-3"
            role="group"
            aria-label="Break down by"
          >
            {VIEWS.map(([value, label]) => (
              <button
                key={value}
                type="button"
                aria-pressed={view === value}
                onClick={() => setView(value)}
                className={`min-h-8 rounded-md px-3 text-xs font-medium ${
                  view === value
                    ? "bg-muted text-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          <ul className="divide-y divide-border border-t border-border">
            {usage ? (
              rows.length ? (
                rows.map((row) => {
                  const share = total ? Math.round((row.tokens / total) * 100) : 0;
                  const body = (
                    <>
                      <div className="flex items-baseline justify-between gap-3 text-sm">
                        <span className="min-w-0">
                          <span
                            className={`block truncate font-medium ${row.muted ? "text-muted-foreground" : ""}`}
                          >
                            {row.label}
                            {row.badge ? (
                              <span className="ml-2 rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                                {row.badge}
                              </span>
                            ) : null}
                          </span>
                          {row.detail ? (
                            <span className="block truncate text-xs text-muted-foreground">
                              {row.detail}
                            </span>
                          ) : null}
                        </span>
                        <span className="shrink-0 text-right tabular-nums">
                          {num(row.tokens)}
                          <span className="block text-xs text-muted-foreground">
                            {share}% · {num(row.calls)} calls
                          </span>
                        </span>
                      </div>
                      <Bar value={row.tokens} max={largest} muted={row.muted} />
                    </>
                  );
                  return (
                    <li key={row.key}>
                      {row.tasks?.length ? (
                        <details className="group">
                          <summary className="cursor-pointer list-none px-5 py-3 hover:bg-muted/40">
                            {body}
                          </summary>
                          <ul className="space-y-2 bg-muted/30 px-5 py-3">
                            {row.tasks.map((task) => (
                              <li
                                key={task.endpoint}
                                className="flex items-baseline justify-between gap-3 text-xs"
                              >
                                <span className="min-w-0 truncate">
                                  {task.label}
                                  <span className="ml-2 font-mono text-[11px] text-muted-foreground">
                                    {task.endpoint}
                                  </span>
                                </span>
                                <span className="shrink-0 tabular-nums text-muted-foreground">
                                  {num(task.totalTokens)} · {num(task.calls)} calls
                                </span>
                              </li>
                            ))}
                          </ul>
                        </details>
                      ) : (
                        <div className="px-5 py-3">{body}</div>
                      )}
                    </li>
                  );
                })
              ) : (
                <li className="px-5 py-6 text-sm text-muted-foreground">
                  No usage recorded in this period.
                </li>
              )
            ) : (
              [0, 1, 2].map((index) => (
                <li key={index} className="px-5 py-3">
                  <div className="h-4 w-40 animate-pulse rounded bg-border" />
                  <div className="mt-2 h-1.5 animate-pulse rounded-full bg-border" />
                </li>
              ))
            )}
          </ul>

          {usage?.unavailableCount ? (
            <p className="border-t border-border px-5 py-3 text-xs text-muted-foreground">
              {usage.unavailableCount} teacher{usage.unavailableCount === 1 ? "’s" : "s’"} usage
              couldn’t be read, so the totals leave {usage.unavailableCount === 1 ? "it" : "them"}{" "}
              out.
            </p>
          ) : null}
          {view === "faculties" &&
          usage &&
          usage.faculties.some((f) => f.community && !f.tasks.length) ? (
            <p className="border-t border-border px-5 py-3 text-xs text-muted-foreground">
              Route detail per faculty appears once the backend is updated.
            </p>
          ) : null}
        </>
      )}
    </section>
  );
}
