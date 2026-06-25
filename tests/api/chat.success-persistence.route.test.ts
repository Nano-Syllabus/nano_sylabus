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

describe("POST /api/chat (successful persistence path)", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    createGoogleGenerativeAI.mockReturnValue(() => "mock-model");
    generateText.mockResolvedValue({ text: "What is inertia?\nHow is force related to mass?\nCan you give one example?" });
    getActivePromptTemplateMap.mockResolvedValue({});
    listDeterministicSubjects.mockResolvedValue([]);
    listDeterministicChapters.mockResolvedValue([]);
    listDeterministicTopics.mockResolvedValue([]);
    listDeterministicQuestionBankEntries.mockResolvedValue([]);
    findBestTopicCard.mockResolvedValue(null);
  });

  function setupSuccessPath({ assistantInsertFails = false }: { assistantInsertFails?: boolean }) {
    const creditsInsert = vi.fn(async () => ({ error: null }));
    let chatMessageInsertCount = 0;
    const assistantInsertPayloads: unknown[] = [];

    const profileChain = {
      select: vi.fn(),
      eq: vi.fn(),
      maybeSingle: vi.fn(async () => ({
        data: {
          user_id: "user-1",
          full_name: "Student",
          college: "Campus",
          board: "NEB",
          grade: "Class 11",
          board_score: "82%",
          subjects: ["physics", "chemistry"],
          target_grade: "A+",
          language_pref: "EN",
          role: "student",
          created_at: "2026-04-20T00:00:00.000Z",
          updated_at: "2026-04-20T00:00:00.000Z",
        },
      })),
    };
    profileChain.select.mockReturnValue(profileChain);
    profileChain.eq.mockReturnValue(profileChain);

    const sessionInsertSingle = vi.fn(async () => ({
      data: {
        id: "11111111-1111-1111-1111-111111111111",
        subject_tags: [],
        subject_context: null,
      },
      error: null,
    }));
    const existingSessionMaybeSingle = vi.fn(async () => ({
      data: {
        id: "11111111-1111-1111-1111-111111111111",
        subject_tags: [],
        subject_context: "Physics",
      },
      error: null,
    }));
    const existingSessionEqUser = vi.fn(() => ({
      maybeSingle: existingSessionMaybeSingle,
    }));
    const existingSessionEqId = vi.fn(() => ({
      eq: existingSessionEqUser,
    }));

    const sessionUpdateEq = vi.fn(async () => ({ error: null }));
    const chatSessionsTable = {
      select: vi.fn(() => ({
        eq: existingSessionEqId,
      })),
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
      data: [{ role: "user", content: "Explain Newton's second law." }],
      error: null,
    }));
    const historyOrder = vi.fn(() => ({
      limit: historyLimit,
    }));
    const historyEq = vi.fn(() => ({
      order: historyOrder,
    }));

    const chatMessagesTable = {
      insert: vi.fn((payload: unknown) => {
        chatMessageInsertCount += 1;
        if (chatMessageInsertCount === 1) {
          return Promise.resolve({ error: null });
        }
        assistantInsertPayloads.push(payload);

        return {
          select: vi.fn(() => ({
            single: vi.fn(async () =>
              assistantInsertFails
                ? { data: null, error: { message: "assistant insert failed" } }
                : { data: { id: "assistant-1" }, error: null },
            ),
          })),
        };
      }),
      select: vi.fn(() => ({
        eq: historyEq,
      })),
      update: vi.fn(() => ({
        eq: vi.fn(() => ({
          eq: vi.fn(async () => ({ error: null })),
        })),
      })),
    };

    const knowledgeDocumentsIn = vi.fn(async () => ({
      data: [
        {
          id: "doc-1",
          subject: "Physics",
          metadata: {
            courseCode: "SH402",
            year: "First Year",
            part: "Part I",
          },
          resource_kind: "syllabus",
        },
      ],
      error: null,
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
    retrieveKnowledgeChunks.mockResolvedValue({
      grounded: true,
      chunks: [
        {
          id: "chunk-1",
          documentId: "doc-1",
          board: "NEB",
          grade: "Class 11",
          subject: "Physics",
          chapter: "Unit 1",
          topic: "Force",
          content: "Force equals mass times acceleration.",
          sourceTitle: "Class 11 Physics",
          sourceName: "physics.pdf",
          score: 0.92,
        },
      ],
      citations: [
        {
          chunkId: "chunk-1",
          documentId: "doc-1",
          sourceLabel: "Physics · Unit 1",
          sourceTitle: "Class 11 Physics",
          sourceName: "physics.pdf",
          subject: "Physics",
          chapter: "Unit 1",
          topic: "Force",
        },
      ],
    });

    streamText.mockImplementation(({ onFinish }: { onFinish: ({ text }: { text: string }) => Promise<void> }) => ({
      toDataStreamResponse: async ({ headers }: { headers: HeadersInit }) => {
        await onFinish({ text: "Newton's second law says force equals mass times acceleration." });
        return new Response("ok", { status: 200, headers });
      },
    }));

    return {
      creditsInsert,
      sessionUpdateEq,
      assistantInsertPayloads,
      historyLimit,
    };
  }

  it("infers a single subject context for no-subject chats and returns it in response headers", async () => {
    const { assistantInsertPayloads, historyLimit } = setupSuccessPath({});

    const response = await POST(
      new Request("http://localhost/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          language: "EN",
          messages: [{ role: "user", content: "Explain Newton's second law." }],
        }),
      }),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("x-subject-context")).toBe("Physics > Unit 1");
    expect(response.headers.get("x-route-path")).toBe("topic_card_hybrid");
    expect(response.headers.get("x-topic-card-used")).toBe("1");
    expect(response.headers.get("x-topic-card-source")).toBe("derived");
    expect(response.headers.get("x-topic-card-title")).toBe("Force");
    expect(response.headers.get("x-history-strategy")).toBe("request_window");
    expect(response.headers.get("x-history-messages")).toBe("1");
    expect(historyLimit).not.toHaveBeenCalled();
    expect(assistantInsertPayloads).toHaveLength(1);
    expect(assistantInsertPayloads[0]).toMatchObject({
      metadata: {
        answer_trace: expect.objectContaining({
          routePath: "topic_card_hybrid",
          answerMode: "quick",
          topicCardUsed: true,
          topicCardSource: "derived",
          topicCardTitle: "Force",
          questionBankUsed: false,
          grounded: true,
        }),
      },
    });
  });

  it("uses an adaptive DB history window for existing sessions", async () => {
    const { historyLimit } = setupSuccessPath({});

    const response = await POST(
      new Request("http://localhost/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: "11111111-1111-1111-1111-111111111111",
          language: "EN",
          answerStyle: "simple",
          subjectContext: "Physics",
          messages: [
            { role: "user", content: "Old user message" },
            { role: "assistant", content: "Old assistant message" },
            { role: "user", content: "Explain inertia briefly." },
          ],
        }),
      }),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("x-history-strategy")).toBe("db_adaptive_window");
    expect(historyLimit).toHaveBeenCalledWith(8);
  });

  it("prefers persisted topic cards for concept answers when a published card exists", async () => {
    const { assistantInsertPayloads } = setupSuccessPath({});
    findBestTopicCard.mockResolvedValue({
      id: "card-1",
      documentId: "doc-1",
      board: "NEB",
      grade: "Class 11",
      subject: "Physics",
      chapter: "Unit 1",
      topic: "Force",
      title: "Force",
      keyTerms: ["force", "mass", "acceleration"],
      coreExplanation: ["Force describes how strongly something pushes or pulls another object."],
      formulaSheet: ["F = ma"],
      exampleLine: "If mass doubles at the same acceleration, force doubles.",
      commonMistake: "Do not confuse mass with weight.",
      examAngle: "Be ready to state the law, formula, and one practical example.",
      status: "published",
      createdAt: "2026-06-05T00:00:00.000Z",
      updatedAt: "2026-06-05T00:00:00.000Z",
    });

    const response = await POST(
      new Request("http://localhost/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          language: "EN",
          messages: [{ role: "user", content: "Explain Newton's second law." }],
        }),
      }),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("x-route-path")).toBe("persisted_topic_card_hybrid");
    expect(response.headers.get("x-topic-card-used")).toBe("1");
    expect(response.headers.get("x-topic-card-source")).toBe("persisted");
    expect(response.headers.get("x-topic-card-title")).toBe("Force");
    expect(assistantInsertPayloads).toHaveLength(1);
    expect(assistantInsertPayloads[0]).toMatchObject({
      metadata: {
        answer_trace: expect.objectContaining({
          routePath: "persisted_topic_card_hybrid",
          answerMode: "quick",
          topicCardUsed: true,
          topicCardSource: "persisted",
          topicCardTitle: "Force",
          questionBankUsed: false,
          grounded: true,
        }),
      },
    });
  });

  it("does not charge credits when assistant persistence fails", async () => {
    const { creditsInsert } = setupSuccessPath({ assistantInsertFails: true });

    const response = await POST(
      new Request("http://localhost/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          language: "EN",
          messages: [{ role: "user", content: "Explain Newton's second law." }],
        }),
      }),
    );

    expect(response.status).toBe(200);
    expect(creditsInsert).not.toHaveBeenCalled();
  });

  it("returns deterministic chapter lists without invoking blind retrieval", async () => {
    setupSuccessPath({});
    listDeterministicChapters.mockResolvedValue([
      {
        documentId: "doc-1",
        board: "NEB",
        grade: "Class 11",
        subject: "Physics",
        chapter: "Unit 1 Force",
        title: "Unit 1 Force",
        sourceName: "physics.pdf",
      },
      {
        documentId: "doc-2",
        board: "NEB",
        grade: "Class 11",
        subject: "Physics",
        chapter: "Unit 2 Motion",
        title: "Unit 2 Motion",
        sourceName: "physics.pdf",
      },
    ]);

    const response = await POST(
      new Request("http://localhost/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          language: "EN",
          subjectContext: "Physics",
          messages: [{ role: "user", content: "What are the chapters in Physics?" }],
        }),
      }),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("x-answer-mode")).toBe("deterministic_catalog_lookup");
    expect(response.headers.get("x-answer-mode-reason")).toBe("subject_chapter_topic_list");
    expect(response.headers.get("x-route-path")).toBe("deterministic_catalog");
    expect(retrieveKnowledgeChunks).not.toHaveBeenCalled();
    await expect(response.text()).resolves.toContain("Unit 2 Motion");
  });

  it("returns full syllabus structure deterministically with topics when requested", async () => {
    setupSuccessPath({});
    listDeterministicChapters.mockResolvedValue([
      {
        documentId: "doc-1",
        board: "NEB",
        grade: "Class 11",
        subject: "Physics",
        chapter: "Unit 1 Force",
        title: "Unit 1 Force",
        sourceName: "physics.pdf",
      },
      {
        documentId: "doc-2",
        board: "NEB",
        grade: "Class 11",
        subject: "Physics",
        chapter: "Unit 2 Motion",
        title: "Unit 2 Motion",
        sourceName: "physics.pdf",
      },
    ]);
    listDeterministicTopics
      .mockResolvedValueOnce([
        {
          chunkId: "chunk-1",
          documentId: "doc-1",
          board: "NEB",
          grade: "Class 11",
          subject: "Physics",
          chapter: "Unit 1 Force",
          topic: "Newton's laws",
          sourceTitle: "Unit 1 Force",
          sourceName: "physics.pdf",
          contentPreview: "Newton's laws summary",
          chunkIndex: 0,
        },
      ])
      .mockResolvedValueOnce([
        {
          chunkId: "chunk-2",
          documentId: "doc-2",
          board: "NEB",
          grade: "Class 11",
          subject: "Physics",
          chapter: "Unit 2 Motion",
          topic: "Equations of motion",
          sourceTitle: "Unit 2 Motion",
          sourceName: "physics.pdf",
          contentPreview: "Equations of motion summary",
          chunkIndex: 0,
        },
      ]);

    const response = await POST(
      new Request("http://localhost/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          language: "EN",
          subjectContext: "Physics",
          messages: [{ role: "user", content: "Give me the full syllabus structure for Physics." }],
        }),
      }),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("x-answer-mode")).toBe("deterministic_catalog_lookup");
    expect(response.headers.get("x-answer-mode-reason")).toBe("full_syllabus_structure");
    expect(response.headers.get("x-route-path")).toBe("deterministic_catalog");
    expect(retrieveKnowledgeChunks).not.toHaveBeenCalled();
    await expect(response.text()).resolves.toContain("Newton's laws");
  });

  it("returns deterministic topic lists for a requested chapter without invoking blind retrieval", async () => {
    setupSuccessPath({});
    listDeterministicChapters.mockResolvedValue([
      {
        documentId: "doc-1",
        board: "NEB",
        grade: "Class 11",
        subject: "Physics",
        chapter: "Unit 1 Force",
        title: "Unit 1 Force",
        sourceName: "physics.pdf",
      },
      {
        documentId: "doc-2",
        board: "NEB",
        grade: "Class 11",
        subject: "Physics",
        chapter: "Unit 2 Motion",
        title: "Unit 2 Motion",
        sourceName: "physics.pdf",
      },
    ]);
    listDeterministicTopics.mockResolvedValue([
      {
        chunkId: "chunk-1",
        documentId: "doc-2",
        board: "NEB",
        grade: "Class 11",
        subject: "Physics",
        chapter: "Unit 2 Motion",
        topic: "Velocity and acceleration",
        sourceTitle: "Unit 2 Motion",
        sourceName: "physics.pdf",
        contentPreview: "Velocity and acceleration basics",
        chunkIndex: 0,
      },
      {
        chunkId: "chunk-2",
        documentId: "doc-2",
        board: "NEB",
        grade: "Class 11",
        subject: "Physics",
        chapter: "Unit 2 Motion",
        topic: "Equations of motion",
        sourceTitle: "Unit 2 Motion",
        sourceName: "physics.pdf",
        contentPreview: "Equations of motion summary",
        chunkIndex: 1,
      },
    ]);

    const response = await POST(
      new Request("http://localhost/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          language: "EN",
          subjectContext: "Physics",
          messages: [{ role: "user", content: "What are the topics in chapter 2?" }],
        }),
      }),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("x-answer-mode")).toBe("deterministic_catalog_lookup");
    expect(response.headers.get("x-route-path")).toBe("deterministic_catalog");
    expect(retrieveKnowledgeChunks).not.toHaveBeenCalled();
    await expect(response.text()).resolves.toContain("Equations of motion");
  });

  it("returns deterministic exam-style questions from question-bank evidence", async () => {
    setupSuccessPath({});
    listDeterministicQuestionBankEntries.mockResolvedValueOnce([
      {
        chunkId: "qb-1",
        documentId: "doc-qb-1",
        board: "NEB",
        grade: "Class 11",
        subject: "Physics",
        chapter: "Unit 2 Motion",
        topic: "Important questions",
        sourceTitle: "Physics question bank",
        sourceName: "physics-question-bank.pdf",
        content:
          "Q1. Define velocity.\nQ2. Explain acceleration with example.\nLong question: Derive equations of motion.\nWhat is displacement?",
        chunkIndex: 0,
      },
    ]);

    const response = await POST(
      new Request("http://localhost/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          language: "EN",
          subjectContext: "Physics",
          messages: [{ role: "user", content: "Give me likely exam questions in Physics." }],
        }),
      }),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("x-answer-mode")).toBe("deterministic_exam_lookup");
    expect(response.headers.get("x-answer-mode-reason")).toBe("exam_question_bank");
    expect(response.headers.get("x-route-path")).toBe("deterministic_question_bank");
    expect(response.headers.get("x-question-bank-used")).toBe("1");
    expect(retrieveKnowledgeChunks).not.toHaveBeenCalled();
    await expect(response.text()).resolves.toContain("Derive equations of motion");
  });

  it("forces structured deep chapter-mode prompts for full-unit requests", async () => {
    setupSuccessPath({});
    retrieveKnowledgeChunks.mockResolvedValueOnce({
      grounded: true,
      chunks: [
        {
          id: "chunk-1",
          documentId: "doc-1",
          board: "NEB",
          grade: "Class 11",
          subject: "Physics",
          chapter: "Unit 2 Motion",
          topic: "Velocity and acceleration",
          content: "Velocity and acceleration basics.",
          sourceTitle: "Engineering Physics",
          sourceName: "physics.pdf",
          resourceKind: "study_material",
          score: 0.96,
          chunkIndex: 0,
        },
        {
          id: "chunk-2",
          documentId: "doc-1",
          board: "NEB",
          grade: "Class 11",
          subject: "Physics",
          chapter: "Unit 2 Motion",
          topic: "Equations of motion",
          content: "Equations of motion summary.",
          sourceTitle: "Engineering Physics",
          sourceName: "physics.pdf",
          resourceKind: "study_material",
          score: 0.93,
          chunkIndex: 1,
        },
        {
          id: "chunk-3",
          documentId: "doc-1",
          board: "NEB",
          grade: "Class 11",
          subject: "Physics",
          chapter: "Unit 2 Motion",
          topic: "Projectile motion",
          content: "Projectile motion key idea.",
          sourceTitle: "Engineering Physics",
          sourceName: "physics.pdf",
          resourceKind: "study_material",
          score: 0.9,
          chunkIndex: 2,
        },
      ],
      citations: [
        {
          chunkId: "chunk-1",
          documentId: "doc-1",
          sourceLabel: "Physics · Unit 2 Motion",
          sourceTitle: "Engineering Physics",
          sourceName: "physics.pdf",
          subject: "Physics",
          chapter: "Unit 2 Motion",
          topic: "Velocity and acceleration",
        },
      ],
    });

    const response = await POST(
      new Request("http://localhost/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          language: "EN",
          retrievalMode: "chapter",
          subjectContext: "Physics",
          messages: [{ role: "user", content: "Give me the full unit in detail about motion." }],
        }),
      }),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("x-answer-mode")).toBe("deep");
    expect(response.headers.get("x-answer-mode-reason")).toBe("chapter_mode_structured");
    expect(response.headers.get("x-route-path")).toBe("chapter_topic_card_hybrid");

    const firstCall = streamText.mock.calls[0]?.[0];
    expect(firstCall?.system).toContain("Chapter-mode guidance:");
    expect(firstCall?.system).toContain("Velocity and acceleration");
    expect(firstCall?.system).toContain("Equations of motion");
    expect(firstCall?.system).toContain("Projectile motion");
  });

  it("uses direct grounded generation for technical derivation questions", async () => {
    const previousRescue = process.env.CHAT_ENABLE_QUALITY_RESCUE;
    process.env.CHAT_ENABLE_QUALITY_RESCUE = "1";
    try {
      setupSuccessPath({});
      retrieveKnowledgeChunks.mockResolvedValueOnce({
        grounded: true,
        chunks: [
          {
            id: "eng-chunk-1",
            documentId: "eng-doc-1",
            board: "ENGINEERING",
            grade: "Bachelor",
            subject: "Engineering Physics",
            chapter: "Unit 2 Wave Motion",
            topic: "Wave equation derivation",
            content:
              "For a progressive wave, start from y = a sin(kx - wt). Differentiate twice with respect to x and t to obtain the wave equation.",
            sourceTitle: "Engineering Physics",
            sourceName: "engineering-physics.pdf",
            resourceKind: "study_material",
            score: 0.98,
            chunkIndex: 0,
          },
          {
            id: "eng-chunk-2",
            documentId: "eng-doc-1",
            board: "ENGINEERING",
            grade: "Bachelor",
            subject: "Engineering Physics",
            chapter: "Unit 2 Wave Motion",
            topic: "Wave equation derivation",
            content:
              "The standard form is d²y/dx² = (1/v²) d²y/dt², where v is wave speed.",
            sourceTitle: "Engineering Physics",
            sourceName: "engineering-physics.pdf",
            resourceKind: "study_material",
            score: 0.95,
            chunkIndex: 1,
          },
        ],
        citations: [
          {
            chunkId: "eng-chunk-1",
            documentId: "eng-doc-1",
            sourceLabel: "Engineering Physics · Unit 2 Wave Motion",
            sourceTitle: "Engineering Physics",
            sourceName: "engineering-physics.pdf",
            subject: "Engineering Physics",
            chapter: "Unit 2 Wave Motion",
            topic: "Wave equation derivation",
          },
        ],
      });

      generateText.mockReset();
      generateText
        .mockResolvedValueOnce({
          text: "Wave equation ko derivation start हुन्छ progressive wave function बाट. Use y = a sin(kx - wt).",
        })
        .mockResolvedValueOnce({
          text: [
            "Derivation of the progressive wave equation:",
            "Start with the displacement of a one-dimensional progressive wave, y = a sin(kx - wt), where a is amplitude, k is wave number, omega is angular frequency, x is position, and t is time.",
            "First differentiate with respect to position: dy/dx = ak cos(kx - wt). Differentiating again gives d²y/dx² = -k²a sin(kx - wt). Since y = a sin(kx - wt), this becomes d²y/dx² = -k²y.",
            "Now differentiate with respect to time: dy/dt = -a omega cos(kx - wt). Differentiating again gives d²y/dt² = -omega²a sin(kx - wt), so d²y/dt² = -omega²y.",
            "From the two results, y = -(1/k²)d²y/dx² and y = -(1/omega²)d²y/dt². Equating them gives (1/k²)d²y/dx² = (1/omega²)d²y/dt².",
            "Because wave speed v = omega/k, we get omega²/k² = v².",
            "Final wave equation: d²y/dx² = (1/v²) d²y/dt².",
            "This means the spatial curvature of the wave is linked to how fast the displacement changes with time, scaled by the square of the wave speed.",
          ].join("\n"),
        })
        .mockResolvedValueOnce({
          text: [
            "Derivation of the progressive wave equation:",
            "Start with y = a sin(kx - wt), where a is amplitude, k is wave number, omega is angular frequency, x is position, and t is time.",
            "Differentiate twice with respect to x to get d²y/dx² = -k²y.",
            "Differentiate twice with respect to t to get d²y/dt² = -omega²y.",
            "Comparing both equations and using v = omega/k gives the standard result.",
            "Final wave equation: d²y/dx² = (1/v²) d²y/dt².",
            "So the equation connects how the wave bends in space with how it changes in time.",
          ].join("\n"),
        });

      const previousStreamCallCount = streamText.mock.calls.length;
      const response = await POST(
        new Request("http://localhost/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            language: "EN",
            subjectContext: "Engineering Physics",
            answerStyle: "detailed",
            messages: [{ role: "user", content: "Derive the wave equation for a progressive wave." }],
          }),
        }),
      );

      expect(response.status).toBe(200);
      expect(response.headers.get("x-route-path")).toBe("rag_answer_direct");
      expect(response.headers.get("x-answer-quality-rescue")).toBe("1");
      expect(streamText.mock.calls.length).toBe(previousStreamCallCount);
      expect(generateText).toHaveBeenCalled();
      await expect(response.text()).resolves.toContain("Final wave equation");
    } finally {
      if (previousRescue === undefined) {
        delete process.env.CHAT_ENABLE_QUALITY_RESCUE;
      } else {
        process.env.CHAT_ENABLE_QUALITY_RESCUE = previousRescue;
      }
    }
  });
});
