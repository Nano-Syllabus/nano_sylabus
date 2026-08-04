import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  class MockTeacherApiError extends Error {
    constructor(
      message: string,
      readonly status: number,
      readonly payload?: unknown,
    ) {
      super(message);
    }
  }

  return {
    createSupabaseServerClient: vi.fn(),
    getTeacherProfile: vi.fn(),
    getTeacherMe: vi.fn(),
    getTeacherSubjects: vi.fn(),
    getTeacherSourceTree: vi.fn(),
    getTeacherDocuments: vi.fn(),
    MockTeacherApiError,
  };
});

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: mocks.createSupabaseServerClient,
}));

vi.mock("@/app/teachers/actions", () => ({
  getTeacherProfile: mocks.getTeacherProfile,
}));

vi.mock("@/lib/teacher-app/client", () => ({
  getTeacherMe: mocks.getTeacherMe,
  getTeacherSubjects: mocks.getTeacherSubjects,
  getTeacherSourceTree: mocks.getTeacherSourceTree,
  getTeacherDocuments: mocks.getTeacherDocuments,
  TeacherApiError: mocks.MockTeacherApiError,
}));

import { GET } from "@/app/api/teacher/workspace/route";

describe("GET /api/teacher/workspace", () => {
  beforeEach(() => {
    mocks.createSupabaseServerClient.mockResolvedValue({
      auth: {
        getUser: vi.fn(async () => ({
          data: { user: { id: "user-1", email: "teacher@example.com" } },
        })),
      },
    });
    mocks.getTeacherProfile.mockResolvedValue({
      id: "teacher-1",
      user_id: "user-1",
      handle: "ramesh",
      collection_sk: "collection-secret",
    });
    mocks.getTeacherMe.mockResolvedValue({ collection: "ramesh-teacher", indexed_files: 2 });
    mocks.getTeacherSubjects.mockResolvedValue({
      subjects: [{ name: "Physics", slug: "physics", folder_path: "Physics" }],
    });
    mocks.getTeacherSourceTree.mockResolvedValue({ name: "ramesh-teacher", children: [] });
    mocks.getTeacherDocuments.mockResolvedValue([
      { document_id: "doc-1", name: "notes.pdf", path: "Physics/Notes/notes.pdf" },
    ]);
  });

  it("returns the real workspace without exposing the collection key", async () => {
    const response = await GET();
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.teacher).toEqual({ handle: "ramesh", email: "teacher@example.com" });
    expect(payload.subjects.subjects[0].name).toBe("Physics");
    expect(JSON.stringify(payload)).not.toContain("collection-secret");
    expect(mocks.getTeacherMe).toHaveBeenCalledWith("collection-secret");
    expect(mocks.getTeacherDocuments).toHaveBeenCalledWith("collection-secret");
  });

  it("rejects an unauthenticated request before reading the teacher profile", async () => {
    mocks.createSupabaseServerClient.mockResolvedValue({
      auth: { getUser: vi.fn(async () => ({ data: { user: null } })) },
    });

    const response = await GET();

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: "Unauthorized" });
    expect(mocks.getTeacherProfile).not.toHaveBeenCalled();
  });

  it("turns an invalid collection key into a recoverable workspace error", async () => {
    mocks.getTeacherMe.mockRejectedValue(
      new mocks.MockTeacherApiError("Unauthorized", 401),
    );

    const response = await GET();

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      error: "This teacher workspace key is no longer valid. Ask an administrator to rotate it.",
    });
  });
});
