import type { AssistantCitation } from "@/lib/types";
import { normalizeSubjectLabel } from "@/lib/profile-normalization";

function uniqueNormalized(values: string[]) {
  return Array.from(
    new Set(
      values
        .map((value) => normalizeSubjectLabel(value))
        .filter(Boolean),
    ),
  );
}

export function isGeneralSubjectTag(value: string | null | undefined) {
  return normalizeSubjectLabel(value ?? "").toLowerCase() === "general";
}

export function inferSessionSubjectContext(input: {
  existingSubjectContext: string | null;
  resolvedSubjectTags: string[];
  citations: AssistantCitation[];
}) {
  const existing = normalizeSubjectLabel(input.existingSubjectContext ?? "");

  // If existing context already has chapter info (contains ">"), keep it as-is
  if (existing && existing.includes(">")) return existing;

  // Derive subject + chapter from citations
  const citedSubjects = uniqueNormalized(input.citations.map((citation) => citation.subject ?? ""));
  const citedChapters = input.citations
    .map((citation) => citation.chapter ?? "")
    .filter(Boolean);
  const uniqueChapters = Array.from(new Set(citedChapters));

  // If all citations point to a single subject and a single chapter,
  // build a "Subject > Chapter" context so follow-ups scope to that chapter.
  if (citedSubjects.length === 1 && uniqueChapters.length === 1) {
    // If the user explicitly selected a subject, only enrich with chapter info
    // when the cited subject matches. Never override the user's choice with a
    // different subject pulled from RAG citations.
    if (existing) {
      const citedNormalized = citedSubjects[0].toLowerCase();
      const existingNormalized = existing.toLowerCase();
      if (citedNormalized === existingNormalized) {
        return `${citedSubjects[0]} > ${uniqueChapters[0]}`;
      }
      // Cited subject differs from user's selection — keep user's choice
      return existing;
    }
    return `${citedSubjects[0]} > ${uniqueChapters[0]}`;
  }

  // If we have a subject but multiple/no chapters, return subject only
  if (existing) return existing;
  if (citedSubjects.length === 1) return citedSubjects[0];
  if (citedSubjects.length > 1) return null;

  const specificTags = uniqueNormalized(
    input.resolvedSubjectTags.filter((tag) => !isGeneralSubjectTag(tag)),
  );
  if (specificTags.length === 1) return specificTags[0];

  return null;
}
