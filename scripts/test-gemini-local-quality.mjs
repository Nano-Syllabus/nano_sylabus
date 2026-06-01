import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { generateText } from "ai";

const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_GENERATIVE_AI_API_KEY;
const quickModel = process.env.GEMINI_QUICK_MODEL || "gemini-2.5-flash";
const deepModel = process.env.GEMINI_DEEP_MODEL || "gemini-2.5-pro";
const chatLanguage = (process.env.TEST_CHAT_LANGUAGE || "EN").toUpperCase();
const quickMaxTokens = Number(process.env.TEST_QUICK_MAX_TOKENS || 700);
const deepMaxTokens = Number(process.env.TEST_DEEP_MAX_TOKENS || 1100);
const quickThinkingBudget = Number(process.env.TEST_QUICK_THINKING_BUDGET || 64);
const deepThinkingBudget = Number(process.env.TEST_DEEP_THINKING_BUDGET || 256);

if (!apiKey) {
  console.error("Missing GEMINI_API_KEY for local quality test.");
  process.exit(1);
}

const google = createGoogleGenerativeAI({ apiKey });

const languageRule =
  chatLanguage === "RN"
    ? "Answer only in Roman Nepali (Latin letters). Never use Devanagari."
    : "Answer only in English.";

const scenarios = [
  {
    id: "mode-en-question-nepali",
    prompt:
      "यदि ओहम्स ल बुझाउनुपर्यो भने छोटकरीमा formula, unit, र एउटा practical example सहित explain गर।",
    expectedLanguage: "EN",
  },
  {
    id: "mode-rn-question-english",
    prompt: "Explain capacitance and RC charging in simple terms for first year engineering.",
    expectedLanguage: "RN",
    forceLanguage: "RN",
  },
  {
    id: "engineering-depth-check",
    prompt:
      "Compare free, damped and forced oscillation with equations and one engineering use-case each.",
    expectedLanguage: "EN",
  },
];

const DEVANAGARI_PATTERN = /[\u0900-\u097F]/;
const ROMAN_NEPALI_HINTS = /\b(cha|chha|bhane|haina|ra|yo|timi|tapai|hajur|bujha|sajilo|kura|ho)\b/gi;

function compliance(answer, mode) {
  if (mode === "RN") {
    if (DEVANAGARI_PATTERN.test(answer)) return false;
    const hits = answer.toLowerCase().match(ROMAN_NEPALI_HINTS)?.length ?? 0;
    return hits >= 2;
  }
  return !DEVANAGARI_PATTERN.test(answer) && !(answer.toLowerCase().match(ROMAN_NEPALI_HINTS)?.length >= 2);
}

function buildRewritePrompt(answer, mode) {
  const targetRule =
    mode === "RN"
      ? "Rewrite in Roman Nepali only (Latin letters). Never use Devanagari. Keep the same meaning."
      : "Rewrite in English only. Do not use Roman Nepali or Devanagari. Keep the same meaning.";
  return `
${targetRule}
Return only rewritten answer.

Original answer:
${answer}
  `.trim();
}

function buildHardRewritePrompt(answer, mode) {
  if (mode === "RN") {
    return [
      "Rewrite this answer in strict Roman Nepali only.",
      "Never use Devanagari characters.",
      "Keep technical terms in English only when needed.",
      "Return only rewritten answer.",
      "",
      "Answer:",
      answer,
    ].join("\n");
  }

  return [
    "Rewrite this answer in strict English only.",
    "Never use Roman Nepali or Devanagari.",
    "Return only rewritten answer.",
    "",
    "Answer:",
    answer,
  ].join("\n");
}

function modeSafeFallback(mode) {
  if (mode === "RN") {
    return "Maile yo answer lai roman nepali format ma rakhna khojda mismatch bhayo, kripaya feri sodhnuhos.";
  }
  return "I could not format this answer correctly in English. Please ask again.";
}

async function runOne(modelName, scenario, overrideLanguage) {
  const mode = overrideLanguage || scenario.expectedLanguage || chatLanguage;
  const isDeep = modelName === deepModel;
  const prompt = `
${languageRule}
Current response mode: ${mode}

Question:
${scenario.prompt}
  `.trim();

  const started = Date.now();
  const result = await generateText({
    model: google(modelName),
    prompt,
    temperature: 0.2,
    maxTokens: isDeep ? deepMaxTokens : quickMaxTokens,
    providerOptions: {
      google: {
        thinkingConfig: {
          thinkingBudget: isDeep ? deepThinkingBudget : quickThinkingBudget,
        },
      },
    },
  });
  const ms = Date.now() - started;
  const text = (result.text || "").trim();
  const initialCompliant = compliance(text, mode);
  let finalText = text;
  let rewriteApplied = false;

  if (!initialCompliant && text) {
    rewriteApplied = true;
    const rewrite = await generateText({
      model: google(modelName),
      prompt: buildRewritePrompt(text, mode),
      temperature: 0.1,
      maxTokens: 600,
      providerOptions: {
        google: {
          thinkingConfig: {
            thinkingBudget: Math.max(128, Math.min(256, isDeep ? deepThinkingBudget : quickThinkingBudget)),
          },
        },
      },
    });
    finalText = (rewrite.text || "").trim();
    if (!compliance(finalText, mode) && finalText) {
      const hardRewrite = await generateText({
        model: google(modelName),
        prompt: buildHardRewritePrompt(finalText, mode),
        temperature: 0.1,
        maxTokens: 600,
        providerOptions: {
          google: {
            thinkingConfig: {
              thinkingBudget: Math.max(128, Math.min(256, isDeep ? deepThinkingBudget : quickThinkingBudget)),
            },
          },
        },
      });
      finalText = (hardRewrite.text || "").trim() || finalText;
    }
    if (!compliance(finalText, mode)) {
      finalText = modeSafeFallback(mode);
    }
  }

  const finalCompliant = compliance(finalText, mode);
  return {
    model: modelName,
    scenario: scenario.id,
    mode,
    latencyMs: ms,
    chars: finalText.length,
    initialCompliant,
    compliant: finalCompliant,
    rewriteApplied,
    preview: finalText.slice(0, 200).replace(/\s+/g, " "),
    finishReason: result.finishReason || "unknown",
  };
}

async function main() {
  const rows = [];

  for (const scenario of scenarios) {
    const mode = scenario.forceLanguage || chatLanguage;
    rows.push(await runOne(quickModel, scenario, mode));
    rows.push(await runOne(deepModel, scenario, mode));
  }

  console.log("Local Gemini quality test report");
  console.log(
    JSON.stringify(
      {
        quickModel,
        deepModel,
        chatLanguage,
        quickMaxTokens,
        deepMaxTokens,
        quickThinkingBudget,
        deepThinkingBudget,
        rows,
      },
      null,
      2,
    ),
  );

  const failed = rows.filter((row) => !row.compliant);
  if (failed.length > 0) {
    console.error(`Language compliance failed in ${failed.length} run(s).`);
    process.exit(2);
  }
}

main().catch((error) => {
  console.error("Local Gemini quality test failed:", error?.message || String(error));
  process.exit(1);
});
