import http from "node:http";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  class TeacherApiError extends Error {
    constructor(
      message: string,
      readonly status: number,
      readonly payload?: unknown,
    ) {
      super(message);
    }
  }

  return {
    getTeacherProfile: vi.fn(),
    getTenantApiEnv: vi.fn(),
    getTeacherSubjects: vi.fn(),
    TeacherApiError,
    createSignedUploadUrl: vi.fn(),
    download: vi.fn(),
    remove: vi.fn(),
    upload: vi.fn(),
    documentUpsert: vi.fn(),
    existingPreview: vi.fn(),
  };
});

vi.mock("@/app/teachers/actions", () => ({
  getTeacherProfile: mocks.getTeacherProfile,
}));

vi.mock("@/lib/env", () => ({
  getTenantApiEnv: mocks.getTenantApiEnv,
}));

vi.mock("@/lib/teacher-app/client", () => ({
  getTeacherSubjects: mocks.getTeacherSubjects,
  TeacherApiError: mocks.TeacherApiError,
}));

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: () => ({
    storage: {
      from: () => ({
        createSignedUploadUrl: mocks.createSignedUploadUrl,
        download: mocks.download,
        remove: mocks.remove,
        upload: mocks.upload,
      }),
    },
    from: () => ({
      select: () => ({
        eq: () => ({
          eq: () => ({ maybeSingle: mocks.existingPreview }),
        }),
      }),
      upsert: mocks.documentUpsert,
    }),
  }),
}));

import { POST } from "@/app/api/teacher/upload/route";

function uploadRequest(path: string) {
  const form = new FormData();
  form.append("file", new File(["teacher notes"], "notes.pdf", { type: "application/pdf" }));
  form.append("path", path);
  return new Request("http://localhost/api/teacher/upload", { method: "POST", body: form });
}

describe("POST /api/teacher/upload", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getTeacherProfile.mockResolvedValue({
      id: "teacher-1",
      user_id: "user-1",
      handle: "ramesh",
      collection_sk: "collection-secret",
    });
    mocks.getTeacherSubjects.mockResolvedValue({
      subjects: [{ slug: "physics", name: "Physics", folder_path: "Physics" }],
    });
    mocks.createSignedUploadUrl.mockResolvedValue({ data: { token: "upload-token" }, error: null });
    mocks.download.mockResolvedValue({
      data: new Blob(["teacher notes"], { type: "application/pdf" }),
      error: null,
    });
    mocks.remove.mockResolvedValue({ data: [], error: null });
    mocks.upload.mockResolvedValue({ data: {}, error: null });
    mocks.existingPreview.mockResolvedValue({ data: null, error: null });
    mocks.documentUpsert.mockResolvedValue({ data: null, error: null });
  });

  it("prepares a private signed upload for the creator UI", async () => {
    const response = await POST(
      new Request("http://localhost/api/teacher/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "prepare",
          path: "Physics/Syllabus",
          fileName: "chemistry.pdf",
          mimeType: "application/pdf",
          sizeBytes: 12 * 1024 * 1024,
        }),
      }),
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toMatchObject({
      bucket: "teacher-documents",
      token: "upload-token",
      maxLabel: "50 MB",
    });
    expect(payload.storagePath).toMatch(/^teacher-1\/staged\/.+-chemistry\.pdf$/);
    expect(mocks.createSignedUploadUrl).toHaveBeenCalledWith(payload.storagePath);
  });

  it("completes a signed upload and indexes the stored document", async () => {
    const calls: Array<{ path: string; authorization: string; body: string }> = [];
    const server = http.createServer((request, response) => {
      const chunks: Buffer[] = [];
      request.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
      request.on("end", () => {
        calls.push({
          path: request.url || "",
          authorization: String(request.headers.authorization || ""),
          body: Buffer.concat(chunks).toString("utf8"),
        });
        response.setHeader("Content-Type", "application/json");
        response.end(
          request.url === "/v1/collection/upload"
            ? JSON.stringify({ path: "Physics/Syllabus/chemistry.pdf" })
            : JSON.stringify({ job_id: "job-signed", status: "queued" }),
        );
      });
    });

    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    try {
      const address = server.address();
      if (!address || typeof address === "string") throw new Error("Test server did not start.");
      mocks.getTenantApiEnv.mockReturnValue({
        baseUrl: `http://127.0.0.1:${address.port}`,
        rejectUnauthorized: false,
        timeoutMs: 30_000,
      });

      const response = await POST(
        new Request("http://localhost/api/teacher/upload", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "complete",
            path: "Physics/Syllabus",
            storagePath: "teacher-1/staged/private-chemistry.pdf",
            fileName: "chemistry.pdf",
            mimeType: "application/pdf",
          }),
        }),
      );
      const payload = await response.json();

      expect(response.status).toBe(200);
      expect(payload.jobId).toBe("job-signed");
      expect(calls.map((call) => call.path)).toEqual([
        "/v1/collection/upload",
        "/v1/collection/index-document",
      ]);
      expect(calls.every((call) => call.authorization === "Bearer collection-secret")).toBe(true);
      expect(mocks.download).toHaveBeenCalledWith("teacher-1/staged/private-chemistry.pdf");
      expect(mocks.documentUpsert).toHaveBeenCalledWith(
        expect.objectContaining({
          teacher_id: "teacher-1",
          collection_path: "Physics/Syllabus/chemistry.pdf",
          storage_path: "teacher-1/staged/private-chemistry.pdf",
          original_name: "chemistry.pdf",
        }),
        { onConflict: "teacher_id,collection_path" },
      );
      expect(mocks.remove).not.toHaveBeenCalled();
    } finally {
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
    }
  });

  it("uploads to the selected shelf and starts an indexing job", async () => {
    const calls: Array<{ path: string; authorization: string; body: string }> = [];
    const server = http.createServer((request, response) => {
      const chunks: Buffer[] = [];
      request.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
      request.on("end", () => {
        calls.push({
          path: request.url || "",
          authorization: String(request.headers.authorization || ""),
          body: Buffer.concat(chunks).toString("utf8"),
        });
        response.setHeader("Content-Type", "application/json");
        response.end(
          request.url === "/v1/collection/upload"
            ? JSON.stringify({ path: "Physics/Notes/notes.pdf" })
            : JSON.stringify({ job_id: "job-1", status: "queued" }),
        );
      });
    });

    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    try {
      const address = server.address();
      if (!address || typeof address === "string") throw new Error("Test server did not start.");
      mocks.getTenantApiEnv.mockReturnValue({
        baseUrl: `http://127.0.0.1:${address.port}`,
        rejectUnauthorized: false,
        timeoutMs: 30_000,
      });

      const response = await POST(uploadRequest("Physics/Notes/Chapter 1"));
      const payload = await response.json();

      expect(response.status).toBe(200);
      expect(payload.jobId).toBe("job-1");
      expect(JSON.stringify(payload)).not.toContain("collection-secret");
      expect(calls.map((call) => call.path)).toEqual([
        "/v1/collection/upload",
        "/v1/collection/index-document",
      ]);
      expect(calls.every((call) => call.authorization === "Bearer collection-secret")).toBe(true);
      expect(calls[0].body).toContain("Physics/Notes/Chapter 1");
      expect(JSON.parse(calls[1].body)).toEqual({ path: "Physics/Notes/notes.pdf" });
    } finally {
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
    }
  });

  it("blocks a path outside the three subject shelves", async () => {
    const response = await POST(uploadRequest("../Other"));

    expect(response.status).toBe(400);
    expect(mocks.getTenantApiEnv).not.toHaveBeenCalled();
  });

  it("blocks a safe path that is not inside a pinned subject shelf", async () => {
    mocks.getTenantApiEnv.mockReturnValue({
      baseUrl: "http://127.0.0.1:1",
      rejectUnauthorized: false,
      timeoutMs: 30_000,
    });

    const response = await POST(uploadRequest("Other/Notes/Chapter 1"));

    expect(response.status).toBe(400);
    expect(mocks.getTeacherSubjects).toHaveBeenCalledWith("collection-secret");
  });

  it("states the creator upload limit before accepting a large file", async () => {
    const response = await POST(
      new Request("http://localhost/api/teacher/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "prepare",
          path: "Physics/Syllabus",
          fileName: "large.pdf",
          mimeType: "application/pdf",
          sizeBytes: 50 * 1024 * 1024 + 1,
        }),
      }),
    );
    const payload = await response.json();

    expect(response.status).toBe(413);
    expect(payload.error).toContain("50 MB");
    expect(mocks.getTenantApiEnv).not.toHaveBeenCalled();
  });
});
