/** Shared by server generation, browser cache keys and the maintenance script. */
export const CONCEPT_READING_VERSION = "microbook-v1";

const record = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;

export function isCurrentConceptReading(reading: unknown) {
  const value = record(reading);
  // The version alone: a micro-book chapter whose activities call failed is still
  // a current reading, just one without widgets.
  return (
    value?.content_version === CONCEPT_READING_VERSION &&
    typeof value.content === "string" &&
    Boolean(value.content.trim())
  );
}

/** Clear only the derived reading; retain exams, solutions, scores and drafts. */
export function resetSavedConceptReading(value: unknown): Record<string, unknown> | null {
  const content = record(value);
  const lesson = record(content?.lesson);
  if (!content || !lesson) return null;
  const translation = record(content.romanNepali);
  return {
    ...content,
    lesson: {
      ...lesson,
      content: [],
      focus: "",
      bigIdea: "",
      connections: [],
      sources: [],
      readingVersion: "",
    },
    readingError: null,
    learningWarning: null,
    ...(translation ? { romanNepali: { ...translation, reading: [], sourceHash: "" } } : {}),
  };
}

export function resetPooledConceptReading(value: unknown): Record<string, unknown> | null {
  const content = record(value);
  return content ? { ...content, reading: null } : null;
}

/** Drop previous reading queries while retaining unrelated browser caches. */
export function pruneCachedConceptQueries<
  T extends { clientState: { queries: Array<{ queryKey: readonly unknown[] }> } },
>(client: T): T {
  return {
    ...client,
    clientState: {
      ...client.clientState,
      queries: client.clientState.queries.filter(({ queryKey: key }) => {
        const reading =
          key[0] === "student" &&
          (key[1] === "revision" || (key[1] === "challenges" && key[2] === "content"));
        return !reading || key.includes(CONCEPT_READING_VERSION);
      }),
    },
  };
}
