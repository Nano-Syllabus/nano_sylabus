import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { createClient } from "@supabase/supabase-js";

function cosineSimilarity(left, right) {
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

function parseEnvFile(raw) {
  const env = {};
  raw.split("\n").forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) return;
    const eq = trimmed.indexOf("=");
    if (eq < 0) return;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim();
    env[key] = value;
  });
  return env;
}

async function loadEnv() {
  const envPath = path.resolve(process.cwd(), ".env.local");
  const raw = await fs.readFile(envPath, "utf8");
  const parsed = parseEnvFile(raw);
  for (const [key, value] of Object.entries(parsed)) {
    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}

async function createEmbedding(input) {
  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_GENERATIVE_AI_API_KEY;
  const model = process.env.GEMINI_EMBEDDING_MODEL || "gemini-embedding-001";
  const modelPath = model.startsWith("models/") ? model : `models/${model}`;

  if (!apiKey) {
    throw new Error("Missing GEMINI_API_KEY for test.");
  }

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/${modelPath}:embedContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: modelPath,
        content: {
          parts: [{ text: input }],
        },
      }),
    },
  );

  if (!response.ok) {
    throw new Error(`Embedding request failed: ${await response.text()}`);
  }

  const payload = await response.json();
  return payload.embedding?.values ?? [];
}

async function main() {
  await loadEnv();

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.");
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });

  const board = "NEB";
  const grade = "Class 11";
  const subject = "English";

  const { data: chunks, error: chunksError } = await supabase
    .from("knowledge_chunks")
    .select("id, content, embedding, subject, chapter, topic, knowledge_documents!inner(title)")
    .eq("board", board)
    .eq("grade", grade)
    .eq("subject", subject)
    .order("chunk_index", { ascending: true });

  if (chunksError) throw chunksError;
  if (!chunks || chunks.length === 0) {
    throw new Error("No chunks found for the document.");
  }

  const questions = [
    {
      id: "Q1",
      text: "Unit 2 Communication ma cover bhayeko main communication skills k-k ho?",
      expectedChapter: "Unit 2 Communication",
    },
    {
      id: "Q2",
      text: "How does the Class 11 English book help improve writing and grammar for students?",
      expectedChapter: null,
    },
    {
      id: "Q3",
      text: "Class 11 English ma k k skill haru sikincha short ma bujhaideu.",
      expectedChapter: null,
    },
    {
      id: "Q4",
      text: "War and Peace unit ma ke-kasto learning context cha?",
      expectedChapter: "Unit 15  War and Peace",
    },
    {
      id: "Q5",
      text: "Travel and Tourism unit ko focus short ma bhana.",
      expectedChapter: "Unit 19 Travel and Tourism",
    },
  ];

  console.log("=== LIVE RAG VALIDATION: CLASS 11 ENGLISH ===");
  console.log(`Scope: ${board} | ${grade} | ${subject}`);
  console.log(`Chunks: ${chunks.length}`);

  let passCount = 0;
  for (const question of questions) {
    const queryEmbedding = await createEmbedding(question.text);
    const ranked = chunks
      .map((chunk) => ({
        id: chunk.id,
        subject: chunk.subject,
        chapter: chunk.chapter,
        topic: chunk.topic,
        sourceTitle: chunk.knowledge_documents?.title ?? "Unknown",
        score: cosineSimilarity(queryEmbedding, chunk.embedding ?? []),
        preview: (chunk.content || "").replace(/\s+/g, " ").slice(0, 170),
      }))
      .sort((left, right) => right.score - left.score)
      .slice(0, 3);

    const top = ranked[0];
    const chapterMatched = question.expectedChapter
      ? ranked.some((candidate) => (candidate.chapter || "").includes(question.expectedChapter))
      : true;
    const passed = Boolean(top && top.score >= 0.15 && chapterMatched);
    if (passed) passCount += 1;

    console.log(`\n${question.id}: ${question.text}`);
    console.log(`Result: ${passed ? "PASS" : "FAIL"} | top score=${top?.score?.toFixed(4) ?? "n/a"}`);
    if (question.expectedChapter) {
      console.log(`Expected chapter match: ${chapterMatched ? "YES" : "NO"} (${question.expectedChapter})`);
    }
    ranked.forEach((candidate, index) => {
      console.log(
        `  #${index + 1} score=${candidate.score.toFixed(4)} | ${candidate.subject} | ${candidate.chapter ?? candidate.topic ?? "n/a"}`,
      );
      console.log(`     source=${candidate.sourceTitle}`);
      console.log(`     ${candidate.preview}`);
    });
  }

  console.log("\n=== SUMMARY ===");
  console.log(`Passed ${passCount}/${questions.length} retrieval checks.`);
  if (passCount !== questions.length) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
