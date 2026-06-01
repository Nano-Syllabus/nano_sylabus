import { createClient } from "@supabase/supabase-js";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { generateText } from "ai";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_GENERATIVE_AI_API_KEY;

if (!supabaseUrl || !serviceRoleKey || !apiKey) {
  console.error("Missing env vars");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false },
});

const google = createGoogleGenerativeAI({ apiKey });
const testQuestion = "explain chapter two on our engineering physics";

async function main() {
  console.log("1. Generating embedding for question...");
  const modelPath = "models/gemini-embedding-001";
  const resp = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/${modelPath}:embedContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: modelPath,
        content: { parts: [{ text: testQuestion }] },
      }),
    }
  );
  const payload = await resp.json();
  const queryEmbedding = payload.embedding?.values ?? [];

  if (!queryEmbedding.length) {
    console.error("Failed to generate query embedding.");
    return;
  }

  console.log("2. Fetching Candidate Chunks from Supabase (Engineering Physics)...");
  // We simulate runCandidateQuery for Engineering Physics
  const { data: chunks, error } = await supabase
    .from("knowledge_chunks")
    .select("id, board, grade, subject, chapter, topic, content, embedding, knowledge_documents(id, title, source_name, resource_kind)")
    .eq("board", "Engineering")
    .eq("grade", "Bachelor")
    .eq("subject", "Engineering Physics")
    .limit(100);

  if (error) {
    console.error("Supabase query failed:", error.message);
    return;
  }

  console.log(`Retrieved ${chunks.length} candidate chunks for the subject.`);

  // Calculate cosine similarity
  const ranked = chunks.map(chunk => {
    let dot = 0, magA = 0, magB = 0;
    const stored = chunk.embedding || [];
    for (let i = 0; i < Math.min(queryEmbedding.length, stored.length); i++) {
      dot += queryEmbedding[i] * stored[i];
      magA += queryEmbedding[i] ** 2;
      magB += stored[i] ** 2;
    }
    const score = dot / (Math.sqrt(magA) * Math.sqrt(magB));
    return { ...chunk, score };
  })
  .filter(c => c.score > 0.08)
  .sort((a, b) => b.score - a.score)
  .slice(0, 5); // Take top 5

  console.log("\\n=== TOP RETRIEVED TEXTBOOK CHUNKS ===");
  ranked.forEach((r, i) => {
    const doc = Array.isArray(r.knowledge_documents) ? r.knowledge_documents[0] : r.knowledge_documents;
    console.log(`[Chunk ${i+1}] Score: ${r.score.toFixed(4)} | Title: ${doc?.title} | Chapter: ${r.chapter}`);
    console.log(`Preview: "${r.content.substring(0, 100).replace(/\\s+/g, " ")}..."\\n`);
  });

  if (ranked.length === 0) {
    console.log("No matching chunks found above threshold. RAG failed.");
    return;
  }

  const groundingPrompt = ranked.map((chunk, i) => {
    const doc = Array.isArray(chunk.knowledge_documents) ? chunk.knowledge_documents[0] : chunk.knowledge_documents;
    return `
[Source ${i + 1}]
Resource type: ${doc?.resource_kind}
Title: ${doc?.title}
Chapter: ${chunk.chapter || "Unknown"}
Content:
${chunk.content.substring(0, 1000)}
    `.trim();
  }).join("\\n\\n");

  const systemPrompt = `
You are Nano Syllabus, an AI study companion for Nepali students.
Respond in clear English. Sound like a strong engineering tutor.

- If textbook/study-material grounding is provided, you MUST use it as your primary source of truth.
- Base your entire answer on the provided syllabus and textbook context. Do not include external knowledge unless absolutely necessary to explain a concept from the textbook.

Grounding context:
${groundingPrompt}
  `.trim();

  console.log("3. Generating final AI answer (simulating streamText)...\\n");
  const start = Date.now();
  const { text } = await generateText({
    model: google("gemini-2.5-flash"),
    system: systemPrompt,
    prompt: testQuestion,
    maxTokens: 1500,
    providerOptions: {
      google: {
        thinkingConfig: { thinkingBudget: 256 },
      },
    },
  });

  console.log("=== FINAL ANSWER ===");
  console.log(text);
  console.log("====================");
  console.log(`Generated in ${((Date.now() - start)/1000).toFixed(2)}s`);
}

main().catch(console.error);
