import { createSupabaseServerClient } from "@/lib/supabase/server";
import { normalizeBoard, normalizeGrade, normalizeSubjects } from "@/lib/profile-normalization";
import type { AssistantCitation, StudentProfile } from "@/lib/types";
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
  score: number;
}

export interface RetrievalResult {
  chunks: RetrievedChunk[];
  citations: AssistantCitation[];
  grounded: boolean;
}

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

async function fetchCandidateChunks(profile: StudentProfile, subjectContext?: string | null) {
  const supabase = await createSupabaseServerClient();
  const boardFilter = normalizeBoard(profile.board);
  const gradeFilter = normalizeGrade(profile.grade);
  const subjectFilter = normalizeSubjects(subjectContext ? [subjectContext] : [])[0] ?? "";
  const profileSubjects = normalizeSubjects(profile.subjects).slice(0, 8);

  // Strict retrieval contract: board + grade + subject must all be present.
  if (!boardFilter || !gradeFilter) {
    return [];
  }

  const strictSubjects = subjectFilter ? [subjectFilter] : profileSubjects;
  if (strictSubjects.length === 0) {
    return [];
  }

  let query = supabase
    .from("knowledge_chunks")
    .select(
      "id, document_id, board, grade, subject, chapter, topic, content, embedding, knowledge_documents(id, title, source_name, source_type)",
    )
    .eq("board", boardFilter)
    .eq("grade", gradeFilter)
    .in("subject", strictSubjects)
    .limit(150);

  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as unknown as KnowledgeCandidateRow[];
}

export async function retrieveKnowledgeChunks(
  question: string,
  profile: StudentProfile,
  options?: { subjectContext?: string | null },
): Promise<RetrievalResult> {
  const candidates = await fetchCandidateChunks(profile, options?.subjectContext);
  if (candidates.length === 0) {
    return {
      chunks: [] as RetrievedChunk[],
      citations: [] as AssistantCitation[],
      grounded: false,
    };
  }

  const queryEmbedding = await embedText(question);
  const ranked = candidates
    .map((candidate) => ({
      id: candidate.id,
      documentId: candidate.document_id,
      board: candidate.board,
      grade: candidate.grade,
      subject: candidate.subject,
      chapter: candidate.chapter,
      topic: candidate.topic,
      content: candidate.content,
      sourceTitle: firstKnowledgeDocument(candidate)?.title ?? "Untitled source",
      sourceName: firstKnowledgeDocument(candidate)?.source_name ?? "unknown-source",
      score: cosineSimilarity(queryEmbedding, candidate.embedding ?? []),
    }))
    .sort((left, right) => right.score - left.score)
    .slice(0, 4)
    .filter((chunk) => chunk.score > 0.15);

  if (ranked.length === 0) {
    return {
      chunks: [] as RetrievedChunk[],
      citations: [] as AssistantCitation[],
      grounded: false,
    };
  }

  const citations = ranked.map((chunk) => ({
    chunkId: chunk.id,
    documentId: chunk.documentId,
    sourceLabel: [chunk.subject, chunk.chapter || chunk.topic || null].filter(Boolean).join(" · "),
    sourceTitle: chunk.sourceTitle,
    sourceName: chunk.sourceName,
    subject: chunk.subject,
    chapter: chunk.chapter,
    topic: chunk.topic,
    excerpt: buildCitationExcerpt(chunk.content),
  }));

  return {
    chunks: ranked,
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
Title: ${chunk.sourceTitle}
Subject: ${chunk.subject}
Chapter: ${chunk.chapter || "Unknown"}
Topic: ${chunk.topic || "Unknown"}
Content:
${chunk.content}
      `.trim(),
    )
    .join("\n\n");
}
