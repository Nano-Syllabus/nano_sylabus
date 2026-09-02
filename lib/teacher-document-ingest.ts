import { randomUUID } from "node:crypto";
import http from "node:http";
import https from "node:https";
import { getTenantApiEnv } from "@/lib/env";

type ApiRecord = Record<string, unknown>;

export class TeacherDocumentIngestError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = "TeacherDocumentIngestError";
  }
}

function safeFilename(name: string) {
  return name.replace(/[\\/\r\n"]/g, "_").slice(0, 240) || "contribution";
}

function responseMessage(payload: unknown, fallback: string) {
  if (!payload || typeof payload !== "object") return fallback;
  const row = payload as ApiRecord;
  return String(row.detail ?? row.error ?? row.message ?? fallback);
}

async function post(
  url: URL,
  rejectUnauthorized: boolean,
  timeoutMs: number,
  headers: Record<string, string | number>,
  body: Buffer | string,
) {
  const transport = url.protocol === "https:" ? https : http;
  return new Promise<ApiRecord>((resolve, reject) => {
    const request = transport.request(
      url,
      { method: "POST", rejectUnauthorized, headers },
      (response) => {
        let raw = "";
        response.setEncoding("utf8");
        response.on("data", (chunk: string) => { raw += chunk; });
        response.on("end", () => {
          let payload: unknown = {};
          try { payload = raw.trim() ? JSON.parse(raw) : {}; } catch {}
          const status = response.statusCode ?? 502;
          if (status >= 400) {
            reject(new TeacherDocumentIngestError(responseMessage(payload, `Document service failed (${status}).`), status));
            return;
          }
          resolve(payload as ApiRecord);
        });
      },
    );
    request.setTimeout(timeoutMs, () => request.destroy(new Error("Document indexing timed out.")));
    request.on("error", reject);
    request.write(body);
    request.end();
  });
}

function uploadedPath(payload: ApiRecord) {
  if (typeof payload.path === "string") return payload.path;
  if (payload.file && typeof payload.file === "object") {
    const path = (payload.file as ApiRecord).path;
    if (typeof path === "string") return path;
  }
  return "";
}

/** Uploads bytes into a creator collection and waits for indexing to finish. */
export async function ingestTeacherDocument(input: {
  collectionKey: string;
  fileName: string;
  mimeType: string;
  buffer: Buffer;
  path: string;
  metadata?: Record<string, unknown>;
}) {
  const { baseUrl, rejectUnauthorized, timeoutMs } = getTenantApiEnv();
  const boundary = `----NanoCommunity${randomUUID()}`;
  const parts: Buffer[] = [
    Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="path"\r\n\r\n${input.path}\r\n`),
  ];
  if (input.metadata) {
    parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="metadata"\r\n\r\n${JSON.stringify(input.metadata)}\r\n`));
  }
  parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${safeFilename(input.fileName)}"\r\nContent-Type: ${input.mimeType || "application/octet-stream"}\r\n\r\n`));
  parts.push(input.buffer);
  parts.push(Buffer.from(`\r\n--${boundary}--\r\n`));
  const body = Buffer.concat(parts);
  const upload = await post(
    new URL("/v1/collection/upload", baseUrl),
    rejectUnauthorized,
    Math.max(timeoutMs, 180_000),
    {
      Authorization: `Bearer ${input.collectionKey}`,
      "Content-Type": `multipart/form-data; boundary=${boundary}`,
      "Content-Length": body.length,
    },
    body,
  );
  const collectionPath = uploadedPath(upload);
  if (!collectionPath) throw new Error("The uploaded document did not return a collection path.");
  const indexBody = JSON.stringify({ path: collectionPath });
  const index = await post(
    new URL("/v1/collection/index-document", baseUrl),
    rejectUnauthorized,
    Math.max(timeoutMs, 270_000),
    {
      Authorization: `Bearer ${input.collectionKey}`,
      "Content-Type": "application/json",
      "Content-Length": Buffer.byteLength(indexBody),
    },
    indexBody,
  );
  return { upload, index, collectionPath };
}
