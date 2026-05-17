import { createGoogleGenerativeAI } from "@ai-sdk/google";
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
import { ensureStarterCreditsForUser, getCreditBalanceForUser } from "@/lib/data/billing";
import { getGeminiEnv } from "@/lib/env";
import { normalizeBoard, normalizeBoardScore, normalizeCollege, normalizeFullName, normalizeGrade, normalizeSubjectLabel, normalizeSubjects, normalizeTargetGrade } from "@/lib/profile-normalization";
import { containsDevanagari, needsEnglishRewrite, needsRomanNepaliRewrite } from "@/lib/roman-nepali";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { deriveSessionTitle } from "@/lib/utils";

const requestSchema = z.object({
  sessionId: z.string().uuid().nullable().optional(),
  language: z.enum(["EN", "RN"]).default("EN"),
  messageLanguage: z.enum(["EN", "RN"]).optional(),
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

function selectAutoAnswerMode(question: string): {
  mode: AnswerMode;
  reason: string;
} {
  const normalized = question.trim().toLowerCase();
  const tokenCount = normalized.split(/\s+/).filter(Boolean).length;

  const deepHints = [
    /\b(compare|difference|justify|analyze|analysis|evaluate|critically)\b/,
    /\bstep[-\s]?by[-\s]?step\b/,
    /\bprove|deriv(e|ation)|deduce\b/,
    /\bsolve|numerical|equation|calculate|formula\b/,
    /\bwhy\b.*\bhow\b/,
    /\bexplain\b.*\bdetail\b/,
    /\bpros and cons\b/,
    /\bcase study\b/,
  ];

  const hasDeepHint = deepHints.some((pattern) => pattern.test(normalized));
  if (hasDeepHint) {
    return { mode: "deep", reason: "complexity-hint" };
  }

  if (tokenCount >= 18) {
    return { mode: "deep", reason: "long-question" };
  }

  return { mode: "quick", reason: "default-fast" };
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
  groundingContext,
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
  groundingContext: string;
}) {
  const languageInstruction =
    language === "RN"
      ? [
          "Respond in Roman Nepali only: Nepali language written with Latin letters.",
          "Do not use Devanagari Nepali characters at all.",
          "Keep answers short by default, using simple student-friendly words.",
          "For numericals, show only the needed formula, substitution, and final answer.",
        ].join(" ")
      : "Respond in clear English. Keep the explanation student-friendly, concise, and structured.";

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
- Be accurate, structured, and concise.
- Prefer exam-helpful explanations over generic theory dumps.
- If needed, break answers into steps.
- ${languageInstruction}
- Do not greet, do not introduce yourself, and do not add filler like "Hello" or "Namaste" unless the student asks.
- If syllabus grounding is provided, prioritize it and do not invent citations.
- If the student asks in Roman Nepali, understand the intent, but always keep the output in the selected response language.
- Avoid long textbook-style paragraphs unless the student explicitly asks for detail.

Grounding context:
${groundingContext || "No syllabus context was retrieved for this question."}
`.trim();
}

async function suggestFollowUps({
  gemini,
  model,
  question,
  answer,
  language,
  subjectContext,
  followupMaxOutputTokens,
  followupThinkingBudget,
}: {
  gemini: ReturnType<typeof createGoogleGenerativeAI>;
  model: string;
  question: string;
  answer: string;
  language: "EN" | "RN";
  subjectContext: string | null;
  followupMaxOutputTokens: number;
  followupThinkingBudget: number;
}) {
  const responseLanguage =
    language === "RN"
      ? "Roman Nepali written only with Latin letters, never Devanagari"
      : "English";

  const { text } = await generateText({
    model: gemini(model),
    temperature: 0.4,
    maxTokens: followupMaxOutputTokens,
    providerOptions: {
      google: {
        thinkingConfig: {
          thinkingBudget: followupThinkingBudget,
        },
      },
    },
    prompt: `
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
    `.trim(),
  });

  return parseFollowUpSuggestions(text);
}

async function enforceAnswerLanguageContract({
  gemini,
  model,
  question,
  answer,
  language,
  subjectContext,
  rewriteMaxOutputTokens,
  rewriteThinkingBudget,
}: {
  gemini: ReturnType<typeof createGoogleGenerativeAI>;
  model: string;
  question: string;
  answer: string;
  language: "EN" | "RN";
  subjectContext: string | null;
  rewriteMaxOutputTokens: number;
  rewriteThinkingBudget: number;
}) {
  if (!needsRomanNepaliRewrite(answer, language) && !needsEnglishRewrite(answer, language)) {
    return answer;
  }

  const rewriteRules =
    language === "RN"
      ? [
          "- Output Roman Nepali only: Nepali language written with Latin letters.",
          "- Never use Devanagari characters.",
          "- Keep it short and student-friendly.",
        ]
      : [
          "- Output English only.",
          "- Do not use Roman Nepali or Devanagari Nepali.",
          "- Keep it short and student-friendly.",
        ];

  const { text } = await generateText({
    model: gemini(model),
    temperature: 0.2,
    maxTokens: rewriteMaxOutputTokens,
    providerOptions: {
      google: {
        thinkingConfig: {
          thinkingBudget: rewriteThinkingBudget,
        },
      },
    },
    prompt: `
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
    `.trim(),
  });

  const rewritten = text.trim();
  if (!rewritten) return answer;

  if (containsDevanagari(rewritten) && !containsDevanagari(answer)) {
    return answer;
  }

  return rewritten;
}

function buildNoGroundingMessage({
  language,
  subjectContext,
}: {
  language: "EN" | "RN";
  subjectContext: string | null;
}) {
  if (language === "RN") {
    const subjectHint = subjectContext
      ? ` "${subjectContext}" ko specific unit/chapter ko question sodhnuhos.`
      : " specific subject ra chapter mention garnuhos.";
    return `Yo question ko lagi syllabus source context bhetena, so ma guess garera answer didina.${subjectHint}`;
  }

  const subjectHint = subjectContext
    ? ` Try asking a specific unit/chapter within "${subjectContext}".`
    : " Try adding a specific subject and chapter.";
  return `I could not find grounded syllabus context for this question, so I will not guess an answer.${subjectHint}`;
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
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const parsed = requestSchema.parse(await request.json());
    const resolvedLanguage = parsed.messageLanguage ?? parsed.language;
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

    let retrieval: RetrievalResult;

    try {
      retrieval = await retrieveKnowledgeChunks(latestUserMessage.content, profile, {
        subjectContext: sessionSubjectContext,
      });
    } catch (retrievalError) {
      console.error("RAG retrieval failed", retrievalError);
      return NextResponse.json(
        {
          error:
            "We could not load syllabus context for this question right now. Please try again in a moment.",
          code: "RAG_RETRIEVAL_FAILED",
        },
        { status: 503 },
      );
    }

    if (!retrieval.grounded || retrieval.chunks.length === 0) {
      return NextResponse.json(
        {
          error: buildNoGroundingMessage({
            language: resolvedLanguage,
            subjectContext: sessionSubjectContext,
          }),
          code: "RAG_NO_GROUNDED_CONTEXT",
        },
        { status: 422 },
      );
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

    const autoModeSelection = selectAutoAnswerMode(latestUserMessage.content);

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
        },
      });
    }

    const {
      apiKey,
      model: defaultModel,
      maxOutputTokens: defaultMaxOutputTokens,
      thinkingBudget: defaultThinkingBudget,
      rewriteMaxOutputTokens,
      rewriteThinkingBudget,
      followupMaxOutputTokens,
      followupThinkingBudget,
    } = getGeminiEnv();
    const quickModel = process.env.GEMINI_QUICK_MODEL || defaultModel;
    const deepModel = process.env.GEMINI_DEEP_MODEL || defaultModel;
    const quickMaxOutputTokens = Number(
      process.env.GEMINI_QUICK_MAX_OUTPUT_TOKENS || Math.max(300, Math.floor(defaultMaxOutputTokens * 0.7)),
    );
    const deepMaxOutputTokens = Number(
      process.env.GEMINI_DEEP_MAX_OUTPUT_TOKENS || Math.max(defaultMaxOutputTokens, 1000),
    );
    const quickThinkingBudget = Number(
      process.env.GEMINI_QUICK_THINKING_BUDGET || Math.max(0, Math.floor(defaultThinkingBudget * 0.2)),
    );
    const deepThinkingBudget = Number(
      process.env.GEMINI_DEEP_THINKING_BUDGET || Math.max(defaultThinkingBudget, 512),
    );

    const model = autoModeSelection.mode === "deep" ? deepModel : quickModel;
    const maxOutputTokens =
      autoModeSelection.mode === "deep" ? deepMaxOutputTokens : quickMaxOutputTokens;
    const thinkingBudget =
      autoModeSelection.mode === "deep" ? deepThinkingBudget : quickThinkingBudget;

    const gemini = createGoogleGenerativeAI({ apiKey });

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

    const result = streamText({
      model: gemini(model),
      maxTokens: maxOutputTokens,
      providerOptions: {
        google: {
          thinkingConfig: {
            thinkingBudget,
          },
        },
      },
      onError: async ({ error }) => {
        console.error("Chat stream error", error);
      },
      // Server-authoritative chat: do not trust client-supplied history.
      messages: promptMessages,
      system: buildSystemPrompt({
        fullName: profile.fullName,
        college: profile.college,
        board: profile.board,
        grade: profile.grade,
        boardScore: profile.boardScore,
        subjects: profile.subjects,
        targetGrade: profile.targetGrade,
        language: resolvedLanguage,
        subjectContext: sessionSubjectContext,
        groundingContext: buildGroundingPrompt(retrieval.chunks),
      }),
      onFinish: async ({ text }) => {
        let persistedAnswer = text;
        try {
          persistedAnswer = await enforceAnswerLanguageContract({
            gemini,
            model,
            question: latestUserMessage.content,
            answer: text,
            language: resolvedLanguage,
            subjectContext: sessionSubjectContext,
            rewriteMaxOutputTokens,
            rewriteThinkingBudget,
          });
        } catch (languageGuardError) {
          console.error("Failed to enforce response language contract", languageGuardError);
        }

        let followUpSuggestions: string[] = [];
        try {
          followUpSuggestions = await suggestFollowUps({
            gemini,
            model,
            question: latestUserMessage.content,
            answer: persistedAnswer,
            language: resolvedLanguage,
            subjectContext: sessionSubjectContext,
            followupMaxOutputTokens,
            followupThinkingBudget,
          });
        } catch (followUpError) {
          console.error("Failed to generate follow-up suggestions", followUpError);
        }

        const assistantMessageId = await persistAssistantCompletion({
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

        if (!assistantMessageId) {
          return;
        }
      },
    });

    return result.toDataStreamResponse({
      headers: {
        "x-session-id": finalSessionId,
        "x-rag-grounded": retrieval.grounded ? "1" : "0",
        "x-rag-chunks": String(retrieval.chunks.length),
        "x-subject-context": sessionSubjectContext ?? "",
        "x-thinking-enabled": thinkingBudget > 0 ? "1" : "0",
        "x-answer-mode": autoModeSelection.mode,
        "x-answer-mode-reason": autoModeSelection.reason,
      },
    });
  } catch (error) {
    console.error("Chat route failed", error);
    const message =
      error instanceof Error ? error.message : "Unexpected server error while processing chat.";

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
