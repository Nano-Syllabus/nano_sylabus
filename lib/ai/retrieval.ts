import { createSupabaseServerClient } from "@/lib/supabase/server";
import { normalizeBoard, normalizeGrade, normalizeSubjects } from "@/lib/profile-normalization";
import type { AssistantCitation, CitationSourceType, StudentProfile } from "@/lib/types";
import { embedText } from "@/lib/ai/embeddings";

interface KnowledgeCandidateRow {
  id: string;
  document_id: string;
  board: string;
  grade: string;
  subject: string;
  chapter: string | null;
  topic: string | null;
  content: string;
  embedding: number[];
  knowledge_documents: Array<{
    id: string;
    title: string;
    source_name: string;
    source_type: string;
    resource_kind?: "syllabus" | "study_material" | "question_bank" | null;
  }> | null;
}

function firstKnowledgeDocument(row: KnowledgeCandidateRow) {
  return row.knowledge_documents?.[0] ?? null;
}

export interface RetrievedChunk {
  id: string;
  documentId: string;
  board: string;
  grade: string;
  subject: string;
  chapter: string | null;
  topic: string | null;
  content: string;
  sourceTitle: string;
  sourceName: string;
  resourceKind: "syllabus" | "study_material" | "question_bank";
  score: number;
}

export interface RetrievalResult {
  chunks: RetrievedChunk[];
  citations: AssistantCitation[];
  grounded: boolean;
}

const LOW_SIGNAL_PATTERNS = [
  /^--\s*\d+\s*of\s*\d+\s*--$/im,
  /^original pdf page\s+\d+$/im,
  /^contents$/im,
  /^preface$/im,
];

const STOPWORDS = new Set([
  "the",
  "and",
  "for",
  "with",
  "that",
  "this",
  "are",
  "was",
  "were",
  "from",
  "into",
  "your",
  "have",
  "has",
  "had",
  "how",
  "what",
  "why",
  "when",
  "where",
  "which",
  "about",
  "than",
  "then",
  "them",
  "they",
  "you",
  "can",
  "will",
  "would",
  "should",
  "could",
  "their",
  "there",
  "explain",
]);

function cosineSimilarity(left: number[], right: number[]) {
  let dot = 0;
  let leftMagnitude = 0;
  let rightMagnitude = 0;

  for (let index = 0; index < Math.min(left.length, right.length); index += 1) {
    dot += left[index] * right[index];
    leftMagnitude += left[index] * left[index];
    rightMagnitude += right[index] * right[index];
  }

  if (!leftMagnitude || !rightMagnitude) return 0;
  return dot / (Math.sqrt(leftMagnitude) * Math.sqrt(rightMagnitude));
}

function buildCitationExcerpt(content: string, limit = 220) {
  const normalized = content.replace(/\s+/g, " ").trim();
  if (!normalized) return "";
  if (normalized.length <= limit) return normalized;

  const clipped = normalized.slice(0, limit);
  const lastSpace = clipped.lastIndexOf(" ");
  return `${(lastSpace > 120 ? clipped.slice(0, lastSpace) : clipped).trim()}...`;
}

function buildGroundingExcerpt(content: string, limit = 900) {
  const normalized = content.replace(/\s+/g, " ").trim();
  if (!normalized) return "";
  if (normalized.length <= limit) return normalized;

  const clipped = normalized.slice(0, limit);
  const lastBoundary = Math.max(
    clipped.lastIndexOf(". "),
    clipped.lastIndexOf("? "),
    clipped.lastIndexOf("! "),
    clipped.lastIndexOf("; "),
  );

  if (lastBoundary > 240) {
    return `${clipped.slice(0, lastBoundary + 1).trim()}...`;
  }

  const lastSpace = clipped.lastIndexOf(" ");
  return `${(lastSpace > 240 ? clipped.slice(0, lastSpace) : clipped).trim()}...`;
}

function normalizeChunkContent(content: string) {
  return content
    .replace(/\r/g, "")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .filter((line) => !LOW_SIGNAL_PATTERNS.some((pattern) => pattern.test(line)))
    .join("\n")
    .trim();
}

function tokenizeForMatch(text: string) {
  const tokens = text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length >= 3)
    .filter((token) => !STOPWORDS.has(token));
  return Array.from(new Set(tokens));
}

function computeLexicalOverlap(queryTokens: string[], content: string) {
  if (queryTokens.length === 0) return 0;
  const contentLower = content.toLowerCase();
  let hits = 0;
  for (const token of queryTokens) {
    if (contentLower.includes(token)) hits += 1;
  }
  return hits / queryTokens.length;
}

function lowSignalPenalty(content: string) {
  const compact = content.replace(/\s+/g, " ").trim();
  if (!compact) return 1;
  const markerMatches = compact.match(/--\s*\d+\s*of\s*\d+\s*--/gi)?.length ?? 0;
  const lengthPenalty = compact.length < 120 ? 0.35 : 0;
  const markerPenalty = markerMatches > 0 ? Math.min(0.5, markerMatches * 0.12) : 0;
  return lengthPenalty + markerPenalty;
}

function isSyllabusIntent(question: string) {
  const normalized = question.toLowerCase();
  const patterns = [
    /\bsyllabus\b/,
    /\bcourse\s+outline\b/,
    /\bcourse\s+structure\b/,
    /\bchapter\s+list\b/,
    /\bunit\s+list\b/,
    /\bhow\s+many\s+hours\b/,
    /\bpractical\b/,
    /\breference\b/,
    /\bcourse\s+code\b/,
    /\bsh\s*402\b/,
    /\blist.*(?:chapter|unit)s?\b/,
    /\b(?:chapter|unit)s?.*\blist\b/,
    /\ball\s+(?:the\s+)?(?:chapter|unit)s?\b/,
    /\b(?:chapter|unit)s?.*\ball\b/,
    /\bhow\s+many\s+(?:chapter|unit)s?\b/,
    /\b(?:what|which)\s+(?:are|is)\s+(?:the\s+)?(?:chapter|unit)s?\b/,
  ];
  return patterns.some((pattern) => pattern.test(normalized));
}

function isStructureLookupIntent(question: string) {
  const normalized = question.toLowerCase();
  const patterns = [
    /\bchapter\s*(?:no\.?|number)?\s*\d+\b/,
    /\bunit\s*\d+\b/,
    /\b\d+(?:st|nd|rd|th)\s+(?:chapter|unit)\b/,
    /\b(?:first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth)\s+(?:chapter|unit)\b/,
    /\bchapter\s+(?:one|two|three|four|five|six|seven|eight|nine|ten)\b/,
    /\bour\s+(?:first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth)\s+(?:chapter|unit)\b/,
    /\bour\s+\d+(?:st|nd|rd|th)\s+(?:chapter|unit)\b/,
    /\b(?:what|which).*(?:chapter|unit).*(?:talks?\s+about|contains?|covers?)\b/,
    /\b(?:what|which).*(?:second|first|third|fourth|fifth).*(?:chapter|unit)\b/,
    /\blist.*(?:chapter|unit)s?\b/,
    /\b(?:chapter|unit)s?.*\blist\b/,
    /\ball\s+(?:the\s+)?(?:chapter|unit)s?\b/,
    /\b(?:what|which)\s+(?:are|is)\s+(?:the\s+)?(?:chapter|unit)s?\b/,
  ];
  return patterns.some((pattern) => pattern.test(normalized));
}

function splitSubjectKeywords(subjects: string[]) {
  const keywords = new Set<string>();
  subjects.forEach((subject) => {
    subject
      .toLowerCase()
      .split(/[^a-z0-9]+/g)
      .map((token) => token.trim())
      .filter((token) => token.length >= 4)
      .filter((token) => !STOPWORDS.has(token))
      .forEach((token) => keywords.add(token));
  });
  return Array.from(keywords).slice(0, 8);
}

function mapResourceKindToCitationSourceType(
  resourceKind: "syllabus" | "study_material" | "question_bank",
): CitationSourceType {
  if (resourceKind === "syllabus") return "syllabus";
  if (resourceKind === "question_bank") return "question_bank";
  return "textbook";
}

function isPlaceholderSourceValue(value: string | null | undefined) {
  if (!value) return true;
  const normalized = value.trim().toLowerCase();
  return (
    normalized.length === 0 ||
    normalized === "unknown-source" ||
    normalized === "source-file" ||
    normalized === "untitled source" ||
    normalized === "untitled" ||
    normalized === "n/a"
  );
}

function pickSourceTitle(options: {
  title: string | null | undefined;
  chapter: string | null | undefined;
  topic: string | null | undefined;
  subject: string;
}) {
  if (!isPlaceholderSourceValue(options.title)) return options.title!.trim();
  if (!isPlaceholderSourceValue(options.chapter)) return options.chapter!.trim();
  if (!isPlaceholderSourceValue(options.topic)) return options.topic!.trim();
  return `${options.subject} source`;
}

function pickSourceName(value: string | null | undefined) {
  return isPlaceholderSourceValue(value) ? "" : value!.trim();
}

function dedupeCandidates(rows: KnowledgeCandidateRow[]) {
  const byId = new Map<string, KnowledgeCandidateRow>();
  rows.forEach((row) => {
    if (!byId.has(row.id)) byId.set(row.id, row);
  });
  return Array.from(byId.values());
}

async function runCandidateQuery({
  supabase,
  board,
  grade,
  subjects,
  subjectLike,
  limit = 300,
}: {
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>;
  board?: string;
  grade?: string;
  subjects?: string[];
  subjectLike?: string;
  limit?: number;
}) {
  let query = supabase
    .from("knowledge_chunks")
    .select(
      "id, document_id, board, grade, subject, chapter, topic, content, embedding, knowledge_documents(id, title, source_name, source_type, resource_kind)",
    );

  if (board) query = query.ilike("board", board);
  if (grade) query = query.ilike("grade", grade);
  if (subjects && subjects.length > 0) query = query.in("subject", subjects);
  if (subjectLike) query = query.ilike("subject", `%${subjectLike}%`);
  query = query.limit(limit);

  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as unknown as KnowledgeCandidateRow[];
}

async function fetchCandidateChunks(
  question: string,
  profile: StudentProfile,
  subjectContext?: string | null,
) {
  const supabase = await createSupabaseServerClient();
  const boardFilter = normalizeBoard(profile.board);
  const gradeFilter = normalizeGrade(profile.grade);
  const subjectFilter = normalizeSubjects(subjectContext ? [subjectContext] : [])[0] ?? "";
  const profileSubjects = normalizeSubjects(profile.subjects).slice(0, 8);
  const strictSubjects = subjectFilter ? [subjectFilter] : profileSubjects;
  const fallbackSubjects = strictSubjects.length > 0 ? strictSubjects : profileSubjects;

  // Guardrail: if we have no profile anchors and no subject anchors, fail closed.
  if (!boardFilter && !gradeFilter && fallbackSubjects.length === 0) {
    return [];
  }

  // 0) Fast path: if the user explicitly selected a subject in the UI, try exact subject match first.
  // This avoids wasting time on board+grade queries that will fail when the user's profile
  // (e.g., NEB/Class 12) doesn't match the subject's board/grade (e.g., Engineering/Bachelor).
  if (subjectFilter) {
    const fastRows = await runCandidateQuery({
      supabase,
      subjects: [subjectFilter],
      limit: 300,
    });
    if (fastRows.length > 0) return fastRows;
  }

  // 1) Strict scope: board + grade + explicit subjects.
  if (boardFilter && gradeFilter && strictSubjects.length > 0) {
    const strictRows = await runCandidateQuery({
      supabase,
      board: boardFilter,
      grade: gradeFilter,
      subjects: strictSubjects,
      limit: 300,
    });
    if (strictRows.length > 0) return strictRows;
  }

  const queryKeywords = tokenizeForMatch(question).filter((token) => token.length >= 4).slice(0, 10);
  const subjectKeywords = Array.from(new Set(splitSubjectKeywords(fallbackSubjects).concat(queryKeywords))).slice(
    0,
    12,
  );
  let fallbackRows: KnowledgeCandidateRow[] = [];

  // 2) Relax subject matching while preserving board+grade.
  if (boardFilter && gradeFilter && subjectKeywords.length > 0) {
    for (const keyword of subjectKeywords) {
      const rows = await runCandidateQuery({
        supabase,
        board: boardFilter,
        grade: gradeFilter,
        subjectLike: keyword,
        limit: 160,
      });
      fallbackRows = dedupeCandidates(fallbackRows.concat(rows));
      if (fallbackRows.length >= 120) break;
    }
  }

  // 3) Relax profile constraints but keep EXACT explicit subject matching.
  // This is critical if a user selects a subject (like "Engineering Physics") that belongs to a different board/grade than their profile.
  if (fallbackRows.length === 0 && strictSubjects.length > 0) {
    const strictSubjectRows = await runCandidateQuery({
      supabase,
      subjects: strictSubjects,
      limit: 300,
    });
    if (strictSubjectRows.length > 0) return strictSubjectRows;
  }

  // 4) Keep subject signal (keywords), drop profile constraints to avoid empty retrieval for mis-profiled users.
  if (fallbackRows.length === 0 && subjectKeywords.length > 0) {
    for (const keyword of subjectKeywords) {
      const rows = await runCandidateQuery({
        supabase,
        subjectLike: keyword,
        limit: 180,
      });
      fallbackRows = dedupeCandidates(fallbackRows.concat(rows));
      if (fallbackRows.length >= 180) break;
    }
  }

  // 4) Last resort: board+grade only so we can at least ground with nearby curriculum.
  if (fallbackRows.length === 0 && boardFilter && gradeFilter) {
    fallbackRows = await runCandidateQuery({
      supabase,
      board: boardFilter,
      grade: gradeFilter,
      limit: 240,
    });
  }

  return dedupeCandidates(fallbackRows);
}

export async function retrieveKnowledgeChunks(
  question: string,
  profile: StudentProfile,
  options?: { subjectContext?: string | null },
): Promise<RetrievalResult> {
  const structureLookupIntent = isStructureLookupIntent(question);
  let candidates = await fetchCandidateChunks(question, profile, options?.subjectContext);
  if (structureLookupIntent) {
    const syllabusOnly = candidates.filter(
      (candidate) => (firstKnowledgeDocument(candidate)?.resource_kind ?? "study_material") === "syllabus",
    );
    if (syllabusOnly.length > 0) {
      candidates = syllabusOnly;
    }
  }
  if (candidates.length === 0) {
    return {
      chunks: [] as RetrievedChunk[],
      citations: [] as AssistantCitation[],
      grounded: false,
    };
  }

  const queryEmbedding = await embedText(question);
  const queryTokens = tokenizeForMatch(question);
  const syllabusIntent = isSyllabusIntent(question) || structureLookupIntent;
  const ranked = candidates
    .map((candidate) => ({
      cleanContent: normalizeChunkContent(candidate.content),
      id: candidate.id,
      documentId: candidate.document_id,
      board: candidate.board,
      grade: candidate.grade,
      subject: candidate.subject,
      chapter: candidate.chapter,
      topic: candidate.topic,
      content: candidate.content,
      sourceTitle: pickSourceTitle({
        title: firstKnowledgeDocument(candidate)?.title,
        chapter: candidate.chapter,
        topic: candidate.topic,
        subject: candidate.subject,
      }),
      sourceName: pickSourceName(firstKnowledgeDocument(candidate)?.source_name),
      resourceKind: firstKnowledgeDocument(candidate)?.resource_kind ?? "study_material",
      score: cosineSimilarity(queryEmbedding, candidate.embedding ?? []),
    }))
    .map((candidate) => {
      const lexical = computeLexicalOverlap(queryTokens, candidate.cleanContent);
      const penalty = lowSignalPenalty(candidate.cleanContent);
      const studyMaterialBoost =
        candidate.resourceKind === "study_material"
          ? syllabusIntent
            ? structureLookupIntent
              ? -0.12
              : 0.03
            : 0.04
          : 0;
      const syllabusBoost =
        candidate.resourceKind === "syllabus"
          ? syllabusIntent
            ? structureLookupIntent
              ? 0.34
              : 0.18
            : 0
          : 0;
      const chapterTopicText = `${candidate.chapter || ""} ${candidate.topic || ""}`.toLowerCase();
      const chapterTopicOverlap =
        queryTokens.length === 0
          ? 0
          : queryTokens.filter((token) => chapterTopicText.includes(token)).length / queryTokens.length;
      const combinedScore =
        candidate.score * 0.72 +
        lexical * 0.18 +
        chapterTopicOverlap * 0.10 +
        studyMaterialBoost +
        syllabusBoost -
        penalty;
      return {
        ...candidate,
        content: candidate.cleanContent || candidate.content,
        score: combinedScore,
      };
    })
    .filter((candidate) => candidate.content.length > 20)
    .sort((left, right) => right.score - left.score)
    .slice(0, 12)
    .filter((chunk) => chunk.score > 0.08);

  const deduped: RetrievedChunk[] = [];
  const seen = new Set<string>();
  for (const chunk of ranked) {
    const key = `${chunk.sourceTitle.toLowerCase()}::${chunk.content.slice(0, 200).toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push({
      id: chunk.id,
      documentId: chunk.documentId,
      board: chunk.board,
      grade: chunk.grade,
      subject: chunk.subject,
      chapter: chunk.chapter,
      topic: chunk.topic,
      content: chunk.content,
      sourceTitle: chunk.sourceTitle,
      sourceName: chunk.sourceName,
      resourceKind: chunk.resourceKind,
      score: chunk.score,
    });
    if (deduped.length >= 4) break;
  }

  if (deduped.length === 0) {
    return {
      chunks: [] as RetrievedChunk[],
      citations: [] as AssistantCitation[],
      grounded: false,
    };
  }

  const citations: AssistantCitation[] = [];
  const seenCitationSources = new Set<string>();
  for (const chunk of deduped) {
    const sourceKey =
      chunk.documentId ||
      `${chunk.sourceTitle.toLowerCase()}::${(chunk.chapter || chunk.topic || "").toLowerCase()}`;
    if (seenCitationSources.has(sourceKey)) continue;
    seenCitationSources.add(sourceKey);
    citations.push({
      chunkId: chunk.id,
      documentId: chunk.documentId,
      sourceType: mapResourceKindToCitationSourceType(chunk.resourceKind),
      sourceLabel: [chunk.subject, chunk.chapter || chunk.topic || null].filter(Boolean).join(" · "),
      sourceTitle: chunk.sourceTitle,
      sourceName: chunk.sourceName,
      subject: chunk.subject,
      chapter: chunk.chapter,
      topic: chunk.topic,
      excerpt: buildCitationExcerpt(chunk.content),
    });
    if (citations.length >= 4) break;
  }

  return {
    chunks: deduped,
    citations,
    grounded: true,
  };
}

export function buildGroundingPrompt(chunks: RetrievedChunk[]) {
  if (chunks.length === 0) return "";

  return chunks
    .map(
      (chunk, index) => `
[Source ${index + 1}]
Resource type: ${chunk.resourceKind}
Title: ${chunk.sourceTitle}
Subject: ${chunk.subject}
Chapter: ${chunk.chapter || "Unknown"}
Topic: ${chunk.topic || "Unknown"}
Content:
${buildGroundingExcerpt(chunk.content)}
      `.trim(),
    )
    .join("\n\n");
}
