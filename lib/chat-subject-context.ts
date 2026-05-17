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
  if (existing) return existing;

  const citedSubjects = uniqueNormalized(input.citations.map((citation) => citation.subject ?? ""));
  if (citedSubjects.length === 1) return citedSubjects[0];
  if (citedSubjects.length > 1) return null;

  const specificTags = uniqueNormalized(
    input.resolvedSubjectTags.filter((tag) => !isGeneralSubjectTag(tag)),
  );
  if (specificTags.length === 1) return specificTags[0];

  return null;
}
