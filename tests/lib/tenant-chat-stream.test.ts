import http from "node:http";
import { afterEach, describe, expect, it, vi } from "vitest";
import { chatTenantStream, type TenantStreamEvent } from "@/lib/tenant/client";

/**
 * The chat stream's delivery contract.
 *
 * `onEvent` is typed `void | Promise<void>`, so an async consumer is allowed —
 * and the route handler that feeds the browser's SSE is exactly that kind of
 * consumer. The handler used to be `response.on("data", async ...)` awaiting
 * inside a loop, which Node does not await: two chunks arriving close together
 * ran their handlers concurrently and could deliver tokens out of order. An
 * answer that reads as shuffled sentences fails no assertion anywhere in the
 * stack; it just looks like the model wrote nonsense.
 */
function sseServer(frames: string[], gapMs = 0) {
  return http.createServer((request, response) => {
    request.resume();
    request.on("end", async () => {
      response.writeHead(200, { "Content-Type": "text/event-stream" });
      for (const frame of frames) {
        response.write(frame);
        if (gapMs) await new Promise((r) => setTimeout(r, gapMs));
      }
      response.end();
    });
  });
}

async function collect(frames: string[], onEach?: () => Promise<void>) {
  const server = sseServer(frames);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Test server did not start.");
    vi.stubEnv("TENANT_API_BASE_URL", `http://127.0.0.1:${address.port}`);
    vi.stubEnv("TENANT_API_TOKEN", "unused");
    vi.stubEnv("TENANT_API_REJECT_UNAUTHORIZED", "0");

    const seen: TenantStreamEvent[] = [];
    await chatTenantStream(
      {
        question: "q", answerInstruction: "", contextSummary: "",
        subject: "Digital Logic", tenant: "nano-syllabus", namespaces: ["ns"], topK: 8,
      },
      async (event) => {
        if (onEach) await onEach();
        seen.push(event);
      },
    );
    return seen;
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

const token = (text: string) => `event: token\ndata: ${JSON.stringify({ text })}\n\n`;

describe("chatTenantStream", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("delivers tokens in order to an async consumer", async () => {
    // Every frame is written in one pass, so they arrive coalesced — the case
    // that used to interleave.
    const frames = [Array.from({ length: 12 }, (_, i) => token(String(i))).join("")];
    // A consumer that yields on every event: enough to interleave if the events
    // were not chained.
    const seen = await collect(frames, () => new Promise((r) => setTimeout(r, 1)));

    const texts = seen.filter((e) => e.type === "token").map((e) => (e as { text: string }).text);
    expect(texts).toEqual(Array.from({ length: 12 }, (_, i) => String(i)));
  });

  it("delivers the final frame before it resolves", async () => {
    // The `done` event is the last thing written and has no trailing blank line
    // to close it, so it is parsed out of the leftover buffer at `end`. Resolving
    // without waiting for the queued work drops it.
    const frames = [token("a"), token("b"), 'event: done\ndata: {"ok":true}\n'];
    const seen = await collect(frames, () => new Promise((r) => setTimeout(r, 1)));

    expect(seen.map((e) => e.type)).toEqual(["token", "token", "done"]);
  });

  it("surfaces a consumer that throws instead of resolving as if it succeeded", async () => {
    const server = sseServer([token("a"), token("b")]);
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    try {
      const address = server.address();
      if (!address || typeof address === "string") throw new Error("Test server did not start.");
      vi.stubEnv("TENANT_API_BASE_URL", `http://127.0.0.1:${address.port}`);
      vi.stubEnv("TENANT_API_TOKEN", "unused");
      vi.stubEnv("TENANT_API_REJECT_UNAUTHORIZED", "0");

      await expect(
        chatTenantStream(
          {
            question: "q", answerInstruction: "", contextSummary: "",
            subject: "Digital Logic", tenant: "nano-syllabus", namespaces: ["ns"], topK: 8,
          },
          async () => {
            throw new Error("consumer exploded");
          },
        ),
      ).rejects.toThrow();
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });
});
