import type { AssistantCitation } from "@/lib/types";
import { normalizeSubjectLabel } from "@/lib/profile-normalization";

type RetrievalResultLike = {
  citations: AssistantCitation[];
};

function normalize(value: string) {
  return normalizeSubjectLabel(value);
}

export function deriveSubjectTags({
  existingTags,
  subjectContext,
  retrieval,
  question,
  profileSubjects,
}: {
  existingTags: string[];
  subjectContext: string | null;
  retrieval: RetrievalResultLike;
  question: string;
  profileSubjects: string[];
}) {
  const tags = new Set<string>();

  existingTags.forEach((tag) => {
    const normalized = normalize(tag);
    if (normalized) tags.add(normalized);
  });

  if (subjectContext?.trim()) {
    tags.add(normalize(subjectContext));
  }

  retrieval.citations.forEach((citation) => {
    if (citation.subject?.trim()) {
      tags.add(normalize(citation.subject));
    }
  });

  const loweredQuestion = question.toLowerCase();
  profileSubjects.forEach((subject) => {
    const normalized = normalize(subject);
    if (normalized && loweredQuestion.includes(normalized.toLowerCase())) {
      tags.add(normalized);
    }
  });

  return Array.from(tags).slice(0, 2);
}
