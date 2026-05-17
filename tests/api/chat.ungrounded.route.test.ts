import { beforeEach, describe, expect, it, vi } from "vitest";

const { createSupabaseServerClient, ensureStarterCreditsForUser, retrieveKnowledgeChunks } =
  vi.hoisted(() => ({
    createSupabaseServerClient: vi.fn(),
    ensureStarterCreditsForUser: vi.fn(),
    retrieveKnowledgeChunks: vi.fn(),
  }));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient,
}));

vi.mock("@/lib/data/billing", () => ({
  ensureStarterCreditsForUser,
  getCreditBalanceForUser: vi.fn(),
}));

vi.mock("@/lib/ai/retrieval", async () => {
  const actual = await vi.importActual<typeof import("@/lib/ai/retrieval")>("@/lib/ai/retrieval");
  return {
    ...actual,
    retrieveKnowledgeChunks,
  };
});

import { POST } from "@/app/api/chat/route";

describe("POST /api/chat (ungrounded no-context path)", () => {
  beforeEach(() => {
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
          board_score: null,
          subjects: ["Physics"],
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

    const sessionSelectChain = {
      select: vi.fn(),
      eq: vi.fn(),
      maybeSingle: vi.fn(async () => ({
        data: {
          id: "11111111-1111-1111-1111-111111111111",
          subject_tags: ["Physics"],
          subject_context: "Physics",
        },
      })),
    };
    sessionSelectChain.select.mockReturnValue(sessionSelectChain);
    sessionSelectChain.eq.mockReturnValue(sessionSelectChain);

    const sessionUpdateChain = {
      eq: vi.fn(async () => ({ error: null })),
    };

    const chatSessionsTable = {
      select: vi.fn(() => sessionSelectChain),
      update: vi.fn(() => sessionUpdateChain),
    };

    const chatMessagesTable = {
      insert: vi.fn(async () => ({ error: null })),
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
        throw new Error(`Unexpected table access: ${table}`);
      }),
    });

    ensureStarterCreditsForUser.mockResolvedValue(20);
    retrieveKnowledgeChunks.mockResolvedValue({
      chunks: [],
      citations: [],
      grounded: false,
    });
  });

  it("returns explicit 422 when no grounded syllabus chunks are found", async () => {
    const response = await POST(
      new Request("http://localhost/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: "11111111-1111-1111-1111-111111111111",
          language: "EN",
          subjectContext: "Physics",
          messages: [{ role: "user", content: "Explain this chapter in depth." }],
        }),
      }),
    );

    expect(response.status).toBe(422);
    await expect(response.json()).resolves.toEqual({
      error:
        'I could not find grounded syllabus context for this question, so I will not guess an answer. Try asking a specific unit/chapter within "Physics".',
      code: "RAG_NO_GROUNDED_CONTEXT",
    });
  });
});
