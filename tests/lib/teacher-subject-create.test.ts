import http from "node:http";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createTeacherSubject } from "@/lib/teacher-app/client";

describe("createTeacherSubject", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("creates the three shelves before pinning the subject", async () => {
    const calls: Array<{ path: string; authorization: string; body: unknown }> = [];
    const server = http.createServer((request, response) => {
      let raw = "";
      request.setEncoding("utf8");
      request.on("data", (chunk) => (raw += chunk));
      request.on("end", () => {
        calls.push({
          path: request.url || "",
          authorization: String(request.headers.authorization || ""),
          body: raw ? JSON.parse(raw) : null,
        });
        response.setHeader("Content-Type", "application/json");
        response.statusCode = 201;
        response.end(
          request.url === "/v1/collection/subjects"
            ? JSON.stringify({
                collection: "ramesh-teacher",
                subject: {
                  name: "Physics",
                  slug: "ramesh_teacher_physics",
                  namespace: "ramesh-teacher",
                  folder_path: "Physics",
                },
              })
            : JSON.stringify({ created: true }),
        );
      });
    });

    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    try {
      const address = server.address();
      if (!address || typeof address === "string") throw new Error("Test server did not start.");
      vi.stubEnv("TENANT_API_BASE_URL", `http://127.0.0.1:${address.port}`);
      vi.stubEnv("TENANT_API_TOKEN", "unused-tenant-token");
      vi.stubEnv("TENANT_API_REJECT_UNAUTHORIZED", "0");

      const subject = await createTeacherSubject("collection-secret", "Physics");

      expect(subject).toEqual({
        name: "Physics",
        slug: "ramesh_teacher_physics",
        namespace: "ramesh-teacher",
        folder_path: "Physics",
      });
      expect(calls).toEqual([
        {
          path: "/v1/collection/mkdir",
          authorization: "Bearer collection-secret",
          body: { path: "Physics/Syllabus" },
        },
        {
          path: "/v1/collection/mkdir",
          authorization: "Bearer collection-secret",
          body: { path: "Physics/Notes" },
        },
        {
          path: "/v1/collection/mkdir",
          authorization: "Bearer collection-secret",
          body: { path: "Physics/Question Bank" },
        },
        {
          path: "/v1/collection/subjects",
          authorization: "Bearer collection-secret",
          body: { name: "Physics", folder_path: "Physics" },
        },
      ]);
    } finally {
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
    }
  });
});
