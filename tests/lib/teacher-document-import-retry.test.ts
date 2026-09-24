import http from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/teacher-app/client", () => ({ getTeacherSubjects: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({ createSupabaseAdminClient: vi.fn() }));

import { isDroppedConnection, uploadAndIndex } from "@/lib/teacher-document-import";

/**
 * "socket hang up" is what a creator read on a failed Drive row. It is a fault in
 * the connection, not the file, so the request is sent again before anything is
 * reported — and if it still fails, the row says so in words, not Node's.
 */

let server: http.Server;
let hangUps: number;
let requests: string[];

function start(hangUpFirst: number) {
  hangUps = hangUpFirst;
  requests = [];
  server = http.createServer((request, response) => {
    let body = "";
    request.on("data", (chunk) => (body += chunk));
    request.on("end", () => {
      requests.push(request.url ?? "");
      if (hangUps > 0) {
        hangUps -= 1;
        request.socket.destroy(); // closes with no response: "socket hang up"
        return;
      }
      response.setHeader("Content-Type", "application/json");
      response.end(
        request.url === "/v1/collection/upload"
          ? JSON.stringify({ path: "Nims/Notes/notes.pdf" })
          : JSON.stringify({ document_id: "doc-1", job_id: "job-1" }),
      );
    });
  });
  return new Promise<void>((resolve) =>
    server.listen(0, "127.0.0.1", () => {
      process.env.TENANT_API_BASE_URL = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
      process.env.TENANT_API_TOKEN = "token";
      resolve();
    }),
  );
}

const input = {
  collectionKey: "collection-secret",
  fileBuffer: Buffer.from("pdf bytes"),
  fileName: "notes.pdf",
  mimeType: "application/pdf",
  path: "Nims/Notes",
};

describe("sending a document to the tenant service", () => {
  beforeEach(() => {
    requests = [];
  });
  afterEach(async () => {
    await new Promise((resolve) => server.close(resolve));
  });

  it("sends the upload again after the connection drops", async () => {
    await start(1);
    const result = await uploadAndIndex(input);
    expect(result.collectionPath).toBe("Nims/Notes/notes.pdf");
    expect(requests).toEqual([
      "/v1/collection/upload",
      "/v1/collection/upload",
      "/v1/collection/index-document",
    ]);
  }, 15_000);

  it("reports a connection that keeps dropping in words, not as a socket error", async () => {
    await start(99);
    await expect(uploadAndIndex(input)).rejects.toThrow(/dropped the connection/);
    expect(requests).toHaveLength(3);
  }, 15_000);

  it("recognises only connection faults as retryable", () => {
    expect(isDroppedConnection(new Error("socket hang up"))).toBe(true);
    expect(isDroppedConnection(Object.assign(new Error("read"), { code: "ECONNRESET" }))).toBe(true);
    expect(isDroppedConnection(new Error("Document service timed out after 30000ms."))).toBe(false);
    expect(isDroppedConnection(new Error("Document service request failed (500)."))).toBe(false);
  });
});
