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

import { DELETE, GET, POST } from "@/app/api/teacher/documents/[documentId]/route";

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

  it("indexes by path when the browser supplies one", async () => {
    // The file this route exists for most — stored but never indexed — has no
    // index row, so its id 404s and only the path resolves.
    const response = await POST(
      new Request("http://localhost", {
        method: "POST",
        body: JSON.stringify({ path: "Physics/Syllabus/physics-syllabus.txt" }),
      }),
      context(),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ jobId: "job-1" });
    expect(mocks.indexTeacherDocument).toHaveBeenCalledWith("collection-secret", {
      path: "Physics/Syllabus/physics-syllabus.txt",
    });
  });

  it("refuses a path that climbs out of the collection", async () => {
    const response = await POST(
      new Request("http://localhost", {
        method: "POST",
        body: JSON.stringify({ path: "../other-teacher/Notes/secret.pdf" }),
      }),
      context(),
    );

    expect(response.status).toBe(400);
    expect(mocks.indexTeacherDocument).not.toHaveBeenCalled();
  });

  it("still describes a document the collection index has never heard of", async () => {
    mocks.getTeacherDocument.mockRejectedValue(new mocks.MockTeacherApiError("Nope", 404));

    const response = await GET(
      new Request("http://localhost?path=Physics%2FSyllabus%2Fphysics-syllabus.txt"),
      context(),
    );
    const payload = await response.json();

    // A 404 here would read as "your file is gone" about a file that is on the
    // shelf, and would take the preview and the Index now button with it.
    expect(response.status).toBe(200);
    expect(payload.document).toMatchObject({
      path: "Physics/Syllabus/physics-syllabus.txt",
      indexed: false,
      chunk_count: 0,
    });
    expect(payload.file.name).toBe("physics-syllabus.txt");
  });

  it("still 404s a missing document when the browser named no path", async () => {
    mocks.getTeacherDocument.mockRejectedValue(new mocks.MockTeacherApiError("Nope", 404));

    const response = await GET(new Request("http://localhost"), context());

    expect(response.status).toBe(404);
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
