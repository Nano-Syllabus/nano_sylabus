import { getGeminiEmbeddingEnv } from "@/lib/env";
import { createDeterministicEmbedding, isE2EFakeAIEnabled } from "@/lib/ai/e2e-harness";

function toGeminiModelPath(model: string) {
  return model.startsWith("models/") ? model : `models/${model}`;
}

export async function embedText(input: string) {
  if (isE2EFakeAIEnabled()) {
    return createDeterministicEmbedding(input);
  }

  const { apiKey, model } = getGeminiEmbeddingEnv();
  const modelPath = toGeminiModelPath(model);

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/${modelPath}:embedContent?key=${apiKey}`,
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

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Failed to create embedding: ${text}`);
  }

  const payload = (await response.json()) as {
    embedding?: { values?: number[] };
  };

  return payload.embedding?.values ?? [];
}

export async function embedTexts(inputs: string[]) {
  const results: number[][] = [];
  for (const input of inputs) {
    results.push(await embedText(input));
  }
  return results;
}
