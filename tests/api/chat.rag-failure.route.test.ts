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

describe("POST /api/chat (RAG failure path)", () => {
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
    retrieveKnowledgeChunks.mockRejectedValue(new Error("vector backend unavailable"));
  });

  it("returns explicit 503 error instead of silent ungrounded fallback", async () => {
    const response = await POST(
      new Request("http://localhost/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: "11111111-1111-1111-1111-111111111111",
          language: "EN",
          subjectContext: "Physics",
          messages: [{ role: "user", content: "Explain Newton's second law." }],
        }),
      }),
    );

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      error: "We could not load syllabus context for this question right now. Please try again in a moment.",
      code: "RAG_RETRIEVAL_FAILED",
    });
  });
});
