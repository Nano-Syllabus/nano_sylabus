"use client";
import type { AssistantCitation } from "@/lib/types";

function sanitizeSourceValue(value: string | null | undefined) {
  if (!value) return "";
  const trimmed = value.trim();
  if (!trimmed) return "";
  const normalized = trimmed.toLowerCase();
  if (
    normalized === "unknown-source" ||
    normalized === "source-file" ||
    normalized === "untitled source" ||
    normalized === "untitled" ||
    normalized === "n/a"
  ) {
    return "";
  }
  return trimmed;
}

export function CitationCard({ citation }: { citation: AssistantCitation }) {
  const sourceType = citation.sourceType ?? "textbook";
  const sourceTypeLabel =
    sourceType === "syllabus"
      ? "Syllabus source"
      : sourceType === "general"
          ? "Ungrounded source"
          : "Textbook source";
  const sourceTitle = sanitizeSourceValue(citation.sourceTitle);
  const sourceName = sanitizeSourceValue(citation.sourceName);
  const sourceLabel = sanitizeSourceValue(citation.sourceLabel);
  const displayTitle = sourceTitle || sourceName || sourceLabel || citation.chapter || citation.topic || citation.subject || "Source";
  const metadata = [sourceLabel, sourceName]
    .filter((value, index, list) => Boolean(value) && list.indexOf(value) === index)
    .join(" • ");

  return (
    <div className="w-full rounded-xl border border-border bg-bg-primary px-3 py-2 text-left sm:max-w-sm">
      <p className="text-[10px] font-mono-ui uppercase tracking-wider font-bold text-text-secondary">{sourceTypeLabel}</p>
      <p className="mt-1 text-[13px] font-semibold text-text-primary">
        {displayTitle}
      </p>
      {metadata ? <p className="mt-1 text-[11px] text-text-secondary">{metadata}</p> : null}
      {citation.excerpt ? (
        <details className="mt-2 group">
          <summary className="cursor-pointer list-none text-[11px] font-medium text-text-secondary transition group-open:text-text-primary">
            View matched excerpt
          </summary>
          <p className="mt-2 text-xs leading-6 text-text-secondary">{citation.excerpt}</p>
        </details>
      ) : null}
    </div>
  );
}
