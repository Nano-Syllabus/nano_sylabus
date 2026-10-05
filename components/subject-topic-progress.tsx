"use client";

import Link from "next/link";
import { useContext, useState } from "react";
import { AppShellContext } from "@/components/app-shell-context";
import { useRouter } from "next/navigation";
import { Target } from "lucide-react";
import type { CommunitySubjectExplorerInsight } from "@/lib/data/community-subject-explorer";
import { unitsStartAtOne } from "@/lib/unit-numbering";

function progressColor(percentage: number | null) {
  if (percentage === null) return "text-text-muted";
  if (percentage >= 70) return "text-success";
  if (percentage >= 40) return "text-warning";
  return "text-destructive";
}

function TopicProgressRing({ percentage }: { percentage: number | null }) {
  const value = percentage === null ? 0 : Math.max(0, Math.min(100, percentage));
  const circumference = 2 * Math.PI * 15;
  return (
    <div className={`relative size-10 shrink-0 ${progressColor(percentage)}`}>
      <svg viewBox="0 0 40 40" className="size-10 -rotate-90" aria-hidden="true">
        <circle
          cx="20"
          cy="20"
          r="15"
          fill="none"
          stroke="currentColor"
          strokeOpacity="0.12"
          strokeWidth="3"
        />
        {percentage !== null ? (
          <circle
            cx="20"
            cy="20"
            r="15"
            fill="none"
            stroke="currentColor"
            strokeWidth="3"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={circumference - (circumference * value) / 100}
          />
        ) : null}
      </svg>
      <span className="absolute inset-0 flex items-center justify-center text-[10px] font-semibold tabular-nums">
        {percentage === null ? "—" : `${Math.round(value)}%`}
      </span>
    </div>
  );
}


const actionClass =
  "shrink-0 rounded-lg px-3 py-2 text-xs font-semibold text-success hover:bg-success/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-success disabled:cursor-wait disabled:opacity-60";

export function SubjectTopicProgress({ insight, courseId, subjectSlug, communitySlug, unlockAll = false }: {
  insight?: CommunitySubjectExplorerInsight;
  courseId?: string | null;
  subjectSlug?: string | null;
  communitySlug?: string;
  /** Plus and Pro: every unpractised topic can be started, not only the next one. */
  unlockAll?: boolean;
}) {
  const router = useRouter();
  const { upgradeHref } = useContext(AppShellContext);
  const [starting, setStarting] = useState<string | null>(null);
  const [startError, setStartError] = useState("");
  // Any practised topic (a score at all) is revisable. On Free only the first
  // unpractised topic can be started, the queue's order; Plus/Pro start any.
  const practised = (topic: CommunitySubjectExplorerInsight["topics"][number]) => (topic.percentage ?? 0) > 0;
  const firstUnpractised = insight?.topics.findIndex((topic) => !practised(topic)) ?? -1;
  async function startTopic(topic: CommunitySubjectExplorerInsight["topics"][number]) {
    if (upgradeHref) { router.push(upgradeHref); return; }
    setStarting(topic.key);
    setStartError("");
    try {
      const response = await fetch("/api/student/revision/start-topic", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ courseId, subjectSlug, topicKey: topic.key }),
      });
      const payload = (await response.json().catch(() => ({}))) as { challengeId?: string; error?: string };
      if (!response.ok || !payload.challengeId) {
        throw new Error(payload.error || "Could not start this topic. Try again.");
      }
      router.push(`/app/challenges?challenge=${encodeURIComponent(payload.challengeId)}`);
    } catch (cause) {
      setStartError(cause instanceof Error ? cause.message : "Could not start this topic. Try again.");
      setStarting(null);
    }
  }
  function actionHref(topic: CommunitySubjectExplorerInsight["topics"][number], revise: boolean) {
    const params = new URLSearchParams({ courseId: courseId!, subject: subjectSlug!, topic: topic.key, topicTitle: topic.title });
    if (communitySlug) params.set("community", communitySlug);
    return `${revise ? "/app/notes" : "/app/challenges"}?${params}`;
  }
  const showUnits = unitsStartAtOne((insight?.topics ?? []).map((topic) => topic.unitNumber));
  return (
    <div>
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-xs font-semibold uppercase tracking-widest text-text-secondary">
          Topic progress
        </h3>
        <span className="text-xs text-text-secondary">
          {insight?.practicedTopicCount === null || insight?.practicedTopicCount === undefined
            ? "— practiced"
            : `${insight.practicedTopicCount} practiced`}
        </span>
      </div>

      {insight?.topics.length ? (
        <div className="mt-3 divide-y divide-border border-y border-border">
          {insight.topics.map((topic, index) => (
            <div key={topic.key} className="flex min-h-16 items-center gap-3 py-3">
              <TopicProgressRing percentage={topic.percentage} />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-text-primary">
                  {index + 1}. {topic.title}
                </p>
                {showUnits && topic.unitNumber ? (
                  <p className="mt-0.5 text-xs text-text-secondary">
                    Unit {topic.unitNumber}
                  </p>
                ) : null}
              </div>
              {upgradeHref ? (
                <Link href={upgradeHref} className={actionClass}>Upgrade</Link>
              ) : !courseId || !subjectSlug ? (
                <span className="shrink-0 px-3 text-xs text-text-muted">Locked</span>
              ) : practised(topic) ? (
                <Link href={actionHref(topic, true)} className={actionClass}>Revise</Link>
              ) : index === firstUnpractised ? (
                <Link href={actionHref(topic, false)} className={actionClass}>Start</Link>
              ) : unlockAll ? (
                <button type="button" className={actionClass} disabled={starting !== null}
                  onClick={() => void startTopic(topic)}>
                  {starting === topic.key ? "Starting…" : "Start"}
                </button>
              ) : (
                <span className="shrink-0 px-3 text-xs text-text-muted">Locked</span>
              )}
            </div>
          ))}
          {startError ? (
            <p role="alert" className="py-3 text-xs text-destructive">{startError}</p>
          ) : null}
        </div>
      ) : (
        <div className="mt-3 rounded-xl border border-dashed border-border bg-bg-secondary p-8 text-center">
          <Target className="mx-auto size-7 text-text-muted" aria-hidden="true" />
          <p className="mt-3 text-sm font-medium text-text-primary">
            {insight ? "No extracted topics yet" : "Topic progress unavailable"}
          </p>
          <p className="mt-1 text-xs leading-5 text-text-secondary">
            {insight
              ? "Ask the community creator to refresh this subject's learning map."
              : "Try again in a moment to see this subject's learning map."}
          </p>
        </div>
      )}
    </div>
  );
}
