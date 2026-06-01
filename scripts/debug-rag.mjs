import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  console.error("Missing Supabase env vars");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false },
});

async function main() {
  // 1. How many knowledge_documents exist?
  const { data: docs, error: docsError } = await supabase
    .from("knowledge_documents")
    .select("id, board, grade, subject, title, source_name, resource_kind, chunk_count, processing_status");

  if (docsError) {
    console.error("Error querying knowledge_documents:", docsError.message);
    return;
  }

  console.log("=== KNOWLEDGE DOCUMENTS ===");
  console.log("Total documents:", docs.length);
  if (docs.length > 0) {
    docs.forEach((doc) => {
      console.log(
        `  [${doc.processing_status}] ${doc.board} | ${doc.grade} | ${doc.subject} | "${doc.title}" | chunks: ${doc.chunk_count} | kind: ${doc.resource_kind}`
      );
    });
  }

  // 2. How many knowledge_chunks exist?
  const { count: chunkCount, error: chunkCountError } = await supabase
    .from("knowledge_chunks")
    .select("id", { count: "exact", head: true });

  console.log("\n=== KNOWLEDGE CHUNKS ===");
  console.log("Total chunks:", chunkCount ?? "ERROR: " + chunkCountError?.message);

  // 3. Check a few chunks for embedding dimension
  const { data: sampleChunks, error: sampleError } = await supabase
    .from("knowledge_chunks")
    .select("id, board, grade, subject, chapter, topic, embedding, content")
    .limit(3);

  if (sampleError) {
    console.error("Error querying sample chunks:", sampleError.message);
    return;
  }

  console.log("\n=== SAMPLE CHUNKS ===");
  sampleChunks.forEach((chunk, i) => {
    const embLen = Array.isArray(chunk.embedding) ? chunk.embedding.length : "NULL/MISSING";
    const contentPreview = (chunk.content || "").slice(0, 100).replace(/\s+/g, " ");
    console.log(
      `  Chunk ${i + 1}: ${chunk.board} | ${chunk.grade} | ${chunk.subject} | chapter: ${chunk.chapter} | topic: ${chunk.topic}`
    );
    console.log(`    Embedding dimensions: ${embLen}`);
    console.log(`    Content preview: "${contentPreview}..."`);
  });

  // 4. Check unique board/grade/subject combos in chunks
  const { data: allChunks, error: allError } = await supabase
    .from("knowledge_chunks")
    .select("board, grade, subject");

  if (!allError && allChunks) {
    const combos = new Set();
    allChunks.forEach((c) => combos.add(`${c.board} | ${c.grade} | ${c.subject}`));
    console.log("\n=== UNIQUE BOARD/GRADE/SUBJECT COMBOS IN CHUNKS ===");
    combos.forEach((c) => console.log("  " + c));
  }

  // 5. Now test what the student profile looks like - check a recent student_profiles row
  const { data: profiles, error: profileError } = await supabase
    .from("student_profiles")
    .select("user_id, board, grade, subjects, college")
    .limit(3);

  console.log("\n=== STUDENT PROFILES (sample) ===");
  if (profileError) {
    console.error("Error:", profileError.message);
  } else {
    profiles.forEach((p) => {
      console.log(`  user: ${p.user_id} | board: ${p.board} | grade: ${p.grade} | subjects: ${JSON.stringify(p.subjects)} | college: ${p.college}`);
    });
  }

  // 6. Test embedding query match
  console.log("\n=== TESTING EMBEDDING MATCH ===");
  const testQuestion = "what are the chapters in engineering physics";

  // Generate embedding for this question using same provider as runtime
  const provider = (process.env.EMBEDDING_PROVIDER || "gemini").trim().toLowerCase();
  console.log("Embedding provider:", provider);

  let queryEmbedding;
  if (provider === "openrouter") {
    const apiKey = process.env.OPENROUTER_API_KEY;
    const model = process.env.OPENROUTER_EMBEDDING_MODEL || "openai/text-embedding-3-small";
    const baseUrl = process.env.OPENROUTER_BASE_URL || "https://openrouter.ai/api/v1";
    console.log("Embedding model:", model);

    const resp = await fetch(`${baseUrl}/embeddings`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({ model, input: testQuestion }),
    });
    const payload = await resp.json();
    queryEmbedding = payload.data?.[0]?.embedding ?? [];
  } else {
    const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_GENERATIVE_AI_API_KEY;
    const model = process.env.GEMINI_EMBEDDING_MODEL || "gemini-embedding-001";
    const modelPath = model.startsWith("models/") ? model : `models/${model}`;
    console.log("Embedding model:", model);

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
    queryEmbedding = payload.embedding?.values ?? [];
  }

  console.log("Query embedding dimensions:", queryEmbedding.length);

  // Compare dimensions
  if (sampleChunks.length > 0) {
    const storedDim = Array.isArray(sampleChunks[0].embedding) ? sampleChunks[0].embedding.length : 0;
    console.log("Stored chunk embedding dimensions:", storedDim);

    if (queryEmbedding.length !== storedDim) {
      console.log("\n*** DIMENSION MISMATCH DETECTED! ***");
      console.log("Query embedding:", queryEmbedding.length, "dimensions");
      console.log("Stored embeddings:", storedDim, "dimensions");
      console.log("This means the embeddings were created with a DIFFERENT model than what you're querying with!");
      console.log("Cosine similarity will be meaningless = RAG will ALWAYS fail!");
    } else {
      // Compute cosine similarity
      let dot = 0, magA = 0, magB = 0;
      const stored = sampleChunks[0].embedding;
      for (let i = 0; i < Math.min(queryEmbedding.length, stored.length); i++) {
        dot += queryEmbedding[i] * stored[i];
        magA += queryEmbedding[i] ** 2;
        magB += stored[i] ** 2;
      }
      const similarity = dot / (Math.sqrt(magA) * Math.sqrt(magB));
      console.log("Cosine similarity with first chunk:", similarity.toFixed(4));
      console.log(similarity > 0.08 ? "PASS: Above retrieval threshold (0.08)" : "FAIL: Below retrieval threshold (0.08)");
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
