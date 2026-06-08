import type { Language } from "@/lib/types";
import type { RetrievalResult } from "@/lib/ai/retrieval";

const DETERMINISTIC_EMBEDDING_DIMENSIONS = 48;

function tokenize(input: string) {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9\s]+/g, " ")
    .split(/\s+/)
    .map((token) => token.trim())
    .filter(Boolean);
}

function hashToken(token: string) {
  let hash = 2166136261;
  for (let index = 0; index < token.length; index += 1) {
    hash ^= token.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash >>> 0);
}

export function isE2EFakeAIEnabled() {
  return process.env.E2E_FAKE_AI === "1" && process.env.NODE_ENV === "test";
}

export function createDeterministicEmbedding(input: string, dimensions = DETERMINISTIC_EMBEDDING_DIMENSIONS) {
  const vector = new Array<number>(dimensions).fill(0);
  const tokens = tokenize(input);

  if (tokens.length === 0) return vector;

  for (const token of tokens) {
    const hash = hashToken(token);
    vector[hash % dimensions] += 1;
    vector[(hash * 7) % dimensions] += 0.5;
  }

  const magnitude = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0));
  if (!magnitude) return vector;

  return vector.map((value) => Number((value / magnitude).toFixed(8)));
}

function bestExcerpt(retrieval: RetrievalResult) {
  return retrieval.citations[0]?.excerpt || retrieval.chunks[0]?.content || "";
}

function buildEnglishAnswer(question: string, retrieval: RetrievalResult) {
  const normalized = question.toLowerCase();
  const excerpt = bestExcerpt(retrieval);

  if (normalized.includes("summarize") && normalized.includes("taking my son to college")) {
    return "The essay shows how technology changes campus discovery and human connection, replacing some of the unplanned encounters that once shaped college life.";
  }

  if (normalized.includes("serendipity")) {
    return "In this essay, serendipity means meaningful unplanned discovery that students used to experience naturally on campus.";
  }

  if (normalized.includes("theme")) {
    return "A central theme is that technology makes student life more efficient, but it can also reduce unexpected human encounters and discovery.";
  }

  return `Based on the indexed textbook context, ${excerpt || "this topic is explained in the Class 11 English material."}`;
}

function buildRomanNepaliAnswer(question: string, retrieval: RetrievalResult) {
  const normalized = question.toLowerCase();
  const excerpt = bestExcerpt(retrieval);

  if (normalized.includes("summarize") && normalized.includes("taking my son to college")) {
    return "Yo essay le technology le campus ko khoj ra manabiya sambandha kasari badalchha bhanera dekhaucha, ra pahile jasto akasmik bhetghat kam hudai gako kura dekhauncha.";
  }

  if (normalized.includes("serendipity")) {
    return "Yo essay ma serendipity bhaneko akasmik tara mulyawan khoj ho, jun student life ma swabhavik rupma huna sakthyo.";
  }

  if (normalized.includes("theme")) {
    return "Yo path ko main theme technology le jindagi sajilo banaye pani akasmik khoj ra manabiya samparka ghatauna sakcha bhanne ho.";
  }

  return excerpt
    ? `Indexed textbook context anusar, ${excerpt}`
    : "Indexed textbook context anusar yo bisayako sankshipta byakhya diiyeko cha.";
}

export function buildE2EGroundedAnswer({
  question,
  retrieval,
  language,
}: {
  question: string;
  retrieval: RetrievalResult;
  language: Language;
}) {
  return language === "RN"
    ? buildRomanNepaliAnswer(question, retrieval)
    : buildEnglishAnswer(question, retrieval);
}

export function buildE2EFollowUpSuggestions({
  question,
  language,
}: {
  question: string;
  language: Language;
}) {
  const normalized = question.toLowerCase();

  if (language === "RN") {
    if (normalized.includes("taking my son to college")) {
      return [
        "Yo essay ma serendipity bhaneko ke ho?",
        "Technology le campus life ma kasto asar pareko cha?",
        "Yo answer lai exam point wise lekhnus ta.",
      ];
    }

    return [
      "Yo bisayako main idea ke ho?",
      "Yo chapter bata exam ma k sodhina sakcha?",
      "Yo kura lai short point ma bujhaidinus.",
    ];
  }

  if (normalized.includes("taking my son to college")) {
    return [
      "What does serendipity mean in this essay?",
      "How does technology affect student life here?",
      "Turn this into exam-ready bullet points.",
    ];
  }

  return [
    "What is the main idea here?",
    "Which textbook point supports this answer?",
    "Can you turn this into short exam notes?",
  ];
}

export function toDataStreamPayload(text: string) {
  return `0:${JSON.stringify(text)}\ne:{"finishReason":"stop","usage":{"promptTokens":0,"completionTokens":0},"isContinued":false}\n`;
}
