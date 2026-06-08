import { createClient } from "@supabase/supabase-js";
import { generateText } from "ai";
import { createGoogleGenerativeAI } from "@ai-sdk/google";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const geminiApiKey = process.env.GEMINI_API_KEY_2 || process.env.GEMINI_API_KEY;

if (!supabaseUrl || !supabaseKey || !geminiApiKey) {
  console.error("Missing environment variables.");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);
const google = createGoogleGenerativeAI({ apiKey: geminiApiKey });
const model = google("gemini-2.5-flash");

async function generateCards() {
  console.log("Fetching distinct topics...");
  
  const { data: chunks, error } = await supabase
    .from("knowledge_chunks")
    .select("board, grade, subject, chapter, topic, content, document_id, id");

  if (error) {
    console.error("Failed to fetch chunks:", error);
    return;
  }

  // Group by topic
  const topicsMap = new Map();
  for (const chunk of chunks) {
    if (chunk.subject !== "Engineering Physics") continue;
    if (chunk.topic.includes("Full Textbook OCR") || chunk.topic.length < 2) continue;
    
    const key = `${chunk.subject}::${chunk.chapter}::${chunk.topic}`;
    if (!topicsMap.has(key)) {
      topicsMap.set(key, {
        board: chunk.board,
        grade: chunk.grade,
        subject: chunk.subject,
        chapter: chunk.chapter,
        topic: chunk.topic,
        document_id: chunk.document_id,
        content: chunk.content,
        chunk_id: chunk.id,
      });
    } else {
      topicsMap.get(key).content += "\n" + chunk.content;
    }
  }

  const topics = Array.from(topicsMap.values());
  console.log(`Found ${topics.length} distinct topics to generate cards for.`);

  for (let i = 0; i < topics.length; i++) {
    const t = topics[i];
    console.log(`\nGenerating card for: [${t.chapter}] ${t.topic} (${i+1}/${topics.length})`);

    // Check if card already exists
    const { data: existing } = await supabase
      .from("topic_cards")
      .select("id")
      .eq("board", t.board)
      .eq("grade", t.grade)
      .eq("subject", t.subject)
      .eq("chapter", t.chapter)
      .eq("topic", t.topic)
      .maybeSingle();

    if (existing) {
      console.log(`Card already exists, skipping.`);
      continue;
    }

    try {
      const prompt = `
        You are an expert physics educator. 
        Create a concise study card for the topic: "${t.topic}" in the chapter "${t.chapter}".
        Base it entirely on this textbook content:
        ${t.content.substring(0, 3000)}

        Return a JSON object ONLY with no markdown formatting or backticks:
        {
          "key_terms": ["term1", "term2", "term3"],
          "core_explanation": ["explanation point 1", "explanation point 2"],
          "formula_sheet": ["F = qE", "V = IR"],
          "example_line": "A brief example of this concept",
          "common_mistake": "A common student misconception",
          "exam_angle": "How this is usually tested in exams"
        }
      `;

      const { text } = await generateText({
        model,
        prompt,
        abortSignal: AbortSignal.timeout(45000), // 45 seconds timeout
      });

      let parsed;
      try {
        const cleaned = text.trim().replace(/^```json|```$/g, "").trim();
        parsed = JSON.parse(cleaned);
      } catch (e) {
        console.log(`Failed to parse JSON for ${t.topic}. Skipping. Error: ${e.message}`);
        console.log("Raw output:", text);
        continue;
      }

      const cardData = {
        board: t.board,
        grade: t.grade,
        subject: t.subject,
        chapter: t.chapter,
        topic: t.topic,
        title: t.topic,
        key_terms: parsed.key_terms || [],
        core_explanation: parsed.core_explanation || [],
        formula_sheet: parsed.formula_sheet || [],
        example_line: parsed.example_line || null,
        common_mistake: parsed.common_mistake || null,
        exam_angle: parsed.exam_angle || null,
        status: "published",
        document_id: t.document_id
      };

      const { error: insertError } = await supabase
        .from("topic_cards")
        .insert(cardData);

      if (insertError) {
        console.error(`Failed to insert topic card:`, insertError);
      } else {
        console.log(`Successfully generated and inserted card for ${t.topic}.`);
      }

      await new Promise((resolve) => setTimeout(resolve, 1000));
    } catch (err) {
      console.error(`Failed generating card for ${t.topic}:`, err);
    }
  }

  console.log("\nFinished generating topic cards.");
}

generateCards();
