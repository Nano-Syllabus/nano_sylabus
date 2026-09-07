type TopicIdentity = {
  topicKey?: string | null;
  title?: string | null;
  subjectName?: string | null;
};

function words(value: string | null | undefined) {
  return String(value || "")
    .toLowerCase()
    .replace(/\.[a-z0-9]{1,8}$/i, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

const SOURCE_DOCUMENT_SUFFIXES = ["qb", "question bank", "syllabus", "text book", "textbook"];

/**
 * The provider catalogue can contain both syllabus topics and source-document
 * containers. A document such as "Applied Mechanics QB" is useful as a source,
 * but it is not a chapter that a student can learn or sit as a challenge.
 */
export function isChallengeSourceDocumentTopic({ topicKey, title, subjectName }: TopicIdentity) {
  const keyWords = words(topicKey);
  const titleWords = words(title);
  const subjectWords = words(subjectName);
  const candidates = [keyWords, titleWords].filter(Boolean);

  return candidates.some((candidate) =>
    SOURCE_DOCUMENT_SUFFIXES.some((suffix) => {
      if (candidate === suffix) return true;
      return Boolean(subjectWords && candidate === `${subjectWords} ${suffix}`);
    }),
  );
}
