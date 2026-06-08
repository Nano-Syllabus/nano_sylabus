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
  chunk_index?: number | null;
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
  chunkIndex?: number | null;
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

const ORDINAL_WORD_TO_NUMBER: Record<string, number> = {
  first: 1,
  second: 2,
  third: 3,
  fourth: 4,
  fifth: 5,
  sixth: 6,
  seventh: 7,
  eighth: 8,
  ninth: 9,
  tenth: 10,
};

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

function compactLine(text: string) {
  return text.replace(/\s+/g, " ").trim();
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
    /^(?:what\s+is\s+(?:in|inside)\s+)?\bchapter\s*(?:no\.?|number)?\s*\d+$/i,
    /^(?:what\s+is\s+(?:in|inside)\s+)?\bunit\s*\d+$/i,
    /^(?:what\s+is\s+(?:in|inside)\s+)?\b\d+(?:st|nd|rd|th)\s+(?:chapter|unit)$/i,
    /^(?:what\s+is\s+(?:in|inside)\s+)?\b(?:first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth)\s+(?:chapter|unit)$/i,
    /^(?:what\s+is\s+(?:in|inside)\s+)?\bchapter\s+(?:one|two|three|four|five|six|seven|eight|nine|ten)$/i,
    /^(?:what\s+is\s+(?:in|inside)\s+)?\bour\s+(?:first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth)\s+(?:chapter|unit)$/i,
    /^(?:what\s+is\s+(?:in|inside)\s+)?\bour\s+\d+(?:st|nd|rd|th)\s+(?:chapter|unit)$/i,
    /\b(?:what|which).*(?:chapter|unit).*(?:talks?\s+about|contains?|covers?|has)\b/,
    /\b(?:what|which).*(?:chapter|unit).*(?:talks?\s+about|contains?|covers?)\b/,
    /\b(?:what|which).*(?:second|first|third|fourth|fifth).*(?:chapter|unit)\b/,
    /\blist.*(?:chapter|unit)s?\b/,
    /\b(?:chapter|unit)s?.*\blist\b/,
    /\ball\s+(?:the\s+)?(?:chapter|unit)s?\b/,
    /\b(?:what|which)\s+(?:are|is)\s+(?:the\s+)?(?:chapter|unit)s?\b/,
  ];
  return patterns.some((pattern) => pattern.test(normalized));
}

function isFullChapterIntent(question: string) {
  const normalized = question.toLowerCase();
  const patterns = [
    /\bfull\s+(?:chapter|unit)\b/,
    /\bentire\s+(?:chapter|unit)\b/,
    /\bwhole\s+(?:chapter|unit)\b/,
    /\bgive\s+me\s+(?:the\s+)?(?:full|entire|whole)\s+(?:chapter|unit)\b/,
    /\bchapter\s+(?:in\s+detail|end\s+to\s+end)\b/,
    /\bteach\s+me\s+(?:the\s+)?(?:whole|full)\s+(?:chapter|unit)\b/,
  ];
  return patterns.some((pattern) => pattern.test(normalized));
}

function isExamAnswerIntent(question: string) {
  const normalized = question.toLowerCase();
  const patterns = [
    /\bexam\b/,
    /\bimportant questions?\b/,
    /\blikely questions?\b/,
    /\bmodel questions?\b/,
    /\bquestion bank\b/,
    /\bviva\b/,
    /\blong questions?\b/,
    /\bshort questions?\b/,
    /\bboard questions?\b/,
    /\bexpected questions?\b/,
    /\bprobable questions?\b/,
  ];
  return patterns.some((pattern) => pattern.test(normalized));
}

function extractChapterSearchHint(question: string) {
  const normalized = question.toLowerCase();
  const directMatch = normalized.match(/\b(unit|chapter)\s*(?:no\.?|number)?\s*(\d{1,2})\b/);
  if (directMatch) {
    return `Unit ${directMatch[2]}`;
  }

  const ordinalNumeric = normalized.match(/\b(\d{1,2})(?:st|nd|rd|th)\s+(chapter|unit)\b/);
  if (ordinalNumeric) {
    return `Unit ${ordinalNumeric[1]}`;
  }

  const ordinalWord = normalized.match(
    /\b(first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth)\s+(chapter|unit)\b/,
  );
  if (ordinalWord) {
    const mapped = ORDINAL_WORD_TO_NUMBER[ordinalWord[1]];
    if (mapped) return `Unit ${mapped}`;
  }

  return null;
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

function buildChunkDedupeKey(chunk: {
  documentId: string;
  chapter: string | null;
  topic: string | null;
  content: string;
  sourceTitle: string;
}) {
  return [
    chunk.documentId,
    chunk.sourceTitle.toLowerCase(),
    (chunk.chapter || "").toLowerCase(),
    (chunk.topic || "").toLowerCase(),
    chunk.content.slice(0, 180).toLowerCase(),
  ].join("::");
}

function buildCitationGroupKey(chunk: Pick<RetrievedChunk, "documentId" | "chapter" | "topic" | "sourceTitle">) {
  return [
    chunk.documentId,
    chunk.sourceTitle.toLowerCase(),
    (chunk.chapter || "").toLowerCase(),
    (chunk.topic || "").toLowerCase(),
  ].join("::");
}

function buildCitationLabel(chunk: Pick<RetrievedChunk, "subject" | "chapter" | "topic" | "sourceTitle">) {
  const parts = [chunk.subject];
  if (chunk.chapter && chunk.topic && chunk.topic.toLowerCase() !== chunk.chapter.toLowerCase()) {
    parts.push(chunk.chapter, chunk.topic);
  } else if (chunk.chapter) {
    parts.push(chunk.chapter);
  } else if (chunk.topic) {
    parts.push(chunk.topic);
  } else if (chunk.sourceTitle) {
    parts.push(chunk.sourceTitle);
  }
  return parts.filter(Boolean).join(" · ");
}

function buildFormalCitations(chunks: RetrievedChunk[], maxCitations = 4) {
  const grouped = new Map<
    string,
    {
      base: RetrievedChunk;
      excerpts: string[];
      topScore: number;
    }
  >();

  for (const chunk of chunks) {
    const key = buildCitationGroupKey(chunk);
    const excerpt = buildCitationExcerpt(chunk.content, 160);
    const existing = grouped.get(key);
    if (!existing) {
      grouped.set(key, {
        base: chunk,
        excerpts: excerpt ? [excerpt] : [],
        topScore: chunk.score,
      });
      continue;
    }

    if (chunk.score > existing.topScore) {
      existing.base = chunk;
      existing.topScore = chunk.score;
    }

    if (
      excerpt &&
      !existing.excerpts.some((seen) => seen.toLowerCase() === excerpt.toLowerCase()) &&
      existing.excerpts.length < 2
    ) {
      existing.excerpts.push(excerpt);
    }
  }

  return Array.from(grouped.values())
    .sort((left, right) => right.topScore - left.topScore)
    .slice(0, maxCitations)
    .map(({ base, excerpts }) => ({
      chunkId: base.id,
      documentId: base.documentId,
      sourceType: mapResourceKindToCitationSourceType(base.resourceKind),
      sourceLabel: buildCitationLabel(base),
      sourceTitle: base.sourceTitle,
      sourceName: base.sourceName,
      subject: base.subject,
      chapter: base.chapter,
      topic: base.topic,
      excerpt: excerpts.join(" "),
    }));
}

async function runCandidateQuery({
  supabase,
  board,
  grade,
  subjects,
  subjectLike,
  chapterLike,
  contentLike,
  limit = 300,
}: {
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>;
  board?: string;
  grade?: string;
  subjects?: string[];
  subjectLike?: string;
  chapterLike?: string;
  contentLike?: string;
  limit?: number;
}) {
  let query = supabase
    .from("knowledge_chunks")
    .select(
      "id, document_id, board, grade, subject, chapter, topic, content, chunk_index, embedding, knowledge_documents(id, title, source_name, source_type, resource_kind)",
    );

  if (board) query = query.ilike("board", board);
  if (grade) query = query.ilike("grade", grade);
  if (subjects && subjects.length > 0) query = query.in("subject", subjects);
  if (subjectLike) query = query.ilike("subject", `%${subjectLike}%`);
  if (chapterLike) query = query.ilike("chapter", `%${chapterLike}%`);
  if (contentLike) query = query.ilike("content", `%${contentLike}%`);
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
  let explicitSubjectRaw = subjectContext || "";
  let explicitChapterRaw = "";

  if (subjectContext && subjectContext.includes(">")) {
    const parts = subjectContext.split(">").map((p) => p.trim());
    // Format could be "Board > Grade > Subject > Chapter" (length 4)
    // or "Subject > Chapter" (length 2)
    if (parts.length >= 4) {
      explicitSubjectRaw = parts[2];
      explicitChapterRaw = parts[3];
    } else if (parts.length >= 2) {
      explicitSubjectRaw = parts[parts.length - 2];
      explicitChapterRaw = parts[parts.length - 1];
    }
  }

  const subjectFilter = normalizeSubjects(explicitSubjectRaw ? [explicitSubjectRaw] : [])[0] ?? "";
  const profileSubjects = normalizeSubjects(profile.subjects).slice(0, 8);
  const strictSubjects = subjectFilter ? [subjectFilter] : profileSubjects;
  const fallbackSubjects = strictSubjects.length > 0 ? strictSubjects : profileSubjects;
  const chapterHint = extractChapterSearchHint(question) || explicitChapterRaw;
  const queryKeywords = tokenizeForMatch(question).filter((token) => token.length >= 4).slice(0, 10);
  const subjectKeywords = Array.from(new Set(splitSubjectKeywords(fallbackSubjects).concat(queryKeywords))).slice(0, 12);

  // Helper to fetch global keyword chunks
  const fetchGlobalKeywordChunks = async (subjectsToSearch: string[]) => {
    let keywordRows: KnowledgeCandidateRow[] = [];
    if (subjectsToSearch.length === 0) return keywordRows;
    for (const keyword of queryKeywords.slice(0, 3)) {
      const rows = await runCandidateQuery({
        supabase,
        subjects: subjectsToSearch,
        contentLike: keyword,
        limit: 60,
      });
      keywordRows = keywordRows.concat(rows);
    }
    return keywordRows;
  };

  // Guardrail: if we have no profile anchors and no subject anchors, fail closed.
  if (!boardFilter && !gradeFilter && fallbackSubjects.length === 0) {
    return [];
  }

  // 0) Fast path: if the user explicitly selected a subject in the UI, try exact subject match first.
  if (subjectFilter) {
    const globalKeywordChunks = await fetchGlobalKeywordChunks([subjectFilter]);

    // 0a) Try with chapter hint first (soft hint, not hard lock)
    if (chapterHint) {
      const chapterRows = await runCandidateQuery({
        supabase,
        subjects: [subjectFilter],
        chapterLike: chapterHint,
        limit: 300,
      });
      if (chapterRows.length >= 5) {
        return dedupeCandidates([...chapterRows, ...globalKeywordChunks]);
      }
    }

    // 0b) If we have a chapter from the UI context (explicitChapterRaw), try that first
    if (explicitChapterRaw && !chapterHint) {
      const explicitChapterRows = await runCandidateQuery({
        supabase,
        subjects: [subjectFilter],
        chapterLike: explicitChapterRaw,
        limit: 300,
      });
      if (explicitChapterRows.length >= 5) {
        return dedupeCandidates([...explicitChapterRows, ...globalKeywordChunks]);
      }
    }

    // 0c) Fallback: search the ENTIRE subject (all chapters) — use 800 to cover large subjects
    const fastRows = await runCandidateQuery({
      supabase,
      subjects: [subjectFilter],
      limit: 800,
    });
    if (fastRows.length > 0) {
      return dedupeCandidates([...fastRows, ...globalKeywordChunks]);
    }
  }

  // 1) Strict scope: board + grade + explicit subjects.
  if (boardFilter && gradeFilter && strictSubjects.length > 0) {
    const globalKeywordChunks = await fetchGlobalKeywordChunks(strictSubjects);
    const strictRows = await runCandidateQuery({
      supabase,
      board: boardFilter,
      grade: gradeFilter,
      subjects: strictSubjects,
      chapterLike: chapterHint ?? undefined,
      limit: 800,
    });
    if (strictRows.length > 0) {
      return dedupeCandidates([...strictRows, ...globalKeywordChunks]);
    }
  }

  let fallbackRows: KnowledgeCandidateRow[] = [];

  // 2) Relax subject matching while preserving board+grade.
  if (boardFilter && gradeFilter && subjectKeywords.length > 0) {
    for (const keyword of subjectKeywords) {
      const rows = await runCandidateQuery({
        supabase,
        board: boardFilter,
        grade: gradeFilter,
        subjectLike: keyword,
        chapterLike: chapterHint ?? undefined,
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
      chapterLike: chapterHint ?? undefined,
      limit: 800,
    });
    if (strictSubjectRows.length > 0) return strictSubjectRows;
  }

  // 4) Keep subject signal (keywords), drop profile constraints to avoid empty retrieval for mis-profiled users.
  if (fallbackRows.length === 0 && subjectKeywords.length > 0) {
    for (const keyword of subjectKeywords) {
      const rows = await runCandidateQuery({
        supabase,
        subjectLike: keyword,
        chapterLike: chapterHint ?? undefined,
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
      chapterLike: chapterHint ?? undefined,
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
  const fullChapterIntent = isFullChapterIntent(question);
  const examAnswerIntent = isExamAnswerIntent(question);
  let candidates = await fetchCandidateChunks(question, profile, options?.subjectContext);
  if (structureLookupIntent) {
    const syllabusOnly = candidates.filter(
      (candidate) => (firstKnowledgeDocument(candidate)?.resource_kind ?? "study_material") === "syllabus",
    );
    if (syllabusOnly.length > 0) {
      candidates = syllabusOnly;
    }
  }
  if (examAnswerIntent) {
    const questionBankOnly = candidates.filter(
      (candidate) => (firstKnowledgeDocument(candidate)?.resource_kind ?? "study_material") === "question_bank",
    );
    if (questionBankOnly.length > 0) {
      candidates = questionBankOnly;
    }
  }
  if (candidates.length === 0) {
    return {
      chunks: [] as RetrievedChunk[],
      citations: [] as AssistantCitation[],
      grounded: false,
    };
  }

  const queryTokens = tokenizeForMatch(question);
  const syllabusIntent = isSyllabusIntent(question) || structureLookupIntent;
  const chapterHint = extractChapterSearchHint(question);
  const embeddingByCandidateId = new Map(candidates.map((candidate) => [candidate.id, candidate.embedding ?? []]));
  const baseCandidates = candidates
    .map((candidate) => ({
      cleanContent: normalizeChunkContent(candidate.content),
      id: candidate.id,
      documentId: candidate.document_id,
      chunkIndex: candidate.chunk_index ?? null,
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
      vectorScore: 0,
    }))
    .map((candidate) => {
      const lexical = computeLexicalOverlap(queryTokens, candidate.cleanContent);
      const penalty = lowSignalPenalty(candidate.cleanContent);
      const structureText = [
        candidate.subject,
        candidate.sourceTitle,
        candidate.sourceName,
        candidate.chapter || "",
        candidate.topic || "",
      ]
        .join(" ")
        .toLowerCase();
      const structureOverlap =
        queryTokens.length === 0
          ? 0
          : queryTokens.filter((token) => structureText.includes(token)).length / queryTokens.length;
      const titleChapterExactBoost = queryTokens.some((token) =>
        [candidate.sourceTitle, candidate.chapter, candidate.topic].filter(Boolean).some((value) =>
          value!.toLowerCase().includes(token),
        ),
      )
        ? 0.08
        : 0;
      const studyMaterialBoost =
        candidate.resourceKind === "study_material"
          ? syllabusIntent
            ? structureLookupIntent
              ? -0.12
              : 0.03
            : examAnswerIntent
              ? -0.04
              : 0.04
          : 0;
      const syllabusBoost =
        candidate.resourceKind === "syllabus"
          ? syllabusIntent
            ? structureLookupIntent
              ? 0.34
              : 0.18
            : examAnswerIntent
              ? -0.06
              : 0
          : 0;
      const questionBankBoost =
        candidate.resourceKind === "question_bank"
          ? examAnswerIntent
            ? 0.3
            : 0
          : 0;
      const chapterTopicText = `${candidate.chapter || ""} ${candidate.topic || ""}`.toLowerCase();
      const chapterTopicOverlap =
        queryTokens.length === 0
          ? 0
          : queryTokens.filter((token) => chapterTopicText.includes(token)).length / queryTokens.length;
      // If the user explicitly mentioned a unit/chapter (e.g. "unit 3"), strongly boost matching chapters
      // and penalise non-matching chapters so that sources always align with the requested unit.
      let chapterMatchBoost = 0;
      if (chapterHint) {
        const candidateChapter = (candidate.chapter || "").toLowerCase();
        const hintLower = chapterHint.toLowerCase();
        if (candidateChapter.includes(hintLower)) {
          chapterMatchBoost = 0.25; // strong boost for matching chapter
        } else {
          chapterMatchBoost = -0.15; // penalty for non-matching chapter
        }
      }
      const structureScore =
        lexical * 0.35 +
        structureOverlap * 0.35 +
        chapterTopicOverlap * 0.20 +
        titleChapterExactBoost +
        studyMaterialBoost +
        syllabusBoost -
        penalty +
        questionBankBoost +
        chapterMatchBoost;
      return {
        ...candidate,
        content: candidate.cleanContent || candidate.content,
        structureScore,
      };
    });

  const vectorlessOnlyIntent =
    structureLookupIntent || fullChapterIntent || syllabusIntent;
  const queryEmbedding = vectorlessOnlyIntent ? null : await embedText(question);
  const ranked = baseCandidates
    .map((candidate) => {
      const vectorScore = queryEmbedding ? cosineSimilarity(queryEmbedding, embeddingByCandidateId.get(candidate.id) ?? []) : 0;
      const combinedScore = vectorlessOnlyIntent
        ? candidate.structureScore
        : vectorScore * 0.62 + candidate.structureScore * 0.38;
      return {
        ...candidate,
        vectorScore,
        score: combinedScore,
      };
    })
    .filter((candidate) => candidate.content.length > 20)
    .sort((left, right) => {
      if (right.score !== left.score) return right.score - left.score;
      return (left.chunkIndex ?? 0) - (right.chunkIndex ?? 0);
    })
    .slice(0, fullChapterIntent ? 60 : 30)
    .filter((chunk) => chunk.score > (vectorlessOnlyIntent ? 0 : 0.08));

  const reranked = ranked
    .map((chunk, index) => {
      const topBandBonus =
        index < 5 ? 0.04 : index < 12 ? 0.02 : 0;
      const exactTopicBoost =
        queryTokens.length > 0 && chunk.topic
          ? queryTokens.filter((token) => chunk.topic!.toLowerCase().includes(token)).length / queryTokens.length
          : 0;
      const exactChapterBoost =
        queryTokens.length > 0 && chunk.chapter
          ? queryTokens.filter((token) => chunk.chapter!.toLowerCase().includes(token)).length / queryTokens.length
          : 0;
      const titleBoost =
        queryTokens.length > 0
          ? queryTokens.filter((token) => chunk.sourceTitle.toLowerCase().includes(token)).length / queryTokens.length
          : 0;
      const intentResourceBoost =
        syllabusIntent && chunk.resourceKind === "syllabus"
          ? 0.05
          : examAnswerIntent && chunk.resourceKind === "question_bank"
            ? 0.05
            : !syllabusIntent && !examAnswerIntent && chunk.resourceKind === "study_material"
              ? 0.02
              : 0;

      return {
        ...chunk,
        score:
          chunk.score +
          topBandBonus +
          exactTopicBoost * 0.05 +
          exactChapterBoost * 0.05 +
          titleBoost * 0.03 +
          intentResourceBoost,
      };
    })
    .sort((left, right) => {
      if (right.score !== left.score) return right.score - left.score;
      return (left.chunkIndex ?? 0) - (right.chunkIndex ?? 0);
    })
    .slice(0, fullChapterIntent ? 40 : 12);

  const deduped: RetrievedChunk[] = [];
  const seen = new Set<string>();
  const preferredDocumentId = fullChapterIntent ? reranked[0]?.documentId ?? null : null;
  const rankedForSelection = preferredDocumentId
    ? reranked
        .filter((chunk) => chunk.documentId === preferredDocumentId)
        .sort((left, right) => (left.chunkIndex ?? 0) - (right.chunkIndex ?? 0))
    : reranked;
  const perDocumentCounts = new Map<string, number>();
  const perTopicCounts = new Map<string, number>();
  for (const chunk of rankedForSelection) {
    const key = buildChunkDedupeKey(chunk);
    if (seen.has(key)) continue;
    if (!fullChapterIntent) {
      const documentCount = perDocumentCounts.get(chunk.documentId) ?? 0;
      const topicKey = `${chunk.documentId}::${(chunk.topic || chunk.chapter || "").toLowerCase()}`;
      const topicCount = perTopicCounts.get(topicKey) ?? 0;
      if (documentCount >= 2 && topicCount >= 1) continue;
      perDocumentCounts.set(chunk.documentId, documentCount + 1);
      perTopicCounts.set(topicKey, topicCount + 1);
    }
    seen.add(key);
    deduped.push({
      id: chunk.id,
      documentId: chunk.documentId,
      chunkIndex: chunk.chunkIndex,
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
    if (deduped.length >= (fullChapterIntent ? 8 : 5)) break;
  }

  if (fullChapterIntent && deduped.length === 0 && rankedForSelection.length > 0) {
    for (const chunk of rankedForSelection.slice(0, 8)) {
      deduped.push({
        id: chunk.id,
        documentId: chunk.documentId,
        chunkIndex: chunk.chunkIndex,
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
    }
  }

  if (deduped.length === 0 && vectorlessOnlyIntent) {
    const fallbackStructured = (preferredDocumentId
      ? baseCandidates
          .filter((candidate) => candidate.documentId === preferredDocumentId)
          .sort((left, right) => (left.chunkIndex ?? 0) - (right.chunkIndex ?? 0))
      : baseCandidates
          .slice()
          .sort((left, right) => {
            const syllabusDelta =
              Number(right.resourceKind === "syllabus") - Number(left.resourceKind === "syllabus");
            if (syllabusDelta !== 0) return syllabusDelta;
            return (left.chunkIndex ?? 0) - (right.chunkIndex ?? 0);
          }))
      .slice(0, fullChapterIntent ? 8 : 4);

    for (const chunk of fallbackStructured) {
      deduped.push({
        id: chunk.id,
        documentId: chunk.documentId,
        chunkIndex: chunk.chunkIndex,
        board: chunk.board,
        grade: chunk.grade,
        subject: chunk.subject,
        chapter: chunk.chapter,
        topic: chunk.topic,
        content: chunk.content,
        sourceTitle: chunk.sourceTitle,
        sourceName: chunk.sourceName,
        resourceKind: chunk.resourceKind,
        score: chunk.structureScore,
      });
    }
  }

  if (deduped.length === 0) {
    return {
      chunks: [] as RetrievedChunk[],
      citations: [] as AssistantCitation[],
      grounded: false,
    };
  }
  // If the user explicitly mentioned a chapter/unit, prefer only matching chunks for citations.
  // This prevents random off-chapter sources from showing in the UI.
  let citationChunks = deduped;
  if (chapterHint) {
    const hintLower = chapterHint.toLowerCase();
    const matchingChunks = deduped.filter((chunk) =>
      (chunk.chapter || "").toLowerCase().includes(hintLower),
    );
    // Only filter if we actually have matching chunks; otherwise keep all as fallback
    if (matchingChunks.length > 0) {
      citationChunks = matchingChunks;
    }
  }

  const citations = buildFormalCitations(citationChunks, 4);

  return {
    chunks: deduped,
    citations,
    grounded: true,
  };
}

export function buildGroundingPrompt(chunks: RetrievedChunk[]) {
  if (chunks.length === 0) return "";

  const chapterMode = chunks.length > 5;
  const maxSources = chapterMode ? 6 : 4;
  const excerptLimit = chapterMode ? 520 : 360;
  const selected = chunks.slice(0, maxSources);

  return selected
    .map((chunk, index) => {
      const headerParts = [
        `Type: ${chunk.resourceKind}`,
        `Title: ${chunk.sourceTitle}`,
        `Subject: ${chunk.subject}`,
        `Chapter: ${chunk.chapter || "Unknown"}`,
        `Topic: ${chunk.topic || "Unknown"}`,
      ];
      return [
        `[Source ${index + 1}]`,
        compactLine(headerParts.join(" | ")),
        buildGroundingExcerpt(chunk.content, excerptLimit),
      ].join("\n");
    })
    .join("\n\n");
}
