import { getEmbeddingEnv } from "@/lib/env";
import { createDeterministicEmbedding, isE2EFakeAIEnabled } from "@/lib/ai/e2e-harness";

function toGeminiModelPath(model: string) {
  return model.startsWith("models/") ? model : `models/${model}`;
}

export async function embedText(input: string) {
  if (isE2EFakeAIEnabled()) {
    return createDeterministicEmbedding(input);
  }

  const env = getEmbeddingEnv();
  let response: Response;

  if (env.provider === "openrouter") {
    response = await fetch(`${env.baseUrl}/embeddings`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${env.apiKey}`,
      },
      body: JSON.stringify({
        model: env.model,
        input,
      }),
    });
  } else {
    const modelPath = toGeminiModelPath(env.model);
    response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/${modelPath}:embedContent?key=${env.apiKey}`,
      {
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
      },
    );
  }

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Failed to create embedding: ${text}`);
  }

  const payload = (await response.json()) as {
    embedding?: { values?: number[] };
    data?: Array<{ embedding?: number[] }>;
  };

  return payload.embedding?.values ?? payload.data?.[0]?.embedding ?? [];
}

export async function embedTexts(inputs: string[]) {
  const results: number[][] = [];
  for (const input of inputs) {
    results.push(await embedText(input));
  }
  return results;
}
