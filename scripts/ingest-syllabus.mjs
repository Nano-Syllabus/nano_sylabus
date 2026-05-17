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

async function createEmbedding(input) {
  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_GENERATIVE_AI_API_KEY;
  const model = process.env.GEMINI_EMBEDDING_MODEL || "gemini-embedding-001";
  const modelPath = model.startsWith("models/") ? model : `models/${model}`;

  if (!apiKey) {
    throw new Error("Missing GEMINI_API_KEY for ingestion.");
  }

  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/${modelPath}:embedContent?key=${apiKey}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: modelPath,
      content: {
        parts: [{ text: input }],
      },
    }),
  });

  if (!response.ok) {
    throw new Error(`Embedding request failed: ${await response.text()}`);
  }

  const payload = await response.json();
  return payload.embedding?.values ?? [];
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
  return value.replace(/\r\n/g, "\n").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
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
      })
      .select("id")
      .single();

    if (documentError || !insertedDocument) {
      throw new Error(`Failed to insert knowledge document: ${documentError?.message ?? "unknown error"}`);
    }

    const chunks = chunkText(document.content);
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
    }

    console.log(`Ingested ${document.title} with ${chunks.length} chunks.`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
