import { Target } from "lucide-react";
import type { CommunitySubjectExplorerInsight } from "@/lib/data/community-subject-explorer";

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


export function SubjectTopicProgress({ insight }: { insight?: CommunitySubjectExplorerInsight }) {
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
                {topic.unitNumber ? (
                  <p className="mt-0.5 text-xs text-text-secondary">
                    Unit {topic.unitNumber}
                  </p>
                ) : null}
              </div>
            </div>
          ))}
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
