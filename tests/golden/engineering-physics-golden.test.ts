import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  createSupabaseServerClient,
  ensureStarterCreditsForUser,
  getCreditBalanceForUser,
  retrieveKnowledgeChunks,
  streamText,
  generateText,
  createGoogleGenerativeAI,
  getActivePromptTemplateMap,
  listDeterministicSubjects,
  listDeterministicChapters,
  listDeterministicTopics,
  listDeterministicQuestionBankEntries,
  findBestTopicCard,
} = vi.hoisted(() => ({
  createSupabaseServerClient: vi.fn(),
  ensureStarterCreditsForUser: vi.fn(),
  getCreditBalanceForUser: vi.fn(),
  retrieveKnowledgeChunks: vi.fn(),
  streamText: vi.fn(),
  generateText: vi.fn(),
  createGoogleGenerativeAI: vi.fn(),
  getActivePromptTemplateMap: vi.fn(),
  listDeterministicSubjects: vi.fn(),
  listDeterministicChapters: vi.fn(),
  listDeterministicTopics: vi.fn(),
  listDeterministicQuestionBankEntries: vi.fn(),
  findBestTopicCard: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient,
}));

vi.mock("@/lib/data/billing", () => ({
  ensureStarterCreditsForUser,
  getCreditBalanceForUser,
}));

vi.mock("@/lib/ai/retrieval", async () => {
  const actual = await vi.importActual<typeof import("@/lib/ai/retrieval")>("@/lib/ai/retrieval");
  return {
    ...actual,
    retrieveKnowledgeChunks,
  };
});

vi.mock("@ai-sdk/google", () => ({
  createGoogleGenerativeAI,
}));

vi.mock("ai", () => ({
  streamText,
  generateText,
}));

vi.mock("@/lib/prompt-runtime", async () => {
  const actual = await vi.importActual<typeof import("@/lib/prompt-runtime")>("@/lib/prompt-runtime");
  return {
    ...actual,
    getActivePromptTemplateMap,
  };
});

vi.mock("@/lib/data/knowledge-catalog", async () => {
  const actual = await vi.importActual<typeof import("@/lib/data/knowledge-catalog")>("@/lib/data/knowledge-catalog");
  return {
    ...actual,
    listDeterministicSubjects,
    listDeterministicChapters,
    listDeterministicTopics,
    listDeterministicQuestionBankEntries,
  };
});

vi.mock("@/lib/data/topic-cards", async () => {
  const actual = await vi.importActual<typeof import("@/lib/data/topic-cards")>("@/lib/data/topic-cards");
  return {
    ...actual,
    findBestTopicCard,
  };
});

import { POST } from "@/app/api/chat/route";
import { goldenEngineeringPhysicsScenarios } from "@/tests/fixtures/golden-engineering-physics";

describe("Engineering Physics golden academic quality scenarios", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    createGoogleGenerativeAI.mockReturnValue(() => "mock-model");
    generateText.mockResolvedValue({ text: "Can you derive the wave equation?\nWhat is wave intensity?\nHow do stationary waves form?" });
    getActivePromptTemplateMap.mockResolvedValue({});
    listDeterministicSubjects.mockResolvedValue([]);
    listDeterministicChapters.mockResolvedValue([]);
    listDeterministicTopics.mockResolvedValue([]);
    listDeterministicQuestionBankEntries.mockResolvedValue([]);
    findBestTopicCard.mockResolvedValue(null);
  });

  function setupEngineeringPhysicsGoldenPath() {
    const creditsInsert = vi.fn(async () => ({ error: null }));
    const assistantInsertPayloads: unknown[] = [];

    const profileChain = {
      select: vi.fn(),
      eq: vi.fn(),
      maybeSingle: vi.fn(async () => ({
        data: {
          user_id: "user-1",
          full_name: "Engineering Student",
          college: "IOE",
          board: "ENGINEERING",
          grade: "Bachelor",
          board_score: "80%",
          subjects: ["Engineering Physics"],
          target_grade: "A",
          language_pref: "EN",
          role: "student",
          created_at: "2026-06-01T00:00:00.000Z",
          updated_at: "2026-06-01T00:00:00.000Z",
        },
      })),
    };
    profileChain.select.mockReturnValue(profileChain);
    profileChain.eq.mockReturnValue(profileChain);

    const sessionInsertSingle = vi.fn(async () => ({
      data: { id: "session-1", subject_tags: [], subject_context: "Engineering Physics" },
      error: null,
    }));
    const existingSessionMaybeSingle = vi.fn(async () => ({
      data: { id: "session-1", subject_tags: [], subject_context: "Engineering Physics" },
      error: null,
    }));
    const existingSessionEqUser = vi.fn(() => ({ maybeSingle: existingSessionMaybeSingle }));
    const existingSessionEqId = vi.fn(() => ({ eq: existingSessionEqUser }));
    const sessionUpdateEq = vi.fn(async () => ({ error: null }));

    const chatSessionsTable = {
      select: vi.fn(() => ({ eq: existingSessionEqId })),
      insert: vi.fn(() => ({
        select: vi.fn(() => ({
          single: sessionInsertSingle,
        })),
      })),
      update: vi.fn(() => ({
        eq: sessionUpdateEq,
      })),
    };

    const historyLimit = vi.fn(async () => ({
      data: [],
      error: null,
    }));
    const historyOrder = vi.fn(() => ({ limit: historyLimit }));
    const historyEq = vi.fn(() => ({ order: historyOrder }));

    const chatMessagesTable = {
      insert: vi.fn((payload: unknown) => {
        const role =
          payload && typeof payload === "object" && "role" in payload && typeof payload.role === "string"
            ? payload.role
            : null;

        if (role === "assistant") {
          assistantInsertPayloads.push(payload);
          return {
            select: vi.fn(() => ({
              single: vi.fn(async () => ({ data: { id: `assistant-${assistantInsertPayloads.length}` }, error: null })),
            })),
          };
        }

        return Promise.resolve({ error: null });
      }),
      select: vi.fn(() => ({ eq: historyEq })),
      update: vi.fn(() => ({
        eq: vi.fn(() => ({
          eq: vi.fn(async () => ({ error: null })),
        })),
      })),
    };

    const knowledgeDocumentsEq = vi.fn(async () => ({
      data: [
        {
          id: "syllabus-doc",
          title: "Engineering Physics SH402 Syllabus",
          subject: "Engineering Physics",
          raw_content: [
            "Unit 1: Mechanics",
            "Rotational dynamics",
            "Oscillations",
            "Unit 2: Wave Motion",
            "Energy transfer in a progressive wave",
            "Stationary waves",
            "Wave intensity and energy density",
            "Unit 3: Acoustics",
            "Sound intensity",
            "Reverberation",
          ].join("\n"),
          metadata: {
            courseCode: "SH402",
            year: "Bachelor",
          },
          resource_kind: "syllabus",
        },
      ],
      error: null,
    }));
    const knowledgeDocumentsIn = vi.fn(() => ({
      eq: knowledgeDocumentsEq,
    }));
    const knowledgeDocumentsTable = {
      select: vi.fn(() => ({
        in: knowledgeDocumentsIn,
      })),
    };

    createSupabaseServerClient.mockResolvedValue({
      auth: {
        getUser: vi.fn(async () => ({
          data: { user: { id: "user-1", email: "student@example.com" } },
        })),
      },
      from: vi.fn((table: string) => {
        if (table === "student_profiles") return profileChain;
        if (table === "chat_sessions") return chatSessionsTable;
        if (table === "chat_messages") return chatMessagesTable;
        if (table === "knowledge_documents") return knowledgeDocumentsTable;
        if (table === "credits_ledger") return { insert: creditsInsert };
        throw new Error(`Unexpected table access: ${table}`);
      }),
    });

    ensureStarterCreditsForUser.mockResolvedValue(20);
    getCreditBalanceForUser.mockResolvedValue(20);

    listDeterministicChapters.mockResolvedValue([
      {
        documentId: "doc-1",
        board: "ENGINEERING",
        grade: "Bachelor",
        subject: "Engineering Physics",
        chapter: "Unit 1 Mechanics",
        title: "Engineering Physics SH402",
        sourceName: "engineering-physics.pdf",
      },
      {
        documentId: "doc-1",
        board: "ENGINEERING",
        grade: "Bachelor",
        subject: "Engineering Physics",
        chapter: "Unit 2 Wave Motion",
        title: "Engineering Physics SH402",
        sourceName: "engineering-physics.pdf",
      },
      {
        documentId: "doc-1",
        board: "ENGINEERING",
        grade: "Bachelor",
        subject: "Engineering Physics",
        chapter: "Unit 3 Acoustics",
        title: "Engineering Physics SH402",
        sourceName: "engineering-physics.pdf",
      },
    ]);

    listDeterministicTopics.mockImplementation(async ({ chapter }: { chapter?: string }) => {
      if (/unit\s*3|acoustics/i.test(chapter ?? "")) {
        return [
          {
            chunkId: "topic-3",
            documentId: "doc-1",
            board: "ENGINEERING",
            grade: "Bachelor",
            subject: "Engineering Physics",
            chapter: "Unit 3 Acoustics",
            topic: "Sound intensity",
            sourceTitle: "Engineering Physics SH402",
            sourceName: "engineering-physics.pdf",
            contentPreview: "Sound intensity",
            chunkIndex: 1,
          },
          {
            chunkId: "topic-4",
            documentId: "doc-1",
            board: "ENGINEERING",
            grade: "Bachelor",
            subject: "Engineering Physics",
            chapter: "Unit 3 Acoustics",
            topic: "Reverberation",
            sourceTitle: "Engineering Physics SH402",
            sourceName: "engineering-physics.pdf",
            contentPreview: "Reverberation",
            chunkIndex: 2,
          },
        ];
      }

      return [
        {
          chunkId: "topic-1",
          documentId: "doc-1",
          board: "ENGINEERING",
          grade: "Bachelor",
          subject: "Engineering Physics",
          chapter: "Unit 2 Wave Motion",
          topic: "Energy transfer in a progressive wave",
          sourceTitle: "Engineering Physics SH402",
          sourceName: "engineering-physics.pdf",
          contentPreview: "Energy transfer in a progressive wave",
          chunkIndex: 1,
        },
        {
          chunkId: "topic-2",
          documentId: "doc-1",
          board: "ENGINEERING",
          grade: "Bachelor",
          subject: "Engineering Physics",
          chapter: "Unit 2 Wave Motion",
          topic: "Stationary waves",
          sourceTitle: "Engineering Physics SH402",
          sourceName: "engineering-physics.pdf",
          contentPreview: "Stationary waves",
          chunkIndex: 2,
        },
      ];
    });

    listDeterministicQuestionBankEntries.mockResolvedValue([
      {
        chunkId: "exam-1",
        documentId: "doc-qb",
        board: "ENGINEERING",
        grade: "Bachelor",
        subject: "Engineering Physics",
        chapter: "Unit 2 Wave Motion",
        topic: "Progressive wave equation",
        sourceTitle: "Engineering Physics Question Bank",
        sourceName: "question-bank.pdf",
        content: "Derive the equation of a progressive wave.",
        chunkIndex: 1,
      },
      {
        chunkId: "exam-2",
        documentId: "doc-qb",
        board: "ENGINEERING",
        grade: "Bachelor",
        subject: "Engineering Physics",
        chapter: "Unit 2 Wave Motion",
        topic: "Wave intensity",
        sourceTitle: "Engineering Physics Question Bank",
        sourceName: "question-bank.pdf",
        content: "Explain wave intensity and energy density.",
        chunkIndex: 2,
      },
    ]);

    findBestTopicCard.mockResolvedValue({
      id: "card-1",
      documentId: "doc-1",
      board: "ENGINEERING",
      grade: "Bachelor",
      subject: "Engineering Physics",
      chapter: "Unit 2 Wave Motion",
      topic: "Wave intensity",
      title: "Wave intensity",
      keyTerms: ["wave intensity", "power", "area"],
      coreExplanation: ["Wave intensity means power transferred per unit area."],
      formulaSheet: ["I = P/A"],
      exampleLine: "If power spreads over bigger area, intensity decreases.",
      commonMistake: "Do not confuse intensity with total power.",
      examAngle: "Explain definition + formula + one implication.",
      status: "published",
      createdAt: "2026-06-01T00:00:00.000Z",
      updatedAt: "2026-06-01T00:00:00.000Z",
    });

    retrieveKnowledgeChunks.mockResolvedValue({
      grounded: true,
      chunks: [
        {
          id: "chunk-syllabus",
          documentId: "syllabus-doc",
          board: "ENGINEERING",
          grade: "Bachelor",
          subject: "Engineering Physics",
          chapter: "Unit 2 Wave Motion",
          topic: "Wave intensity",
          content: "Wave intensity and energy density are covered in Unit 2.",
          sourceTitle: "Engineering Physics SH402 Syllabus",
          sourceName: "engineering-physics-syllabus.pdf",
          score: 0.95,
          resourceKind: "syllabus",
        },
        {
          id: "chunk-textbook",
          documentId: "doc-1",
          board: "ENGINEERING",
          grade: "Bachelor",
          subject: "Engineering Physics",
          chapter: "Unit 2 Wave Motion",
          topic: "Wave intensity",
          content: "Wave intensity means power transferred per unit area.",
          sourceTitle: "Engineering Physics Textbook",
          sourceName: "engineering-physics.pdf",
          score: 0.92,
          resourceKind: "study_material",
        },
      ],
      citations: [
        {
          chunkId: "chunk-textbook",
          documentId: "doc-1",
          sourceType: "textbook",
          sourceLabel: "Engineering Physics Textbook",
          sourceTitle: "Engineering Physics Textbook",
          sourceName: "engineering-physics.pdf",
          subject: "Engineering Physics",
          chapter: "Unit 2 Wave Motion",
          topic: "Wave intensity",
        },
      ],
      matchedScope: "ENGINEERING > Bachelor > Engineering Physics > Unit 2 Wave Motion",
      reasoning: "Golden benchmark retrieval.",
      routePath: "persisted_topic_card_hybrid",
      timings: {
        retrieveMs: 8,
        rerankMs: 3,
        totalMs: 12,
      },
      fallbackUsed: false,
      topicCardUsed: true,
      topicCardTitle: "Wave intensity",
      topicCardSource: "persisted",
      questionBankUsed: false,
      questionBankCount: 0,
    });

    streamText.mockImplementation(
      ({
        messages,
        onFinish,
      }: {
        messages: Array<{ role: "user" | "assistant"; content: unknown }>;
        onFinish: ({ text }: { text: string }) => Promise<void>;
      }) => ({
        toDataStreamResponse: async ({ headers }: { headers: HeadersInit }) => {
          const latestQuestion = messages
            .slice()
            .reverse()
            .map((message) => {
              if (typeof message.content === "string") return message.content;
              return JSON.stringify(message.content ?? "");
            })
            .find((content) => content.trim().length > 0) ?? "";
          let text =
            "Wave motion covers progressive waves, stationary waves, and wave intensity. Wave intensity means power transferred per unit area.";

          if (/calculate wave intensity/i.test(latestQuestion)) {
            text = [
              "Given: P = 20 W, A = 5 m^2",
              "Formula: I = P/A",
              "Substitution: I = 20/5",
              "Final answer: 4 W/m^2",
              "Interpretation: if the same power spreads over more area, intensity decreases.",
            ].join("\n");
          } else if (/derive the equation of a progressive wave/i.test(latestQuestion)) {
            text = [
              "Starting relation: take a sinusoidal disturbance moving in +x direction.",
              "Let the displacement at x = 0 be y(0,t) = A sin(omega t).",
              "At position x, the phase lags by kx, so y(x,t) = A sin(omega t - kx).",
              "Final derived form: y(x,t) = A sin(omega t - kx).",
              "Physical meaning: the shape moves forward while the phase changes with position.",
            ].join("\n");
          } else if (/compare progressive waves and stationary waves/i.test(latestQuestion)) {
            text = [
              "Direct difference: a progressive wave transports energy from one place to another, while a stationary wave has fixed nodes and antinodes with no net energy flow.",
              "Progressive wave: profile travels, phase changes continuously, and energy is transmitted.",
              "Stationary wave: pattern stays in place, nodes/antinodes form, and average energy transfer is zero.",
              "Exam takeaway: if the question asks about transport of energy and moving wavefronts, think progressive; if it asks about nodes and antinodes, think stationary.",
            ].join("\n");
          }

          await onFinish({ text });
          return new Response(text, { status: 200, headers });
        },
      }),
    );

    return { assistantInsertPayloads };
  }

  it("keeps core engineering-physics academic routes stable across golden scenarios", async () => {
    const { assistantInsertPayloads } = setupEngineeringPhysicsGoldenPath();

    for (const scenario of goldenEngineeringPhysicsScenarios) {
      const previousStreamCallCount = streamText.mock.calls.length;
      const previousGenerateCallCount = generateText.mock.calls.length;
      const response = await POST(
        new Request("http://localhost/api/chat", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            sessionId: "11111111-1111-1111-1111-111111111111",
            subjectContext: scenario.subjectContext,
            retrievalMode: scenario.retrievalMode ?? "default",
            answerStyle: scenario.retrievalMode === "chapter" ? "detailed" : "balanced",
            messages: [{ role: "user", content: scenario.question }],
          }),
        }),
      );

      expect(response.status).toBe(200);
      const routePath = response.headers.get("x-route-path");
      expect(routePath?.replace(/_direct$/, "")).toBe(scenario.expectedRoutePath);
      expect(response.headers.get("x-answer-mode")).toBe(scenario.expectedAnswerMode);

      const body = await response.text();
      for (const expected of scenario.expectedContains) {
        expect(body).toContain(expected);
      }

      if (scenario.expectedPromptContains?.length) {
        const streamUsed = streamText.mock.calls.length > previousStreamCallCount;
        const generateUsed = generateText.mock.calls.length > previousGenerateCallCount;
        expect(streamUsed || generateUsed).toBe(true);
        const latestCall = (
          streamUsed ? streamText.mock.calls.at(-1)?.[0] : generateText.mock.calls.at(-1)?.[0]
        ) as { system?: string } | undefined;
        const systemPrompt = latestCall?.system ?? "";
        for (const expected of scenario.expectedPromptContains) {
          expect(systemPrompt).toContain(expected);
        }
      }
    }

    expect(assistantInsertPayloads).toHaveLength(goldenEngineeringPhysicsScenarios.length);
  });
});
