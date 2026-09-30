"use client";

import { useEffect, useState } from "react";

/**
 * TOKEN SPEND PER FACULTY.
 *
 * The backend tags each AI call with the faculty a student made it from
 * (`X-NSDI-Community`, lib/usage-community.ts) and `/v1/collection/usage`
 * returns `by_community`. The '' bucket is everything not made for a faculty:
 * this creator's own workspace work, indexing, and every call made before the
 * tagging shipped.
 */
export type CommunityUsageBucket = { community: string; totalTokens: number; calls: number };

export function communityUsageBuckets(usage: Record<string, unknown>): CommunityUsageBucket[] {
  const rows = Array.isArray(usage.by_community) ? usage.by_community : [];
  return rows
    .map((row) => {
      const record = (row || {}) as Record<string, unknown>;
      return {
        community: String(record.community || ""),
        totalTokens: Number(record.total_tokens) || 0,
        calls: Number(record.calls) || 0,
      };
    })
    .filter((bucket) => bucket.totalTokens > 0)
    .sort((a, b) => b.totalTokens - a.totalTokens);
}

/** The Analytics card's "By faculty" list: a bar per faculty, untagged last. */
export function FacultyTokenBreakdown({
  buckets,
  names,
}: {
  buckets: CommunityUsageBucket[];
  names: Record<string, string>;
}) {
  const tagged = buckets.filter((bucket) => bucket.community);
  // Until the backend records faculties there is nothing to split — say nothing
  // rather than show one "untagged" row that looks like a finding.
  if (!tagged.length) return null;
  const untagged = buckets.find((bucket) => !bucket.community);
  const rows = untagged ? [...tagged, untagged] : tagged;
  const total = rows.reduce((sum, bucket) => sum + bucket.totalTokens, 0) || 1;

  return (
    <div className="mt-5 border-t border-border pt-4">
      <h4 className="text-sm font-semibold text-text-primary">By faculty</h4>
      <ul className="mt-3 space-y-3">
        {rows.map((bucket) => {
          const share = bucket.totalTokens / total;
          const label = bucket.community
            ? names[bucket.community] || bucket.community
            : "Your workspace & earlier usage";
          return (
            <li key={bucket.community || "untagged"}>
              <div className="flex items-baseline justify-between gap-3 text-sm">
                <span className="min-w-0 truncate font-medium text-text-primary">{label}</span>
                <span className="shrink-0 tabular-nums text-text-secondary">
                  {bucket.totalTokens.toLocaleString()}
                  <span className="ml-2 text-xs text-text-muted">{Math.round(share * 100)}%</span>
                </span>
              </div>
              <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-bg-secondary">
                <div
                  className={bucket.community ? "h-full rounded-full bg-blue-600" : "h-full rounded-full bg-border"}
                  style={{ width: `${Math.max(share * 100, 1)}%` }}
                />
              </div>
            </li>
          );
        })}
      </ul>
      {untagged ? (
        <p className="mt-3 text-xs leading-5 text-text-muted">
          Faculty totals count from when per-faculty tracking started. Your own workspace work,
          indexing and earlier usage stay in the last row.
        </p>
      ) : null}
    </div>
  );
}

/** One faculty's spend, for its Members & settings tab. */
export function FacultyTokenUsage({ slug }: { slug: string }) {
  const [state, setState] = useState<
    { status: "loading" } | { status: "ready"; bucket: CommunityUsageBucket | null } | { status: "error" }
  >({ status: "loading" });

  useEffect(() => {
    let active = true;
    fetch("/api/teacher/collection/usage", { headers: { Accept: "application/json" }, cache: "no-store" })
      .then(async (response) => {
        const payload = (await response.json().catch(() => ({}))) as { usage?: Record<string, unknown> };
        if (!response.ok) throw new Error("usage unavailable");
        // A backend that does not record faculties yet has no `by_community` at
        // all; "0 tokens" would read as a fact, so the card stays hidden instead.
        if (!Array.isArray(payload.usage?.by_community)) throw new Error("not tracked yet");
        if (!active) return;
        const bucket =
          communityUsageBuckets(payload.usage || {}).find((item) => item.community === slug) || null;
        setState({ status: "ready", bucket });
      })
      .catch(() => {
        if (active) setState({ status: "error" });
      });
    return () => {
      active = false;
    };
  }, [slug]);

  if (state.status === "error") return null;
  return (
    <section className="mt-7 rounded-xl border border-border bg-bg-primary p-5 sm:p-6" aria-labelledby="faculty-usage-heading">
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-0 flex-1">
          <h2 id="faculty-usage-heading" className="font-display text-xl font-semibold">
            AI token usage
          </h2>
          <p className="mt-1 text-sm text-text-secondary">
            What students in this community have used — challenges, NanoAI chat and grading.
          </p>
        </div>
        {state.status === "loading" ? (
          <span className="h-8 w-28 animate-pulse rounded-md bg-border motion-reduce:animate-none" />
        ) : (
          <p className="text-right">
            <span className="block font-display text-2xl font-semibold tabular-nums text-text-primary">
              {(state.bucket?.totalTokens ?? 0).toLocaleString()}
            </span>
            <span className="text-xs text-text-muted">
              tokens · {(state.bucket?.calls ?? 0).toLocaleString()} AI calls
            </span>
          </p>
        )}
      </div>
    </section>
  );
}
