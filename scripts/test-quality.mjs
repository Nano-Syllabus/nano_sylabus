import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { generateText } from "ai";
import fs from "fs";

// Load environment variables (if any needed) or just rely on process.env


const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_GENERATIVE_AI_API_KEY;

if (!apiKey) {
  console.error("Missing GEMINI_API_KEY");
  process.exit(1);
}

const google = createGoogleGenerativeAI({ apiKey });

// Simulating the exact system prompt rules we just injected into your backend
const systemPrompt = `
IMPORTANT GRAMMAR RULE: Output English ONLY.
Keep it short and student-friendly. Prefer short paragraphs or bullets.

You are a helpful engineering tutor. Answer the student's question clearly.
`;

const engineeringQuestion = "Explain the working principle of a PID controller and how to tune it for a robotic arm joint. Use simple engineering terms.";

async function runTest() {
  console.log("Generating answer using gemini-2.5-flash (with Thinking)...\\n");
  
  const start = Date.now();
  const { text } = await generateText({
    model: google("gemini-2.5-flash"),
    system: systemPrompt,
    prompt: engineeringQuestion,
    maxTokens: 1500,
    providerOptions: {
      google: {
        thinkingConfig: {
          thinkingBudget: 256, // Simulated thinking budget
        },
      },
    },
  });
  
  const ms = Date.now() - start;
  
  console.log("=== ANSWER ===");
  console.log(text);
  console.log("==============");
  console.log("Time taken: " + (ms / 1000).toFixed(2) + " seconds");
}

runTest().catch(console.error);
