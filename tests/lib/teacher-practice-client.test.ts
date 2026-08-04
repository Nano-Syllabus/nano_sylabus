import http from "node:http";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  generateTeacherPracticePaper,
  gradeTeacherPracticePaper,
  gradeTeacherPracticePaperFile,
} from "@/lib/teacher-app/client";

describe("generateTeacherPracticePaper", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("uses the collection key and collection-implied namespace", async () => {
    let received: { path: string; authorization: string; body: Record<string, unknown> } | null = null;
    const server = http.createServer((request, response) => {
      let raw = "";
      request.setEncoding("utf8");
      request.on("data", (chunk) => (raw += chunk));
      request.on("end", () => {
        received = {
          path: request.url || "",
          authorization: String(request.headers.authorization || ""),
          body: JSON.parse(raw),
        };
        response.setHeader("Content-Type", "application/json");
        response.end(JSON.stringify({ id: "exam-1", questions: [], total_marks: 10 }));
      });
    });

    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    try {
      const address = server.address();
      if (!address || typeof address === "string") throw new Error("Test server did not start.");
      vi.stubEnv("TENANT_API_BASE_URL", `http://127.0.0.1:${address.port}`);
      vi.stubEnv("TENANT_API_TOKEN", "unused-tenant-token");
      vi.stubEnv("TENANT_API_REJECT_UNAUTHORIZED", "0");

      await generateTeacherPracticePaper("collection-secret", {
        subject: "Physics",
        title: "Unit test",
        pass_marks: 4,
        bands: [{ label: "Short", question_type: "theory", count: 2, marks_each: 5 }],
      });

      expect(received).toEqual({
        path: "/api/v1/practice/generate",
        authorization: "Bearer collection-secret",
        body: {
          subject: "Physics",
          title: "Unit test",
          pass_marks: 4,
          bands: [{ label: "Short", question_type: "theory", count: 2, marks_each: 5 }],
        },
      });
      expect(received?.body).not.toHaveProperty("namespaces");
    } finally {
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
    }
  });

  it("uploads an answer sheet with the collection key", async () => {
    let received: { path: string; authorization: string; contentType: string; body: string } | null =
      null;
    const server = http.createServer((request, response) => {
      const chunks: Buffer[] = [];
      request.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
      request.on("end", () => {
        received = {
          path: request.url || "",
          authorization: String(request.headers.authorization || ""),
          contentType: String(request.headers["content-type"] || ""),
          body: Buffer.concat(chunks).toString("utf8"),
        };
        response.setHeader("Content-Type", "application/json");
        response.end(JSON.stringify({ total_score: 8, total_marks: 10, results: [] }));
      });
    });

    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    try {
      const address = server.address();
      if (!address || typeof address === "string") throw new Error("Test server did not start.");
      vi.stubEnv("TENANT_API_BASE_URL", `http://127.0.0.1:${address.port}`);
      vi.stubEnv("TENANT_API_TOKEN", "unused-tenant-token");
      vi.stubEnv("TENANT_API_REJECT_UNAUTHORIZED", "0");

      const result = await gradeTeacherPracticePaperFile("collection-secret", "exam/one", {
        studentName: "Jane Doe",
        instruction: "Be strict",
        file: {
          name: "answers.pdf",
          mimeType: "application/pdf",
          buffer: Buffer.from("answer sheet"),
        },
      });

      expect(result.total_score).toBe(8);
      expect(received?.path).toBe("/api/v1/practice/papers/exam%2Fone/grade-file");
      expect(received?.authorization).toBe("Bearer collection-secret");
      expect(received?.contentType).toContain("multipart/form-data; boundary=");
      expect(received?.body).toContain('name="student_name"');
      expect(received?.body).toContain("Jane Doe");
      expect(received?.body).toContain('filename="answers.pdf"');
      expect(received?.body).toContain("answer sheet");
    } finally {
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
    }
  });

  it("grades typed answers with the collection key and saved paper id", async () => {
    let received: { path: string; authorization: string; body: unknown } | null = null;
    const server = http.createServer((request, response) => {
      let raw = "";
      request.setEncoding("utf8");
      request.on("data", (chunk) => (raw += chunk));
      request.on("end", () => {
        received = {
          path: request.url || "",
          authorization: String(request.headers.authorization || ""),
          body: JSON.parse(raw),
        };
        response.setHeader("Content-Type", "application/json");
        response.end(JSON.stringify({ total_score: 5, total_marks: 10, results: [] }));
      });
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    try {
      const address = server.address();
      if (!address || typeof address === "string") throw new Error("Test server did not start.");
      vi.stubEnv("TENANT_API_BASE_URL", `http://127.0.0.1:${address.port}`);
      vi.stubEnv("TENANT_API_TOKEN", "unused-tenant-token");
      vi.stubEnv("TENANT_API_REJECT_UNAUTHORIZED", "0");
      await gradeTeacherPracticePaper("collection-secret", "exam/one", {
        student_name: "Jane",
        answers: [{ question_id: "q-1", answer_text: "Typed answer" }],
      });
      expect(received).toEqual({
        path: "/api/v1/practice/papers/exam%2Fone/grade",
        authorization: "Bearer collection-secret",
        body: { student_name: "Jane", answers: [{ question_id: "q-1", answer_text: "Typed answer" }] },
      });
    } finally {
      await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    }
  });
});
