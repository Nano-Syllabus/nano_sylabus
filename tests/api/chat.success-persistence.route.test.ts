import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  createSupabaseServerClient,
  ensureStarterCreditsForUser,
  getCreditBalanceForUser,
  retrieveKnowledgeChunks,
  streamText,
  generateText,
  createGoogleGenerativeAI,
} = vi.hoisted(() => ({
  createSupabaseServerClient: vi.fn(),
  ensureStarterCreditsForUser: vi.fn(),
  getCreditBalanceForUser: vi.fn(),
  retrieveKnowledgeChunks: vi.fn(),
  streamText: vi.fn(),
  generateText: vi.fn(),
  createGoogleGenerativeAI: vi.fn(),
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

import { POST } from "@/app/api/chat/route";

describe("POST /api/chat (successful persistence path)", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    createGoogleGenerativeAI.mockReturnValue(() => "mock-model");
    generateText.mockResolvedValue({ text: "What is inertia?\nHow is force related to mass?\nCan you give one example?" });
  });

  function setupSuccessPath({ assistantInsertFails = false }: { assistantInsertFails?: boolean }) {
    const creditsInsert = vi.fn(async () => ({ error: null }));
    let chatMessageInsertCount = 0;

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

    const sessionUpdateEq = vi.fn(async () => ({ error: null }));
    const chatSessionsTable = {
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
    };
  }

  it("infers a single subject context for no-subject chats and returns it in response headers", async () => {
    setupSuccessPath({});

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
    expect(response.headers.get("x-subject-context")).toBe("Physics");
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
});
