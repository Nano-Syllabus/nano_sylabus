"use client";

import Link from "next/link";
import type { AssistantCitation } from "@/lib/types";

export function CitationCard({ citation }: { citation: AssistantCitation }) {
  const metadata = [citation.sourceLabel, citation.sourceName]
    .filter((value, index, list) => Boolean(value) && list.indexOf(value) === index)
    .join(" • ");

  return (
    <div className="w-full rounded-xl border border-border bg-bg-primary px-3 py-2 text-left sm:max-w-sm">
      <p className="text-[10px] font-mono-ui uppercase tracking-wider text-text-muted">Textbook source</p>
      <p className="mt-1 text-xs font-medium text-text-primary">
        {citation.sourceTitle || citation.sourceName || citation.sourceLabel}
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
      <Link
        href={`/app/sources/${encodeURIComponent(citation.chunkId)}`}
        className="mt-2 inline-flex text-[11px] font-medium text-text-secondary underline-offset-4 transition hover:text-text-primary hover:underline"
      >
        Open source detail →
      </Link>
    </div>
  );
}
