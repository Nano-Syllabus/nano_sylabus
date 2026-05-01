export function getSupabaseEnv() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!url || !key) {
    throw new Error(
      "Missing Supabase environment variables. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY.",
    );
  }

  return { url, key };
}

export function getSupabaseServiceRoleEnv() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    throw new Error(
      "Missing Supabase admin environment variables. Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.",
    );
  }

  return { url, serviceRoleKey };
}

export function getGeminiEnv() {
  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_GENERATIVE_AI_API_KEY;
  const model = process.env.GEMINI_MODEL || "gemini-2.5-flash";
  const maxOutputTokens = Number(process.env.GEMINI_MAX_OUTPUT_TOKENS || 900);
  const thinkingBudget = Number(process.env.GEMINI_THINKING_BUDGET || 256);
  const rewriteMaxOutputTokens = Number(process.env.GEMINI_REWRITE_MAX_OUTPUT_TOKENS || 320);
  const rewriteThinkingBudget = Number(process.env.GEMINI_REWRITE_THINKING_BUDGET || 64);
  const followupMaxOutputTokens = Number(process.env.GEMINI_FOLLOWUP_MAX_OUTPUT_TOKENS || 220);
  const followupThinkingBudget = Number(process.env.GEMINI_FOLLOWUP_THINKING_BUDGET || 64);

  if (!apiKey) {
    throw new Error("Missing GEMINI_API_KEY.");
  }

  return {
    apiKey,
    model,
    maxOutputTokens,
    thinkingBudget,
    rewriteMaxOutputTokens,
    rewriteThinkingBudget,
    followupMaxOutputTokens,
    followupThinkingBudget,
  };
}

export function getGeminiEmbeddingEnv() {
  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_GENERATIVE_AI_API_KEY;
  const model = process.env.GEMINI_EMBEDDING_MODEL || "gemini-embedding-001";

  if (!apiKey) {
    throw new Error("Missing GEMINI_API_KEY.");
  }

  return { apiKey, model };
}
