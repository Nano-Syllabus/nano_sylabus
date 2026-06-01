import type { AssistantCitation } from "@/lib/types";

function normalizeKeyPart(value: string | null | undefined) {
  return (value || "").trim().toLowerCase();
}

export function dedupeCitationsForDisplay(citations: AssistantCitation[]) {
  const seen = new Set<string>();
  const deduped: AssistantCitation[] = [];

  for (const citation of citations) {
    const key = [
      normalizeKeyPart(citation.documentId),
      normalizeKeyPart(citation.sourceTitle),
      normalizeKeyPart(citation.subject),
      normalizeKeyPart(citation.chapter),
    ]
      .filter(Boolean)
      .join("::");

    const fallbackKey = [
      normalizeKeyPart(citation.sourceLabel),
      normalizeKeyPart(citation.sourceName),
      normalizeKeyPart(citation.excerpt?.slice(0, 80)),
    ]
      .filter(Boolean)
      .join("::");

    const finalKey = key || fallbackKey;
    if (!finalKey || seen.has(finalKey)) continue;
    seen.add(finalKey);
    deduped.push(citation);
  }

  return deduped;
}
