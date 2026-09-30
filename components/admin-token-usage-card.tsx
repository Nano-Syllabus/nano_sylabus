"use client";

import { useEffect, useState } from "react";
import type { PlatformTokenUsage } from "@/lib/data/admin-token-usage";

const num = (value: number) => value.toLocaleString();

/**
 * AI token spend for the whole platform: totals, then by teacher and by
 * faculty. Loads on its own after the Overview, since it asks the backend
 * once per teacher (cached five minutes on the server).
 */
export function AdminTokenUsageCard() {
  const [usage, setUsage] = useState<PlatformTokenUsage | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<"teachers" | "faculties">("teachers");

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/admin/token-usage", { cache: "no-store", signal: controller.signal })
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
  }, []);

  const rows =
    usage && view === "teachers"
      ? usage.teachers.map((row) => ({
          key: row.teacherId,
          label: row.name,
          detail: row.available ? row.email : "Couldn’t read this teacher’s usage",
          tokens: row.totalTokens,
          calls: row.calls,
          muted: !row.available,
        }))
      : (usage?.faculties ?? []).map((row) => ({
          key: row.community || "untagged",
          label: row.name,
          detail: row.community ? null : "Indexing, teachers’ own work, and usage before faculty tracking",
          tokens: row.totalTokens,
          calls: row.calls,
          muted: !row.community,
        }));
  const largest = Math.max(1, ...rows.map((row) => row.tokens));

  return (
    <section className="mt-6 rounded-xl border border-border bg-card">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-4">
        <div>
          <h2 className="font-semibold">AI token usage</h2>
          <p className="text-xs text-muted-foreground">All teachers’ collections, all time.</p>
        </div>
        <div className="flex gap-1 rounded-lg bg-muted p-1" role="group" aria-label="Break down by">
          {(["teachers", "faculties"] as const).map((option) => (
            <button
              key={option}
              type="button"
              aria-pressed={view === option}
              onClick={() => setView(option)}
              className={`min-h-8 rounded-md px-3 text-xs font-medium ${
                view === option ? "bg-card text-foreground shadow-sm" : "text-muted-foreground"
              }`}
            >
              {option === "teachers" ? "By teacher" : "By faculty"}
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

          <ul className="divide-y divide-border border-t border-border">
            {usage
              ? rows.map((row) => (
                  <li key={row.key} className="px-5 py-3">
                    <div className="flex items-baseline justify-between gap-3 text-sm">
                      <span className="min-w-0">
                        <span className={`block truncate font-medium ${row.muted ? "text-muted-foreground" : ""}`}>
                          {row.label}
                        </span>
                        {row.detail ? (
                          <span className="block truncate text-xs text-muted-foreground">{row.detail}</span>
                        ) : null}
                      </span>
                      <span className="shrink-0 text-right tabular-nums">
                        {num(row.tokens)}
                        <span className="block text-xs text-muted-foreground">{num(row.calls)} calls</span>
                      </span>
                    </div>
                    <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
                      <div
                        className={`h-full rounded-full ${row.muted ? "bg-border" : "bg-blue-600"}`}
                        style={{ width: `${Math.max((row.tokens / largest) * 100, row.tokens ? 1 : 0)}%` }}
                      />
                    </div>
                  </li>
                ))
              : [0, 1, 2].map((index) => (
                  <li key={index} className="px-5 py-3">
                    <div className="h-4 w-40 animate-pulse rounded bg-border" />
                    <div className="mt-2 h-1.5 animate-pulse rounded-full bg-border" />
                  </li>
                ))}
          </ul>

          {usage?.unavailableCount ? (
            <p className="border-t border-border px-5 py-3 text-xs text-muted-foreground">
              {usage.unavailableCount} teacher{usage.unavailableCount === 1 ? "’s" : "s’"} usage couldn’t be read, so the
              totals leave {usage.unavailableCount === 1 ? "it" : "them"} out.
            </p>
          ) : null}
        </>
      )}
    </section>
  );
}
