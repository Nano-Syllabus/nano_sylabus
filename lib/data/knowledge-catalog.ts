import { normalizeBoard, normalizeGrade, normalizeSubjectLabel } from "@/lib/profile-normalization";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export interface KnowledgeCatalogOptions {
  boards: string[];
  gradesByBoard: Record<string, string[]>;
  subjectsByBoardGrade: Record<string, string[]>;
}

export interface DeterministicCatalogChapter {
  documentId: string;
  board: string;
  grade: string;
  subject: string;
  chapter: string;
  title: string;
  sourceName: string;
}

export interface DeterministicCatalogTopic {
  chunkId: string;
  documentId: string;
  board: string;
  grade: string;
  subject: string;
  chapter: string;
  topic: string;
  sourceTitle: string;
  sourceName: string;
  contentPreview: string;
  chunkIndex: number | null;
}

export interface DeterministicQuestionBankEntry {
  chunkId: string;
  documentId: string;
  board: string;
  grade: string;
  subject: string;
  chapter: string | null;
  topic: string | null;
  sourceTitle: string;
  sourceName: string;
  content: string;
  chunkIndex: number | null;
}

type SupabaseCatalogClient = Pick<ReturnType<typeof createSupabaseAdminClient>, "from">;

const CATALOG_CACHE_TTL_MS = 2 * 60 * 1000;

type CacheEntry<T> = {
  expiresAt: number;
  value: T;
};

const catalogCache = new Map<string, CacheEntry<unknown>>();

function sortValues(values: Set<string>) {
  return Array.from(values).sort((left, right) =>
    left.localeCompare(right, undefined, { numeric: true, sensitivity: "base" }),
  );
}

function keyForBoardGrade(board: string, grade: string) {
  return `${board}::${grade}`;
}

function getCatalogClient(client?: SupabaseCatalogClient) {
  return client ?? createSupabaseAdminClient();
}

function readCatalogCache<T>(key: string): T | null {
  const entry = catalogCache.get(key);
  if (!entry) return null;
  if (entry.expiresAt <= Date.now()) {
    catalogCache.delete(key);
    return null;
  }
  return entry.value as T;
}

function writeCatalogCache<T>(key: string, value: T) {
  catalogCache.set(key, {
    expiresAt: Date.now() + CATALOG_CACHE_TTL_MS,
    value,
  });
}

function buildCacheKey(namespace: string, parts: Array<string | null | undefined>) {
  return [namespace, ...parts.map((part) => (part ?? "").trim().toLowerCase())].join("::");
}

function buildPreview(content: string, limit = 180) {
  const normalized = content.replace(/\s+/g, " ").trim();
  if (normalized.length <= limit) return normalized;
  const clipped = normalized.slice(0, limit);
  const lastSpace = clipped.lastIndexOf(" ");
  return `${(lastSpace > 80 ? clipped.slice(0, lastSpace) : clipped).trim()}...`;
}

function extractChapterOrder(label: string) {
  const normalized = label.trim().toLowerCase();
  const match = normalized.match(/\b(?:unit|chapter)\s*(\d{1,2})\b/);
  if (match) return Number(match[1]);

  const leading = normalized.match(/^(\d{1,2})\b/);
  if (leading) return Number(leading[1]);

  return Number.POSITIVE_INFINITY;
}

function sortChapterLabels<T extends { chapter: string }>(rows: T[]) {
  return rows.sort((left, right) => {
    const leftOrder = extractChapterOrder(left.chapter);
    const rightOrder = extractChapterOrder(right.chapter);
    if (leftOrder !== rightOrder) return leftOrder - rightOrder;
    return left.chapter.localeCompare(right.chapter, undefined, {
      numeric: true,
      sensitivity: "base",
    });
  });
}

export async function listKnowledgeCatalogOptions(): Promise<KnowledgeCatalogOptions> {
  const cacheKey = buildCacheKey("catalog_options", []);
  const cached = readCatalogCache<KnowledgeCatalogOptions>(cacheKey);
  if (cached) return cached;

  const supabase = createSupabaseAdminClient();

  const [documentsResult, notebooksResult] = await Promise.all([
    supabase
      .from("knowledge_documents")
      .select("board, grade, subject")
      .eq("processing_status", "ready")
      .gt("chunk_count", 0),
    supabase.from("knowledge_notebooks").select("board, level, subject").neq("title", ""),
  ]);

  if (documentsResult.error) throw documentsResult.error;
  if (notebooksResult.error) throw notebooksResult.error;

  const boards = new Set<string>();
  const gradesByBoard = new Map<string, Set<string>>();
  const subjectsByBoardGrade = new Map<string, Set<string>>();

  const applyRow = (boardValue: string | null, gradeValue: string | null, subjectValue: string | null) => {
    const board = normalizeBoard(boardValue ?? "");
    const grade = normalizeGrade(gradeValue ?? "");
    const subject = normalizeSubjectLabel(subjectValue ?? "");
    if (!board || !grade || !subject) return;

    boards.add(board);

    const grades = gradesByBoard.get(board) ?? new Set<string>();
    grades.add(grade);
    gradesByBoard.set(board, grades);

    const boardGradeKey = keyForBoardGrade(board, grade);
    const subjects = subjectsByBoardGrade.get(boardGradeKey) ?? new Set<string>();
    subjects.add(subject);
    subjectsByBoardGrade.set(boardGradeKey, subjects);
  };

  const readyDocuments = documentsResult.data ?? [];
  if (readyDocuments.length > 0) {
    readyDocuments.forEach((row) => applyRow(row.board, row.grade, row.subject));
  } else {
    (notebooksResult.data ?? []).forEach((row) => applyRow(row.board, row.level, row.subject));
  }

  const result = {
    boards: sortValues(boards),
    gradesByBoard: Object.fromEntries(
      Array.from(gradesByBoard.entries()).map(([board, grades]) => [board, sortValues(grades)]),
    ),
    subjectsByBoardGrade: Object.fromEntries(
      Array.from(subjectsByBoardGrade.entries()).map(([boardGrade, subjects]) => [boardGrade, sortValues(subjects)]),
    ),
  };

  writeCatalogCache(cacheKey, result);
  return result;
}

export async function listDeterministicSubjects(
  filters: {
    board?: string | null;
    grade?: string | null;
  } = {},
  client?: SupabaseCatalogClient,
) {
  const cacheKey =
    client == null ? buildCacheKey("subjects", [filters.board ?? "", filters.grade ?? ""]) : null;
  if (cacheKey) {
    const cached = readCatalogCache<string[]>(cacheKey);
    if (cached) return [...cached];
  }

  const supabase = getCatalogClient(client);
  const boardFilter = normalizeBoard(filters.board ?? "");
  const gradeFilter = normalizeGrade(filters.grade ?? "");

  const [documentsResult, notebooksResult] = await Promise.all([
    supabase
      .from("knowledge_documents")
      .select("board, grade, subject, processing_status, chunk_count"),
    supabase.from("knowledge_notebooks").select("board, level, subject"),
  ]);

  if (documentsResult.error) throw documentsResult.error;
  if (notebooksResult.error) throw notebooksResult.error;

  const readySubjects = new Set<string>();
  for (const row of documentsResult.data ?? []) {
    const board = normalizeBoard((row.board as string | null) ?? "");
    const grade = normalizeGrade((row.grade as string | null) ?? "");
    const subject = normalizeSubjectLabel((row.subject as string | null) ?? "");
    if (!subject) continue;
    if (boardFilter && board !== boardFilter) continue;
    if (gradeFilter && grade !== gradeFilter) continue;
    if ((row.processing_status as string | null) !== "ready") continue;
    if (Number(row.chunk_count ?? 0) <= 0) continue;
    readySubjects.add(subject);
  }

  if (readySubjects.size > 0) {
    const result = sortValues(readySubjects);
    if (cacheKey) writeCatalogCache(cacheKey, result);
    return result;
  }

  const fallbackSubjects = new Set<string>();
  for (const row of notebooksResult.data ?? []) {
    const board = normalizeBoard((row.board as string | null) ?? "");
    const grade = normalizeGrade((row.level as string | null) ?? "");
    const subject = normalizeSubjectLabel((row.subject as string | null) ?? "");
    if (!subject) continue;
    if (boardFilter && board !== boardFilter) continue;
    if (gradeFilter && grade !== gradeFilter) continue;
    fallbackSubjects.add(subject);
  }

  const result = sortValues(fallbackSubjects);
  if (cacheKey) writeCatalogCache(cacheKey, result);
  return result;
}

export async function listDeterministicChapters(
  filters: {
    subject: string;
    board?: string | null;
    grade?: string | null;
  },
  client?: SupabaseCatalogClient,
) {
  const cacheKey =
    client == null
      ? buildCacheKey("chapters", [filters.subject, filters.board ?? "", filters.grade ?? ""])
      : null;
  if (cacheKey) {
    const cached = readCatalogCache<DeterministicCatalogChapter[]>(cacheKey);
    if (cached) return [...cached];
  }

  const supabase = getCatalogClient(client);
  const subjectFilter = normalizeSubjectLabel(filters.subject);
  const boardFilter = normalizeBoard(filters.board ?? "");
  const gradeFilter = normalizeGrade(filters.grade ?? "");
  if (!subjectFilter) return [];

  const { data: docData, error: docError } = await supabase
    .from("knowledge_documents")
    .select("id, board, grade, subject, title, source_name, processing_status, chunk_count")
    .ilike("subject", `%${subjectFilter}%`);

  if (docError) throw docError;

  const validDocs = new Map<string, { board: string; grade: string; subject: string; title: string; sourceName: string }>();
  for (const row of docData ?? []) {
    const board = normalizeBoard((row.board as string | null) ?? "");
    const grade = normalizeGrade((row.grade as string | null) ?? "");
    const subject = normalizeSubjectLabel((row.subject as string | null) ?? "");
    if (!subject) continue;
    if (subject !== subjectFilter) continue;
    if ((row.processing_status as string | null) !== "ready") continue;
    if (Number(row.chunk_count ?? 0) <= 0) continue;
    
    validDocs.set(row.id as string, {
      board,
      grade,
      subject,
      title: ((row.title as string | null) ?? "").trim(),
      sourceName: ((row.source_name as string | null) ?? "").trim(),
    });
  }

  if (validDocs.size === 0) return [];

  const allChunks: { document_id: string; chapter: string }[] = [];
  let start = 0;
  const pageSize = 1000;
  while (true) {
    const { data: chunkData, error: chunkError } = await supabase
      .from("knowledge_chunks")
      .select("document_id, chapter")
      .ilike("subject", `%${subjectFilter}%`)
      .range(start, start + pageSize - 1);
      
    if (chunkError) throw chunkError;
    if (!chunkData || chunkData.length === 0) break;
    
    allChunks.push(...(chunkData as any[]));
    if (chunkData.length < pageSize) break;
    start += pageSize;
  }

  const collectChapters = (useBoardGradeFilters: boolean) => {
    const chaptersMap = new Map<string, DeterministicCatalogChapter>();
    for (const chunk of allChunks) {
      const doc = validDocs.get(chunk.document_id);
      if (!doc) continue;
      
      const chapter = (chunk.chapter || "").trim();
      if (!chapter) continue;
      
      if (useBoardGradeFilters && boardFilter && doc.board !== boardFilter) continue;
      if (useBoardGradeFilters && gradeFilter && doc.grade !== gradeFilter) continue;
      if (chaptersMap.has(chapter.toLowerCase())) continue;

      chaptersMap.set(chapter.toLowerCase(), {
        documentId: chunk.document_id,
        board: doc.board,
        grade: doc.grade,
        subject: doc.subject,
        chapter,
        title: doc.title || chapter,
        sourceName: doc.sourceName,
      });
    }

    return Array.from(chaptersMap.values());
  };

  const strictChapters = collectChapters(true);
  const chapters = strictChapters.length > 0 ? strictChapters : collectChapters(false);

  const result = sortChapterLabels(chapters);
  if (cacheKey) writeCatalogCache(cacheKey, result);
  return result;
}

export async function listDeterministicTopics(
  filters: {
    subject: string;
    chapter: string;
    board?: string | null;
    grade?: string | null;
  },
  client?: SupabaseCatalogClient,
) {
  const cacheKey =
    client == null
      ? buildCacheKey("topics", [filters.subject, filters.chapter, filters.board ?? "", filters.grade ?? ""])
      : null;
  if (cacheKey) {
    const cached = readCatalogCache<DeterministicCatalogTopic[]>(cacheKey);
    if (cached) return [...cached];
  }

  const supabase = getCatalogClient(client);
  const subjectFilter = normalizeSubjectLabel(filters.subject);
  const chapterFilter = filters.chapter.trim().toLowerCase();
  const boardFilter = normalizeBoard(filters.board ?? "");
  const gradeFilter = normalizeGrade(filters.grade ?? "");
  if (!subjectFilter || !chapterFilter) return [];

  let query = supabase
    .from("knowledge_chunks")
    .select(
      "id, document_id, board, grade, subject, chapter, topic, content, chunk_index, knowledge_documents(title, source_name)",
    );

  if (filters.subject) {
    query = query.ilike("subject", `%${filters.subject.trim()}%`);
  }
  if (filters.chapter) {
    query = query.ilike("chapter", `%${filters.chapter.trim()}%`);
  }

  const { data, error } = await query;

  if (error) throw error;

  const collectTopics = (useBoardGradeFilters: boolean) => {
    const topicsMap = new Map<string, DeterministicCatalogTopic>();
    for (const row of data ?? []) {
      const board = normalizeBoard((row.board as string | null) ?? "");
      const grade = normalizeGrade((row.grade as string | null) ?? "");
      const subject = normalizeSubjectLabel((row.subject as string | null) ?? "");
      const chapter = ((row.chapter as string | null) ?? "").trim();
      const topic = ((row.topic as string | null) ?? "").trim();
      if (!chapter || !topic || !subject) continue;
      if (subject !== subjectFilter) continue;
      if (chapter.toLowerCase() !== chapterFilter) continue;
      if (useBoardGradeFilters && boardFilter && board !== boardFilter) continue;
      if (useBoardGradeFilters && gradeFilter && grade !== gradeFilter) continue;

      const key = topic.toLowerCase();
      if (topicsMap.has(key)) continue;
      const linkedDocument = Array.isArray(row.knowledge_documents) ? row.knowledge_documents[0] : row.knowledge_documents;

      topicsMap.set(key, {
        chunkId: row.id as string,
        documentId: row.document_id as string,
        board,
        grade,
        subject,
        chapter,
        topic,
        sourceTitle: ((linkedDocument?.title as string | null) ?? chapter).trim(),
        sourceName: ((linkedDocument?.source_name as string | null) ?? "").trim(),
        contentPreview: buildPreview((row.content as string | null) ?? ""),
        chunkIndex: typeof row.chunk_index === "number" ? row.chunk_index : null,
      });
    }

    return Array.from(topicsMap.values());
  };

  const strictTopics = collectTopics(true);
  const topics = strictTopics.length > 0 ? strictTopics : collectTopics(false);

  const result = topics.sort((left, right) => {
    const leftOrder = left.chunkIndex ?? Number.POSITIVE_INFINITY;
    const rightOrder = right.chunkIndex ?? Number.POSITIVE_INFINITY;
    if (leftOrder !== rightOrder) return leftOrder - rightOrder;
    return left.topic.localeCompare(right.topic, undefined, {
      numeric: true,
      sensitivity: "base",
    });
  });
  if (cacheKey) writeCatalogCache(cacheKey, result);
  return result;
}

export async function listDeterministicQuestionBankEntries(
  filters: {
    subject: string;
    board?: string | null;
    grade?: string | null;
    chapter?: string | null;
  },
  client?: SupabaseCatalogClient,
) {
  const cacheKey =
    client == null
      ? buildCacheKey("question_bank", [
          filters.subject,
          filters.chapter ?? "",
          filters.board ?? "",
          filters.grade ?? "",
        ])
      : null;
  if (cacheKey) {
    const cached = readCatalogCache<DeterministicQuestionBankEntry[]>(cacheKey);
    if (cached) return [...cached];
  }

  const supabase = getCatalogClient(client);
  const subjectFilter = normalizeSubjectLabel(filters.subject);
  const chapterFilter = (filters.chapter ?? "").trim().toLowerCase();
  const boardFilter = normalizeBoard(filters.board ?? "");
  const gradeFilter = normalizeGrade(filters.grade ?? "");
  if (!subjectFilter) return [];

  const { data, error } = await supabase
    .from("knowledge_chunks")
    .select(
      "id, document_id, board, grade, subject, chapter, topic, content, chunk_index, knowledge_documents(title, source_name, resource_kind, processing_status, chunk_count)",
    );

  if (error) throw error;

  const entries: DeterministicQuestionBankEntry[] = [];
  for (const row of data ?? []) {
    const board = normalizeBoard((row.board as string | null) ?? "");
    const grade = normalizeGrade((row.grade as string | null) ?? "");
    const subject = normalizeSubjectLabel((row.subject as string | null) ?? "");
    const chapter = ((row.chapter as string | null) ?? "").trim() || null;
    const topic = ((row.topic as string | null) ?? "").trim() || null;
    if (!subject || subject !== subjectFilter) continue;
    if (boardFilter && board !== boardFilter) continue;
    if (gradeFilter && grade !== gradeFilter) continue;
    if (chapterFilter && chapter?.toLowerCase() !== chapterFilter) continue;

    const linkedDocument = Array.isArray(row.knowledge_documents) ? row.knowledge_documents[0] : row.knowledge_documents;
    if (!linkedDocument) continue;
    if ((linkedDocument.resource_kind as string | null) !== "question_bank") continue;
    if ((linkedDocument.processing_status as string | null) !== "ready") continue;
    if (Number(linkedDocument.chunk_count ?? 0) <= 0) continue;

    entries.push({
      chunkId: row.id as string,
      documentId: row.document_id as string,
      board,
      grade,
      subject,
      chapter,
      topic,
      sourceTitle: ((linkedDocument.title as string | null) ?? chapter ?? subject).trim(),
      sourceName: ((linkedDocument.source_name as string | null) ?? "").trim(),
      content: ((row.content as string | null) ?? "").trim(),
      chunkIndex: typeof row.chunk_index === "number" ? row.chunk_index : null,
    });
  }

  const result = entries.sort((left, right) => {
    const leftChapter = left.chapter ?? "";
    const rightChapter = right.chapter ?? "";
    const chapterOrder = leftChapter.localeCompare(rightChapter, undefined, {
      numeric: true,
      sensitivity: "base",
    });
    if (chapterOrder !== 0) return chapterOrder;
    const leftIndex = left.chunkIndex ?? Number.POSITIVE_INFINITY;
    const rightIndex = right.chunkIndex ?? Number.POSITIVE_INFINITY;
    if (leftIndex !== rightIndex) return leftIndex - rightIndex;
    return left.sourceTitle.localeCompare(right.sourceTitle, undefined, {
      numeric: true,
      sensitivity: "base",
    });
  });
  if (cacheKey) writeCatalogCache(cacheKey, result);
  return result;
}
