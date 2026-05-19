import { embedTexts } from "@/lib/ai/embeddings";
import { chunkDocumentContent } from "@/lib/ai/chunking";
import { createKnowledgeSourceSignedUrl, removeKnowledgeSourceFile } from "@/lib/knowledge-storage";
import { normalizeBoard, normalizeGrade, normalizeSubjectLabel } from "@/lib/profile-normalization";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type {
  AdminKnowledgeDocumentDetail,
  AdminKnowledgeDocumentSummary,
  AdminKnowledgeNotebookDetail,
  AdminKnowledgeNotebookSummary,
  KnowledgeChunk,
  KnowledgeDocumentType,
  KnowledgeProcessingStatus,
  KnowledgeResourceKind,
} from "@/lib/types";

interface KnowledgeNotebookRow {
  id: string;
  title: string;
  board: string;
  level: string;
  faculty: string;
  subject: string;
  curriculum: string;
  description: string;
  created_at: string;
  updated_at: string;
}

interface KnowledgeDocumentRow {
  id: string;
  notebook_id: string | null;
  board: string;
  grade: string;
  faculty: string;
  curriculum: string;
  subject: string;
  chapter: string | null;
  resource_kind: KnowledgeResourceKind;
  resource_subtype: KnowledgeDocumentType;
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
  notebook_title?: string | null;
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

export interface AdminKnowledgeNotebookInput {
  title: string;
  board: string;
  level: string;
  faculty: string;
  subject: string;
  curriculum: string;
  description: string;
}

export interface AdminKnowledgeDocumentInput {
  notebookId: string;
  board: string;
  grade: string;
  faculty: string;
  curriculum: string;
  subject: string;
  chapter: string | null;
  resourceKind: KnowledgeResourceKind;
  resourceSubtype: KnowledgeDocumentType;
  title: string;
  sourceName: string;
  sourceType: string;
  storageBucket?: string | null;
  storagePath?: string | null;
  sourceMimeType?: string | null;
  sourceSizeBytes?: number | null;
  rawContent: string;
}

function toKnowledgeNotebook(
  row: KnowledgeNotebookRow,
  counts?: { resourceCount?: number; readyChunkCount?: number },
): AdminKnowledgeNotebookSummary {
  return {
    id: row.id,
    title: row.title,
    board: normalizeBoard(row.board),
    level: normalizeGrade(row.level),
    faculty: row.faculty.trim(),
    subject: normalizeSubjectLabel(row.subject),
    curriculum: row.curriculum.trim(),
    description: row.description ?? "",
    resourceCount: counts?.resourceCount ?? 0,
    readyChunkCount: counts?.readyChunkCount ?? 0,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toKnowledgeDocument(row: KnowledgeDocumentRow): AdminKnowledgeDocumentSummary {
  return {
    id: row.id,
    notebookId: row.notebook_id,
    notebookTitle: row.notebook_title ?? null,
    board: normalizeBoard(row.board),
    grade: normalizeGrade(row.grade),
    faculty: row.faculty.trim(),
    curriculum: row.curriculum.trim(),
    subject: normalizeSubjectLabel(row.subject),
    chapter: row.chapter,
    resourceKind: row.resource_kind,
    resourceSubtype: row.resource_subtype ?? row.document_type,
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

async function getNotebookCounts(notebookIds: string[]) {
  if (!notebookIds.length) return new Map<string, { resourceCount: number; readyChunkCount: number }>();

  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("knowledge_documents")
    .select("notebook_id, chunk_count, processing_status")
    .in("notebook_id", notebookIds);

  if (error) throw error;

  const counts = new Map<string, { resourceCount: number; readyChunkCount: number }>();
  for (const row of data ?? []) {
    const notebookId = (row.notebook_id as string | null) ?? "";
    if (!notebookId) continue;
    const current = counts.get(notebookId) ?? { resourceCount: 0, readyChunkCount: 0 };
    current.resourceCount += 1;
    if (row.processing_status === "ready") {
      current.readyChunkCount += Number(row.chunk_count ?? 0);
    }
    counts.set(notebookId, current);
  }

  return counts;
}

export async function listAdminKnowledgeNotebooks(filters?: { q?: string }) {
  const supabase = createSupabaseAdminClient();
  let query = supabase
    .from("knowledge_notebooks")
    .select("*")
    .order("updated_at", { ascending: false })
    .limit(200);

  const q = filters?.q?.trim();
  if (q) {
    query = query.or(
      `title.ilike.%${q}%,board.ilike.%${q}%,level.ilike.%${q}%,faculty.ilike.%${q}%,subject.ilike.%${q}%,curriculum.ilike.%${q}%`,
    );
  }

  const { data, error } = await query;
  if (error) throw error;

  const rows = (data ?? []) as KnowledgeNotebookRow[];
  const counts = await getNotebookCounts(rows.map((row) => row.id));
  return rows.map((row) => toKnowledgeNotebook(row, counts.get(row.id)));
}

export async function getAdminKnowledgeNotebook(notebookId: string) {
  const supabase = createSupabaseAdminClient();
  const { data: notebook, error: notebookError } = await supabase
    .from("knowledge_notebooks")
    .select("*")
    .eq("id", notebookId)
    .maybeSingle();

  if (notebookError) throw notebookError;
  if (!notebook) return null;

  const { data: resources, error: resourceError } = await supabase
    .from("knowledge_documents")
    .select("*")
    .eq("notebook_id", notebookId)
    .order("updated_at", { ascending: false });

  if (resourceError) throw resourceError;

  return {
    ...toKnowledgeNotebook(notebook as KnowledgeNotebookRow),
    resources: ((resources ?? []) as KnowledgeDocumentRow[]).map((resource) =>
      toKnowledgeDocument({
        ...resource,
        notebook_title: (notebook as KnowledgeNotebookRow).title,
      }),
    ),
  } satisfies AdminKnowledgeNotebookDetail;
}

export async function createAdminKnowledgeNotebook(input: AdminKnowledgeNotebookInput) {
  const supabase = createSupabaseAdminClient();
  const payload = {
    title: input.title.trim(),
    board: normalizeBoard(input.board),
    level: normalizeGrade(input.level),
    faculty: input.faculty.trim(),
    subject: normalizeSubjectLabel(input.subject),
    curriculum: input.curriculum.trim(),
    description: input.description.trim(),
  };

  const { data, error } = await supabase.from("knowledge_notebooks").insert(payload).select("id").single();
  if (error || !data) throw error || new Error("Failed to create notebook.");

  return getAdminKnowledgeNotebook(data.id);
}

export async function updateAdminKnowledgeNotebook(notebookId: string, input: AdminKnowledgeNotebookInput) {
  const supabase = createSupabaseAdminClient();
  const payload = {
    title: input.title.trim(),
    board: normalizeBoard(input.board),
    level: normalizeGrade(input.level),
    faculty: input.faculty.trim(),
    subject: normalizeSubjectLabel(input.subject),
    curriculum: input.curriculum.trim(),
    description: input.description.trim(),
  };

  const { error } = await supabase.from("knowledge_notebooks").update(payload).eq("id", notebookId);
  if (error) throw error;

  const { error: cascadeError } = await supabase
    .from("knowledge_documents")
    .update({
      board: payload.board,
      grade: payload.level,
      faculty: payload.faculty,
      subject: payload.subject,
      curriculum: payload.curriculum,
    })
    .eq("notebook_id", notebookId);

  if (cascadeError) throw cascadeError;

  return getAdminKnowledgeNotebook(notebookId);
}

export async function deleteAdminKnowledgeNotebook(notebookId: string) {
  const supabase = createSupabaseAdminClient();
  const { data: resources, error: resourceError } = await supabase
    .from("knowledge_documents")
    .select("storage_path")
    .eq("notebook_id", notebookId);

  if (resourceError) throw resourceError;

  for (const resource of resources ?? []) {
    await removeKnowledgeSourceFile((resource.storage_path as string | null) ?? null);
  }

  const { error } = await supabase.from("knowledge_notebooks").delete().eq("id", notebookId);
  if (error) throw error;
}

export async function listAdminKnowledgeDocuments(filters?: { q?: string; notebookId?: string }) {
  const supabase = createSupabaseAdminClient();
  let query = supabase
    .from("knowledge_documents")
    .select("*, knowledge_notebooks(title)")
    .order("updated_at", { ascending: false })
    .limit(200);

  const q = filters?.q?.trim();
  if (q) {
    query = query.or(
      `title.ilike.%${q}%,subject.ilike.%${q}%,chapter.ilike.%${q}%,curriculum.ilike.%${q}%,faculty.ilike.%${q}%`,
    );
  }

  if (filters?.notebookId) {
    query = query.eq("notebook_id", filters.notebookId);
  }

  const { data, error } = await query;
  if (error) throw error;

  return ((data ?? []) as Array<KnowledgeDocumentRow & { knowledge_notebooks?: { title: string } | { title: string }[] | null }>).map(
    (row) =>
      toKnowledgeDocument({
        ...row,
        notebook_title: Array.isArray(row.knowledge_notebooks)
          ? row.knowledge_notebooks[0]?.title ?? null
          : row.knowledge_notebooks?.title ?? null,
      }),
  );
}

export async function getAdminKnowledgeDocument(documentId: string) {
  const supabase = createSupabaseAdminClient();
  const { data: document, error: documentError } = await supabase
    .from("knowledge_documents")
    .select("*, knowledge_notebooks(title)")
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

  const notebookTitle = Array.isArray((document as { knowledge_notebooks?: { title: string }[] }).knowledge_notebooks)
    ? (document as { knowledge_notebooks?: { title: string }[] }).knowledge_notebooks?.[0]?.title ?? null
    : ((document as { knowledge_notebooks?: { title: string } | null }).knowledge_notebooks?.title ?? null);

  return {
    ...toKnowledgeDocument({
      ...(document as KnowledgeDocumentRow),
      notebook_title: notebookTitle,
    }),
    chunks: ((chunks ?? []) as KnowledgeChunkRow[]).map(toKnowledgeChunk),
  } satisfies AdminKnowledgeDocumentDetail;
}

export async function createAdminKnowledgeDocument(input: AdminKnowledgeDocumentInput) {
  const supabase = createSupabaseAdminClient();
  const payload = {
    notebook_id: input.notebookId,
    board: normalizeBoard(input.board),
    grade: normalizeGrade(input.grade),
    faculty: input.faculty.trim(),
    curriculum: input.curriculum.trim(),
    subject: normalizeSubjectLabel(input.subject),
    chapter: input.chapter?.trim() || null,
    resource_kind: input.resourceKind,
    resource_subtype: input.resourceSubtype,
    title: input.title.trim(),
    source_name: input.sourceName.trim(),
    source_type: input.sourceType.trim(),
    storage_bucket: input.storageBucket ?? null,
    storage_path: input.storagePath ?? null,
    source_mime_type: input.sourceMimeType ?? null,
    source_size_bytes: input.sourceSizeBytes ?? null,
    document_type: input.resourceSubtype,
    raw_content: input.rawContent.trim(),
    processing_status: "draft" as const,
    processing_error: null,
  };

  const { data, error } = await supabase
    .from("knowledge_documents")
    .insert(payload)
    .select("id")
    .single();

  if (error || !data) throw error || new Error("Failed to create resource.");
  return getAdminKnowledgeDocument(data.id);
}

export async function updateAdminKnowledgeDocument(documentId: string, input: AdminKnowledgeDocumentInput) {
  const supabase = createSupabaseAdminClient();
  const payload = {
    notebook_id: input.notebookId,
    board: normalizeBoard(input.board),
    grade: normalizeGrade(input.grade),
    faculty: input.faculty.trim(),
    curriculum: input.curriculum.trim(),
    subject: normalizeSubjectLabel(input.subject),
    chapter: input.chapter?.trim() || null,
    resource_kind: input.resourceKind,
    resource_subtype: input.resourceSubtype,
    title: input.title.trim(),
    source_name: input.sourceName.trim(),
    source_type: input.sourceType.trim(),
    storage_bucket: input.storageBucket ?? null,
    storage_path: input.storagePath ?? null,
    source_mime_type: input.sourceMimeType ?? null,
    source_size_bytes: input.sourceSizeBytes ?? null,
    document_type: input.resourceSubtype,
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
  if (!document) throw new Error("Resource not found.");

  const typedDocument = document as KnowledgeDocumentRow;
  const rawContent = typedDocument.raw_content.trim();
  if (!rawContent) {
    throw new Error("Add resource content before processing.");
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
      throw new Error("The resource content is too short to chunk.");
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
