import http from "node:http";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getTeacherProfile: vi.fn(),
  getTenantApiEnv: vi.fn(),
}));

vi.mock("@/app/teachers/actions", () => ({
  getTeacherProfile: mocks.getTeacherProfile,
}));

vi.mock("@/lib/env", () => ({
  getTenantApiEnv: mocks.getTenantApiEnv,
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
    mocks.getTeacherProfile.mockResolvedValue({
      id: "teacher-1",
      user_id: "user-1",
      handle: "ramesh",
      collection_sk: "collection-secret",
    });
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

      const response = await POST(uploadRequest("Physics/Notes"));
      const payload = await response.json();

      expect(response.status).toBe(200);
      expect(payload.jobId).toBe("job-1");
      expect(JSON.stringify(payload)).not.toContain("collection-secret");
      expect(calls.map((call) => call.path)).toEqual([
        "/v1/collection/upload",
        "/v1/collection/index-document",
      ]);
      expect(calls.every((call) => call.authorization === "Bearer collection-secret")).toBe(true);
      expect(calls[0].body).toContain("Physics/Notes");
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
    expect(mocks.getTenantApiEnv).toHaveBeenCalledOnce();
  });
});
