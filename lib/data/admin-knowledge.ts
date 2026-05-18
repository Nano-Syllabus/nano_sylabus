import { embedTexts } from "@/lib/ai/embeddings";
import { chunkDocumentContent } from "@/lib/ai/chunking";
import { createKnowledgeSourceSignedUrl, removeKnowledgeSourceFile } from "@/lib/knowledge-storage";
import { normalizeBoard, normalizeGrade, normalizeSubjectLabel } from "@/lib/profile-normalization";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type {
  AdminKnowledgeDocumentDetail,
  AdminKnowledgeDocumentSummary,
  KnowledgeChunk,
  KnowledgeDocumentType,
  KnowledgeProcessingStatus,
} from "@/lib/types";

interface KnowledgeDocumentRow {
  id: string;
  board: string;
  grade: string;
  faculty: string;
  curriculum: string;
  subject: string;
  chapter: string | null;
  title: string;
  source_name: string;
  source_type: string;
  storage_bucket: string | null;
  storage_path: string | null;
  source_mime_type: string | null;
  source_size_bytes: number | null;
  document_type: KnowledgeDocumentType;
  raw_content: string;
  chunk_count: number;
  processing_status: KnowledgeProcessingStatus;
  processing_error: string | null;
  uploaded_at: string;
  updated_at: string;
}

interface KnowledgeChunkRow {
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

export interface AdminKnowledgeDocumentInput {
  board: string;
  grade: string;
  faculty: string;
  curriculum: string;
  subject: string;
  chapter: string | null;
  title: string;
  sourceName: string;
  sourceType: string;
  storageBucket?: string | null;
  storagePath?: string | null;
  sourceMimeType?: string | null;
  sourceSizeBytes?: number | null;
  documentType: KnowledgeDocumentType;
  rawContent: string;
}

function toKnowledgeDocument(row: KnowledgeDocumentRow): AdminKnowledgeDocumentSummary {
  return {
    id: row.id,
    board: normalizeBoard(row.board),
    grade: normalizeGrade(row.grade),
    faculty: row.faculty.trim(),
    curriculum: row.curriculum.trim(),
    subject: normalizeSubjectLabel(row.subject),
    chapter: row.chapter,
    title: row.title,
    sourceName: row.source_name,
    sourceType: row.source_type,
    storageBucket: row.storage_bucket,
    storagePath: row.storage_path,
    sourceMimeType: row.source_mime_type,
    sourceSizeBytes: row.source_size_bytes,
    documentType: row.document_type,
    rawContent: row.raw_content,
    chunkCount: row.chunk_count,
    processingStatus: row.processing_status,
    processingError: row.processing_error,
    uploadedAt: row.uploaded_at,
    updatedAt: row.updated_at,
  };
}

function toKnowledgeChunk(row: KnowledgeChunkRow): KnowledgeChunk {
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
  };
}

export async function listAdminKnowledgeDocuments(filters?: { q?: string }) {
  const supabase = createSupabaseAdminClient();
  let query = supabase
    .from("knowledge_documents")
    .select("*")
    .order("updated_at", { ascending: false })
    .limit(200);

  const q = filters?.q?.trim();
  if (q) {
    query = query.or(
      `title.ilike.%${q}%,subject.ilike.%${q}%,chapter.ilike.%${q}%,curriculum.ilike.%${q}%,faculty.ilike.%${q}%`,
    );
  }

  const { data, error } = await query;
  if (error) throw error;
  return ((data ?? []) as KnowledgeDocumentRow[]).map(toKnowledgeDocument);
}

export async function getAdminKnowledgeDocument(documentId: string) {
  const supabase = createSupabaseAdminClient();
  const { data: document, error: documentError } = await supabase
    .from("knowledge_documents")
    .select("*")
    .eq("id", documentId)
    .maybeSingle();

  if (documentError) throw documentError;
  if (!document) return null;

  const { data: chunks, error: chunkError } = await supabase
    .from("knowledge_chunks")
    .select("id, document_id, board, grade, subject, chapter, topic, content, chunk_index, created_at")
    .eq("document_id", documentId)
    .order("chunk_index", { ascending: true });

  if (chunkError) throw chunkError;

  return {
    ...toKnowledgeDocument(document as KnowledgeDocumentRow),
    chunks: ((chunks ?? []) as KnowledgeChunkRow[]).map(toKnowledgeChunk),
  } satisfies AdminKnowledgeDocumentDetail;
}

export async function createAdminKnowledgeDocument(input: AdminKnowledgeDocumentInput) {
  const supabase = createSupabaseAdminClient();
  const payload = {
    board: normalizeBoard(input.board),
    grade: normalizeGrade(input.grade),
    faculty: input.faculty.trim(),
    curriculum: input.curriculum.trim(),
    subject: normalizeSubjectLabel(input.subject),
    chapter: input.chapter?.trim() || null,
    title: input.title.trim(),
    source_name: input.sourceName.trim(),
    source_type: input.sourceType.trim(),
    storage_bucket: input.storageBucket ?? null,
    storage_path: input.storagePath ?? null,
    source_mime_type: input.sourceMimeType ?? null,
    source_size_bytes: input.sourceSizeBytes ?? null,
    document_type: input.documentType,
    raw_content: input.rawContent.trim(),
    processing_status: "draft" as const,
    processing_error: null,
  };

  const { data, error } = await supabase
    .from("knowledge_documents")
    .insert(payload)
    .select("id")
    .single();

  if (error || !data) throw error || new Error("Failed to create document.");
  return getAdminKnowledgeDocument(data.id);
}

export async function updateAdminKnowledgeDocument(
  documentId: string,
  input: AdminKnowledgeDocumentInput,
) {
  const supabase = createSupabaseAdminClient();
  const payload = {
    board: normalizeBoard(input.board),
    grade: normalizeGrade(input.grade),
    faculty: input.faculty.trim(),
    curriculum: input.curriculum.trim(),
    subject: normalizeSubjectLabel(input.subject),
    chapter: input.chapter?.trim() || null,
    title: input.title.trim(),
    source_name: input.sourceName.trim(),
    source_type: input.sourceType.trim(),
    storage_bucket: input.storageBucket ?? null,
    storage_path: input.storagePath ?? null,
    source_mime_type: input.sourceMimeType ?? null,
    source_size_bytes: input.sourceSizeBytes ?? null,
    document_type: input.documentType,
    raw_content: input.rawContent.trim(),
    processing_status: "draft" as const,
    processing_error: null,
  };

  const { error } = await supabase.from("knowledge_documents").update(payload).eq("id", documentId);
  if (error) throw error;

  return getAdminKnowledgeDocument(documentId);
}

export async function deleteAdminKnowledgeDocument(documentId: string) {
  const supabase = createSupabaseAdminClient();
  const { data: document, error: documentError } = await supabase
    .from("knowledge_documents")
    .select("storage_path")
    .eq("id", documentId)
    .maybeSingle();

  if (documentError) throw documentError;
  await removeKnowledgeSourceFile(document?.storage_path ?? null);

  const { error } = await supabase.from("knowledge_documents").delete().eq("id", documentId);
  if (error) throw error;
}

export async function getAdminKnowledgeSourceSignedUrl(documentId: string, options?: { download?: boolean }) {
  const supabase = createSupabaseAdminClient();
  const { data: document, error } = await supabase
    .from("knowledge_documents")
    .select("source_name, storage_bucket, storage_path")
    .eq("id", documentId)
    .maybeSingle();

  if (error) throw error;
  if (!document?.storage_bucket || !document?.storage_path) return null;

  return createKnowledgeSourceSignedUrl({
    storageBucket: document.storage_bucket,
    storagePath: document.storage_path,
    sourceName: document.source_name ?? "source-file",
    download: options?.download ?? false,
  });
}

export async function processAdminKnowledgeDocument(documentId: string) {
  const supabase = createSupabaseAdminClient();
  const { data: document, error: documentError } = await supabase
    .from("knowledge_documents")
    .select("*")
    .eq("id", documentId)
    .maybeSingle();

  if (documentError) throw documentError;
  if (!document) throw new Error("Document not found.");

  const typedDocument = document as KnowledgeDocumentRow;
  const rawContent = typedDocument.raw_content.trim();
  if (!rawContent) {
    throw new Error("Add document content before processing.");
  }

  await supabase
    .from("knowledge_documents")
    .update({
      processing_status: "processing",
      processing_error: null,
    })
    .eq("id", documentId);

  try {
    const chunks = chunkDocumentContent(rawContent);
    if (!chunks.length) {
      throw new Error("The document content is too short to chunk.");
    }

    const embeddings = await embedTexts(chunks.map((chunk) => chunk.content));

    await supabase.from("knowledge_chunks").delete().eq("document_id", documentId);

    const rows = chunks.map((chunk, index) => ({
      document_id: documentId,
      board: typedDocument.board,
      grade: typedDocument.grade,
      subject: typedDocument.subject,
      chapter: typedDocument.chapter,
      topic: typedDocument.title,
      content: chunk.content,
      embedding: embeddings[index] ?? [],
      chunk_index: chunk.chunkIndex,
    }));

    const { error: insertError } = await supabase.from("knowledge_chunks").insert(rows);
    if (insertError) throw insertError;

    await supabase
      .from("knowledge_documents")
      .update({
        chunk_count: rows.length,
        processing_status: "ready",
        processing_error: null,
      })
      .eq("id", documentId);
  } catch (error) {
    await supabase
      .from("knowledge_documents")
      .update({
        processing_status: "failed",
        processing_error: error instanceof Error ? error.message : "Unknown processing failure",
      })
      .eq("id", documentId);

    throw error;
  }

  return getAdminKnowledgeDocument(documentId);
}
