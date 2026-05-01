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
  const required = ["board", "grade", "subject", "title", "sourceName", "sourceType", "content"];
  for (const key of required) {
    if (!document[key]) {
      throw new Error(`Document is missing required field "${key}".`);
    }
  }
}

async function main() {
  const inputPath = process.argv[2];
  if (!inputPath) {
    throw new Error(
      "Usage: npm run ingest:syllabus -- <path-to-documents.json>",
    );
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.");
  }

  const absolutePath = path.resolve(process.cwd(), inputPath);
  const raw = await fs.readFile(absolutePath, "utf8");
  const documents = JSON.parse(raw);

  if (!Array.isArray(documents)) {
    throw new Error("Input JSON must be an array of syllabus documents.");
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });

  for (const document of documents) {
    validateDocument(document);

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
