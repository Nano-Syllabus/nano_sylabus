import http from "node:http";
import { afterEach, describe, expect, it, vi } from "vitest";
import { askTeacherQuestion } from "@/lib/teacher-app/client";

describe("askTeacherQuestion", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("sends the subject namespace and conversation history to /v1/answer", async () => {
    let received: { authorization: string; body: unknown } | null = null;
    const server = http.createServer((request, response) => {
      let raw = "";
      request.setEncoding("utf8");
      request.on("data", (chunk) => (raw += chunk));
      request.on("end", () => {
        received = {
          authorization: String(request.headers.authorization || ""),
          body: JSON.parse(raw),
        };
        response.setHeader("Content-Type", "application/json");
        response.end(JSON.stringify({ answer_id: "a-1", answer: "Answer", chunks: [] }));
      });
    });

    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    try {
      const address = server.address();
      if (!address || typeof address === "string") throw new Error("Test server did not start.");
      vi.stubEnv("TENANT_API_BASE_URL", `http://127.0.0.1:${address.port}`);
      vi.stubEnv("TENANT_API_TOKEN", "unused-tenant-token");
      vi.stubEnv("TENANT_API_REJECT_UNAUTHORIZED", "0");

      await askTeacherQuestion("collection-secret", "Explain induction", 5, "physics-scope", [
        { role: "user", content: "What is magnetic flux?" },
        { role: "assistant", content: "It measures field through an area." },
      ]);

      expect(received).toEqual({
        authorization: "Bearer collection-secret",
        body: {
          query: "Explain induction",
          top_k: 5,
          namespace: "physics-scope",
          conversation_history: [
            { role: "user", content: "What is magnetic flux?" },
            { role: "assistant", content: "It measures field through an area." },
          ],
        },
      });
    } finally {
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
    }
  });
});
