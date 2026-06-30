function collectGeminiApiKeys() {
  const directKeys = [
    process.env.GEMINI_API_KEY,
    process.env.GOOGLE_GENERATIVE_AI_API_KEY,
  ];

  const listKeys = (process.env.GEMINI_API_KEYS || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);

  const numberedKeys = Object.entries(process.env)
    .filter(([key, value]) => /^GEMINI_API_KEY_\d+$/.test(key) && value)
    .sort(([left], [right]) => left.localeCompare(right, undefined, { numeric: true }))
    .map(([, value]) => String(value).trim())
    .filter(Boolean);

  return Array.from(new Set([...directKeys, ...listKeys, ...numberedKeys].filter(Boolean) as string[]));
}

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
  const apiKeys = collectGeminiApiKeys();
  const apiKey = apiKeys[0];
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
    apiKeys,
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
  const apiKeys = collectGeminiApiKeys();
  const apiKey = apiKeys[0];
  const model = process.env.GEMINI_EMBEDDING_MODEL || "gemini-embedding-001";

  if (!apiKey) {
    throw new Error("Missing GEMINI_API_KEY.");
  }

  return { apiKey, apiKeys, model };
}

export function getEmbeddingEnv() {
  const provider = (process.env.EMBEDDING_PROVIDER || "gemini").trim().toLowerCase();

  if (provider === "openrouter") {
    const apiKey = process.env.OPENROUTER_API_KEY;
    const model = process.env.OPENROUTER_EMBEDDING_MODEL || "openai/text-embedding-3-small";
    const baseUrl = process.env.OPENROUTER_BASE_URL || "https://openrouter.ai/api/v1";

    if (!apiKey) {
      throw new Error("Missing OPENROUTER_API_KEY.");
    }

    return { provider: "openrouter" as const, apiKey, model, baseUrl };
  }

  const { apiKey, model } = getGeminiEmbeddingEnv();
  return { provider: "gemini" as const, apiKey, model };
}

export function getOpenRouterEnv() {
  const apiKey = process.env.OPENROUTER_API_KEY;
  const model = process.env.OPENROUTER_MODEL || "deepseek/deepseek-v4-flash:free";
  const maxOutputTokens = Number(process.env.OPENROUTER_MAX_OUTPUT_TOKENS || 900);
  const rewriteMaxOutputTokens = Number(process.env.OPENROUTER_REWRITE_MAX_OUTPUT_TOKENS || 320);
  const followupMaxOutputTokens = Number(process.env.OPENROUTER_FOLLOWUP_MAX_OUTPUT_TOKENS || 220);

  if (!apiKey) {
    throw new Error("Missing OPENROUTER_API_KEY.");
  }

  return {
    apiKey,
    model,
    maxOutputTokens,
    rewriteMaxOutputTokens,
    followupMaxOutputTokens,
  };
}

export function getTenantApiEnv() {
  const baseUrl = process.env.TENANT_API_BASE_URL;
  const token = process.env.TENANT_API_TOKEN;
  const rejectUnauthorized = (process.env.TENANT_API_REJECT_UNAUTHORIZED || "0").trim() === "1";
  const timeoutMs = Number(process.env.TENANT_API_TIMEOUT_MS || 20000);

  if (!baseUrl || !token) {
    throw new Error(
      "Missing tenant API environment variables. Set TENANT_API_BASE_URL and TENANT_API_TOKEN.",
    );
  }

  return {
    baseUrl,
    token,
    rejectUnauthorized,
    timeoutMs: Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : 20000,
  };
}
