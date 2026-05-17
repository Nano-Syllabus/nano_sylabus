import { beforeEach, describe, expect, it, vi } from "vitest";

const { createSupabaseServerClient } = vi.hoisted(() => ({
  createSupabaseServerClient: vi.fn(),
}));

const { getRevisionNoteDetail } = vi.hoisted(() => ({
  getRevisionNoteDetail: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient,
}));

vi.mock("@/lib/data/notes", () => ({
  getRevisionNoteDetail,
}));

import { DELETE, GET, PATCH } from "@/app/api/notes/[noteId]/route";

describe("note detail API", () => {
  beforeEach(() => {
    getRevisionNoteDetail.mockResolvedValue({
      id: "note-1",
      userId: "user-1",
      sessionId: "session-1",
      messageId: "message-1",
      title: "Saved note",
      subjectTag: "Physics",
      chapterTag: "Unit 1",
      annotation: "Important",
      colorLabel: "yellow",
      createdAt: "2026-05-17T00:00:00.000Z",
      updatedAt: "2026-05-17T00:00:00.000Z",
      questionContent: "What is force?",
      answerContent: "Force is push or pull.",
      citations: [],
      reviewedCount: 0,
      lastReviewedAt: null,
    });

    const updateEq = vi.fn();
    const updateChain = {
      eq: updateEq,
    };
    updateEq
      .mockReturnValueOnce(updateChain)
      .mockReturnValueOnce({
        select: vi.fn(() => ({
          maybeSingle: vi.fn(async () => ({ data: { id: "note-1" }, error: null })),
        })),
      });

    const deleteEq = vi.fn();
    const deleteChain = {
      eq: deleteEq,
    };
    deleteEq
      .mockReturnValueOnce(deleteChain)
      .mockReturnValueOnce({
        select: vi.fn(() => ({
          maybeSingle: vi.fn(async () => ({ data: { id: "note-1" }, error: null })),
        })),
      });

    const revisionNotesTable = {
      update: vi.fn(() => updateChain),
      delete: vi.fn(() => deleteChain),
    };

    createSupabaseServerClient.mockResolvedValue({
      auth: {
        getUser: vi.fn(async () => ({
          data: { user: { id: "user-1" } },
        })),
      },
      from: vi.fn((table: string) => {
        if (table === "revision_notes") return revisionNotesTable;
        throw new Error(`Unexpected table access: ${table}`);
      }),
    });
  });

  it("loads note detail for the current user", async () => {
    const response = await GET(
      new Request("http://localhost/api/notes/note-1", {
        method: "GET",
      }),
      { params: Promise.resolve({ noteId: "note-1" }) },
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      id: "note-1",
      title: "Saved note",
      subjectTag: "Physics",
    });
  });

  it("updates note metadata for the current user", async () => {
    const response = await PATCH(
      new Request("http://localhost/api/notes/note-1", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: "Updated note",
          subjectTag: "Biology",
          chapterTag: "Plants",
          annotation: "Updated annotation",
          colorLabel: "green",
        }),
      }),
      { params: Promise.resolve({ noteId: "note-1" }) },
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true });
  });

  it("deletes a note for the current user", async () => {
    const response = await DELETE(
      new Request("http://localhost/api/notes/note-1", {
        method: "DELETE",
      }),
      { params: Promise.resolve({ noteId: "note-1" }) },
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true });
  });
});
