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
import {
  listDeterministicChapters,
  listDeterministicQuestionBankEntries,
  listDeterministicSubjects,
  listDeterministicTopics,
} from "@/lib/data/knowledge-catalog";
import { findBestTopicCard } from "@/lib/data/topic-cards";
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
import type { AnswerStyle, AssistantAnswerTrace } from "@/lib/types";

const requestSchema = z.object({
  sessionId: z.string().uuid().nullable().optional(),
  language: z.enum(["EN", "RN"]).default("EN"),
  messageLanguage: z.enum(["EN", "RN"]).optional(),
  answerStyle: z.enum(["simple", "balanced", "detailed"]).optional(),
  retrievalMode: z.enum(["default", "chapter"]).optional(),
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
type QuestionStyle = "concept" | "numerical" | "derivation" | "compare";
type TopicCardContext = {
  title: string;
  chapter: string | null;
  keyTerms: string[];
  coreExplanation: string[];
  formulaSheet: string[];
  exampleLine: string | null;
  commonMistake: string | null;
  examAngle: string | null;
};
type TopicCardSource = "persisted" | "derived";
type ExamBankContext = {
  title: string;
  questions: string[];
};
const DEFAULT_RAG_TIMEOUT_MS = 3500;
const DEFAULT_MODEL_TIMEOUT_MS = 18000;
const DEFAULT_REWRITE_TIMEOUT_MS = 7000;
const DEFAULT_MAX_RETRIES = 0;

function resolvePromptHistoryLimit({
  retrievalMode,
  answerStyle,
}: {
  retrievalMode: "default" | "chapter";
  answerStyle: AnswerStyle;
}) {
  if (retrievalMode === "chapter") return 14;
  if (answerStyle === "detailed") return 12;
  if (answerStyle === "balanced") return 10;
  return 8;
}

function buildPromptMessagesFromRequest(
  messages: Array<{ role: "user" | "assistant"; content: string }>,
  maxMessages: number,
) {
  return messages
    .filter((message) => message.content.trim().length > 0)
    .slice(-maxMessages)
    .map((message) => ({
      role: message.role,
      content: message.content,
    }));
}

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

  if (/\bderive|derivation|prove|show that|deduce\b/.test(normalized)) {
    return "derivation";
  }

  if (
    /\bcalculate|find|solve|numerical\b/.test(normalized) ||
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
  const hasDerivationSignal = /\b(start with|from this|therefore|hence|substitute|differentiate|integrate|rearrange|let us derive)\b/i.test(
    trimmed,
  );

  if (answerStyle === "detailed" && words < 120) return true;
  if (answerStyle === "balanced" && words < 80) return true;
  if (questionStyle === "numerical" && !hasEquationSignal) return true;
  if (questionStyle === "derivation" && (!hasEquationSignal || !hasDerivationSignal)) return true;
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

  if (questionStyle === "derivation") {
    return [
      subjectHint,
      ...commonRules,
      ...styleGuidance,
      "For derivation questions, use this structure when useful:",
      "1. State what must be derived",
      "2. Write the governing principle or starting relation",
      "3. Mention assumptions or known relations if they matter",
      "4. Show the derivation step by step without skipping the final expression",
      "5. Box or clearly restate the final derived formula/result",
      "6. Explain the physical meaning or exam significance in one or two lines",
      language === "RN"
        ? "Roman Nepali ma technical derivation clear, ordered, ra complete bana."
        : "Keep the derivation technically complete, ordered, and exam-ready.",
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

function extractCandidateSentences(content: string) {
  return content
    .replace(/\r/g, " ")
    .replace(/\s+/g, " ")
    .split(/(?<=[.?!])\s+/)
    .map((line) => line.trim())
    .filter((line) => line.length >= 24);
}

function buildTopicCardContext({
  question,
  retrieval,
  questionStyle,
}: {
  question: string;
  retrieval: RetrievalResult;
  questionStyle: QuestionStyle;
}): TopicCardContext | null {
  if (!retrieval.grounded || retrieval.chunks.length === 0) return null;
  if (questionStyle !== "concept") return null;

  const dominantTopic =
    retrieval.chunks.find((chunk) => chunk.topic)?.topic ??
    retrieval.chunks.find((chunk) => chunk.chapter)?.chapter ??
    retrieval.chunks[0]?.sourceTitle ??
    null;
  if (!dominantTopic) return null;

  const selectedChunks = retrieval.chunks.filter((chunk) => {
    if (chunk.topic && chunk.topic.toLowerCase() === dominantTopic.toLowerCase()) return true;
    if (!chunk.topic && chunk.chapter && chunk.chapter.toLowerCase() === dominantTopic.toLowerCase()) return true;
    return false;
  });
  const workingSet = (selectedChunks.length > 0 ? selectedChunks : retrieval.chunks).slice(0, 4);
  const sentences = workingSet.flatMap((chunk) => extractCandidateSentences(chunk.content));
  const uniqueSentences: string[] = [];
  for (const sentence of sentences) {
    if (uniqueSentences.some((seen) => seen.toLowerCase() === sentence.toLowerCase())) continue;
    uniqueSentences.push(sentence);
    if (uniqueSentences.length >= 10) break;
  }

  const formulaSheet = uniqueSentences.filter((line) => /[=≈∝+\-/*^]|\bformula\b|\bequation\b/i.test(line)).slice(0, 3);
  const exampleLine =
    uniqueSentences.find((line) => /\bexample|application|practical|used\b/i.test(line)) ?? null;
  const commonMistake =
    uniqueSentences.find((line) => /\bmistake|confuse|remember|note that|do not\b/i.test(line)) ?? null;
  const chapter = workingSet.find((chunk) => chunk.chapter)?.chapter ?? null;
  const keyTerms = Array.from(
    new Set(
      workingSet
        .flatMap((chunk) => [chunk.topic, chunk.chapter])
        .filter(Boolean)
        .map((value) => value!.trim()),
    ),
  ).slice(0, 4);

  const examAngle =
    chapter || dominantTopic
      ? `For exams, focus on the definition, the governing relation/formula, and one clean application of ${dominantTopic}.`
      : null;

  const coreExplanation = uniqueSentences
    .filter((line) => line !== exampleLine && line !== commonMistake)
    .slice(0, formulaSheet.length > 0 ? 2 : 3);

  if (coreExplanation.length === 0 && formulaSheet.length === 0) return null;

  return {
    title: dominantTopic,
    chapter,
    keyTerms,
    coreExplanation,
    formulaSheet,
    exampleLine,
    commonMistake,
    examAngle,
  };
}

function mapStoredTopicCardToContext(card: Awaited<ReturnType<typeof findBestTopicCard>>): TopicCardContext | null {
  if (!card) return null;
  if (card.coreExplanation.length === 0 && card.formulaSheet.length === 0) return null;
  return {
    title: card.title || card.topic,
    chapter: card.chapter,
    keyTerms: card.keyTerms,
    coreExplanation: card.coreExplanation,
    formulaSheet: card.formulaSheet,
    exampleLine: card.exampleLine,
    commonMistake: card.commonMistake,
    examAngle: card.examAngle,
  };
}

async function resolveTopicCardContext({
  supabase,
  question,
  retrieval,
  questionStyle,
  board,
  grade,
  subject,
}: {
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>;
  question: string;
  retrieval: RetrievalResult;
  questionStyle: QuestionStyle;
  board: string;
  grade: string;
  subject: string | null;
}): Promise<{
  topicCard: TopicCardContext | null;
  topicCardSource: TopicCardSource | null;
}> {
  if (questionStyle !== "concept") {
    return { topicCard: null, topicCardSource: null };
  }

  const topChunk = retrieval.chunks[0];
  const persistedSubject = normalizeSubjectLabel(subject ?? topChunk?.subject ?? "");
  if (persistedSubject) {
    const storedTopicCard = await findBestTopicCard(
      {
        subject: persistedSubject,
        question,
        board,
        grade,
        chapter: topChunk?.chapter ?? null,
        topic: topChunk?.topic ?? null,
      },
      supabase,
    );
    const storedContext = mapStoredTopicCardToContext(storedTopicCard);
    if (storedContext) {
      return { topicCard: storedContext, topicCardSource: "persisted" };
    }
  }

  const derived = buildTopicCardContext({
    question,
    retrieval,
    questionStyle,
  });
  return {
    topicCard: derived,
    topicCardSource: derived ? "derived" : null,
  };
}

function formatTopicCardContextForPrompt(topicCard: TopicCardContext | null) {
  if (!topicCard) return "";
  const lines = [
    `Topic card title: ${topicCard.title}`,
    topicCard.chapter ? `Chapter / unit: ${topicCard.chapter}` : null,
    topicCard.keyTerms.length > 0 ? `Key terms: ${topicCard.keyTerms.join(", ")}` : null,
    topicCard.coreExplanation.length > 0
      ? ["Core explanation:", ...topicCard.coreExplanation.map((line) => `- ${line}`)].join("\n")
      : null,
    topicCard.formulaSheet.length > 0
      ? ["Formula sheet:", ...topicCard.formulaSheet.map((line) => `- ${line}`)].join("\n")
      : null,
    topicCard.commonMistake ? `Common mistake: ${topicCard.commonMistake}` : null,
    topicCard.examAngle ? `Exam angle: ${topicCard.examAngle}` : null,
    topicCard.exampleLine ? `Example or application: ${topicCard.exampleLine}` : null,
  ].filter(Boolean);

  return lines.join("\n");
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
  topicCardContext,
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
  topicCardContext: string;
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
- For engineering-grade answers, finish the reasoning fully. Do not stop halfway through a derivation, a calculation, or a comparison.
- If a retrieved source is incomplete or noisy, synthesize a cleaner answer from the best grounded evidence rather than copying the chunk wording.
- ${languageInstruction}
- Do not greet, do not introduce yourself, and do not add filler like "Hello" or "Namaste" unless the student asks.
- Never begin the answer with greetings such as "Hello", "Hi", "Hey", "Namaste", or "Namaskar".
- Start directly with the explanation, the answer, or the first useful heading.
- If textbook/study-material grounding is provided, you MUST use it as your primary source of truth.
- Base your entire explanation on the provided syllabus and textbook context. If the user asks for exam predictions or summaries not explicitly in the text, you may synthesize them based on the textbook topics, without apologizing or claiming you can't access the text.
- If grounded textbook or syllabus context is missing or too weak, you MAY use your own domain knowledge to fill the gap. However, this knowledge MUST perfectly align with the typical scope of the student's specific syllabus and textbook. Do not provide advanced or out-of-scope general knowledge.
- IMPORTANT: If you answer using your own syllabus-aligned domain knowledge because the textbook lacked the specific details, you MUST explicitly state at the beginning or end of your answer that you are providing standard textbook-aligned knowledge because the exact paragraph was missing from the provided scan.
- If the student asks in Roman Nepali, understand the intent, but always keep the output in the selected response language.
- Avoid shallow one-paragraph answers when the topic needs reasoning.
- Preferred answer style: ${answerStyle}.
- Never start the answer with metadata like "Matched:" or scope labels. Those belong to the UI, not the answer body.
- Use bullets or short sections when they improve clarity.
- If a topic card is provided, use it as the fast teaching skeleton before expanding from the grounded evidence.

Presentation contract:
- ${buildAnswerFormatGuidance({ language, questionStyle, subjectContext, answerStyle })}

Topic card context:
${topicCardContext || "No topic card context was prepared for this question."}

Grounding context:
${groundingContext || "No syllabus context was retrieved for this question."}
`.trim();
}

function buildChapterModeOutline(chunks: RetrievalResult["chunks"]) {
  const sectionTitles: string[] = [];
  let chapterTitle: string | null = null;

  for (const chunk of chunks) {
    if (!chapterTitle && chunk.chapter?.trim()) {
      chapterTitle = chunk.chapter.trim();
    }

    const candidate = (chunk.topic || chunk.chapter || "").trim();
    if (!candidate) continue;
    if (sectionTitles.some((seen) => seen.toLowerCase() === candidate.toLowerCase())) continue;
    sectionTitles.push(candidate);
    if (sectionTitles.length >= 8) break;
  }

  return {
    chapterTitle,
    sectionTitles,
  };
}

function buildChapterModeGuidance({
  language,
  matchedScope,
  chunks,
  topicCard,
}: {
  language: "EN" | "RN";
  matchedScope: string | null;
  chunks: RetrievalResult["chunks"];
  topicCard: TopicCardContext | null;
}) {
  const { chapterTitle, sectionTitles } = buildChapterModeOutline(chunks);
  const scopeLine = matchedScope || chapterTitle || "current grounded chapter";
  const orderedSections = sectionTitles.length > 0 ? sectionTitles : topicCard?.keyTerms || [];
  const sectionList =
    orderedSections.length > 0
      ? orderedSections.map((section, index) => `${index + 1}. ${section}`).join("\n")
      : language === "RN"
        ? "1. Core chapter overview\n2. Main concepts\n3. Key formulas\n4. Important applications"
        : "1. Core chapter overview\n2. Main concepts\n3. Key formulas\n4. Important applications";

  if (language === "RN") {
    return `
Chapter-mode guidance:
- Yo request full chapter / full unit style ho, so short generic answer nadinu.
- Scope lai "${scopeLine}" ko chapter/unit explanation ko rup ma treat gara.
- Answer ko start ma 2-3 line ko chapter overview deu.
- Tespachi sections lai yehi order ma explain gara:
${sectionList}
- Harek section मा concept -> important formula/relationship -> short implication/example ko structure follow gara.
- Retrieval ma dekhiyeko later sections skip nagara.
- Book ko context weak cha bhane guess nagara; grounded chunks ma dekhiyeko kura matra explain gara.
- UI le citations alag dekhauchha, so answer bhitra raw metadata nadinu.
`.trim();
  }

  return `
Chapter-mode guidance:
- This is a full chapter / full unit request, so do not answer with a short generic summary.
- Treat the scope as a structured chapter explanation for "${scopeLine}".
- Start with a 2-3 line chapter overview.
- Then explain the chapter in this sequence:
${sectionList}
- For each section, use the pattern: concept -> key formula/relationship -> implication/example.
- Do not skip later grounded sections just because an early chunk looked strong.
- If the textbook evidence is weak for a subpart, do not invent content; stay inside the grounded material.
- The UI handles citations separately, so do not dump raw metadata lines inside the answer.
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

  const rendered = renderPromptTemplate(template, {
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

  if (!input.topicCardContext) return rendered;

  return `${rendered}\n\nTopic card context:\n${input.topicCardContext}`.trim();
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
    /\b(?:chapter|chpater|chap|ch|unit)\s*(?:no\.?|number)?\s*(\d{1,2})(?:st|nd|rd|th)?\b/,
    /\b(\d{1,2})(?:st|nd|rd|th)\s*(?:chapter|chpater|chap|ch|unit)\b/,
  ];
  for (const pattern of numericPatterns) {
    const match = normalized.match(pattern);
    if (!match?.[1]) continue;
    const value = Number(match[1]);
    if (Number.isFinite(value)) return value;
  }

  const wordPatterns = [
    /\b(?:chapter|chpater|chap|ch|unit)\s+(first|one|second|two|third|three|fourth|four|fifth|five|sixth|six|seventh|seven|eighth|eight|ninth|nine|tenth|ten)\b/,
    /\b(first|one|second|two|third|three|fourth|four|fifth|five|sixth|six|seventh|seven|eighth|eight|ninth|nine|tenth|ten)\s+(?:chapter|chpater|chap|ch|unit)\b/,
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
  if (parseRequestedChapterUnitIndex(question) === null) return false;
  
  const normalized = question.trim().toLowerCase();
  
  // "what is unit 5 about?" or "tell me about chapter 3" → structure lookup
  if (/\babout\b/i.test(normalized)) return true;
  
  // Exact very short phrases (e.g., "chapter 3", "unit 3")
  if (/^(?:chapter|chpater|chap|ch|unit)\s*(?:no\.?|number)?\s*\d+(?:st|nd|rd|th)?$/i.test(normalized)) {
    return true;
  }
  
  // Reject deep-dive / explanation intents (but NOT if "about" was present — handled above)
  if (/\b(explain|describe|define|derivation|derive|prove|meaning|how|why|details?|deeply|elaborate|summary|summarize|samjhau|bujhau|bataau|buzhaideu)\b/i.test(normalized)) {
    return false;
  }
  
  // Explicit structure lookup intents
  return /\b(tell me|what is in|what is|topics?|list|outline|contents?|syllabus|structure|overview|show me)\b/i.test(normalized);
}

function isSubjectListQuestion(question: string) {
  const normalized = question.trim().toLowerCase();
  return (
    /\bsubjects?\b/.test(normalized) &&
    /\b(available|list|what|which|show|all)\b/.test(normalized)
  );
}

function isTopicListQuestion(question: string) {
  const normalized = question.trim().toLowerCase();
  return /\btopics?\b/.test(normalized);
}

function isChapterListQuestion(question: string) {
  const normalized = question.trim().toLowerCase();
  if (isTopicListQuestion(question)) return false;
  if (isStructureLookupQuestion(question)) return false;
  
  const test1 = /\b(full syllabus|syllabus outline|chapter list|unit list|units list|chapters list)\b/.test(normalized);
  const test2 = /\b(chapters?|units?|untis|chapters?)\b/.test(normalized);
  const test3 = /\b(available|list|what|which|show|all|total|how many|kati|k k|kati wata|kati ota|amount|amoutn|toal)\b/.test(normalized);
  
  console.log(`[DEBUG] isChapterListQuestion: normalized="${normalized}" test1=${test1} test2=${test2} test3=${test3}`);
  
  if (test1) return true;
  return test2 && test3;
}

function isFullSyllabusStructureQuestion(question: string) {
  return /\b(full syllabus|complete syllabus|entire syllabus|syllabus structure|full course outline|course structure)\b/i.test(
    question,
  );
}

function isExamQuestionBankQuestion(question: string) {
  return /\b(exam|important questions?|likely questions?|model questions?|question bank|viva|expected questions?|probable questions?)\b/i.test(
    question,
  );
}

function buildCatalogCitationLabel(scope: Array<string | null | undefined>) {
  return scope.filter(Boolean).join(" > ");
}

function buildRouteScopeDebug(scope: {
  board?: string | null;
  grade?: string | null;
  subject?: string | null;
  chapter?: string | null;
  mode?: string | null;
}) {
  return [
    scope.board || null,
    scope.grade || null,
    scope.subject || null,
    scope.chapter || null,
    scope.mode ? `mode=${scope.mode}` : null,
  ]
    .filter(Boolean)
    .join(" > ");
}

function buildAnswerTrace(input: {
  routePath: string;
  routeScopeDebug: string;
  retrievalMode: "default" | "chapter";
  answerMode: string;
  answerModeReason: string;
  matchedScope: string | null;
  topicCardUsed: boolean;
  topicCardTitle?: string | null;
  topicCardSource?: TopicCardSource | null;
  questionBankUsed: boolean;
  answerModel?: string | null;
  usedFallback?: boolean;
  usedQualityRescue?: boolean;
  fallbackReason?: string | null;
  grounded: boolean;
  ragChunks: number;
  ragMs: number;
  generationMs?: number;
  rewriteMs?: number;
  followupMs?: number;
  totalMs: number;
}): AssistantAnswerTrace {
  return {
    routePath: input.routePath,
    routeScopeDebug: input.routeScopeDebug,
    retrievalMode: input.retrievalMode,
    answerMode: input.answerMode,
    answerModeReason: input.answerModeReason,
    matchedScope: input.matchedScope,
    topicCardUsed: input.topicCardUsed,
    topicCardTitle: input.topicCardTitle ?? null,
    topicCardSource: input.topicCardSource ?? null,
    questionBankUsed: input.questionBankUsed,
    answerModel: input.answerModel ?? null,
    usedFallback: input.usedFallback ?? false,
    usedQualityRescue: input.usedQualityRescue ?? false,
    fallbackReason: input.fallbackReason ?? null,
    grounded: input.grounded,
    ragChunks: input.ragChunks,
    ragMs: input.ragMs,
    generationMs: input.generationMs ?? 0,
    rewriteMs: input.rewriteMs ?? 0,
    followupMs: input.followupMs ?? 0,
    totalMs: input.totalMs,
  };
}

function shouldRetryAssistantInsertWithoutMetadata(error: { message?: string; details?: string } | null) {
  const message = `${error?.message || ""} ${error?.details || ""}`.toLowerCase();
  return (
    message.includes("metadata") ||
    message.includes("schema cache") ||
    message.includes("could not find the 'metadata' column") ||
    message.includes("column metadata")
  );
}

function buildSyntheticCatalogRetrieval({
  subject,
  chapter,
  snippets,
  sourceLabel,
}: {
  subject: string;
  chapter?: string | null;
  snippets: Array<{
    id: string;
    documentId: string;
    content: string;
    topic?: string | null;
    sourceTitle?: string | null;
    sourceName?: string | null;
  }>;
  sourceLabel: string;
}): RetrievalResult {
  return {
    grounded: true,
    chunks: snippets.map((snippet, index) => ({
      id: snippet.id,
      documentId: snippet.documentId,
      board: "",
      grade: "",
      subject,
      chapter: chapter ?? null,
      topic: snippet.topic ?? null,
      content: snippet.content,
      sourceTitle: snippet.sourceTitle || sourceLabel,
      sourceName: snippet.sourceName || "academic-catalog",
      resourceKind: "syllabus",
      score: 1 - index * 0.01,
      chunkIndex: index,
    })),
    citations: snippets.map((snippet) => ({
      chunkId: snippet.id,
      documentId: snippet.documentId,
      sourceType: "syllabus" as const,
      sourceLabel,
      sourceTitle: snippet.sourceTitle || sourceLabel,
      sourceName: snippet.sourceName || "academic-catalog",
      subject,
      chapter: chapter ?? null,
      topic: snippet.topic ?? null,
      excerpt: snippet.content,
    })),
  };
}

function extractQuestionBankLines(content: string) {
  const lines = content
    .replace(/\r/g, "\n")
    .split("\n")
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean);
  const candidates = new Set<string>();
  for (const line of lines) {
    if (
      /\?$/.test(line) ||
      /^(?:q\.?|question|long question|short question|very short|define|derive|explain|state|list|compare|distinguish|write|discuss)\b/i.test(
        line,
      )
    ) {
      candidates.add(line.replace(/^(?:q\.?\s*\d*[:.)-]?\s*)/i, "").trim());
    }
  }
  if (candidates.size > 0) return Array.from(candidates);

  return content
    .replace(/\r/g, " ")
    .replace(/\s+/g, " ")
    .split(/(?<=[?!.])\s+/)
    .map((line) => line.trim())
    .filter((line) =>
      /\?$/.test(line) ||
      /^(?:define|derive|explain|state|list|compare|distinguish|write|discuss)\b/i.test(line),
    );
}

function buildExamBankContext({
  question,
  retrieval,
}: {
  question: string;
  retrieval: RetrievalResult;
}): ExamBankContext | null {
  if (!isExamQuestionBankQuestion(question)) return null;
  const examChunks = retrieval.chunks.filter((chunk) => chunk.resourceKind === "question_bank");
  if (examChunks.length === 0) return null;
  const questions: string[] = [];
  for (const chunk of examChunks) {
    for (const line of extractQuestionBankLines(chunk.content)) {
      if (questions.some((seen) => seen.toLowerCase() === line.toLowerCase())) continue;
      questions.push(line);
      if (questions.length >= 8) break;
    }
    if (questions.length >= 8) break;
  }
  if (questions.length === 0) return null;
  return {
    title:
      examChunks.find((chunk) => chunk.chapter)?.chapter ??
      examChunks.find((chunk) => chunk.topic)?.topic ??
      examChunks[0]?.sourceTitle ??
      "Question bank",
    questions,
  };
}

function resolveDeterministicSubjectContext({
  subjectContext,
  profileSubjects,
}: {
  subjectContext: string | null;
  profileSubjects: string[];
}) {
  if (subjectContext?.trim()) {
    const trimmed = subjectContext.trim();
    const subjectPart = trimmed.includes(">") ? trimmed.split(">")[0].trim() : trimmed;
    return subjectPart;
  }
  return profileSubjects.length === 1 ? profileSubjects[0] : null;
}

function resolveRequestedChapterLabel(
  question: string,
  chapters: Array<{ chapter: string }>,
  subject?: string | null
) {
  const chapterIndex = parseRequestedChapterUnitIndex(question);
  if (chapterIndex) {
    if (subject && /engineering\s*physics/i.test(subject) && SH402_UNIT_BY_INDEX[chapterIndex]) {
      return SH402_UNIT_BY_INDEX[chapterIndex];
    }
    const expectedRegex = new RegExp(`\\b(?:unit|chapter)\\s*${chapterIndex}\\b`, "i");
    const matched = chapters.find((c) => expectedRegex.test(c.chapter));
    if (matched) return matched.chapter;

    return chapters[chapterIndex - 1]?.chapter ?? null;
  }

  const normalizedQuestion = question.trim().toLowerCase();
  for (const chapter of chapters) {
    if (normalizedQuestion.includes(chapter.chapter.toLowerCase())) {
      return chapter.chapter;
    }
  }

  return null;
}

function isFullChapterIntent(question: string) {
  return /\b(full|entire|whole)\s+(chapter|unit)\b|\b(chapter|unit)\s+in\s+detail\b|\bgive me (the )?(full|entire|whole)\s+(chapter|unit)\b/i.test(
    question,
  );
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
  const filteredChunks = retrieval.chunks.filter((chunk) => chunk.resourceKind === "syllabus");
  
  return {
    answer: sanitizeAnswerPresentation(answer),
    matchedScope,
    filteredRetrieval: {
      ...retrieval,
      chunks: filteredChunks,
      grounded: true,
      citations: filteredChunks.map((c) => ({
        chunkId: c.id,
        documentId: c.documentId,
        sourceType: "syllabus" as const,
        sourceLabel: c.sourceTitle,
        sourceTitle: c.sourceTitle,
        sourceName: c.sourceName,
        subject: c.subject,
        chapter: c.chapter,
        topic: c.topic,
      })),
    },
  };
}

async function buildDeterministicCatalogAnswer({
  supabase,
  question,
  language,
  subjectContext,
  profile,
}: {
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>;
  question: string;
  language: "EN" | "RN";
  subjectContext: string | null;
  profile: { board: string; grade: string; subjects: string[] };
}) {
  const effectiveSubject = resolveDeterministicSubjectContext({
    subjectContext,
    profileSubjects: profile.subjects,
  });
  const isFullSyllabusRequest = isFullSyllabusStructureQuestion(question);

  if (isSubjectListQuestion(question)) {
    const subjects = await listDeterministicSubjects(
      { board: profile.board, grade: profile.grade },
      supabase,
    );
    if (!subjects.length) return null;

    const scopeLabel = buildCatalogCitationLabel([profile.board, profile.grade, "Subject catalog"]);
    const answer =
      language === "RN"
        ? [
            `${profile.board || "Yo board"} ${profile.grade || "yo level"} ko lagi available subjects:`,
            ...subjects.map((subject) => `- ${subject}`),
          ].join("\n")
        : [
            `Available subjects for ${profile.board || "this board"} ${profile.grade || "this level"}:`,
            ...subjects.map((subject) => `- ${subject}`),
          ].join("\n");

    return {
      answer,
      matchedScope: scopeLabel,
      subjectContextOverride: subjectContext,
      filteredRetrieval: buildSyntheticCatalogRetrieval({
        subject: effectiveSubject || "General",
        sourceLabel: scopeLabel,
        snippets: subjects.map((subject, index) => ({
          id: `catalog-subject-${index + 1}`,
          documentId: `catalog-subject-${index + 1}`,
          content: subject,
          topic: subject,
          sourceTitle: "Academic subject catalog",
          sourceName: "academic-catalog",
        })),
      }),
      answerModeReason: "subject_chapter_topic_list",
      routePath: "deterministic_catalog",
    };
  }

  if (isChapterListQuestion(question)) {
    if (!effectiveSubject) {
      const subjects = await listDeterministicSubjects(
        { board: profile.board, grade: profile.grade },
        supabase,
      );
      const answer =
        language === "RN"
          ? [
              "Chapter list dine lai pahila exact subject choose garnu parcha.",
              subjects.length > 0 ? `Available subjects: ${subjects.join(", ")}` : "",
            ]
              .filter(Boolean)
              .join("\n")
          : [
              "To list chapters accurately, I need the exact subject first.",
              subjects.length > 0 ? `Available subjects: ${subjects.join(", ")}` : "",
            ]
              .filter(Boolean)
              .join("\n");
      return {
        answer,
        matchedScope: buildCatalogCitationLabel([profile.board, profile.grade, "Subject selection required"]),
        subjectContextOverride: subjectContext,
        filteredRetrieval: buildSyntheticCatalogRetrieval({
          subject: "General",
          sourceLabel: "Academic subject catalog",
          snippets: subjects.map((subject, index) => ({
            id: `catalog-subject-${index + 1}`,
            documentId: `catalog-subject-${index + 1}`,
            content: subject,
            topic: subject,
          })),
        }),
        answerModeReason: "subject_chapter_topic_list",
        routePath: "deterministic_catalog",
      };
    }

    let chapters = await listDeterministicChapters(
      { board: profile.board, grade: profile.grade, subject: effectiveSubject },
      supabase,
    );
    
    // Fallback: If no chapters found and we have a profile subject, try that
    if (!chapters.length && profile.subjects.length > 0 && effectiveSubject !== profile.subjects[0]) {
      chapters = await listDeterministicChapters(
        { board: profile.board, grade: profile.grade, subject: profile.subjects[0] },
        supabase,
      );
    }
    
    if (!chapters.length) return null;

    if (isFullSyllabusRequest) {
      const chapterTopicRows = await Promise.all(
        chapters.map(async (chapter) => ({
          chapter,
          topics: await listDeterministicTopics(
            {
              board: profile.board,
              grade: profile.grade,
              subject: effectiveSubject,
              chapter: chapter.chapter,
            },
            supabase,
          ),
        })),
      );

      const scopeLabel = buildCatalogCitationLabel([
        profile.board,
        profile.grade,
        effectiveSubject,
        "Full syllabus structure",
      ]);
      const answerLines =
        language === "RN"
          ? [
              `${effectiveSubject} ko full syllabus structure (${chapters.length} chapters/units):`,
              ...chapterTopicRows.flatMap(({ chapter, topics }, index) => {
                const topicLines =
                  topics.length > 0
                    ? topics.map((topic, topicIndex) => `   - ${index + 1}.${topicIndex + 1} ${topic.topic}`)
                    : ["   - Topics not indexed yet"];
                return [`${index + 1}. ${chapter.chapter}`, ...topicLines];
              }),
            ]
          : [
              `Full syllabus structure for ${effectiveSubject} (${chapters.length} chapters/units):`,
              ...chapterTopicRows.flatMap(({ chapter, topics }, index) => {
                const topicLines =
                  topics.length > 0
                    ? topics.map((topic, topicIndex) => `   - ${index + 1}.${topicIndex + 1} ${topic.topic}`)
                    : ["   - Topics are not indexed yet"];
                return [`${index + 1}. ${chapter.chapter}`, ...topicLines];
              }),
            ];

      const syntheticSnippets = chapterTopicRows.flatMap(({ chapter, topics }, index) => [
        {
          id: `catalog-syllabus-${index + 1}`,
          documentId: chapter.documentId,
          content: chapter.chapter,
          topic: chapter.chapter,
          sourceTitle: chapter.title,
          sourceName: chapter.sourceName,
        },
        ...topics.map((topic) => ({
          id: topic.chunkId,
          documentId: topic.documentId,
          content: topic.contentPreview,
          topic: topic.topic,
          sourceTitle: topic.sourceTitle,
          sourceName: topic.sourceName,
        })),
      ]);

      return {
        answer: answerLines.join("\n"),
        matchedScope: scopeLabel,
        subjectContextOverride: effectiveSubject,
        filteredRetrieval: buildSyntheticCatalogRetrieval({
          subject: effectiveSubject,
          sourceLabel: scopeLabel,
          snippets: syntheticSnippets,
        }),
        answerModeReason: "full_syllabus_structure",
        routePath: "deterministic_catalog",
      };
    }

    const scopeLabel = buildCatalogCitationLabel([profile.board, profile.grade, effectiveSubject]);
    const answer =
      language === "RN"
        ? [
            `${effectiveSubject} ko available chapters/units:`,
            ...chapters.map((chapter, index) => `- ${index + 1}. ${chapter.chapter}`),
          ].join("\n")
        : [
            `Available chapters/units for ${effectiveSubject}:`,
            ...chapters.map((chapter, index) => `- ${index + 1}. ${chapter.chapter}`),
          ].join("\n");

    return {
      answer,
      matchedScope: scopeLabel,
      subjectContextOverride: effectiveSubject,
      filteredRetrieval: buildSyntheticCatalogRetrieval({
        subject: effectiveSubject,
        sourceLabel: scopeLabel,
        snippets: chapters.map((chapter, index) => ({
          id: `catalog-chapter-${index + 1}`,
          documentId: chapter.documentId,
          content: chapter.chapter,
          topic: chapter.chapter,
          sourceTitle: chapter.title,
          sourceName: chapter.sourceName,
        })),
      }),
      answerModeReason: "subject_chapter_topic_list",
      routePath: "deterministic_catalog",
    };
  }

  if (
    isStructureLookupQuestion(question) &&
    !isTopicListQuestion(question) &&
    !isExamQuestionBankQuestion(question)
  ) {
    if (!effectiveSubject) return null;

    const chapters = await listDeterministicChapters(
      { board: profile.board, grade: profile.grade, subject: effectiveSubject },
      supabase,
    );
    const requestedChapter = resolveRequestedChapterLabel(question, chapters, effectiveSubject);
    if (!requestedChapter) return null;

    const chapterPosition = chapters.findIndex(
      (chapter) => chapter.chapter.toLowerCase() === requestedChapter.toLowerCase(),
    );
    const chapterNumber = chapterPosition >= 0 ? chapterPosition + 1 : null;
    const topics = await listDeterministicTopics(
      {
        board: profile.board,
        grade: profile.grade,
        subject: effectiveSubject,
        chapter: requestedChapter,
      },
      supabase,
    );

    const scopeLabel = buildCatalogCitationLabel([
      profile.board,
      profile.grade,
      effectiveSubject,
      requestedChapter,
    ]);
    const topicLines = topics.slice(0, 10).map((topic, index) => `- ${index + 1}. ${topic.topic}`);
    const chapterLabel = chapterNumber
      ? `Chapter ${chapterNumber} is ${requestedChapter}`
      : `The matched chapter is ${requestedChapter}`;
    const answer =
      language === "RN"
        ? [
            `${effectiveSubject} ko ${chapterLabel.replace(" is ", " = ")}.`,
            topics.length > 0
              ? "Grounded syllabus/document bata yo chapter ka key topics:"
              : "Grounded catalog ma यो chapter छ, तर topics अझै indexed छैनन्।",
            ...topicLines,
          ].join("\n")
        : [
            `For ${effectiveSubject}, ${chapterLabel}.`,
            topics.length > 0
              ? "Based on the grounded syllabus/document, it covers:"
              : "This chapter exists in the grounded catalog, but its topics are not indexed yet.",
            ...topicLines,
          ].join("\n");

    const selectedChapter = chapters[chapterPosition] ?? chapters.find((chapter) => chapter.chapter === requestedChapter);
    return {
      answer: sanitizeAnswerPresentation(answer),
      matchedScope: scopeLabel,
      subjectContextOverride: effectiveSubject,
      filteredRetrieval: buildSyntheticCatalogRetrieval({
        subject: effectiveSubject,
        chapter: requestedChapter,
        sourceLabel: scopeLabel,
        snippets: [
          {
            id: `catalog-structure-${requestedChapter.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
            documentId: selectedChapter?.documentId ?? `catalog-structure-${requestedChapter}`,
            content: requestedChapter,
            topic: requestedChapter,
            sourceTitle: selectedChapter?.title ?? requestedChapter,
            sourceName: selectedChapter?.sourceName ?? "academic-catalog",
          },
          ...topics.slice(0, 10).map((topic) => ({
            id: topic.chunkId,
            documentId: topic.documentId,
            content: topic.contentPreview || topic.topic,
            topic: topic.topic,
            sourceTitle: topic.sourceTitle,
            sourceName: topic.sourceName,
          })),
        ],
      }),
      answerMode: "deterministic_structure_lookup",
      answerModeReason: "chapter_unit_lookup",
      routePath: "deterministic_structure",
    };
  }

  if (isTopicListQuestion(question)) {
    if (!effectiveSubject) return null;

    const chapters = await listDeterministicChapters(
      { board: profile.board, grade: profile.grade, subject: effectiveSubject },
      supabase,
    );
    const requestedChapter = resolveRequestedChapterLabel(question, chapters, effectiveSubject);
    if (!requestedChapter) return null;

    const topics = await listDeterministicTopics(
      {
        board: profile.board,
        grade: profile.grade,
        subject: effectiveSubject,
        chapter: requestedChapter,
      },
      supabase,
    );
    if (!topics.length) return null;

    const scopeLabel = buildCatalogCitationLabel([profile.board, profile.grade, effectiveSubject, requestedChapter]);
    const answer =
      language === "RN"
        ? [
            `${requestedChapter} ko main topics:`,
            ...topics.slice(0, 16).map((topic, index) => `- ${index + 1}. ${topic.topic}`),
          ].join("\n")
        : [
            `Main topics in ${requestedChapter}:`,
            ...topics.slice(0, 16).map((topic, index) => `- ${index + 1}. ${topic.topic}`),
          ].join("\n");

    return {
      answer,
      matchedScope: scopeLabel,
      subjectContextOverride: effectiveSubject,
      filteredRetrieval: buildSyntheticCatalogRetrieval({
        subject: effectiveSubject,
        chapter: requestedChapter,
        sourceLabel: scopeLabel,
        snippets: topics.slice(0, 16).map((topic) => ({
          id: topic.chunkId,
          documentId: topic.documentId,
          content: topic.contentPreview,
          topic: topic.topic,
          sourceTitle: topic.sourceTitle,
          sourceName: topic.sourceName,
        })),
      }),
      answerModeReason: "subject_chapter_topic_list",
      routePath: "deterministic_catalog",
    };
  }

  return null;
}

async function buildDeterministicExamBankAnswerFromCatalog({
  supabase,
  question,
  language,
  subjectContext,
  profile,
}: {
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>;
  question: string;
  language: "EN" | "RN";
  subjectContext: string | null;
  profile: { board: string; grade: string; subjects: string[] };
}) {
  if (!isExamQuestionBankQuestion(question)) return null;

  const effectiveSubject = resolveDeterministicSubjectContext({
    subjectContext,
    profileSubjects: profile.subjects,
  });
  if (!effectiveSubject) return null;

  const chapters = await listDeterministicChapters(
    { board: profile.board, grade: profile.grade, subject: effectiveSubject },
    supabase,
  );
  const requestedChapter = resolveRequestedChapterLabel(question, chapters, effectiveSubject);

  const entries = await listDeterministicQuestionBankEntries(
    {
      board: profile.board,
      grade: profile.grade,
      subject: effectiveSubject,
      chapter: requestedChapter,
    },
    supabase,
  );
  if (!entries.length) return null;

  const questions: string[] = [];
  for (const entry of entries) {
    for (const line of extractQuestionBankLines(entry.content)) {
      if (questions.some((seen) => seen.toLowerCase() === line.toLowerCase())) continue;
      questions.push(line);
      if (questions.length >= 8) break;
    }
    if (questions.length >= 8) break;
  }
  if (!questions.length) return null;

  const matchedScope = buildCatalogCitationLabel([
    profile.board,
    profile.grade,
    effectiveSubject,
    requestedChapter,
    "Question bank",
  ]);
  const answer =
    language === "RN"
      ? [
          `${effectiveSubject} ko likely exam-style questions${requestedChapter ? ` (${requestedChapter})` : ""}:`,
          ...questions.map((item, index) => `- ${index + 1}. ${item}`),
        ].join("\n")
      : [
          `Likely exam-style questions for ${effectiveSubject}${requestedChapter ? ` (${requestedChapter})` : ""}:`,
          ...questions.map((item, index) => `- ${index + 1}. ${item}`),
        ].join("\n");

  const filteredRetrieval = buildSyntheticCatalogRetrieval({
    subject: effectiveSubject,
    chapter: requestedChapter,
    sourceLabel: matchedScope,
    snippets: entries.slice(0, 8).map((entry) => ({
      id: entry.chunkId,
      documentId: entry.documentId,
      content: entry.content,
      topic: entry.topic,
      sourceTitle: entry.sourceTitle,
      sourceName: entry.sourceName,
    })),
  });

  filteredRetrieval.chunks = filteredRetrieval.chunks.map((chunk) => ({
    ...chunk,
    resourceKind: "question_bank" as const,
  }));
  filteredRetrieval.citations = filteredRetrieval.citations.map((citation) => ({
    ...citation,
    sourceType: "question_bank" as const,
  }));

  return {
    answer: sanitizeAnswerPresentation(answer),
    matchedScope,
    subjectContextOverride: effectiveSubject,
    filteredRetrieval,
    answerModeReason: "exam_question_bank",
    routePath: "deterministic_question_bank",
    questionBankUsed: true,
  };
}

async function buildDeterministicExamBankAnswer({
  question,
  language,
  subjectContext,
  retrieval,
}: {
  question: string;
  language: "EN" | "RN";
  subjectContext: string | null;
  retrieval: RetrievalResult;
}) {
  const examBank = buildExamBankContext({ question, retrieval });
  if (!examBank) return null;

  const scopeLabel = buildCatalogCitationLabel([
    subjectContext || retrieval.chunks[0]?.subject || "General",
    examBank.title,
    "Question bank",
  ]);
  const answer =
    language === "RN"
      ? [
          `${subjectContext || "Yo subject"} ko question-bank style likely exam questions:`,
          ...examBank.questions.map((item, index) => `- ${index + 1}. ${item}`),
        ].join("\n")
      : [
          `Likely exam-style questions for ${subjectContext || "this subject"}:`,
          ...examBank.questions.map((item, index) => `- ${index + 1}. ${item}`),
        ].join("\n");

  return {
    answer: sanitizeAnswerPresentation(answer),
    matchedScope: scopeLabel,
    answerModeReason: "exam_question_bank",
    routePath: "deterministic_question_bank",
    questionBankUsed: true,
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
  const unit = retrieval.chunks[0]?.chapter || null;

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

async function rescueLowQualityTechnicalAnswer({
  model,
  providerOptions,
  question,
  answer,
  language,
  subjectContext,
  answerStyle,
  questionStyle,
  systemPrompt,
  promptMessages,
  maxTokens,
  timeoutMs,
  maxRetries,
}: {
  model: ReturnType<ReturnType<typeof createGoogleGenerativeAI>> | ReturnType<ReturnType<typeof createOpenAI>>;
  providerOptions?: ProviderOptions;
  question: string;
  answer: string;
  language: "EN" | "RN";
  subjectContext: string | null;
  answerStyle: AnswerStyle;
  questionStyle: QuestionStyle;
  systemPrompt: string;
  promptMessages: Array<{ role: "user" | "assistant"; content: string }>;
  maxTokens: number;
  timeoutMs?: number;
  maxRetries: number;
}) {
  const sanitizedAnswer = sanitizeAnswerPresentation(answer);
  const needsRescue = looksLowQualityForTechnicalAnswer({
    answer: sanitizedAnswer,
    answerStyle,
    questionStyle,
    subjectContext,
  });

  if (!needsRescue) {
    return {
      answer: sanitizedAnswer,
      usedQualityRescue: false,
      rescueMs: 0,
    };
  }

  const rescueStartedAt = Date.now();
  try {
    const rescuePrompt =
      language === "RN"
        ? [
            "Yo answer technical roop ma weak, adho, wa over-short cha.",
            "Same grounded textbook/syllabus evidence bhitra basera answer lai feri lekh.",
            "Requirements:",
            "- siddhai answer bata suru gara, greeting nadinu",
            "- concept clearly explain gara",
            "- relevant formula cha bhane meaning saha deu",
            "- derivation/numerical ho bhane step haru complete gara",
            "- adho paragraph ma naroka",
            "- evidence ma nabhayeko kura invent nagara",
            "",
            `Original question: ${question}`,
            "",
            "Current weak answer:",
            sanitizedAnswer,
          ].join("\n")
        : [
            "The current answer is too weak, too short, or incomplete for this technical study question.",
            "Rewrite it using the SAME grounded textbook/syllabus evidence already provided in the system context.",
            "Requirements:",
            "- start directly with the answer, no greeting",
            "- explain the concept clearly",
            "- include the relevant formula and what each term means when useful",
            "- if this is a derivation or numerical answer, complete the steps fully",
            "- do not stop halfway through the explanation",
            "- do not invent facts beyond the grounded evidence",
            "",
            `Original question: ${question}`,
            "",
            "Current weak answer:",
            sanitizedAnswer,
          ].join("\n");

    const rescuePass = await withTimeout(
      generateText({
        model,
        maxRetries,
        maxTokens,
        providerOptions,
        system: systemPrompt,
        messages: [
          ...promptMessages,
          { role: "assistant", content: sanitizedAnswer },
          { role: "user", content: rescuePrompt },
        ],
      }),
      Math.max(4000, timeoutMs ?? DEFAULT_MODEL_TIMEOUT_MS),
      "Answer quality rescue",
    );

    const completedRescue = await completeAnswerIfTruncated({
      model,
      providerOptions,
      systemPrompt,
      promptMessages: [
        ...promptMessages,
        { role: "assistant", content: sanitizedAnswer },
        { role: "user", content: rescuePrompt },
      ],
      answer: rescuePass.text.trim(),
      maxTokens,
      finishReason: rescuePass.finishReason,
      timeoutMs,
      maxRetries,
    });

    const rescuedAnswer = sanitizeAnswerPresentation(completedRescue);
    const stillWeak = looksLowQualityForTechnicalAnswer({
      answer: rescuedAnswer,
      answerStyle,
      questionStyle,
      subjectContext,
    });

    return {
      answer: stillWeak ? sanitizedAnswer : rescuedAnswer,
      usedQualityRescue: !stillWeak,
      rescueMs: Date.now() - rescueStartedAt,
    };
  } catch (rescueError) {
    console.error("Quality rescue failed", rescueError);
    return {
      answer: sanitizedAnswer,
      usedQualityRescue: false,
      rescueMs: Date.now() - rescueStartedAt,
    };
  }
}

function shouldPreferDirectGeneration({
  retrievalMode,
  questionStyle,
  subjectContext,
}: {
  retrievalMode: "default" | "chapter";
  questionStyle: QuestionStyle;
  subjectContext: string | null;
}) {
  if (!isTechnicalSubject(subjectContext)) return false;
  return (
    questionStyle === "numerical" ||
    questionStyle === "derivation" ||
    questionStyle === "compare"
  );
}

function shouldRequireGroundedContext({
  question,
  subjectContext,
}: {
  question: string;
  subjectContext: string | null;
}) {
  if (subjectContext?.trim()) return true;

  const normalized = question.trim().toLowerCase();
  return (
    isStructureLookupQuestion(question) ||
    isFullChapterIntent(question) ||
    /\b(textbook|syllabus|chapter|unit|source|from the book|from textbook)\b/.test(normalized)
  );
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
  answerTrace,
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
  answerTrace?: AssistantAnswerTrace | null;
}) {
  const basePayload = {
    session_id: sessionId,
    role: "assistant" as const,
    content: answer,
    language,
    grounded: retrieval.grounded,
    citations: retrieval.citations,
    follow_up_suggestions: followUpSuggestions,
  };

  let assistantMessage: { id: string } | null = null;
  let assistantError: { message?: string; details?: string } | null = null;

  if (answerTrace) {
    const attempt = await supabase
      .from("chat_messages")
      .insert({
        ...basePayload,
        metadata: {
          answer_trace: answerTrace,
        },
      })
      .select("id")
      .single();
    assistantMessage = attempt.data;
    assistantError = attempt.error;
  }

  if (!assistantMessage && (!answerTrace || shouldRetryAssistantInsertWithoutMetadata(assistantError))) {
    const fallbackAttempt = await supabase
      .from("chat_messages")
      .insert(basePayload)
      .select("id")
      .single();
    assistantMessage = fallbackAttempt.data;
    assistantError = fallbackAttempt.error;
  }

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
    const retrievalMode = parsed.retrievalMode ?? "default";
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



    const currentBalance = await ensureStarterCreditsForUser(user.id);
    if (!canSpendCredits(currentBalance)) {
      return NextResponse.json(
        { error: "No credits left. Buy a plan to continue chatting." },
        { status: 402 },
      );
    }

    const profile = profileRow ? {
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
    } : {
      userId: user.id,
      fullName: user.user_metadata?.full_name || (user.email?.split("@")[0] ?? "Student"),
      college: "IOE",
      board: "IOE",
      grade: "Undergraduate",
      boardScore: null,
      subjects: ["Engineering Physics"],
      targetGrade: "A",
      languagePref: "EN" as const,
      role: "student" as const,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const requestHadExistingSession = Boolean(parsed.sessionId);
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
    const retrievalQuestion =
      retrievalMode === "chapter"
        ? `Give me the full chapter or full unit in detail for this topic, using sequential grounded sections from the indexed syllabus/textbook: ${latestUserMessage.content}`
        : latestUserMessage.content;

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
    const deterministicCatalogAnswer = await buildDeterministicCatalogAnswer({
      supabase,
      question: latestUserMessage.content,
      language: resolvedLanguage,
      subjectContext: sessionSubjectContext,
      profile: {
        board: profile.board,
        grade: profile.grade,
        subjects: profile.subjects,
      },
    });

    if (deterministicCatalogAnswer) {
      retrievalMs = Date.now() - retrievalStartedAt;
      retrieval = deterministicCatalogAnswer.filteredRetrieval;
      const deterministicAnswerMode: string =
        deterministicCatalogAnswer.answerMode ?? "deterministic_catalog_lookup";
      sessionSubjectContext =
        deterministicCatalogAnswer.subjectContextOverride ?? sessionSubjectContext;

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

      const answer = sanitizeAnswerPresentation(deterministicCatalogAnswer.answer);
      const followUpSuggestions = buildE2EFollowUpSuggestions({
        question: latestUserMessage.content,
        language: resolvedLanguage,
      });
      const routeScopeDebug = buildRouteScopeDebug({
        board: profile.board,
        grade: profile.grade,
        subject: sessionSubjectContext,
        mode: retrievalMode,
      });
      const totalMs = Date.now() - requestStartedAt;

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
        answerTrace: buildAnswerTrace({
          routePath: deterministicCatalogAnswer.routePath ?? "deterministic_catalog",
          routeScopeDebug,
          retrievalMode,
          answerMode: deterministicAnswerMode,
          answerModeReason:
            deterministicCatalogAnswer.answerModeReason ?? "subject_chapter_topic_list",
          matchedScope: deterministicCatalogAnswer.matchedScope,
          topicCardUsed: false,
          questionBankUsed: false,
          grounded: retrieval.grounded,
          ragChunks: retrieval.chunks.length,
          ragMs: retrievalMs,
          totalMs,
        }),
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
          "x-retrieval-mode": retrievalMode,
          "x-subject-context": sessionSubjectContext ?? "",
          "x-thinking-enabled": "0",
          "x-answer-mode": deterministicAnswerMode,
          "x-answer-mode-reason":
            deterministicCatalogAnswer.answerModeReason ?? "subject_chapter_topic_list",
          "x-matched-scope": deterministicCatalogAnswer.matchedScope,
          "x-route-path": deterministicCatalogAnswer.routePath ?? "deterministic_catalog",
          "x-route-scope-debug": routeScopeDebug,
          "x-topic-card-used": "0",
          "x-topic-card-title": "",
          "x-question-bank-used": "0",
          "x-answer-fallback": "0",
          "x-answer-quality-rescue": "0",
          "x-answer-fallback-reason": "",
          "x-rag-ms": String(retrievalMs),
          "x-generation-ms": "0",
          "x-rewrite-ms": "0",
          "x-followup-ms": "0",
          "x-total-ms": String(totalMs),
        },
      });
    }

    const deterministicExamBankCatalogAnswer = await buildDeterministicExamBankAnswerFromCatalog({
      supabase,
      question: latestUserMessage.content,
      language: resolvedLanguage,
      subjectContext: sessionSubjectContext,
      profile: {
        board: profile.board,
        grade: profile.grade,
        subjects: profile.subjects,
      },
    });

    if (deterministicExamBankCatalogAnswer) {
      retrievalMs = Date.now() - retrievalStartedAt;
      retrieval = deterministicExamBankCatalogAnswer.filteredRetrieval;
      sessionSubjectContext =
        deterministicExamBankCatalogAnswer.subjectContextOverride ?? sessionSubjectContext;

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

      const answer = sanitizeAnswerPresentation(deterministicExamBankCatalogAnswer.answer);
      const followUpSuggestions = buildE2EFollowUpSuggestions({
        question: latestUserMessage.content,
        language: resolvedLanguage,
      });
      const routeScopeDebug = buildRouteScopeDebug({
        board: profile.board,
        grade: profile.grade,
        subject: sessionSubjectContext,
        chapter: deterministicExamBankCatalogAnswer.matchedScope,
        mode: retrievalMode,
      });
      const totalMs = Date.now() - requestStartedAt;

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
        answerTrace: buildAnswerTrace({
          routePath: deterministicExamBankCatalogAnswer.routePath,
          routeScopeDebug,
          retrievalMode,
          answerMode: "deterministic_exam_lookup",
          answerModeReason: deterministicExamBankCatalogAnswer.answerModeReason,
          matchedScope: deterministicExamBankCatalogAnswer.matchedScope,
          topicCardUsed: false,
          questionBankUsed: true,
          grounded: retrieval.grounded,
          ragChunks: retrieval.chunks.length,
          ragMs: retrievalMs,
          totalMs,
        }),
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
          "x-retrieval-mode": retrievalMode,
          "x-subject-context": sessionSubjectContext ?? "",
          "x-thinking-enabled": "0",
          "x-answer-mode": "deterministic_exam_lookup",
          "x-answer-mode-reason": deterministicExamBankCatalogAnswer.answerModeReason,
          "x-matched-scope": deterministicExamBankCatalogAnswer.matchedScope,
          "x-route-path": deterministicExamBankCatalogAnswer.routePath,
          "x-route-scope-debug": routeScopeDebug,
          "x-topic-card-used": "0",
          "x-topic-card-title": "",
          "x-question-bank-used": "1",
          "x-answer-fallback": "0",
          "x-answer-quality-rescue": "0",
          "x-answer-fallback-reason": "",
          "x-rag-ms": String(retrievalMs),
          "x-generation-ms": "0",
          "x-rewrite-ms": "0",
          "x-followup-ms": "0",
          "x-total-ms": String(totalMs),
        },
      });
    }

    try {
      retrieval = await withTimeout(
        retrieveKnowledgeChunks(retrievalQuestion, profile, {
          subjectContext: sessionSubjectContext,
        }),
        Math.max(1000, ragTimeoutMs),
        "RAG retrieval",
      );
    } catch (retrievalError) {
      console.error("RAG retrieval failed; refusing ungrounded answer", retrievalError);
      retrieval = {
        grounded: false,
        chunks: [],
        citations: [],
      };
    } finally {
      retrievalMs = Date.now() - retrievalStartedAt;
    }

    // (Removed RAG_NO_GROUNDED_CONTEXT block: Hybrid RAG allows LLM to use general knowledge if chunks are empty)

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
      if (deterministicChapterAnswer.filteredRetrieval) {
        retrieval = deterministicChapterAnswer.filteredRetrieval;
      }
      const answer = deterministicChapterAnswer.answer;
      const followUpSuggestions = buildE2EFollowUpSuggestions({
        question: latestUserMessage.content,
        language: resolvedLanguage,
      });
      const routeScopeDebug = buildRouteScopeDebug({
        board: profile.board,
        grade: profile.grade,
        subject: sessionSubjectContext,
        chapter: matchedScope,
        mode: retrievalMode,
      });
      const totalMs = Date.now() - requestStartedAt;

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
        answerTrace: buildAnswerTrace({
          routePath: "deterministic_structure",
          routeScopeDebug,
          retrievalMode,
          answerMode: "deterministic_structure_lookup",
          answerModeReason: "chapter_unit_lookup",
          matchedScope,
          topicCardUsed: false,
          questionBankUsed: false,
          grounded: retrieval.grounded,
          ragChunks: retrieval.chunks.length,
          ragMs: retrievalMs,
          totalMs,
        }),
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
          "x-retrieval-mode": retrievalMode,
          "x-subject-context": sessionSubjectContext ?? "",
          "x-thinking-enabled": "0",
          "x-answer-mode": "deterministic_structure_lookup",
          "x-answer-mode-reason": "chapter_unit_lookup",
          "x-matched-scope": matchedScope,
          "x-route-path": "deterministic_structure",
          "x-route-scope-debug": routeScopeDebug,
          "x-topic-card-used": "0",
          "x-topic-card-title": "",
          "x-question-bank-used": "0",
          "x-answer-fallback": "0",
          "x-answer-quality-rescue": "0",
          "x-answer-fallback-reason": "",
          "x-rag-ms": String(retrievalMs),
          "x-generation-ms": "0",
          "x-rewrite-ms": "0",
          "x-followup-ms": "0",
          "x-total-ms": String(totalMs),
        },
      });
    }

    const deterministicExamBankAnswer = await buildDeterministicExamBankAnswer({
      question: latestUserMessage.content,
      language: resolvedLanguage,
      subjectContext: sessionSubjectContext,
      retrieval,
    });
    if (deterministicExamBankAnswer) {
      const answer = deterministicExamBankAnswer.answer;
      const followUpSuggestions = buildE2EFollowUpSuggestions({
        question: latestUserMessage.content,
        language: resolvedLanguage,
      });
      const routeScopeDebug = buildRouteScopeDebug({
        board: profile.board,
        grade: profile.grade,
        subject: sessionSubjectContext,
        chapter: deterministicExamBankAnswer.matchedScope,
        mode: retrievalMode,
      });
      const totalMs = Date.now() - requestStartedAt;

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
        answerTrace: buildAnswerTrace({
          routePath: deterministicExamBankAnswer.routePath,
          routeScopeDebug,
          retrievalMode,
          answerMode: "deterministic_exam_lookup",
          answerModeReason: deterministicExamBankAnswer.answerModeReason,
          matchedScope: deterministicExamBankAnswer.matchedScope,
          topicCardUsed: false,
          questionBankUsed: true,
          grounded: retrieval.grounded,
          ragChunks: retrieval.chunks.length,
          ragMs: retrievalMs,
          totalMs,
        }),
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
          "x-retrieval-mode": retrievalMode,
          "x-subject-context": sessionSubjectContext ?? "",
          "x-thinking-enabled": "0",
          "x-answer-mode": "deterministic_exam_lookup",
          "x-answer-mode-reason": deterministicExamBankAnswer.answerModeReason,
          "x-matched-scope": deterministicExamBankAnswer.matchedScope,
          "x-route-path": deterministicExamBankAnswer.routePath,
          "x-route-scope-debug": routeScopeDebug,
          "x-topic-card-used": "0",
          "x-topic-card-title": "",
          "x-question-bank-used": "1",
          "x-answer-fallback": "0",
          "x-answer-quality-rescue": "0",
          "x-answer-fallback-reason": "",
          "x-rag-ms": String(retrievalMs),
          "x-generation-ms": "0",
          "x-rewrite-ms": "0",
          "x-followup-ms": "0",
          "x-total-ms": String(totalMs),
        },
      });
    }

    const autoModeSelection = selectAutoAnswerMode(
      latestUserMessage.content,
      sessionSubjectContext,
    );
    const effectiveAnswerModeSelection =
      retrievalMode === "chapter"
        ? { mode: "quick" as const, reason: "chapter_mode_structured" }
        : autoModeSelection;
    const questionStyle = classifyQuestionStyle(latestUserMessage.content);
    const [{ topicCard, topicCardSource }, promptTemplates] = await Promise.all([
      resolveTopicCardContext({
        supabase,
        question: latestUserMessage.content,
        retrieval,
        questionStyle,
        board: profile.board,
        grade: profile.grade,
        subject: sessionSubjectContext,
      }),
      getActivePromptTemplateMap(),
    ]);

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
      const routePath = topicCard
        ? topicCardSource === "persisted"
          ? "persisted_topic_card_hybrid"
          : "topic_card_hybrid"
        : "e2e_fake_ai";
      const routeScopeDebug = buildRouteScopeDebug({
        board: profile.board,
        grade: profile.grade,
        subject: sessionSubjectContext,
        chapter: matchedScope,
        mode: retrievalMode,
      });
      const totalMs = Date.now() - requestStartedAt;
      const questionBankUsed = retrieval.chunks.some((chunk) => chunk.resourceKind === "question_bank");

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
        answerTrace: buildAnswerTrace({
          routePath,
          routeScopeDebug,
          retrievalMode,
          answerMode: effectiveAnswerModeSelection.mode,
          answerModeReason: effectiveAnswerModeSelection.reason,
          matchedScope,
          topicCardUsed: Boolean(topicCard),
          topicCardTitle: topicCard?.title ?? null,
          topicCardSource,
          questionBankUsed,
          grounded: retrieval.grounded,
          ragChunks: retrieval.chunks.length,
          ragMs: retrievalMs,
          totalMs,
        }),
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
          "x-retrieval-mode": retrievalMode,
          "x-subject-context": sessionSubjectContext ?? "",
          "x-thinking-enabled": "1",
          "x-answer-mode": effectiveAnswerModeSelection.mode,
          "x-answer-mode-reason": effectiveAnswerModeSelection.reason,
          "x-matched-scope": matchedScope,
          "x-route-path": routePath,
          "x-route-scope-debug": routeScopeDebug,
          "x-topic-card-used": topicCard ? "1" : "0",
          "x-topic-card-title": topicCard?.title ?? "",
          "x-topic-card-source": topicCardSource ?? "",
          "x-question-bank-used": questionBankUsed ? "1" : "0",
          "x-answer-fallback": "0",
          "x-answer-quality-rescue": "0",
          "x-answer-fallback-reason": "",
          "x-rag-ms": String(retrievalMs),
          "x-generation-ms": "0",
          "x-rewrite-ms": "0",
          "x-followup-ms": "0",
          "x-total-ms": String(totalMs),
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
      const modelName = effectiveAnswerModeSelection.mode === "deep" ? deepModel : quickModel;
      activeModelName = modelName;
      maxOutputTokens =
        effectiveAnswerModeSelection.mode === "deep" ? deepMaxOutputTokens : quickMaxOutputTokens;
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
      if (effectiveAnswerModeSelection.mode === "quick" && deepModel !== quickModel) {
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

      const modelName = effectiveAnswerModeSelection.mode === "deep" ? deepModel : quickModel;
      activeModelName = modelName;
      maxOutputTokens =
        effectiveAnswerModeSelection.mode === "deep" ? deepMaxOutputTokens : quickMaxOutputTokens;
      thinkingBudget =
        effectiveAnswerModeSelection.mode === "deep" ? deepThinkingBudget : quickThinkingBudget;
      rewriteMaxOutputTokens = defaultRewriteMaxOutputTokens;
      followupMaxOutputTokens = defaultFollowupMaxOutputTokens;

      const gemini = createGoogleGenerativeAI({ apiKey });
      activeModel = gemini(modelName);
      rewriteModel = gemini(rewriteModelName);
      followupModel = gemini(followupModelName);
      if (effectiveAnswerModeSelection.mode === "quick" && deepModel !== quickModel) {
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

    const promptHistoryLimit = resolvePromptHistoryLimit({
      retrievalMode,
      answerStyle,
    });
    const promptHistoryStrategy = requestHadExistingSession ? "db_adaptive_window" : "request_window";
    let promptMessages: Array<{ role: "user" | "assistant"; content: string }> = [];

    if (requestHadExistingSession) {
      const { data: historyRows, error: historyError } = await supabase
        .from("chat_messages")
        .select("role, content")
        .eq("session_id", finalSessionId)
        .order("created_at", { ascending: false })
        .limit(promptHistoryLimit);

      if (historyError) {
        return NextResponse.json({ error: "Failed to load chat history." }, { status: 500 });
      }

      promptMessages = (historyRows ?? [])
        .slice()
        .reverse()
        .map((row) => ({
          role: row.role as "user" | "assistant",
          content: row.content as string,
        }));
    } else {
      promptMessages = buildPromptMessagesFromRequest(parsed.messages, promptHistoryLimit);
    }

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
      topicCardContext: formatTopicCardContextForPrompt(topicCard),
      questionStyle,
      answerStyle,
    });

    const chapterModeGuidance =
      retrievalMode === "chapter"
        ? buildChapterModeGuidance({
            language: resolvedLanguage,
            matchedScope,
            chunks: retrieval.chunks,
            topicCard,
          })
        : null;

    const systemPrompt =
      rewriteRules +
      "\n\n" +
      baseSystemPrompt +
      (chapterModeGuidance ? `\n\n${chapterModeGuidance}` : "");

    let answerText = "";
    let generationModel = activeModel;
    let generationProviderOptions = answerProviderOptions;
    let usedFallback = false;
    let usedBackupFallback = false;
    let usedQualityRescue = false;
    let fallbackReason: string | null = null;

    const generationStartedAt = Date.now();
    let streamResult;
    const routePath = retrievalMode === "chapter"
      ? topicCard
        ? topicCardSource === "persisted"
          ? "chapter_persisted_topic_card_hybrid"
          : "chapter_topic_card_hybrid"
        : retrieval.chunks.some((chunk) => chunk.resourceKind === "question_bank")
          ? "chapter_question_bank_hybrid"
          : "rag_answer_chapter"
      : topicCard
        ? topicCardSource === "persisted"
          ? "persisted_topic_card_hybrid"
          : "topic_card_hybrid"
        : retrieval.chunks.some((chunk) => chunk.resourceKind === "question_bank")
          ? "question_bank_hybrid"
          : "rag_answer";
    const routeScopeDebug = buildRouteScopeDebug({
      board: profile.board,
      grade: profile.grade,
      subject: sessionSubjectContext,
      chapter: matchedScope,
      mode: retrievalMode,
    });
    const questionBankUsed = retrieval.chunks.some((chunk) => chunk.resourceKind === "question_bank");
    const preferDirectGeneration = shouldPreferDirectGeneration({
      retrievalMode,
      questionStyle,
      subjectContext: sessionSubjectContext,
    });

    const handleStreamFinish = async ({ text }: { text: string }) => {
      const persistedAnswer = text;
      const generationFinishedAt = Date.now();
      let generationMs = generationFinishedAt - generationStartedAt;
      let followUpSuggestions: string[] = [];
      const shouldGenerateFollowUps = (process.env.CHAT_GENERATE_FOLLOWUPS || "0").trim() === "1";
      
      if (shouldGenerateFollowUps && followupModel) {
        const followupStartedAt = Date.now();
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
        } finally {
          followupMs = Date.now() - followupStartedAt;
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
          answerTrace: buildAnswerTrace({
            routePath,
            routeScopeDebug,
            retrievalMode,
            answerMode: effectiveAnswerModeSelection.mode,
            answerModeReason: effectiveAnswerModeSelection.reason,
            matchedScope,
            topicCardUsed: Boolean(topicCard),
            topicCardTitle: topicCard?.title ?? null,
            topicCardSource,
            questionBankUsed,
            answerModel: usedFallback ? fallbackModelName ?? activeModelName : activeModelName,
            usedFallback: usedBackupFallback,
            usedQualityRescue,
            fallbackReason,
            grounded: retrieval.grounded,
            ragChunks: retrieval.chunks.length,
            ragMs: retrievalMs,
            generationMs,
            rewriteMs,
            followupMs,
            totalMs: Date.now() - requestStartedAt,
          }),
        });
      } catch (dbError) {
        console.error("Failed to persist assistant completion in background", dbError);
      }
    };

    const persistDirectAnswer = async (persistedAnswer: string, persistedRoutePath: string) => {
      const generationFinishedAt = Date.now();
      const generationMs = generationFinishedAt - generationStartedAt;
      let followUpSuggestions: string[] = [];
      const shouldGenerateFollowUps = (process.env.CHAT_GENERATE_FOLLOWUPS || "0").trim() === "1";

      if (shouldGenerateFollowUps && followupModel) {
        const followupStartedAt = Date.now();
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
        } finally {
          followupMs = Date.now() - followupStartedAt;
        }
      }

      const totalMs = Date.now() - requestStartedAt;

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
        answerTrace: buildAnswerTrace({
          routePath: persistedRoutePath,
          routeScopeDebug,
          retrievalMode,
          answerMode: effectiveAnswerModeSelection.mode,
          answerModeReason: effectiveAnswerModeSelection.reason,
          matchedScope,
          topicCardUsed: Boolean(topicCard),
          topicCardTitle: topicCard?.title ?? null,
          topicCardSource,
          questionBankUsed,
          answerModel: usedFallback ? fallbackModelName ?? activeModelName : activeModelName,
          usedFallback: usedBackupFallback,
          usedQualityRescue,
          fallbackReason,
          grounded: retrieval.grounded,
          ragChunks: retrieval.chunks.length,
          ragMs: retrievalMs,
          generationMs,
          rewriteMs,
          followupMs,
          totalMs,
        }),
      });

      return { generationMs, totalMs };
    };

    if (preferDirectGeneration) {
      let directAnswer = "";

      const runDirectGeneration = async (
        model: typeof activeModel,
        providerOptions: typeof answerProviderOptions,
        maxTokens: number,
      ) =>
        withTimeout(
          generateText({
            model,
            maxRetries: chatMaxRetries,
            maxTokens,
            providerOptions,
            messages: promptMessages,
            system: systemPrompt,
          }),
          modelTimeoutMs,
          "Answer model timed out.",
        );

      try {
        const primaryResult = await runDirectGeneration(activeModel, answerProviderOptions, maxOutputTokens);
        directAnswer = sanitizeAnswerPresentation(primaryResult.text.trim());
      } catch (primaryError) {
        console.error("Primary direct answer generation failed", primaryError);
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

        let lastFallbackError: unknown = primaryError;
        for (const candidate of orderedFallbacks) {
          try {
            const fallbackResult = await runDirectGeneration(
              candidate.model,
              candidate.providerOptions,
              candidate.maxTokens,
            );
            directAnswer = sanitizeAnswerPresentation(fallbackResult.text.trim());
            generationModel = candidate.model;
            generationProviderOptions = candidate.providerOptions;
            usedFallback = true;
            usedBackupFallback = true;
            fallbackModelName = candidate.label;
            break;
          } catch (fallbackError) {
            lastFallbackError = fallbackError;
            console.error(`Fallback direct generation failed (${candidate.label})`, fallbackError);
          }
        }

        if (!directAnswer) {
          return NextResponse.json(
            {
              error: formatModelError(lastFallbackError),
              code: "MODEL_GENERATION_FAILED",
            },
            { status: 503 },
          );
        }
      }

      directAnswer = await completeAnswerIfTruncated({
        answer: directAnswer,
        providerOptions: generationProviderOptions,
        model: generationModel,
        systemPrompt,
        promptMessages,
        maxTokens: maxOutputTokens,
        maxRetries: chatMaxRetries,
      });

      if (enableQualityRescue) {
        const rescued = await rescueLowQualityTechnicalAnswer({
          answer: directAnswer,
          question: latestUserMessage.content,
          questionStyle,
          language: resolvedLanguage,
          subjectContext: sessionSubjectContext,
          answerStyle,
          model: qualityRescueModel ?? generationModel,
          providerOptions: qualityRescueProviderOptions ?? generationProviderOptions,
          systemPrompt,
          promptMessages,
          maxTokens: qualityRescueMaxTokens || maxOutputTokens,
          timeoutMs: modelTimeoutMs,
          maxRetries: chatMaxRetries,
        });
        directAnswer = rescued.answer;
        usedQualityRescue = rescued.usedQualityRescue;
      }

      directAnswer = await enforceAnswerLanguageContract({
        answer: directAnswer,
        language: resolvedLanguage,
        model: generationModel,
        providerOptions: generationProviderOptions,
        question: latestUserMessage.content,
        subjectContext: sessionSubjectContext,
        answerStyle,
        templates: promptTemplates,
        rewriteMaxOutputTokens,
        maxRetries: chatMaxRetries,
      });
      directAnswer = sanitizeAnswerPresentation(directAnswer);

      const persistedRoutePath = `${routePath}_direct`;
      const { generationMs, totalMs } = await persistDirectAnswer(directAnswer, persistedRoutePath);

      return new Response(toDataStreamPayload(directAnswer), {
        headers: {
          "Content-Type": "text/plain; charset=utf-8",
          "x-session-id": finalSessionId,
          "x-rag-grounded": retrieval.grounded ? "1" : "0",
          "x-rag-chunks": String(retrieval.chunks.length),
          "x-retrieval-mode": retrievalMode,
          "x-subject-context": sessionSubjectContext ?? "",
          "x-thinking-enabled": thinkingBudget > 0 ? "1" : "0",
          "x-answer-mode": effectiveAnswerModeSelection.mode,
          "x-answer-mode-reason": effectiveAnswerModeSelection.reason,
          "x-matched-scope": matchedScope,
          "x-route-path": persistedRoutePath,
          "x-route-scope-debug": routeScopeDebug,
          "x-topic-card-used": topicCard ? "1" : "0",
          "x-topic-card-title": topicCard?.title ?? "",
          "x-topic-card-source": topicCardSource ?? "",
          "x-question-bank-used": questionBankUsed ? "1" : "0",
          "x-history-strategy": promptHistoryStrategy,
          "x-history-messages": String(promptMessages.length),
          "x-answer-model": usedFallback ? fallbackModelName ?? activeModelName : activeModelName,
          "x-answer-fallback": usedBackupFallback ? "1" : "0",
          "x-answer-quality-rescue": usedQualityRescue ? "1" : "0",
          "x-answer-fallback-reason": fallbackReason ?? "",
          "x-rag-ms": String(retrievalMs),
          "x-generation-ms": String(generationMs),
          "x-rewrite-ms": String(rewriteMs),
          "x-followup-ms": String(followupMs),
          "x-total-ms": String(totalMs),
        },
      });
    }

    try {
      streamResult = await streamText({
        model: activeModel,
        maxRetries: chatMaxRetries,
        maxTokens: maxOutputTokens,
        providerOptions: answerProviderOptions,
        messages: promptMessages,
        system: systemPrompt,
        onFinish: handleStreamFinish,
        onError({ error }) {
          console.error("[STREAM_ERROR] Gemini stream error during generation:", error);
        },
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
        "x-retrieval-mode": retrievalMode,
        "x-subject-context": sessionSubjectContext ?? "",
        "x-thinking-enabled": thinkingBudget > 0 ? "1" : "0",
        "x-answer-mode": effectiveAnswerModeSelection.mode,
        "x-answer-mode-reason": effectiveAnswerModeSelection.reason,
        "x-matched-scope": matchedScope,
          "x-route-path": routePath,
          "x-route-scope-debug": routeScopeDebug,
          "x-topic-card-used": topicCard ? "1" : "0",
          "x-topic-card-title": topicCard?.title ?? "",
          "x-topic-card-source": topicCardSource ?? "",
        "x-question-bank-used": questionBankUsed ? "1" : "0",
        "x-history-strategy": promptHistoryStrategy,
        "x-history-messages": String(promptMessages.length),
        "x-answer-model": usedFallback ? fallbackModelName ?? activeModelName : activeModelName,
        "x-answer-fallback": usedBackupFallback ? "1" : "0",
        "x-answer-quality-rescue": usedQualityRescue ? "1" : "0",
        "x-answer-fallback-reason": fallbackReason ?? "",
        "x-rag-ms": String(retrievalMs),
        "x-total-ms": String(Date.now() - requestStartedAt),
      }
    });
  } catch (error) {
    console.error("Chat route failed", error);
    let message = "Unexpected server error while processing chat.";
    if (error instanceof Error) {
      message = error.message;
    } else if (error && typeof error === "object" && "message" in error) {
      message = String(error.message);
    } else {
      message = String(error);
    }

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
