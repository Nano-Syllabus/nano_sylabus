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

async function fixTopics() {
  console.log("Fetching chunks with bad topics...");
  
  // Fetch chunks where the topic contains 'Full Textbook OCR' or is too long/generic
  const { data: chunks, error } = await supabase
    .from("knowledge_chunks")
    .select("id, chapter, content, topic")
    .ilike("topic", "%Full Textbook OCR%");

  if (error) {
    console.error("Failed to fetch chunks:", error);
    return;
  }

  if (!chunks || chunks.length === 0) {
    console.log("No chunks found with the bad topic name.");
    return;
  }

  console.log(`Found ${chunks.length} chunks to fix.`);

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    console.log(`\nProcessing ${i + 1}/${chunks.length} (ID: ${chunk.id})...`);
    console.log(`Original chapter: ${chunk.chapter}`);

    try {
      const prompt = `
        You are an expert physics educator.
        Below is a short snippet from a physics textbook/syllabus for a chapter named "${chunk.chapter}".
        Please read the snippet and provide a single, short, descriptive topic name (2-5 words max) that best summarizes the content. 
        For example: "Coulomb's Law", "Electric Field Lines", "Capacitance".
        DO NOT provide any other text or explanation, just the topic name.
        
        Snippet:
        ${chunk.content.substring(0, 1500)}
      `;

      const { text } = await generateText({
        model,
        prompt,
      });

      const newTopic = text.trim().replace(/^"|"$/g, "");
      console.log(`Generated Topic: "${newTopic}"`);

      // Update the database
      const { error: updateError } = await supabase
        .from("knowledge_chunks")
        .update({ topic: newTopic })
        .eq("id", chunk.id);

      if (updateError) {
        console.error(`Failed to update chunk ${chunk.id}:`, updateError);
      } else {
        console.log(`Successfully updated topic for chunk ${chunk.id}.`);
      }

      // Small delay to prevent rate limits
      await new Promise((resolve) => setTimeout(resolve, 500));
    } catch (err) {
      console.error(`Failed to process chunk ${chunk.id}:`, err);
    }
  }

  console.log("\nFinished updating topics.");
}

fixTopics();
