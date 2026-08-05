import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  class MockTeacherApiError extends Error {
    constructor(message: string, readonly status: number) { super(message); }
  }
  return {
    getTeacherProfile: vi.fn(),
    getTeacherSubjects: vi.fn(),
    retrieveTeacherChunks: vi.fn(),
    MockTeacherApiError,
  };
});

vi.mock("@/app/teachers/actions", () => ({ getTeacherProfile: mocks.getTeacherProfile }));
vi.mock("@/lib/teacher-app/client", () => ({
  getTeacherSubjects: mocks.getTeacherSubjects,
  retrieveTeacherChunks: mocks.retrieveTeacherChunks,
  TeacherApiError: mocks.MockTeacherApiError,
}));

import { POST } from "@/app/api/teacher/query/route";

function request(body: unknown) {
  return new Request("http://localhost/api/teacher/query", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/teacher/query", () => {
  beforeEach(() => {
    mocks.getTeacherProfile.mockResolvedValue({ id: "teacher-1", collection_sk: "collection-secret" });
    mocks.getTeacherSubjects.mockResolvedValue({ subjects: [{ name: "Physics", slug: "ramesh-teacher-physics" }] });
    mocks.retrieveTeacherChunks.mockResolvedValue({
      chunks: [{ id: "chunk-1", score: 0.88, text: "Lenz's law opposes the change.", source: { filename: "induction.pdf", page: 12, section: "Lenz's law" } }],
    });
  });

  it("searches only the selected subject namespace and hides the collection key", async () => {
    const response = await POST(request({ query: "minus sign", subjectSlug: "ramesh-teacher-physics", topK: 8 }));
    const payload = await response.json();
    expect(response.status).toBe(200);
    expect(payload.results).toEqual([{ id: "chunk-1", name: "induction.pdf", where: "page 12 · Lenz's law", content: "Lenz's law opposes the change.", score: 0.88 }]);
    expect(JSON.stringify(payload)).not.toContain("collection-secret");
    expect(mocks.retrieveTeacherChunks).toHaveBeenCalledWith("collection-secret", "minus sign", 8, "ramesh-teacher-physics");
  });

  it("rejects a namespace outside this teacher collection", async () => {
    const response = await POST(request({ query: "private", subjectSlug: "another-teacher-subject" }));
    expect(response.status).toBe(404);
    expect(mocks.retrieveTeacherChunks).not.toHaveBeenCalled();
  });
});
