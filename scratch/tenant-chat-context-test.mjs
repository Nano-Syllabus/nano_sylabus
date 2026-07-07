#!/usr/bin/env node

process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

const CHAT_URL = process.env.TENANT_CHAT_URL ?? "https://173.212.214.79/api/chat";

const scenarios = [
  {
    label: "Digital Logic encoder follow-up",
    subject: "Digital Logic",
    namespaces: ["Pokhara University", "Tribhuvan University"],
    turns: [
      "Explain encoder and decoder in digital logic in simple terms.",
      "okay then talk about 4x2",
      "how is it different from 2x4 decoder?",
    ],
  },
  {
    label: "Engineering Physics optics follow-up",
    subject: "Engineering Physics",
    namespaces: ["Tribhuvan University"],
    turns: [
      "Explain interference of light in one short paragraph.",
      "now explain the conditions for sustained interference",
      "give one practical use of that",
    ],
  },
];

function excerpt(value, max = 600) {
  if (typeof value !== "string") return "";
  return value.length > max ? `${value.slice(0, max)}...` : value;
}

async function callChat({ question, contextSummary, subject, namespaces }) {
  const startedAt = Date.now();
  const response = await fetch(CHAT_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      question,
      context_summary: contextSummary,
      subject,
      tenant: "nano-syllabus",
      namespaces,
      top_k: 8,
    }),
  });

  const raw = await response.text();
  let json = null;
  try {
    json = JSON.parse(raw);
  } catch {
    // Keep raw text visible below when the API returns non-JSON.
  }

  return {
    ok: response.ok,
    status: response.status,
    elapsedMs: Date.now() - startedAt,
    raw,
    json,
  };
}

for (const scenario of scenarios) {
  console.log(`\n=== ${scenario.label} ===`);
  let contextSummary = "";

  for (const [index, question] of scenario.turns.entries()) {
    const result = await callChat({
      question,
      contextSummary,
      subject: scenario.subject,
      namespaces: scenario.namespaces,
    });

    const payload = result.json ?? {};
    const answer = payload.answer ?? payload.response ?? payload.message ?? "";
    const nextSummary = payload.context_summary ?? "";

    console.log(`\nTurn ${index + 1}`);
    console.log("status:", result.status, "ok:", result.ok, "elapsedMs:", result.elapsedMs);
    console.log("sentQuestion:", question);
    console.log("sentContextSummary:", contextSummary || "(empty)");
    console.log("responseKeys:", Object.keys(payload));
    console.log("answerPreview:", excerpt(answer));
    console.log("returnedContextSummary:", excerpt(nextSummary, 1000) || "(missing)");

    if (!result.ok || !payload.context_summary) {
      console.log("rawResponse:", excerpt(result.raw, 1200));
    }

    contextSummary = nextSummary;
  }
}
