import { normalizeBoard, normalizeGrade, normalizeSubjectLabel } from "@/lib/profile-normalization";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { KnowledgeChunkDetail, StudentProfile } from "@/lib/types";

interface KnowledgeChunkDetailRow {
  id: string;
  document_id: string;
  board: string;
  grade: string;
  subject: string;
  chapter: string | null;
  topic: string | null;
  content: string;
  chunk_index: number;
  created_at: string;
}

interface KnowledgeDocumentRow {
  title: string;
  source_name: string;
  source_type: string;
  uploaded_at: string;
}

function toKnowledgeChunkDetail(row: KnowledgeChunkDetailRow, document: KnowledgeDocumentRow | null): KnowledgeChunkDetail {

  return {
    id: row.id,
    documentId: row.document_id,
    board: normalizeBoard(row.board),
    grade: normalizeGrade(row.grade),
    subject: normalizeSubjectLabel(row.subject),
    chapter: row.chapter,
    topic: row.topic,
    content: row.content,
    chunkIndex: row.chunk_index,
    createdAt: row.created_at,
    sourceTitle: document?.title ?? "Untitled source",
    sourceName: document?.source_name ?? "unknown-source",
    sourceType: document?.source_type ?? "unknown",
    uploadedAt: document?.uploaded_at ?? row.created_at,
  };
}

export async function getKnowledgeChunkDetail(chunkId: string, profile: StudentProfile) {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("knowledge_chunks")
    .select("id, document_id, board, grade, subject, chapter, topic, content, chunk_index, created_at")
    .eq("id", chunkId)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;

  const { data: document, error: documentError } = await supabase
    .from("knowledge_documents")
    .select("title, source_name, source_type, uploaded_at")
    .eq("id", data.document_id)
    .maybeSingle();

  if (documentError) throw documentError;

  const detail = toKnowledgeChunkDetail(
    data as unknown as KnowledgeChunkDetailRow,
    (document as KnowledgeDocumentRow | null) ?? null,
  );
  const board = normalizeBoard(profile.board);
  const grade = normalizeGrade(profile.grade);

  if (board && detail.board !== board) return null;
  if (grade && detail.grade !== grade) return null;

  return detail;
}
