import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  class MockTeacherApiError extends Error {
    constructor(message: string, readonly status: number) {
      super(message);
    }
  }
  return {
    getTeacherProfile: vi.fn(),
    indexTeacherDocument: vi.fn(),
    deleteTeacherDocument: vi.fn(),
    getTeacherDocument: vi.fn(),
    createSupabaseAdminClient: vi.fn(),
    MockTeacherApiError,
  };
});

vi.mock("@/app/teachers/actions", () => ({ getTeacherProfile: mocks.getTeacherProfile }));
vi.mock("@/lib/teacher-app/client", () => ({
  indexTeacherDocument: mocks.indexTeacherDocument,
  deleteTeacherDocument: mocks.deleteTeacherDocument,
  getTeacherDocument: mocks.getTeacherDocument,
  TeacherApiError: mocks.MockTeacherApiError,
}));
vi.mock("@/lib/supabase/admin", () => ({ createSupabaseAdminClient: mocks.createSupabaseAdminClient }));

import { DELETE, POST } from "@/app/api/teacher/documents/[documentId]/route";

const context = (documentId = "doc-1") => ({ params: Promise.resolve({ documentId }) });

describe("/api/teacher/documents/[documentId]", () => {
  beforeEach(() => {
    mocks.getTeacherProfile.mockResolvedValue({
      id: "teacher-1",
      user_id: "user-1",
      handle: "ramesh",
      collection_sk: "collection-secret",
    });
    mocks.indexTeacherDocument.mockResolvedValue({ job_id: "job-1", status: "queued" });
    mocks.deleteTeacherDocument.mockResolvedValue({ deleted: true });
    mocks.getTeacherDocument.mockResolvedValue({ source_path: "Physics/Notes/notes.pdf" });
    const chain = { select: vi.fn(), eq: vi.fn(), maybeSingle: vi.fn(async () => ({ data: null, error: null })) };
    chain.select.mockReturnValue(chain); chain.eq.mockReturnValue(chain);
    mocks.createSupabaseAdminClient.mockReturnValue({ from: vi.fn(() => chain), storage: { from: vi.fn() } });
  });

  it("re-indexes by document ID and returns the polling job ID", async () => {
    const response = await POST(new Request("http://localhost", { method: "POST" }), context());
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.jobId).toBe("job-1");
    expect(JSON.stringify(payload)).not.toContain("collection-secret");
    expect(mocks.indexTeacherDocument).toHaveBeenCalledWith("collection-secret", {
      documentId: "doc-1",
    });
  });

  it("deletes only through the authenticated teacher collection", async () => {
    const response = await DELETE(new Request("http://localhost", { method: "DELETE" }), context());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ deleted: true });
    expect(mocks.deleteTeacherDocument).toHaveBeenCalledWith("collection-secret", "doc-1");
  });

  it("does not reveal whether another collection owns a missing document", async () => {
    mocks.getTeacherDocument.mockRejectedValue(new mocks.MockTeacherApiError("Nope", 404));

    const response = await DELETE(new Request("http://localhost", { method: "DELETE" }), context("other"));

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({
      error: "Document not found in this teacher collection.",
    });
  });
});
