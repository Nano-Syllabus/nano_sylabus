import { beforeEach, describe, expect, it, vi } from "vitest";

const { createSupabaseServerClient } = vi.hoisted(() => ({
  createSupabaseServerClient: vi.fn(),
}));
const { createSupabaseAdminClient } = vi.hoisted(() => ({
  createSupabaseAdminClient: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient,
}));

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient,
}));

import { PATCH } from "@/app/api/chat/messages/[messageId]/feedback/route";

describe("PATCH /api/chat/messages/[messageId]/feedback", () => {
  beforeEach(() => {
    const messageChain = {
      select: vi.fn(),
      eq: vi.fn(),
      maybeSingle: vi.fn(async () => ({
        data: {
          id: "message-1",
          role: "assistant",
          session_id: "session-1",
        },
      })),
    };
    messageChain.select.mockReturnValue(messageChain);
    messageChain.eq.mockReturnValue(messageChain);

    const sessionChain = {
      select: vi.fn(),
      eq: vi.fn(),
      maybeSingle: vi.fn(async () => ({
        data: { id: "session-1" },
      })),
    };
    sessionChain.select.mockReturnValue(sessionChain);
    sessionChain.eq.mockReturnValue(sessionChain);

    const updateMaybeSingle = vi.fn(async () => ({
      data: { id: "message-1", feedback: "up" },
      error: null,
    }));
    const updateSelect = vi.fn(() => ({ maybeSingle: updateMaybeSingle }));
    const updateEqSecond = vi.fn(() => ({ select: updateSelect }));
    const updateEqFirst = vi.fn(() => ({ eq: updateEqSecond }));
    const chatMessagesTable = {
      select: vi.fn(() => messageChain),
    };
    const adminChatMessagesTable = {
      update: vi.fn(() => ({ eq: updateEqFirst })),
    };

    createSupabaseServerClient.mockResolvedValue({
      auth: {
        getUser: vi.fn(async () => ({
          data: {
            user: { id: "user-1" },
          },
        })),
      },
      from: vi.fn((table: string) => {
        if (table === "chat_messages") return chatMessagesTable;
        if (table === "chat_sessions") return sessionChain;
        throw new Error(`Unexpected table access: ${table}`);
      }),
    });

    createSupabaseAdminClient.mockReturnValue({
      from: vi.fn((table: string) => {
        if (table === "chat_messages") return adminChatMessagesTable;
        throw new Error(`Unexpected admin table access: ${table}`);
      }),
    });
  });

  it("stores thumbs feedback for an assistant message in the user's own session", async () => {
    const response = await PATCH(
      new Request("http://localhost/api/chat/messages/message-1/feedback", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ feedback: "up" }),
      }),
      {
        params: Promise.resolve({ messageId: "message-1" }),
      },
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      id: "message-1",
      feedback: "up",
    });
  });
});
