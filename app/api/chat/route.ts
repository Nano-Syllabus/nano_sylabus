import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createOpenAI } from "@ai-sdk/openai";
import { generateText, streamText } from "ai";
import { NextResponse } from "next/server";
import { z } from "zod";
import { canSpendCredits, CHAT_MESSAGE_CREDIT_COST, computeNextBalance } from "@/lib/billing";
import {
  buildGroundingPrompt,
  retrieveKnowledgeChunks,
  type RetrievalResult,
} from "@/lib/ai/retrieval";
import {
  buildE2EFollowUpSuggestions,
  buildE2EGroundedAnswer,
  isE2EFakeAIEnabled,
  toDataStreamPayload,
} from "@/lib/ai/e2e-harness";
import {
  parseFollowUpSuggestions,
} from "@/lib/chat-followups";
import { inferSessionSubjectContext } from "@/lib/chat-subject-context";
import { deriveSubjectTags } from "@/lib/chat-subjects";
import { resolveResponseLanguage } from "@/lib/chat-language-mode";
import { ensureStarterCreditsForUser, getCreditBalanceForUser } from "@/lib/data/billing";
import { getGeminiEnv, getOpenRouterEnv } from "@/lib/env";
import {
  getActivePromptContent,
  getActivePromptTemplateMap,
  renderPromptTemplate,
  type PromptTemplateMap,
} from "@/lib/prompt-runtime";
import { normalizeBoard, normalizeBoardScore, normalizeCollege, normalizeFullName, normalizeGrade, normalizeSubjectLabel, normalizeSubjects, normalizeTargetGrade } from "@/lib/profile-normalization";
import { containsDevanagari, needsEnglishRewrite, needsRomanNepaliRewrite } from "@/lib/roman-nepali";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { deriveSessionTitle } from "@/lib/utils";
import type { AnswerStyle } from "@/lib/types";

const requestSchema = z.object({
  sessionId: z.string().uuid().nullable().optional(),
  language: z.enum(["EN", "RN"]).default("EN"),
  messageLanguage: z.enum(["EN", "RN"]).optional(),
  answerStyle: z.enum(["simple", "balanced", "detailed"]).optional(),
  subjectContext: z.string().trim().min(1).max(120).nullable().optional(),
  messages: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string(),
      }),
    )
    .min(1),
});

type AnswerMode = "quick" | "deep";
type ProviderOptions = Parameters<typeof generateText>[0]["providerOptions"];
type QuestionStyle = "concept" | "numerical" | "compare";
const DEFAULT_RAG_TIMEOUT_MS = 3500;
const DEFAULT_MODEL_TIMEOUT_MS = 18000;
const DEFAULT_REWRITE_TIMEOUT_MS = 7000;
const DEFAULT_MAX_RETRIES = 0;

function resolveLlmProvider() {
  const forceGeminiPrimary = (process.env.FORCE_GEMINI_PRIMARY || "1").trim() !== "0";
  if (forceGeminiPrimary) return "gemini" as const;
  const value = (process.env.LLM_PROVIDER || "gemini").trim().toLowerCase();
  if (value === "openrouter") return "openrouter" as const;
  return "gemini" as const;
}

function summarizeModelFailureReason(error: unknown) {
  const text = (error instanceof Error ? error.message : String(error || ""))
    .toLowerCase()
    .trim();
  if (!text) return "unknown";
  if (text.includes("timed out")) return "timeout";
  if (
    text.includes("429") ||
    text.includes("quota") ||
    text.includes("resource_exhausted") ||
    text.includes("rate limit")
  ) {
    return "quota_or_rate_limit";
  }
  if (text.includes("401") || text.includes("403") || text.includes("unauthorized")) return "auth_error";
  if (text.includes("network") || text.includes("fetch")) return "network_error";
  return "provider_error";
}

function selectAutoAnswerMode(question: string, subjectContext?: string | null): {
  mode: AnswerMode;
  reason: string;
} {
  const normalized = question.trim().toLowerCase();
  const tokenCount = normalized.split(/\s+/).filter(Boolean).length;
  const normalizedSubject = (subjectContext || "").trim().toLowerCase();
  const isTechnicalSubject =
    /\bengineering\b/.test(normalizedSubject) ||
    /\bphysics\b/.test(normalizedSubject) ||
    /\belectronics\b/.test(normalizedSubject) ||
    /\belectrical\b/.test(normalizedSubject);

  const deepHints = [
    /\b(compare|difference|justify|analyze|analysis|evaluate|critically)\b/,
    /\bstep[-\s]?by[-\s]?step\b/,
    /\bprove|deriv(e|ation)|deduce\b/,
    /\bsolve|numerical|equation|calculate\b/,
    /\bconcept\b/,
    /\bprinciple\b/,
    /\bmechanism\b/,
    /\benergy transfer\b/,
    /\bexplain\b.*\bwhy\b/,
    /\bwhat happens\b/,
    /\bdifferent medium\b/,
    /\bwhy\b.*\bhow\b/,
    /\bexplain\b.*\bdetail\b/,
    /\bpros and cons\b/,
    /\bcase study\b/,
  ];

  const hasDeepHint = deepHints.some((pattern) => pattern.test(normalized));
  if (hasDeepHint) {
    return { mode: "deep", reason: "complexity-hint" };
  }

  if (isTechnicalSubject && tokenCount >= 18) {
    return { mode: "deep", reason: "technical-long-question" };
  }

  if (tokenCount >= 18) {
    return { mode: "deep", reason: "long-question" };
  }

  return { mode: "quick", reason: "default-fast" };
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string) {
  let timer: ReturnType<typeof setTimeout> | null = null;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => {
          reject(new Error(`${label} timed out after ${timeoutMs}ms`));
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function classifyQuestionStyle(question: string): QuestionStyle {
  const normalized = question.trim().toLowerCase();
  if (
    /\bcompare|difference|distinguish|versus|vs\b/.test(normalized) ||
    /\bhow is .* different\b/.test(normalized)
  ) {
    return "compare";
  }

  if (
    /\bcalculate|find|solve|numerical|derive|derivation|prove|show that\b/.test(normalized) ||
    /\bformula\b/.test(normalized)
  ) {
    return "numerical";
  }

  return "concept";
}

function isTechnicalSubject(subjectContext?: string | null) {
  const normalized = (subjectContext || "").toLowerCase();
  return (
    /\bengineering\b/.test(normalized) ||
    /\bphysics\b/.test(normalized) ||
    /\belectronics\b/.test(normalized) ||
    /\belectrical\b/.test(normalized) ||
    /\bmechanics\b/.test(normalized)
  );
}

function looksLowQualityForTechnicalAnswer({
  answer,
  answerStyle,
  questionStyle,
  subjectContext,
}: {
  answer: string;
  answerStyle: AnswerStyle;
  questionStyle: QuestionStyle;
  subjectContext?: string | null;
}) {
  if (!isTechnicalSubject(subjectContext)) return false;
  const trimmed = answer.trim();
  if (!trimmed) return true;

  const words = trimmed.split(/\s+/).filter(Boolean).length;
  const hasStructure = /\b(step|formula|concept|why|because|therefore|example|unit|given)\b/i.test(trimmed);
  const hasEquationSignal = /[=^*/]|pi|rho|lambda|omega|mu|sigma|velocity|frequency|wavelength/i.test(trimmed);

  if (answerStyle === "detailed" && words < 120) return true;
  if (answerStyle === "balanced" && words < 80) return true;
  if (questionStyle === "numerical" && !hasEquationSignal) return true;
  if (!hasStructure && words < 100) return true;

  return false;
}

function buildAnswerFormatGuidance({
  language,
  questionStyle,
  subjectContext,
  answerStyle,
}: {
  language: "EN" | "RN";
  questionStyle: QuestionStyle;
  subjectContext: string | null;
  answerStyle: AnswerStyle;
}) {
  const subjectHint =
    subjectContext && /engineering|physics|electronics|electrical/i.test(subjectContext)
      ? "The student is likely expecting an engineering-grade explanation, not a school-level simplification."
      : "";

  const commonRules = [
    "Do not output LaTeX delimiters like \\( \\) \\[ \\].",
    "Write formulas in plain readable text.",
    "Do not dump formulas without explaining what each quantity means.",
    "Do not copy raw OCR wording from sources.",
    "Use short sections or bullets when they improve clarity.",
  ];

  const styleGuidance =
    answerStyle === "simple"
      ? [
          "Keep the answer compact and easy to scan.",
          "Prefer short paragraphs or bullets.",
          "Use only the most necessary formula or example.",
          "Avoid long derivations unless absolutely necessary.",
        ]
      : answerStyle === "detailed"
        ? [
            "Give a full teacher-quality explanation.",
            "Do not over-compress the answer.",
            "Explain the why, the principle, and the physical meaning clearly.",
            "If a formula is relevant, explain what each term represents.",
            "If useful, include one small intuitive example or exam-oriented interpretation.",
          ]
        : [
            "Keep the answer clear and complete.",
            "Do not make it too short or too long without reason.",
            "Explain enough for a student to understand and revise from it.",
          ];

  if (questionStyle === "numerical") {
    return [
      subjectHint,
      ...commonRules,
      ...styleGuidance,
      "For numerical or derivation questions, use this structure when useful:",
      "1. Direct answer",
      "2. Given / known values",
      "3. Formula",
      "4. Substitution / derivation",
      "5. Final answer",
      "6. One-line interpretation",
      language === "RN"
        ? "Roman Nepali ma pani technical clarity maintain gara."
        : "Keep the explanation technically precise and easy to follow.",
    ]
      .filter(Boolean)
      .join("\n- ");
  }

  if (questionStyle === "compare") {
    return [
      subjectHint,
      ...commonRules,
      ...styleGuidance,
      "For comparison questions, use this structure when useful:",
      "1. Direct difference in one or two lines",
      "2. Principle behind each item",
      "3. Key differences in bullets",
      "4. Practical or exam-oriented takeaway",
    ]
      .filter(Boolean)
      .join("\n- ");
  }

  return [
    subjectHint,
    ...commonRules,
    ...styleGuidance,
    "For conceptual questions, use this structure when useful:",
    "1. Direct answer in simple words",
    "2. Why this happens",
    "3. Key relation or formula only if it helps",
    "4. Physical meaning / intuition",
    "5. Short takeaway or exam point",
  ]
    .filter(Boolean)
    .join("\n- ");
}

function buildSystemPrompt({
  fullName,
  college,
  board,
  grade,
  boardScore,
  subjects,
  targetGrade,
  language,
  subjectContext,
  matchedScope,
  groundingContext,
  questionStyle,
  answerStyle,
}: {
  fullName: string;
  college: string;
  board: string;
  grade: string;
  boardScore: string | null;
  subjects: string[];
  targetGrade: string;
  language: "EN" | "RN";
  subjectContext: string | null;
  matchedScope: string | null;
  groundingContext: string;
  questionStyle: QuestionStyle;
  answerStyle: AnswerStyle;
}) {
  const languageInstruction =
    language === "RN"
      ? [
          "Respond in Roman Nepali only: Nepali language written with Latin letters.",
          "Do not use Devanagari Nepali characters at all.",
          "Use clean, natural Roman Nepali that an engineering student can understand quickly.",
          "Do not sound robotic, broken, or overly literal.",
          "For concept questions: explain the idea first, then formula or math if needed.",
          "For numericals: show givens, formula, substitution, calculation, and final answer clearly.",
        ].join(" ")
      : [
          "Respond in clear English.",
          "Sound like a strong engineering tutor, not like copied notes.",
          "Explain the idea first, then the governing formula, then the implication or example.",
          "Keep the answer structured and readable, but not shallow.",
        ].join(" ");

  return `
You are Nano Syllabus, an AI study companion for Nepali students.

Student context:
- Name: ${fullName || "Student"}
- Institution: ${college || "Unknown"}
- Board: ${board || "Unknown"}
- Grade / Year: ${grade || "Unknown"}
- Previous score: ${boardScore || "Unknown"}
- Subjects: ${subjects.join(", ") || "Unknown"}
- Target grade: ${targetGrade || "Unknown"}
${subjectContext ? `- Subject focus: ${subjectContext}` : ""}

Guidelines:
- Adjust difficulty to the student's level.
- Be accurate, structured, and genuinely helpful.
- Prefer grounded textbook-style explanation over vague generic summaries.
- For engineering, physics, and technical subjects: explain the physical meaning, not just the formula.
- If the question is conceptual, answer in this order when useful: direct answer, principle, formula/relationship, practical implication.
- If the question is numerical or derivational, answer in this order when useful: givens, formula, substitution, result, short interpretation.
- If a retrieved source is incomplete or noisy, synthesize a cleaner answer from the best grounded evidence rather than copying the chunk wording.
- ${languageInstruction}
- Do not greet, do not introduce yourself, and do not add filler like "Hello" or "Namaste" unless the student asks.
- Never begin the answer with greetings such as "Hello", "Hi", "Hey", "Namaste", or "Namaskar".
- Start directly with the explanation, the answer, or the first useful heading.
- If textbook/study-material grounding is provided, you MUST use it as your primary source of truth.
- Base your entire explanation on the provided syllabus and textbook context. If the user asks for exam predictions or summaries not explicitly in the text, you may synthesize them based on the textbook topics, without apologizing or claiming you can't access the text.
- If no grounded source is provided at all, you may answer using general knowledge, but state clearly that you are answering without specific textbook context.
- If the student asks in Roman Nepali, understand the intent, but always keep the output in the selected response language.
- Avoid shallow one-paragraph answers when the topic needs reasoning.
- Preferred answer style: ${answerStyle}.
- Never start the answer with metadata like "Matched:" or scope labels. Those belong to the UI, not the answer body.
- Use bullets or short sections when they improve clarity.

Presentation contract:
- ${buildAnswerFormatGuidance({ language, questionStyle, subjectContext, answerStyle })}

Grounding context:
${groundingContext || "No syllabus context was retrieved for this question."}
`.trim();
}

function buildSystemPromptWithTemplate(
  templates: PromptTemplateMap,
  input: Parameters<typeof buildSystemPrompt>[0],
) {
  const template = getActivePromptContent(templates, "system", input.language);
  if (!template) {
    return buildSystemPrompt(input);
  }

  return renderPromptTemplate(template, {
    STUDENT_NAME: input.fullName || "Student",
    STUDENT_COLLEGE: input.college || "Unknown",
    STUDENT_BOARD: input.board || "Unknown",
    STUDENT_GRADE: input.grade || "Unknown",
    STUDENT_SCORE: input.boardScore || "Unknown",
    STUDENT_SUBJECTS: input.subjects.join(", ") || "Unknown",
    STUDENT_TARGET_GRADE: input.targetGrade || "Unknown",
    SUBJECT_CONTEXT: input.subjectContext || "",
    SUBJECT_CONTEXT_LINE: input.subjectContext ? `Subject focus: ${input.subjectContext}` : "",
    RESPONSE_LANGUAGE_RULES:
      input.language === "RN"
        ? [
            "Respond in Roman Nepali only: Nepali language written with Latin letters.",
            "Do not use Devanagari Nepali characters at all.",
            "Use clean, natural Roman Nepali that an engineering student can understand quickly.",
            "Do not sound robotic, broken, or overly literal.",
            "For concept questions: explain the idea first, then formula or math if needed.",
            "For numericals: show givens, formula, substitution, calculation, and final answer clearly.",
          ].join(" ")
        : [
            "Respond in clear English.",
            "Sound like a strong engineering tutor, not like copied notes.",
            "Explain the idea first, then the governing formula, then the implication or example.",
            "Keep the answer structured and readable, but not shallow.",
          ].join(" "),
    GROUNDING_CONTEXT: input.groundingContext || "No syllabus context was retrieved for this question.",
    ANSWER_FORMAT_GUIDANCE: buildAnswerFormatGuidance({
      language: input.language,
      questionStyle: input.questionStyle,
      subjectContext: input.subjectContext,
      answerStyle: input.answerStyle,
    }),
    ANSWER_STYLE: input.answerStyle,
  }).trim();
}

function detectSH402Unit(question: string, sourceText: string) {
  const text = `${question}\n${sourceText}`.toLowerCase();
  const unitRules: Array<{ unit: string; patterns: RegExp[] }> = [
    { unit: "Unit 1 Oscillation", patterns: [/\boscillation\b/, /\bdamped\b/, /\bforced\b/, /\bem oscillation\b/] },
    { unit: "Unit 2 Wave Motion", patterns: [/\bwave motion\b/, /\bprogressive wave\b/, /\bwaves and particles\b/] },
    { unit: "Unit 3 Acoustics", patterns: [/\bacoustics?\b/, /\breverberation\b/, /\bsabine\b/, /\bultrasound\b/] },
    { unit: "Unit 4 Physical Optics", patterns: [/\binterference\b/, /\bdiffraction\b/, /\bnewton'?s rings\b/, /\bpolarization\b/] },
    { unit: "Unit 5 Geometrical Optics", patterns: [/\bgeometrical optics\b/, /\blenses\b/, /\bcardinal points\b/, /\bchromatic aberration\b/] },
    { unit: "Unit 6 Laser and Fiber Optics", patterns: [/\blaser\b/, /\bhe-ne\b/, /\bfiber optics?\b/, /\boptical fiber\b/] },
    { unit: "Unit 7 Electrostatics", patterns: [/\belectrostatics?\b/, /\belectric field\b/, /\bcapacitor\b/, /\bdielectric\b/] },
    { unit: "Unit 8 Electromagnetism", patterns: [/\belectromagnetism\b/, /\bohm'?s law\b/, /\bhall effect\b/, /\bfaraday\b/, /\bampere\b/] },
    { unit: "Unit 9 Electromagnetic Waves", patterns: [/\bmaxwell\b/, /\bcontinuity equation\b/, /\belectromagnetic waves?\b/, /\benergy transfer\b/] },
    { unit: "Unit 10 Photon and Matter Waves", patterns: [/\bphoton\b/, /\bmatter waves?\b/, /\bschrodinger\b/, /\buncertainty principle\b/, /\bbarrier tunneling\b/] },
    { unit: "Practical", patterns: [/\bpractical\b/, /\bexperiment\b/, /\bspectrometer\b/, /\bpolarimeter\b/, /\blrc\b/] },
    { unit: "References", patterns: [/\breferences?\b/, /\bhalliday\b/, /\bresnick\b/, /\bwalker\b/, /\bbrij lal\b/] },
  ];

  let best: { unit: string; score: number } | null = null;
  for (const rule of unitRules) {
    const score = rule.patterns.reduce((sum, pattern) => sum + (pattern.test(text) ? 1 : 0), 0);
    if (score <= 0) continue;
    if (!best || score > best.score) {
      best = { unit: rule.unit, score };
    }
  }
  return best?.unit ?? null;
}

const CHAPTER_WORD_TO_INDEX: Record<string, number> = {
  first: 1,
  one: 1,
  second: 2,
  two: 2,
  third: 3,
  three: 3,
  fourth: 4,
  four: 4,
  fifth: 5,
  five: 5,
  sixth: 6,
  six: 6,
  seventh: 7,
  seven: 7,
  eighth: 8,
  eight: 8,
  ninth: 9,
  nine: 9,
  tenth: 10,
  ten: 10,
};

const SH402_UNIT_BY_INDEX: Record<number, string> = {
  1: "Unit 1 Oscillation",
  2: "Unit 2 Wave Motion",
  3: "Unit 3 Acoustics",
  4: "Unit 4 Physical Optics",
  5: "Unit 5 Geometrical Optics",
  6: "Unit 6 Laser and Fiber Optics",
  7: "Unit 7 Electrostatics",
  8: "Unit 8 Electromagnetism",
  9: "Unit 9 Electromagnetic Waves",
  10: "Unit 10 Photon and Matter Waves",
};

function parseRequestedChapterUnitIndex(question: string) {
  const normalized = question.toLowerCase();
  const numericPatterns = [
    /\b(?:chapter|unit)\s*(?:no\.?|number)?\s*(\d{1,2})(?:st|nd|rd|th)?\b/,
    /\b(\d{1,2})(?:st|nd|rd|th)\s*(?:chapter|unit)\b/,
  ];
  for (const pattern of numericPatterns) {
    const match = normalized.match(pattern);
    if (!match?.[1]) continue;
    const value = Number(match[1]);
    if (Number.isFinite(value)) return value;
  }

  const wordPatterns = [
    /\b(?:chapter|unit)\s+(first|one|second|two|third|three|fourth|four|fifth|five|sixth|six|seventh|seven|eighth|eight|ninth|nine|tenth|ten)\b/,
    /\b(first|one|second|two|third|three|fourth|four|fifth|five|sixth|six|seventh|seven|eighth|eight|ninth|nine|tenth|ten)\s+(?:chapter|unit)\b/,
  ];
  for (const pattern of wordPatterns) {
    const match = normalized.match(pattern);
    if (!match?.[1]) continue;
    const word = match[1].toLowerCase();
    if (word in CHAPTER_WORD_TO_INDEX) {
      return CHAPTER_WORD_TO_INDEX[word];
    }
  }

  return null;
}

function isStructureLookupQuestion(question: string) {
  return parseRequestedChapterUnitIndex(question) !== null;
}

function looksLikeEngineeringPhysicsScope({
  subjectContext,
  profileSubjects,
  retrieval,
}: {
  subjectContext: string | null;
  profileSubjects: string[];
  retrieval: RetrievalResult;
}) {
  const scopeText = [
    subjectContext ?? "",
    ...profileSubjects,
    ...retrieval.citations.map((citation) => citation.sourceLabel || ""),
    ...retrieval.chunks.map((chunk) => `${chunk.sourceTitle} ${chunk.subject}`),
  ]
    .join(" ")
    .toLowerCase();

  return (
    /\bengineering\s*physics\b/.test(scopeText) ||
    /\bsh\s*402\b/.test(scopeText)
  );
}

function pickUnitOutlineSnippets(rawContent: string, unitIndex: number) {
  const content = rawContent.replace(/\r/g, "");
  const unitHeaderPattern = new RegExp(
    `(?:^|\\n)\\s*(?:unit|chapter)\\s*${unitIndex}(?:\\s*[:.)-]|\\s+)`,
    "i",
  );
  const startMatch = unitHeaderPattern.exec(content);
  if (!startMatch || startMatch.index < 0) return [];

  const afterStart = content.slice(startMatch.index);
  const nextUnitPattern = /\n\s*(?:unit|chapter)\s*\d{1,2}(?:\s*[:.)-]|\s+)/i;
  const nextUnitMatch = nextUnitPattern.exec(afterStart.slice(1));
  const block = nextUnitMatch
    ? afterStart.slice(0, Math.max(0, nextUnitMatch.index + 1))
    : afterStart.slice(0, 2200);

  const lines = block
    .split("\n")
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .filter((line) => line.length >= 8)
    .filter((line) => !/^--\s*\d+\s*of\s*\d+\s*--$/i.test(line))
    .filter((line) => !/^contents?$/i.test(line))
    .filter((line) => !/^original pdf page\s+\d+$/i.test(line));

  const compactUnique: string[] = [];
  for (const line of lines) {
    if (compactUnique.some((seen) => seen.toLowerCase() === line.toLowerCase())) continue;
    compactUnique.push(line);
    if (compactUnique.length >= 6) break;
  }

  return compactUnique;
}

async function buildDeterministicChapterAnswer({
  supabase,
  question,
  language,
  subjectContext,
  profile,
  retrieval,
}: {
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>;
  question: string;
  language: "EN" | "RN";
  subjectContext: string | null;
  profile: { board: string; grade: string; subjects: string[] };
  retrieval: RetrievalResult;
}) {
  if (!isStructureLookupQuestion(question)) return null;
  if (
    !looksLikeEngineeringPhysicsScope({
      subjectContext,
      profileSubjects: profile.subjects,
      retrieval,
    })
  ) {
    return null;
  }

  const chapterIndex = parseRequestedChapterUnitIndex(question);
  if (!chapterIndex) return null;

  if (chapterIndex < 1 || chapterIndex > 10) {
    const answer =
      language === "RN"
        ? "Engineering Physics SH402 ma theory units 1 dekhi 10 samma chan. Kripaya 1-10 bhitra ko chapter sodhnuhos."
        : "Engineering Physics SH402 has theory units from 1 to 10. Please ask for a chapter between 1 and 10.";
    return { answer, matchedScope: `${profile.board || "Unknown"} > ${profile.grade || "Unknown"} > SH402` };
  }

  const syllabusDocIds = Array.from(
    new Set(
      retrieval.chunks
        .filter((chunk) => chunk.resourceKind === "syllabus")
        .map((chunk) => chunk.documentId)
        .filter(Boolean),
    ),
  );

  let rawSyllabus = "";
  if (syllabusDocIds.length > 0) {
    const { data: docs } = await supabase
      .from("knowledge_documents")
      .select("id, raw_content, title, subject, metadata, resource_kind")
      .in("id", syllabusDocIds)
      .eq("resource_kind", "syllabus");

    const preferredDoc = (docs ?? []).find((doc) => {
      const metadata = (doc.metadata ?? {}) as Record<string, unknown>;
      const courseCode = typeof metadata.courseCode === "string" ? metadata.courseCode.toLowerCase() : "";
      const combined = `${doc.title || ""} ${doc.subject || ""}`.toLowerCase();
      return courseCode.includes("sh402") || combined.includes("engineering physics");
    });
    rawSyllabus = typeof preferredDoc?.raw_content === "string" ? preferredDoc.raw_content : "";
  }

  const unitName = SH402_UNIT_BY_INDEX[chapterIndex] ?? `Unit ${chapterIndex}`;
  const snippets = rawSyllabus ? pickUnitOutlineSnippets(rawSyllabus, chapterIndex) : [];
  const filteredSnippets = snippets.filter((line) => !new RegExp(`\\b(?:unit|chapter)\\s*${chapterIndex}\\b`, "i").test(line));

  const answer =
    language === "RN"
      ? [
          `Engineering Physics SH402 ko Chapter ${chapterIndex} = ${unitName}.`,
          filteredSnippets.length > 0
            ? "Yo chapter ma syllabus anusaar yo key points chan:"
            : "Yo chapter ko main focus yo unit ko core concepts haru ho.",
          ...filteredSnippets.slice(0, 5).map((line) => `- ${line}`),
        ]
          .join("\n")
          .trim()
      : [
          `For Engineering Physics SH402, Chapter ${chapterIndex} is ${unitName}.`,
          filteredSnippets.length > 0
            ? "Based on the grounded syllabus, it covers:"
            : "This unit focuses on the core concepts listed in the SH402 syllabus.",
          ...filteredSnippets.slice(0, 5).map((line) => `- ${line}`),
        ]
          .join("\n")
          .trim();

  const matchedScope = `${profile.board || "Unknown"} > ${profile.grade || "Unknown"} > SH402 > ${unitName}`;
  return {
    answer: sanitizeAnswerPresentation(answer),
    matchedScope,
  };
}

async function resolveMatchedScope({
  supabase,
  retrieval,
  question,
  profile,
}: {
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>;
  retrieval: RetrievalResult;
  question: string;
  profile: {
    board: string;
    grade: string;
    subjects: string[];
  };
}) {
  const docIds = Array.from(new Set(retrieval.chunks.map((chunk) => chunk.documentId).filter(Boolean)));
  if (docIds.length === 0) {
    return `${profile.board || "Unknown"} > ${profile.grade || "Unknown"}`;
  }

  const { data: docs, error } = await supabase
    .from("knowledge_documents")
    .select("id, subject, metadata, resource_kind")
    .in("id", docIds);
  if (error) {
    console.error("Failed to resolve matched scope metadata", error);
    return `${profile.board || "Unknown"} > ${profile.grade || "Unknown"}`;
  }

  const syllabusDoc = (docs ?? []).find((doc) => doc.resource_kind === "syllabus");
  const metadata = (syllabusDoc?.metadata ?? {}) as Record<string, unknown>;
  const courseCode = typeof metadata.courseCode === "string" ? metadata.courseCode : null;
  const year = typeof metadata.year === "string" ? metadata.year : null;
  const part = typeof metadata.part === "string" ? metadata.part : null;
  const subject =
    typeof syllabusDoc?.subject === "string" && syllabusDoc.subject.trim()
      ? syllabusDoc.subject.trim()
      : retrieval.chunks[0]?.subject || profile.subjects[0] || "General";
  const sourceText = retrieval.chunks.map((chunk) => chunk.content).join("\n");
  const unit = detectSH402Unit(question, sourceText);

  const scopeParts = [
    profile.board || "Unknown",
    profile.grade || "Unknown",
    year,
    part,
    courseCode,
    subject,
    unit,
  ].filter(Boolean);
  return scopeParts.join(" > ");
}

function buildFollowUpPrompt({
  question,
  answer,
  language,
  subjectContext,
}: {
  question: string;
  answer: string;
  language: "EN" | "RN";
  subjectContext: string | null;
}) {
  const responseLanguage =
    language === "RN"
      ? "Roman Nepali written only with Latin letters, never Devanagari"
      : "English";

  return `
You are writing suggested follow-up study questions for a student chat.

Write exactly 3 short follow-up questions in ${responseLanguage}.
${subjectContext ? `Keep them focused on ${subjectContext}.` : ""}
They must be natural next questions a student might ask after reading the answer.
Do not include numbering, bullets, labels, or explanations.
Return one question per line.

Student question:
${question}

Assistant answer:
${answer}
  `.trim();
}

async function suggestFollowUps({
  model,
  providerOptions,
  question,
  answer,
  language,
  subjectContext,
  templates,
  followupMaxOutputTokens,
  maxRetries,
}: {
  model: ReturnType<ReturnType<typeof createGoogleGenerativeAI>> | ReturnType<ReturnType<typeof createOpenAI>>;
  providerOptions?: ProviderOptions;
  question: string;
  answer: string;
  language: "EN" | "RN";
  subjectContext: string | null;
  templates: PromptTemplateMap;
  followupMaxOutputTokens: number;
  maxRetries: number;
}) {
  const template = getActivePromptContent(templates, "followup", language);
  const prompt = template
    ? renderPromptTemplate(template, {
        RESPONSE_LANGUAGE:
          language === "RN"
            ? "Roman Nepali written only with Latin letters, never Devanagari"
            : "English",
        SUBJECT_CONTEXT: subjectContext || "",
        SUBJECT_CONTEXT_LINE: subjectContext ? `Keep them focused on ${subjectContext}.` : "",
        QUESTION: question,
        ANSWER: answer,
      }).trim()
    : buildFollowUpPrompt({ question, answer, language, subjectContext });

  const { text } = await generateText({
    model,
    maxRetries,
    temperature: 0.4,
    maxTokens: followupMaxOutputTokens,
    providerOptions,
    prompt,
  });

  return parseFollowUpSuggestions(text);
}

function buildRewritePrompt({
  question,
  answer,
  language,
  subjectContext,
  answerStyle,
}: {
  question: string;
  answer: string;
  language: "EN" | "RN";
  subjectContext: string | null;
  answerStyle: AnswerStyle;
}) {
  const styleRules =
    answerStyle === "simple"
      ? [
          "- Keep it short and student-friendly.",
          "- Prefer short paragraphs or bullets.",
        ]
      : answerStyle === "detailed"
        ? [
            "- Preserve the full explanation and do not compress it into a short summary.",
            "- Keep the answer detailed, structured, and tutor-like.",
            "- Retain conceptual explanation, formula meaning, and step-wise reasoning when present.",
          ]
        : [
            "- Keep it clear, complete, and student-friendly.",
            "- Do not over-compress it into a very short summary.",
          ];

  const rewriteRules =
    language === "RN"
      ? [
          "- Output Roman Nepali only: Nepali language written with Latin letters.",
          "- Never use Devanagari characters.",
          ...styleRules,
        ]
      : [
          "- Output English only.",
          "- Do not use Roman Nepali or Devanagari Nepali.",
          ...styleRules,
        ];

  return `
Rewrite this assistant answer for Nano Syllabus.

Hard requirements:
${rewriteRules.join("\n")}
- Preserve formulas, numbers, and the meaning of the original answer.
- Do not add new facts.
- Return only the rewritten answer.
${subjectContext ? `- Subject focus: ${subjectContext}.` : ""}

Student question:
${question}

Original answer:
${answer}
    `.trim();
}

function buildLanguageSafetyFallback(language: "EN" | "RN") {
  if (language === "RN") {
    return "Maile yo answer lai roman nepali format ma thik sanga dine prayas gare, tara format mismatch bhayo. Kripaya same question feri sodhnuhos.";
  }
  return "I could not format this answer correctly in English this time. Please ask the same question again.";
}

function formatModelError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  const normalized = message.toLowerCase();

  if (
    normalized.includes("resource_exhausted") ||
    normalized.includes("quota") ||
    normalized.includes("429")
  ) {
    return "The answer model hit a temporary quota or rate limit. Please retry in a few moments.";
  }

  if (normalized.includes("timeout") || normalized.includes("deadline")) {
    return "The answer model took too long to respond. Please retry.";
  }

  return `The answer model failed for this question: ${message}`;
}

function sanitizeAnswerPresentation(text: string) {
  const withoutGreeting = text.replace(
    /^(?:\s*(?:namaste|namaskar|hello|hi|hey|dear student|dear learner)[!,.\s:-]*)+/i,
    "",
  );

  return withoutGreeting
    .replace(/^Matched:.*$/gim, "")
    .replace(/\\\[/g, "")
    .replace(/\\\]/g, "")
    .replace(/\\\(/g, "")
    .replace(/\\\)/g, "")
    .replace(/\\rho\b/g, "rho")
    .replace(/\\mu\b/g, "mu")
    .replace(/\\lambda\b/g, "lambda")
    .replace(/\\omega\b/g, "omega")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function looksTruncatedAnswer(text: string, finishReason?: string | null) {
  const trimmed = text.trim();
  if (!trimmed) return false;

  if (finishReason) {
    const normalizedFinishReason = finishReason.toLowerCase();
    if (
      normalizedFinishReason.includes("length") ||
      normalizedFinishReason.includes("max") ||
      normalizedFinishReason.includes("token")
    ) {
      return true;
    }
  }

  if (trimmed.length < 220) return false;
  if (/[.!?…)"\]]$/.test(trimmed)) return false;
  if (/[:,;-]$/.test(trimmed)) return true;

  const lastWord = trimmed.split(/\s+/).at(-1) || "";
  if (lastWord.length > 0 && lastWord.length <= 4) return true;

  return /\b(?:ra|ani|tara|tesaile|jaba|yadi|bhane|kina|jasle|which|that|because|therefore|thus|so)\s*$/i.test(
    trimmed,
  );
}

function mergeContinuationAnswer(answer: string, continuation: string) {
  const base = answer.trimEnd();
  const extra = continuation.trim();

  if (!extra) return base;

  const normalizedExtra = extra.replace(/^(?:continue(?:ing)?(?: from)?(?: where you stopped)?[:,-]?\s*)/i, "").trim();
  if (!normalizedExtra) return base;

  const overlapWindow = Math.min(120, base.length, normalizedExtra.length);
  for (let overlap = overlapWindow; overlap >= 24; overlap -= 1) {
    if (base.slice(-overlap) === normalizedExtra.slice(0, overlap)) {
      return `${base}${normalizedExtra.slice(overlap)}`.trim();
    }
  }

  if (base.endsWith(normalizedExtra)) return base;
  return `${base}\n${normalizedExtra}`.trim();
}

async function completeAnswerIfTruncated({
  model,
  providerOptions,
  systemPrompt,
  promptMessages,
  answer,
  maxTokens,
  finishReason,
  timeoutMs,
  maxRetries,
}: {
  model: ReturnType<ReturnType<typeof createGoogleGenerativeAI>> | ReturnType<ReturnType<typeof createOpenAI>>;
  providerOptions?: ProviderOptions;
  systemPrompt: string;
  promptMessages: Array<{ role: "user" | "assistant"; content: string }>;
  answer: string;
  maxTokens: number;
  finishReason?: string | null;
  timeoutMs?: number;
  maxRetries: number;
}) {
  if (!looksTruncatedAnswer(answer, finishReason)) {
    return answer.trim();
  }

  try {
    const continuation = await withTimeout(
      generateText({
        model,
        maxRetries,
        maxTokens: Math.max(300, Math.floor(maxTokens * 0.45)),
        providerOptions,
        system: systemPrompt,
        messages: [
          ...promptMessages,
          { role: "assistant", content: answer },
          {
            role: "user",
            content:
              "Continue the same answer from exactly where you stopped. Do not restart, do not repeat the earlier paragraphs, and finish the explanation completely.",
          },
        ],
      }),
      Math.max(4000, timeoutMs ?? DEFAULT_MODEL_TIMEOUT_MS),
      "Answer continuation",
    );

    return mergeContinuationAnswer(answer, continuation.text);
  } catch (continuationError) {
    console.error("Failed to continue truncated answer", continuationError);
    return answer.trim();
  }
}

async function enforceAnswerLanguageContract({
  model,
  providerOptions,
  question,
  answer,
  language,
  subjectContext,
  answerStyle,
  templates,
  rewriteMaxOutputTokens,
  maxRetries,
}: {
  model: ReturnType<ReturnType<typeof createGoogleGenerativeAI>> | ReturnType<ReturnType<typeof createOpenAI>>;
  providerOptions?: ProviderOptions;
  question: string;
  answer: string;
  language: "EN" | "RN";
  subjectContext: string | null;
  answerStyle: AnswerStyle;
  templates: PromptTemplateMap;
  rewriteMaxOutputTokens: number;
  maxRetries: number;
}) {
  const violatesContract = (text: string) =>
    language === "RN" ? needsRomanNepaliRewrite(text, language) : needsEnglishRewrite(text, language);

  if (!violatesContract(answer)) {
    return sanitizeAnswerPresentation(answer);
  }

  const template = getActivePromptContent(templates, "rewrite", language);
  const prompt = template
    ? renderPromptTemplate(template, {
        REWRITE_RULES:
          language === "RN"
            ? [
                "- Output Roman Nepali only: Nepali language written with Latin letters.",
                "- Never use Devanagari characters.",
                ...(answerStyle === "simple"
                  ? [
                      "- Keep it short and student-friendly.",
                      "- Prefer short paragraphs or bullets.",
                    ]
                  : answerStyle === "detailed"
                    ? [
                        "- Preserve the full explanation and do not compress it into a short summary.",
                        "- Keep the answer detailed, structured, and tutor-like.",
                        "- Retain conceptual explanation, formula meaning, and step-wise reasoning when present.",
                      ]
                    : [
                        "- Keep it clear, complete, and student-friendly.",
                        "- Do not over-compress it into a very short summary.",
                      ]),
              ].join("\n")
            : [
                "- Output English only.",
                "- Do not use Roman Nepali or Devanagari Nepali.",
                ...(answerStyle === "simple"
                  ? [
                      "- Keep it short and student-friendly.",
                      "- Prefer short paragraphs or bullets.",
                    ]
                  : answerStyle === "detailed"
                    ? [
                        "- Preserve the full explanation and do not compress it into a short summary.",
                        "- Keep the answer detailed, structured, and tutor-like.",
                        "- Retain conceptual explanation, formula meaning, and step-wise reasoning when present.",
                      ]
                    : [
                        "- Keep it clear, complete, and student-friendly.",
                        "- Do not over-compress it into a very short summary.",
                      ]),
              ].join("\n"),
        SUBJECT_CONTEXT: subjectContext || "",
        SUBJECT_CONTEXT_LINE: subjectContext ? `- Subject focus: ${subjectContext}.` : "",
        QUESTION: question,
        ANSWER: answer,
      }).trim()
    : buildRewritePrompt({ question, answer, language, subjectContext, answerStyle });

  const { text } = await generateText({
    model,
    maxRetries,
    temperature: 0.2,
    maxTokens: rewriteMaxOutputTokens,
    providerOptions,
    prompt,
  });

  const rewritten = text.trim();
  if (rewritten && !violatesContract(rewritten)) {
    return sanitizeAnswerPresentation(rewritten);
  }

  const hardFixPrompt =
    language === "RN"
      ? [
          "Rewrite this answer in strict Roman Nepali only.",
          "Never use Devanagari characters.",
          "Keep technical terms in English only when needed.",
          "Return only the rewritten answer.",
          "",
          "Answer:",
          rewritten || answer,
        ].join("\n")
      : [
          "Rewrite this answer in strict English only.",
          "Never use Roman Nepali or Devanagari.",
          "Return only the rewritten answer.",
          "",
          "Answer:",
          rewritten || answer,
        ].join("\n");

  try {
    const secondPass = await generateText({
      model,
      maxRetries,
      temperature: 0.1,
      maxTokens: rewriteMaxOutputTokens,
      providerOptions,
      prompt: hardFixPrompt,
    });
    const secondText = secondPass.text.trim();
    if (secondText && !violatesContract(secondText)) {
      return sanitizeAnswerPresentation(secondText);
    }
  } catch (retryError) {
    console.error("Second-pass language rewrite failed", retryError);
  }

  if (rewritten && !containsDevanagari(rewritten) && language === "RN") {
    return sanitizeAnswerPresentation(rewritten);
  }

  return buildLanguageSafetyFallback(language);
}

function buildGeneralFallbackRetrieval({
  question,
  subjectContext,
  profileSubjects,
}: {
  question: string;
  subjectContext: string | null;
  profileSubjects: string[];
}): RetrievalResult {
  const subject = subjectContext || profileSubjects[0] || "General";
  return {
    chunks: [],
    grounded: false,
    citations: [
      {
        chunkId: `general-ai-${Date.now()}`,
        documentId: "general-ai",
        sourceType: "general",
        sourceLabel: `${subject} · General AI`,
        sourceTitle: "General AI knowledge",
        sourceName: "Model reasoning",
        subject,
        chapter: null,
        topic: null,
        excerpt:
          question.length > 220
            ? `${question.slice(0, 217).trim()}...`
            : question,
      },
    ],
  };
}

async function persistAssistantCompletion({
  supabase,
  sessionId,
  userId,
  answer,
  language,
  retrieval,
  subjectTags,
  subjectContext,
  followUpSuggestions,
}: {
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>;
  sessionId: string;
  userId: string;
  answer: string;
  language: "EN" | "RN";
  retrieval: RetrievalResult;
  subjectTags: string[];
  subjectContext: string | null;
  followUpSuggestions: string[];
}) {
  const { data: assistantMessage, error: assistantError } = await supabase
    .from("chat_messages")
    .insert({
      session_id: sessionId,
      role: "assistant",
      content: answer,
      language,
      grounded: retrieval.grounded,
      citations: retrieval.citations,
      follow_up_suggestions: followUpSuggestions,
    })
    .select("id")
    .single();

  if (assistantError || !assistantMessage) {
    return null;
  }

  await supabase
    .from("chat_sessions")
    .update({
      updated_at: new Date().toISOString(),
      subject_tags: subjectTags,
      subject_context: subjectContext,
    })
    .eq("id", sessionId);

  const latestBalance = await getCreditBalanceForUser(userId);
  const nextBalance = computeNextBalance(latestBalance, -CHAT_MESSAGE_CREDIT_COST);

  const { error: chargeError } = await supabase.from("credits_ledger").insert({
    user_id: userId,
    type: "usage",
    amount: -CHAT_MESSAGE_CREDIT_COST,
    balance_after: Math.max(nextBalance, 0),
    reference_type: "chat_message",
    reference_id: assistantMessage.id,
    description: "Credit used for successful assistant response",
  });

  if (chargeError && chargeError.code !== "23505") {
    console.error("Failed to record credit usage", chargeError);
  }

  return assistantMessage.id;
}

export async function POST(request: Request) {
  try {
    const requestStartedAt = Date.now();
    let retrievalMs = 0;
    let generationMs = 0;
    let rewriteMs = 0;
    let followupMs = 0;

    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const parsed = requestSchema.parse(await request.json());
    const answerStyle: AnswerStyle = parsed.answerStyle ?? "detailed";
    const resolvedLanguage = resolveResponseLanguage({
      chatLanguage: parsed.language,
      messageLanguage: parsed.messageLanguage,
    });
    const latestUserMessage = [...parsed.messages].reverse().find((message) => message.role === "user");

    if (!latestUserMessage?.content.trim()) {
      return NextResponse.json({ error: "Message content is required." }, { status: 400 });
    }

    const { data: profileRow } = await supabase
      .from("student_profiles")
      .select("*")
      .eq("user_id", user.id)
      .maybeSingle();

    if (!profileRow) {
      return NextResponse.json({ error: "Onboarding required." }, { status: 400 });
    }

    const currentBalance = await ensureStarterCreditsForUser(user.id);
    if (!canSpendCredits(currentBalance)) {
      return NextResponse.json(
        { error: "No credits left. Buy a plan to continue chatting." },
        { status: 402 },
      );
    }

    const profile = {
      userId: profileRow.user_id,
      fullName: normalizeFullName(profileRow.full_name ?? ""),
      college: normalizeCollege(profileRow.college ?? ""),
      board: normalizeBoard(profileRow.board ?? ""),
      grade: normalizeGrade(profileRow.grade ?? ""),
      boardScore: profileRow.board_score ? normalizeBoardScore(profileRow.board_score) : null,
      subjects: normalizeSubjects(profileRow.subjects ?? []),
      targetGrade: normalizeTargetGrade(profileRow.target_grade ?? ""),
      languagePref: profileRow.language_pref ?? "EN",
      role: profileRow.role ?? "student",
      createdAt: profileRow.created_at,
      updatedAt: profileRow.updated_at,
    } as const;

    let sessionId = parsed.sessionId ?? null;
    let sessionSubjectTags: string[] = [];
    let sessionSubjectContext: string | null = parsed.subjectContext
      ? normalizeSubjectLabel(parsed.subjectContext)
      : null;

    if (sessionId) {
      const { data: sessionRow } = await supabase
        .from("chat_sessions")
        .select("id, subject_tags, subject_context")
        .eq("id", sessionId)
        .eq("user_id", user.id)
        .maybeSingle();

      if (!sessionRow) {
        return NextResponse.json({ error: "Chat session not found." }, { status: 404 });
      }

      sessionSubjectTags = normalizeSubjects(Array.isArray(sessionRow.subject_tags) ? sessionRow.subject_tags : []);
      sessionSubjectContext = sessionRow.subject_context
        ? normalizeSubjectLabel(sessionRow.subject_context)
        : sessionSubjectContext;
    } else {
      const { data: insertedSession, error: sessionError } = await supabase
        .from("chat_sessions")
        .insert({
          user_id: user.id,
          title: deriveSessionTitle(latestUserMessage.content),
          subject_context: sessionSubjectContext,
          subject_tags: sessionSubjectContext ? [sessionSubjectContext] : [],
        })
        .select("id, subject_tags, subject_context")
        .single();

      if (sessionError || !insertedSession) {
        return NextResponse.json({ error: "Failed to create chat session." }, { status: 500 });
      }

      sessionId = insertedSession.id;
      sessionSubjectTags = Array.isArray(insertedSession.subject_tags) ? insertedSession.subject_tags : [];
      sessionSubjectContext = insertedSession.subject_context ?? sessionSubjectContext;
    }

    const finalSessionId = sessionId as string;

    const { error: userMessageError } = await supabase.from("chat_messages").insert({
      session_id: finalSessionId,
      role: "user",
      content: latestUserMessage.content,
      language: resolvedLanguage,
    });

    if (userMessageError) {
      return NextResponse.json({ error: "Failed to save the user message." }, { status: 500 });
    }

    await supabase
      .from("chat_sessions")
      .update({ updated_at: new Date().toISOString() })
      .eq("id", finalSessionId);

    const ragTimeoutMs = Number(process.env.CHAT_RAG_TIMEOUT_MS || DEFAULT_RAG_TIMEOUT_MS);
    const modelTimeoutMs = Number(process.env.CHAT_MODEL_TIMEOUT_MS || DEFAULT_MODEL_TIMEOUT_MS);
    const rewriteTimeoutMs = Number(
      process.env.CHAT_REWRITE_TIMEOUT_MS || DEFAULT_REWRITE_TIMEOUT_MS,
    );
    const chatMaxRetries = Number(process.env.CHAT_MAX_RETRIES || DEFAULT_MAX_RETRIES);
    const enableQualityRescue = (process.env.CHAT_ENABLE_QUALITY_RESCUE || "0").trim() === "1";
    let retrieval: RetrievalResult;

    const retrievalStartedAt = Date.now();
    try {
      retrieval = await withTimeout(
        retrieveKnowledgeChunks(latestUserMessage.content, profile, {
          subjectContext: sessionSubjectContext,
        }),
        Math.max(1000, ragTimeoutMs),
        "RAG retrieval",
      );
    } catch (retrievalError) {
      console.error("RAG retrieval slow/failed, using general fallback", retrievalError);
      retrieval = buildGeneralFallbackRetrieval({
        question: latestUserMessage.content,
        subjectContext: sessionSubjectContext,
        profileSubjects: profile.subjects,
      });
    } finally {
      retrievalMs = Date.now() - retrievalStartedAt;
    }

    if (!retrieval.grounded || retrieval.chunks.length === 0) {
      retrieval = buildGeneralFallbackRetrieval({
        question: latestUserMessage.content,
        subjectContext: sessionSubjectContext,
        profileSubjects: profile.subjects,
      });
    }

    const resolvedSubjectTags = deriveSubjectTags({
      existingTags: sessionSubjectTags,
      subjectContext: sessionSubjectContext,
      retrieval,
      question: latestUserMessage.content,
      profileSubjects: profile.subjects,
    });

    sessionSubjectContext = inferSessionSubjectContext({
      existingSubjectContext: sessionSubjectContext,
      resolvedSubjectTags,
      citations: retrieval.citations,
    });
    let matchedScope = await resolveMatchedScope({
      supabase,
      retrieval,
      question: latestUserMessage.content,
      profile,
    });

    const deterministicChapterAnswer = await buildDeterministicChapterAnswer({
      supabase,
      question: latestUserMessage.content,
      language: resolvedLanguage,
      subjectContext: sessionSubjectContext,
      profile: {
        board: profile.board,
        grade: profile.grade,
        subjects: profile.subjects,
      },
      retrieval,
    });
    if (deterministicChapterAnswer) {
      if (deterministicChapterAnswer.matchedScope) {
        matchedScope = deterministicChapterAnswer.matchedScope;
      }
      const answer = deterministicChapterAnswer.answer;
      const followUpSuggestions = buildE2EFollowUpSuggestions({
        question: latestUserMessage.content,
        language: resolvedLanguage,
      });

      const assistantMessageId = await persistAssistantCompletion({
        supabase,
        sessionId: finalSessionId,
        userId: user.id,
        answer,
        language: resolvedLanguage,
        retrieval,
        subjectTags: resolvedSubjectTags,
        subjectContext: sessionSubjectContext,
        followUpSuggestions,
      });

      if (!assistantMessageId) {
        return NextResponse.json({ error: "Failed to save the assistant message." }, { status: 500 });
      }

      return new Response(toDataStreamPayload(answer), {
        status: 200,
        headers: {
          "Content-Type": "text/plain; charset=utf-8",
          "x-session-id": finalSessionId,
          "x-rag-grounded": retrieval.grounded ? "1" : "0",
          "x-rag-chunks": String(retrieval.chunks.length),
          "x-subject-context": sessionSubjectContext ?? "",
          "x-thinking-enabled": "0",
          "x-answer-mode": "deterministic_structure_lookup",
          "x-answer-mode-reason": "chapter_unit_lookup",
          "x-matched-scope": matchedScope,
          "x-answer-fallback": "0",
          "x-answer-quality-rescue": "0",
          "x-answer-fallback-reason": "",
          "x-rag-ms": String(retrievalMs),
          "x-generation-ms": "0",
          "x-rewrite-ms": "0",
          "x-followup-ms": "0",
          "x-total-ms": String(Date.now() - requestStartedAt),
        },
      });
    }

    const autoModeSelection = selectAutoAnswerMode(
      latestUserMessage.content,
      sessionSubjectContext,
    );
    const questionStyle = classifyQuestionStyle(latestUserMessage.content);
    const promptTemplates = await getActivePromptTemplateMap();

    if (isE2EFakeAIEnabled()) {
      const answer = buildE2EGroundedAnswer({
        question: latestUserMessage.content,
        retrieval,
        language: resolvedLanguage,
      });
      const followUpSuggestions = buildE2EFollowUpSuggestions({
        question: latestUserMessage.content,
        language: resolvedLanguage,
      });

      const assistantMessageId = await persistAssistantCompletion({
        supabase,
        sessionId: finalSessionId,
        userId: user.id,
        answer,
        language: resolvedLanguage,
        retrieval,
        subjectTags: resolvedSubjectTags,
        subjectContext: sessionSubjectContext,
        followUpSuggestions,
      });

      if (!assistantMessageId) {
        return NextResponse.json({ error: "Failed to save the assistant message." }, { status: 500 });
      }

      return new Response(toDataStreamPayload(answer), {
        status: 200,
        headers: {
          "Content-Type": "text/plain; charset=utf-8",
          "x-session-id": finalSessionId,
          "x-rag-grounded": retrieval.grounded ? "1" : "0",
          "x-rag-chunks": String(retrieval.chunks.length),
          "x-subject-context": sessionSubjectContext ?? "",
          "x-thinking-enabled": "1",
          "x-answer-mode": autoModeSelection.mode,
          "x-answer-mode-reason": autoModeSelection.reason,
          "x-matched-scope": matchedScope,
          "x-answer-fallback": "0",
          "x-answer-quality-rescue": "0",
          "x-answer-fallback-reason": "",
          "x-rag-ms": String(retrievalMs),
          "x-generation-ms": "0",
          "x-rewrite-ms": "0",
          "x-followup-ms": "0",
          "x-total-ms": String(Date.now() - requestStartedAt),
        },
      });
    }

    const llmProvider = resolveLlmProvider();

    let activeModel:
      | ReturnType<ReturnType<typeof createGoogleGenerativeAI>>
      | ReturnType<ReturnType<typeof createOpenAI>>;
    let fallbackModel:
      | ReturnType<ReturnType<typeof createGoogleGenerativeAI>>
      | ReturnType<ReturnType<typeof createOpenAI>>
      | null = null;
    let maxOutputTokens = 900;
    let thinkingBudget = 0;
    let rewriteMaxOutputTokens = 320;
    let followupMaxOutputTokens = 220;
    let answerProviderOptions: ProviderOptions = undefined;
    let fallbackAnswerProviderOptions: ProviderOptions = undefined;
    let rewriteProviderOptions: ProviderOptions = undefined;
    let followupProviderOptions: ProviderOptions = undefined;
    let rewriteModel:
      | ReturnType<ReturnType<typeof createGoogleGenerativeAI>>
      | ReturnType<ReturnType<typeof createOpenAI>>;
    let followupModel:
      | ReturnType<ReturnType<typeof createGoogleGenerativeAI>>
      | ReturnType<ReturnType<typeof createOpenAI>>;
    let qualityRescueModel:
      | ReturnType<ReturnType<typeof createGoogleGenerativeAI>>
      | ReturnType<ReturnType<typeof createOpenAI>>
      | null = null;
    let qualityRescueProviderOptions: ProviderOptions = undefined;
    let qualityRescueMaxTokens = 0;
    let qualityRescueModelName: string | null = null;
    let activeModelName = "";
    let fallbackModelName: string | null = null;
    const fallbackCandidates: Array<{
      model:
        | ReturnType<ReturnType<typeof createGoogleGenerativeAI>>
        | ReturnType<ReturnType<typeof createOpenAI>>;
      providerOptions?: ProviderOptions;
      maxTokens: number;
      label: string;
    }> = [];

    if (llmProvider === "openrouter") {
      const {
        apiKey,
        model: defaultModel,
        maxOutputTokens: defaultMaxOutputTokens,
        rewriteMaxOutputTokens: defaultRewriteMaxOutputTokens,
        followupMaxOutputTokens: defaultFollowupMaxOutputTokens,
      } = getOpenRouterEnv();
      const quickModel = process.env.OPENROUTER_QUICK_MODEL || defaultModel;
      const deepModel = process.env.OPENROUTER_DEEP_MODEL || defaultModel;
      const quickMaxOutputTokens = Number(
        process.env.OPENROUTER_QUICK_MAX_OUTPUT_TOKENS ||
          Math.max(300, Math.floor(defaultMaxOutputTokens * 0.7)),
      );
      const deepMaxOutputTokens = Number(
        process.env.OPENROUTER_DEEP_MAX_OUTPUT_TOKENS || Math.max(defaultMaxOutputTokens, 1000),
      );
      const modelName = autoModeSelection.mode === "deep" ? deepModel : quickModel;
      activeModelName = modelName;
      maxOutputTokens =
        autoModeSelection.mode === "deep" ? deepMaxOutputTokens : quickMaxOutputTokens;
      rewriteMaxOutputTokens = Number(
        process.env.OPENROUTER_REWRITE_MAX_OUTPUT_TOKENS || defaultRewriteMaxOutputTokens,
      );
      followupMaxOutputTokens = Number(
        process.env.OPENROUTER_FOLLOWUP_MAX_OUTPUT_TOKENS || defaultFollowupMaxOutputTokens,
      );

      const openrouter = createOpenAI({
        apiKey,
        baseURL: process.env.OPENROUTER_BASE_URL || "https://openrouter.ai/api/v1",
        headers: {
          ...(process.env.OPENROUTER_HTTP_REFERER
            ? { "HTTP-Referer": process.env.OPENROUTER_HTTP_REFERER }
            : {}),
          ...(process.env.OPENROUTER_X_TITLE ? { "X-Title": process.env.OPENROUTER_X_TITLE } : {}),
        },
      });

      activeModel = openrouter.chat(modelName);
      rewriteModel = openrouter.chat(process.env.OPENROUTER_REWRITE_MODEL || quickModel);
      followupModel = openrouter.chat(process.env.OPENROUTER_FOLLOWUP_MODEL || quickModel);
      if (autoModeSelection.mode === "quick" && deepModel !== quickModel) {
        qualityRescueModel = openrouter.chat(deepModel);
        qualityRescueModelName = deepModel;
        qualityRescueMaxTokens = deepMaxOutputTokens;
      }
    } else {
      const {
        apiKey,
        apiKeys,
        model: defaultModel,
        maxOutputTokens: defaultMaxOutputTokens,
        thinkingBudget: defaultThinkingBudget,
        rewriteMaxOutputTokens: defaultRewriteMaxOutputTokens,
        rewriteThinkingBudget,
        followupMaxOutputTokens: defaultFollowupMaxOutputTokens,
        followupThinkingBudget,
      } = getGeminiEnv();
      const quickModel = process.env.GEMINI_QUICK_MODEL || defaultModel || "gemini-2.5-flash";
      const deepModel = process.env.GEMINI_DEEP_MODEL || quickModel;
      const rewriteModelName = process.env.GEMINI_REWRITE_MODEL || quickModel;
      const followupModelName = process.env.GEMINI_FOLLOWUP_MODEL || quickModel;
      const quickMaxOutputTokens = Number(
        process.env.GEMINI_QUICK_MAX_OUTPUT_TOKENS || Math.max(700, Math.floor(defaultMaxOutputTokens * 0.9)),
      );
      const deepMaxOutputTokens = Number(
        process.env.GEMINI_DEEP_MAX_OUTPUT_TOKENS || Math.max(defaultMaxOutputTokens, 1500),
      );
      const quickThinkingBudget = Number(
        process.env.GEMINI_QUICK_THINKING_BUDGET || Math.max(128, Math.floor(defaultThinkingBudget * 0.5)),
      );
      const deepThinkingBudget = Number(
        process.env.GEMINI_DEEP_THINKING_BUDGET || Math.max(defaultThinkingBudget, 1024),
      );
      const explicitFallbackModelName =
        process.env.GEMINI_FALLBACK_MODEL || (deepModel !== quickModel ? quickModel : null);

      const modelName = autoModeSelection.mode === "deep" ? deepModel : quickModel;
      activeModelName = modelName;
      maxOutputTokens =
        autoModeSelection.mode === "deep" ? deepMaxOutputTokens : quickMaxOutputTokens;
      thinkingBudget =
        autoModeSelection.mode === "deep" ? deepThinkingBudget : quickThinkingBudget;
      rewriteMaxOutputTokens = defaultRewriteMaxOutputTokens;
      followupMaxOutputTokens = defaultFollowupMaxOutputTokens;

      const gemini = createGoogleGenerativeAI({ apiKey });
      activeModel = gemini(modelName);
      rewriteModel = gemini(rewriteModelName);
      followupModel = gemini(followupModelName);
      if (autoModeSelection.mode === "quick" && deepModel !== quickModel) {
        qualityRescueModel = gemini(deepModel);
        qualityRescueModelName = deepModel;
        qualityRescueMaxTokens = deepMaxOutputTokens;
        qualityRescueProviderOptions = {
          google: {
            thinkingConfig: {
              thinkingBudget: deepThinkingBudget,
            },
          },
        };
      }
      if (explicitFallbackModelName && explicitFallbackModelName !== modelName) {
        const fallbackThinkingBudget =
          explicitFallbackModelName === quickModel ? quickThinkingBudget : Math.max(128, quickThinkingBudget);
        fallbackModel = gemini(explicitFallbackModelName);
        fallbackModelName = explicitFallbackModelName;
        fallbackAnswerProviderOptions = {
          google: {
            thinkingConfig: {
              thinkingBudget: fallbackThinkingBudget,
            },
          },
        };
      }
      for (const extraApiKey of apiKeys.slice(1)) {
        const extraGemini = createGoogleGenerativeAI({ apiKey: extraApiKey });
        fallbackCandidates.push({
          model: extraGemini(modelName),
          providerOptions: {
            google: {
              thinkingConfig: {
                thinkingBudget,
              },
            },
          },
          maxTokens: maxOutputTokens,
          label: `${modelName} via backup Gemini key`,
        });
        if (explicitFallbackModelName && explicitFallbackModelName !== modelName) {
          const extraFallbackThinkingBudget =
            explicitFallbackModelName === quickModel
              ? quickThinkingBudget
              : Math.max(128, quickThinkingBudget);
          fallbackCandidates.push({
            model: extraGemini(explicitFallbackModelName),
            providerOptions: {
              google: {
                thinkingConfig: {
                  thinkingBudget: extraFallbackThinkingBudget,
                },
              },
            },
            maxTokens: Math.max(700, Math.floor(maxOutputTokens * 0.8)),
            label: `${explicitFallbackModelName} via backup Gemini key`,
          });
        }
      }

      try {
        const {
          apiKey: openRouterApiKey,
          model: openRouterDefaultModel,
          maxOutputTokens: openRouterDefaultMaxOutputTokens,
        } = getOpenRouterEnv();
        const openrouter = createOpenAI({
          apiKey: openRouterApiKey,
          baseURL: process.env.OPENROUTER_BASE_URL || "https://openrouter.ai/api/v1",
          headers: {
            ...(process.env.OPENROUTER_HTTP_REFERER
              ? { "HTTP-Referer": process.env.OPENROUTER_HTTP_REFERER }
              : {}),
            ...(process.env.OPENROUTER_X_TITLE ? { "X-Title": process.env.OPENROUTER_X_TITLE } : {}),
          },
        });
        const openRouterQuickModel =
          process.env.OPENROUTER_QUICK_MODEL || openRouterDefaultModel || "deepseek/deepseek-v4-flash:free";
        fallbackCandidates.push({
          model: openrouter.chat(openRouterQuickModel),
          maxTokens: Number(
            process.env.OPENROUTER_QUICK_MAX_OUTPUT_TOKENS ||
              Math.max(300, Math.floor(openRouterDefaultMaxOutputTokens * 0.7)),
          ),
          label: `${openRouterQuickModel} via OpenRouter fallback`,
        });
      } catch (openRouterEnvError) {
        console.error("OpenRouter fallback unavailable", openRouterEnvError);
      }
      answerProviderOptions = {
        google: {
          thinkingConfig: {
            thinkingBudget,
          },
        },
      };
      rewriteProviderOptions = {
        google: {
          thinkingConfig: {
            thinkingBudget: rewriteThinkingBudget,
          },
        },
      };
      followupProviderOptions = {
        google: {
          thinkingConfig: {
            thinkingBudget: followupThinkingBudget,
          },
        },
      };
    }

    if (answerStyle === "detailed") {
      maxOutputTokens = Math.max(maxOutputTokens, 1700);
      rewriteMaxOutputTokens = Math.max(rewriteMaxOutputTokens, 900);
    } else if (answerStyle === "balanced") {
      maxOutputTokens = Math.max(maxOutputTokens, 1200);
      rewriteMaxOutputTokens = Math.max(rewriteMaxOutputTokens, 500);
    }

    const { data: historyRows, error: historyError } = await supabase
      .from("chat_messages")
      .select("role, content")
      .eq("session_id", finalSessionId)
      .order("created_at", { ascending: false })
      .limit(24);

    if (historyError) {
      return NextResponse.json({ error: "Failed to load chat history." }, { status: 500 });
    }

    const promptMessages = (historyRows ?? [])
      .slice()
      .reverse()
      .map((row) => ({
        role: row.role as "user" | "assistant",
        content: row.content as string,
      }));

    const rewriteRules = resolvedLanguage === "RN"
      ? "IMPORTANT GRAMMAR RULE: Output Roman Nepali ONLY: Nepali language written with Latin letters. Never use Devanagari characters.\n" +
        (answerStyle === "simple" ? "Keep it short and student-friendly. Prefer short paragraphs or bullets." : "")
      : "IMPORTANT GRAMMAR RULE: Output English ONLY.\n" +
        (answerStyle === "simple" ? "Keep it short and student-friendly. Prefer short paragraphs or bullets." : "");

    const baseSystemPrompt = buildSystemPromptWithTemplate(promptTemplates, {
      fullName: profile.fullName,
      college: profile.college,
      board: profile.board,
      grade: profile.grade,
      boardScore: profile.boardScore,
      subjects: profile.subjects,
      targetGrade: profile.targetGrade,
      language: resolvedLanguage,
      subjectContext: sessionSubjectContext,
      matchedScope,
      groundingContext: buildGroundingPrompt(retrieval.chunks),
      questionStyle,
      answerStyle,
    });

    const systemPrompt = rewriteRules + "\n\n" + baseSystemPrompt;

    let answerText = "";
    let generationModel = activeModel;
    let generationProviderOptions = answerProviderOptions;
    let usedFallback = false;
    let usedBackupFallback = false;
    let usedQualityRescue = false;
    let fallbackReason: string | null = null;

    const generationStartedAt = Date.now();
    let streamResult;

    const handleStreamFinish = async ({ text }: { text: string }) => {
      const persistedAnswer = text;
      let followUpSuggestions: string[] = [];
      const shouldGenerateFollowUps = (process.env.CHAT_GENERATE_FOLLOWUPS || "0").trim() === "1";
      
      if (shouldGenerateFollowUps && followupModel) {
        try {
          followUpSuggestions = await suggestFollowUps({
            model: followupModel,
            providerOptions: followupProviderOptions,
            question: latestUserMessage.content,
            answer: persistedAnswer,
            language: resolvedLanguage,
            subjectContext: sessionSubjectContext,
            templates: promptTemplates,
            followupMaxOutputTokens,
            maxRetries: chatMaxRetries,
          });
        } catch (followUpError) {
          console.error("Failed to generate async follow-up suggestions", followUpError);
        }
      }

      try {
        await persistAssistantCompletion({
          supabase,
          sessionId: finalSessionId,
          userId: user.id,
          answer: persistedAnswer,
          language: resolvedLanguage,
          retrieval,
          subjectTags: resolvedSubjectTags,
          subjectContext: sessionSubjectContext,
          followUpSuggestions,
        });
      } catch (dbError) {
        console.error("Failed to persist assistant completion in background", dbError);
      }
    };

    try {
      streamResult = await streamText({
        model: activeModel,
        maxRetries: chatMaxRetries,
        maxTokens: maxOutputTokens,
        providerOptions: answerProviderOptions,
        messages: promptMessages,
        system: systemPrompt,
        onFinish: handleStreamFinish,
      });
    } catch (primaryError) {
      console.error("Primary answer generation failed to start", primaryError);
      fallbackReason = summarizeModelFailureReason(primaryError);
      const orderedFallbacks = [
        ...(fallbackModel
          ? [
              {
                model: fallbackModel,
                providerOptions: fallbackAnswerProviderOptions,
                maxTokens: Math.max(700, Math.floor(maxOutputTokens * 0.8)),
                label: fallbackModelName ?? "fallback model",
              },
            ]
          : []),
        ...fallbackCandidates,
      ];

      if (orderedFallbacks.length === 0) {
        return NextResponse.json(
          {
            error: formatModelError(primaryError),
            code: "MODEL_GENERATION_FAILED",
          },
          { status: 503 },
        );
      }

      let lastFallbackError: unknown = primaryError;
      for (const candidate of orderedFallbacks) {
        try {
          streamResult = await streamText({
            model: candidate.model,
            maxRetries: chatMaxRetries,
            maxTokens: candidate.maxTokens,
            providerOptions: candidate.providerOptions,
            messages: promptMessages,
            system: systemPrompt,
            onFinish: handleStreamFinish,
          });
          generationModel = candidate.model;
          generationProviderOptions = candidate.providerOptions;
          usedFallback = true;
          usedBackupFallback = true;
          fallbackModelName = candidate.label;
          break;
        } catch (fallbackError) {
          lastFallbackError = fallbackError;
          console.error(`Fallback answer generation failed to start (${candidate.label})`, fallbackError);
        }
      }

      if (!streamResult) {
        return NextResponse.json(
          {
            error: formatModelError(lastFallbackError),
            code: "MODEL_GENERATION_FAILED",
          },
          { status: 503 },
        );
      }
    }

    return streamResult.toDataStreamResponse({
      headers: {
        "x-session-id": finalSessionId,
        "x-rag-grounded": retrieval.grounded ? "1" : "0",
        "x-rag-chunks": String(retrieval.chunks.length),
        "x-subject-context": sessionSubjectContext ?? "",
        "x-thinking-enabled": thinkingBudget > 0 ? "1" : "0",
        "x-answer-mode": autoModeSelection.mode,
        "x-answer-mode-reason": autoModeSelection.reason,
        "x-matched-scope": matchedScope,
        "x-answer-model": usedFallback ? fallbackModelName ?? activeModelName : activeModelName,
        "x-answer-fallback": usedBackupFallback ? "1" : "0",
        "x-answer-quality-rescue": "0",
        "x-answer-fallback-reason": fallbackReason ?? "",
        "x-rag-ms": String(retrievalMs),
        "x-total-ms": String(Date.now() - requestStartedAt),
      }
    });
  } catch (error) {
    console.error("Chat route failed", error);
    const message =
      error instanceof Error ? error.message : "Unexpected server error while processing chat.";

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
