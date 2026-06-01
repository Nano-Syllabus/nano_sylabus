import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { createClient } from "@supabase/supabase-js";

function chunkText(content, size = 1400, overlap = 250) {
  const chunks = [];
  let start = 0;
  while (start < content.length) {
    const end = Math.min(content.length, start + size);
    chunks.push(content.slice(start, end).trim());
    if (end >= content.length) break;
    start = Math.max(end - overlap, start + 1);
  }
  return chunks.filter(Boolean);
}

function getChunkConfig() {
  const size = Number.parseInt(process.env.INGEST_CHUNK_SIZE || "1400", 10);
  const overlap = Number.parseInt(process.env.INGEST_CHUNK_OVERLAP || "250", 10);

  const safeSize = Number.isFinite(size) && size > 300 ? size : 1400;
  const safeOverlap =
    Number.isFinite(overlap) && overlap >= 0 && overlap < safeSize
      ? overlap
      : Math.min(250, Math.floor(safeSize / 4));

  return { size: safeSize, overlap: safeOverlap };
}

async function createEmbedding(input) {
  const provider = (process.env.EMBEDDING_PROVIDER || "gemini").trim().toLowerCase();
  const geminiApiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_GENERATIVE_AI_API_KEY;
  const geminiModel = process.env.GEMINI_EMBEDDING_MODEL || "gemini-embedding-001";
  const geminiModelPath = geminiModel.startsWith("models/") ? geminiModel : `models/${geminiModel}`;
  const openrouterApiKey = process.env.OPENROUTER_API_KEY;
  const openrouterModel = process.env.OPENROUTER_EMBEDDING_MODEL || "openai/text-embedding-3-small";
  const openrouterBaseUrl = process.env.OPENROUTER_BASE_URL || "https://openrouter.ai/api/v1";

  if (provider === "openrouter" && !openrouterApiKey) {
    throw new Error("Missing OPENROUTER_API_KEY for ingestion with EMBEDDING_PROVIDER=openrouter.");
  }

  if (provider !== "openrouter" && !geminiApiKey) {
    throw new Error("Missing GEMINI_API_KEY for ingestion.");
  }

  const maxRetries = Number.parseInt(process.env.GEMINI_EMBED_RETRIES || "6", 10);
  const baseDelayMs = Number.parseInt(process.env.GEMINI_EMBED_RETRY_DELAY_MS || "1000", 10);

  for (let attempt = 1; attempt <= maxRetries + 1; attempt += 1) {
    try {
      const response = await fetch(
        provider === "openrouter"
          ? `${openrouterBaseUrl}/embeddings`
          : `https://generativelanguage.googleapis.com/v1beta/${geminiModelPath}:embedContent?key=${geminiApiKey}`,
        provider === "openrouter"
          ? {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${openrouterApiKey}`,
              },
              body: JSON.stringify({
                model: openrouterModel,
                input,
              }),
            }
          : {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                model: geminiModelPath,
                content: {
                  parts: [{ text: input }],
                },
              }),
            },
      );

      if (response.ok) {
        const payload = await response.json();
        return payload.embedding?.values ?? payload.data?.[0]?.embedding ?? [];
      }

      const errorText = await response.text();
      const retryable = [429, 500, 502, 503, 504].includes(response.status);
      const quotaExceeded = errorText.toLowerCase().includes("quota exceeded");

      if ((retryable || quotaExceeded) && attempt <= maxRetries) {
        const delay = baseDelayMs * 2 ** (attempt - 1);
        await new Promise((resolve) => setTimeout(resolve, delay));
        continue;
      }

      throw new Error(`Embedding request failed: ${errorText}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const retryableNetwork =
        message.toLowerCase().includes("fetch failed") ||
        message.toLowerCase().includes("timeout") ||
        message.toLowerCase().includes("connect timeout") ||
        message.toLowerCase().includes("network");

      if (retryableNetwork && attempt <= maxRetries) {
        const delay = baseDelayMs * 2 ** (attempt - 1);
        await new Promise((resolve) => setTimeout(resolve, delay));
        continue;
      }

      throw error;
    }
  }

  throw new Error("Embedding request failed after retries.");
}

function validateDocument(document) {
  const required = ["board", "grade", "subject", "title", "sourceName", "sourceType"];
  for (const key of required) {
    if (!document[key]) {
      throw new Error(`Document is missing required field "${key}".`);
    }
  }

  const hasInlineContent = typeof document.content === "string" && document.content.trim().length > 0;
  const hasContentFile = typeof document.contentFile === "string" && document.contentFile.trim().length > 0;
  if (!hasInlineContent && !hasContentFile) {
    throw new Error('Document must include either non-empty "content" or "contentFile".');
  }
}

function normalizeResourceKind(value) {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (!normalized) return "study_material";
  const allowed = new Set(["syllabus", "study_material", "question_bank"]);
  if (!allowed.has(normalized)) {
    throw new Error(`Invalid resourceKind "${value}". Allowed: syllabus, study_material, question_bank.`);
  }
  return normalized;
}

function normalizeResourceSubtype(value) {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (!normalized) return "textbook";
  const allowed = new Set([
    "micro_syllabus",
    "curriculum",
    "syllabus",
    "learning_outcomes",
    "textbook",
    "notes",
    "solutions",
    "guides",
    "question_bank",
    "past_questions",
    "example_questions",
    "other",
  ]);
  if (!allowed.has(normalized)) {
    throw new Error(`Invalid resourceSubtype "${value}".`);
  }
  return normalized;
}

function parseArgs(argv) {
  const flags = new Set(argv.filter((value) => value.startsWith("--")));
  const inputPath = argv.find((value) => !value.startsWith("--")) ?? null;
  return {
    inputPath,
    validateOnly: flags.has("--validate-only"),
    replaceScope: flags.has("--replace-scope"),
    strictClass11Core: flags.has("--strict-class11-core"),
  };
}

function normalizeContent(value) {
  const markerPatterns = [
    /^--\s*\d+\s*of\s*\d+\s*--$/i,
    /^original pdf page\s+\d+$/i,
    /^full text-only ocr conversion of the uploaded scanned pdf\.?$/i,
    /^ocr is machine-generated and may contain recognition errors.*$/i,
    /^original pdf pages processed:\s*\d+\.?$/i,
  ];

  const cleanedLines = value
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((line) => line.replace(/\t+/g, " ").trim())
    .filter((line) => {
      if (!line) return false;
      return !markerPatterns.some((pattern) => pattern.test(line));
    });

  return cleanedLines.join("\n").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}

function ensureStrictClass11Core(normalizedDocuments) {
  const requiredSubjects = ["English", "Physics", "Chemistry", "Mathematics"];
  const subjectSet = new Set(
    normalizedDocuments
      .filter((doc) => doc.board === "NEB" && doc.grade === "Class 11")
      .map((doc) => doc.subject),
  );
  const missing = requiredSubjects.filter((subject) => !subjectSet.has(subject));
  if (missing.length > 0) {
    throw new Error(
      `Missing required Class 11 core subjects for strict mode: ${missing.join(", ")}.`,
    );
  }
}

async function normalizeDocument(document, inputBaseDir) {
  validateDocument(document);
  const inlineContent = typeof document.content === "string" ? document.content : "";
  const contentFile = typeof document.contentFile === "string" ? document.contentFile.trim() : "";
  let resolvedContent = inlineContent;

  if (!resolvedContent.trim() && contentFile) {
    const contentPath = path.resolve(inputBaseDir, contentFile);
    const rawContent = await fs.readFile(contentPath, "utf8");
    resolvedContent = rawContent;
  }

  const normalizedContent = normalizeContent(resolvedContent);
  if (!normalizedContent) {
    throw new Error(`Resolved content is empty for "${document.title}".`);
  }

  return {
    board: String(document.board).trim(),
    grade: String(document.grade).trim(),
    subject: String(document.subject).trim(),
    chapter: document.chapter ?? null,
    topic: document.topic ?? null,
    title: String(document.title).trim(),
    sourceName: String(document.sourceName).trim(),
    sourceType: String(document.sourceType).trim(),
    resourceKind: normalizeResourceKind(document.resourceKind),
    resourceSubtype: normalizeResourceSubtype(document.resourceSubtype),
    metadata: document.metadata && typeof document.metadata === "object" ? document.metadata : {},
    content: normalizedContent,
  };
}

async function assertContentFilesExist(documents, inputBaseDir) {
  const missingFiles = [];
  for (const document of documents) {
    const hasInlineContent = typeof document.content === "string" && document.content.trim().length > 0;
    const contentFile = typeof document.contentFile === "string" ? document.contentFile.trim() : "";
    if (hasInlineContent || !contentFile) continue;

    const absoluteContentPath = path.resolve(inputBaseDir, contentFile);
    try {
      await fs.access(absoluteContentPath);
    } catch {
      missingFiles.push(absoluteContentPath);
    }
  }

  if (missingFiles.length > 0) {
    throw new Error(
      `Missing content files:\n${missingFiles.map((filePath) => `- ${filePath}`).join("\n")}`,
    );
  }
}

async function main() {
  const { inputPath, validateOnly, replaceScope, strictClass11Core } = parseArgs(process.argv.slice(2));
  if (!inputPath) {
    throw new Error(
      "Usage: npm run ingest:syllabus -- <path-to-documents.json> [--validate-only] [--replace-scope] [--strict-class11-core]",
    );
  }

  const absolutePath = path.resolve(process.cwd(), inputPath);
  const raw = await fs.readFile(absolutePath, "utf8");
  const documents = JSON.parse(raw);

  if (!Array.isArray(documents)) {
    throw new Error("Input JSON must be an array of syllabus documents.");
  }

  const inputBaseDir = path.dirname(absolutePath);
  await assertContentFilesExist(documents, inputBaseDir);
  const normalizedDocuments = [];
  for (const document of documents) {
    normalizedDocuments.push(await normalizeDocument(document, inputBaseDir));
  }

  if (strictClass11Core) {
    ensureStrictClass11Core(normalizedDocuments);
  }

  if (validateOnly) {
    console.log(`Validated ${normalizedDocuments.length} syllabus documents from ${inputPath}.`);
    return;
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.");
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });

  if (replaceScope && normalizedDocuments.length > 0) {
    const scopeFilters = new Map();
    for (const document of normalizedDocuments) {
      const scopeKey = `${document.board}::${document.grade}::${document.subject}`;
      if (!scopeFilters.has(scopeKey)) {
        scopeFilters.set(scopeKey, {
          board: document.board,
          grade: document.grade,
          subject: document.subject,
        });
      }
    }

    for (const scope of scopeFilters.values()) {
      const { error: deleteError } = await supabase
        .from("knowledge_documents")
        .delete()
        .eq("board", scope.board)
        .eq("grade", scope.grade)
        .eq("subject", scope.subject);

      if (deleteError) {
        throw new Error(
          `Failed to clear scope ${scope.board} / ${scope.grade} / ${scope.subject}: ${deleteError.message}`,
        );
      }
      console.log(`Cleared existing scope: ${scope.board} | ${scope.grade} | ${scope.subject}`);
    }
  }

  for (const document of normalizedDocuments) {
    const { data: insertedDocument, error: documentError } = await supabase
      .from("knowledge_documents")
      .insert({
        board: document.board,
        grade: document.grade,
        subject: document.subject,
        chapter: document.chapter ?? null,
        title: document.title,
        source_name: document.sourceName,
        source_type: document.sourceType,
        resource_kind: document.resourceKind,
        resource_subtype: document.resourceSubtype,
        metadata: document.metadata ?? {},
        raw_content: document.content,
        processing_status: "processing",
        chunk_count: 0,
      })
      .select("id")
      .single();

    if (documentError || !insertedDocument) {
      throw new Error(`Failed to insert knowledge document: ${documentError?.message ?? "unknown error"}`);
    }

    const chunkConfig = getChunkConfig();
    const chunks = chunkText(document.content, chunkConfig.size, chunkConfig.overlap);
    const embedDelayMs = Number.parseInt(process.env.GEMINI_EMBED_DELAY_MS || "800", 10);
    for (let index = 0; index < chunks.length; index += 1) {
      const content = chunks[index];
      const embedding = await createEmbedding(content);
      const { error: chunkError } = await supabase.from("knowledge_chunks").insert({
        document_id: insertedDocument.id,
        board: document.board,
        grade: document.grade,
        subject: document.subject,
        chapter: document.chapter ?? null,
        topic: document.topic ?? null,
        content,
        embedding,
        chunk_index: index,
      });

      if (chunkError) {
        throw new Error(`Failed to insert chunk ${index}: ${chunkError.message}`);
      }

      if (embedDelayMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, embedDelayMs));
      }
    }

    const { error: finalizeError } = await supabase
      .from("knowledge_documents")
      .update({
        raw_content: document.content,
        chunk_count: chunks.length,
        processing_status: "ready",
        processing_error: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", insertedDocument.id);

    if (finalizeError) {
      throw new Error(`Failed to finalize knowledge document ${insertedDocument.id}: ${finalizeError.message}`);
    }

    console.log(`Ingested ${document.title} with ${chunks.length} chunks.`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
