import { randomUUID } from "node:crypto";
import http from "node:http";
import https from "node:https";
import { getTenantApiEnv } from "@/lib/env";
import { getTeacherSubjects, type ApiRecord as TeacherApiRecord } from "@/lib/teacher-app/client";
import { TEACHER_UPLOAD_MAX_LABEL, teacherUploadStorageFileName } from "@/lib/teacher-upload";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

/**
 * Putting one document into a creator's collection: upload, index, keep a
 * private preview.
 *
 * Lifted out of `app/api/teacher/upload/route.ts` when Drive imports became a
 * background queue. Three callers now walk this exact path — the browser's
 * staged upload, the small-file form post, and the queue drain — and the whole
 * point of the extraction is that they cannot drift: a document imported from
 * Drive must end up indistinguishable from the same document chosen from disk,
 * or the portal shows a preview for one and not the other with nothing on
 * screen explaining the difference.
 */

type ApiRecord = Record<string, unknown>;

// Uploading the bytes is quick, but PDF/OCR indexing is currently synchronous in
// the tenant service. Large notes and question banks routinely need longer than
// the general API timeout, so keep this below the route's five-minute ceiling.
const DOCUMENT_INDEX_TIMEOUT_MS = 270_000;

export class UpstreamUploadError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "UpstreamUploadError";
  }
}

export function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export function numberValue(value: unknown) {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function apiMessage(payload: unknown, fallback: string) {
  if (!payload || typeof payload !== "object") return fallback;
  const record = payload as ApiRecord;
  return String(record.detail ?? record.error ?? record.message ?? fallback);
}

export function uploadedPath(payload: unknown) {
  if (!payload || typeof payload !== "object") return "";
  const record = payload as ApiRecord;
  if (typeof record.path === "string") return record.path;
  if (record.file && typeof record.file === "object") {
    const path = (record.file as ApiRecord).path;
    if (typeof path === "string") return path;
  }
  return "";
}

export function jobId(payload: unknown) {
  if (!payload || typeof payload !== "object") return "";
  const record = payload as ApiRecord;
  if (typeof record.job_id === "string") return record.job_id;
  if (record.job && typeof record.job === "object") {
    const id = (record.job as ApiRecord).job_id ?? (record.job as ApiRecord).id;
    if (typeof id === "string") return id;
  }
  return typeof record.id === "string" ? record.id : "";
}

export function safeUploadPath(path: string) {
  if (!path || path.startsWith("/") || path.includes("\\")) return false;
  const parts = path.split("/");
  return !parts.some((part) => !part || part === "." || part === "..");
}

export function safeFilename(name: string) {
  return name.replace(/[\\/\r\n"]/g, "_").slice(0, 240) || "upload";
}

export function pathBelongsToSubjectShelf(path: string, subjects: TeacherApiRecord[]) {
  return subjects.some((subject) => {
    const root = typeof subject.folder_path === "string" ? subject.folder_path.trim() : "";
    if (!root || !safeUploadPath(root)) return false;
    return ["Syllabus", "Notes", "Question Bank"].some((shelf) => {
      const shelfPath = `${root}/${shelf}`;
      return path === shelfPath || path.startsWith(`${shelfPath}/`);
    });
  });
}

export async function validateDestination(collectionKey: string, path: string) {
  if (!safeUploadPath(path)) {
    return "Choose a valid Syllabus, Notes or Question Bank folder.";
  }
  const subjects = await getTeacherSubjects(collectionKey);
  return pathBelongsToSubjectShelf(path, subjects.subjects)
    ? ""
    : "Choose a folder inside one of this creator's subject shelves.";
}

export function indexedDocumentId(payload: ApiRecord) {
  if (typeof payload.document_id === "string") return payload.document_id;
  if (payload.document && typeof payload.document === "object") {
    const id = (payload.document as ApiRecord).id;
    if (typeof id === "string") return id;
  }
  return "";
}

/**
 * Connection-level faults: the socket closed or never opened, before any
 * response arrived. Node reports these as `socket hang up` / `ECONNRESET`, which
 * is what a creator used to read on a failed Drive row — a message about our
 * wiring, not about their file.
 */
const DROPPED_CONNECTION_CODES = new Set(["ECONNRESET", "ECONNREFUSED", "EPIPE", "ETIMEDOUT"]);

export function isDroppedConnection(cause: unknown) {
  if (!(cause instanceof Error)) return false;
  const code = (cause as NodeJS.ErrnoException).code ?? "";
  return DROPPED_CONNECTION_CODES.has(code) || /socket hang up/i.test(cause.message);
}

/** Two more goes, 2s then 6s apart: long enough to ride out a service restart
 *  (the deploy restarts it), short enough to stay inside the drain's budget. */
const DROPPED_CONNECTION_RETRY_DELAYS_MS = [2_000, 6_000];

async function sendTenantRequest(
  url: URL,
  rejectUnauthorized: boolean,
  timeoutMs: number,
  headers: Record<string, string | number>,
  body: Buffer | string,
) {
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await sendTenantRequestOnce(url, rejectUnauthorized, timeoutMs, headers, body);
    } catch (cause) {
      if (!isDroppedConnection(cause)) throw cause;
      const delay = DROPPED_CONNECTION_RETRY_DELAYS_MS[attempt];
      if (delay === undefined) {
        throw new UpstreamUploadError(
          "The document service dropped the connection. Retry in a minute — the file itself is fine.",
          502,
        );
      }
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
}

function sendTenantRequestOnce(
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
      // `agent: false` — a fresh connection per request. Node's global agent
      // keeps sockets alive by default, and a pooled socket the server has
      // already closed fails the NEXT request with "socket hang up". Between
      // two Drive files the drain can sit idle long past nginx's keep-alive
      // window, so that race is the common case here, not the rare one; one
      // extra TLS handshake per multi-megabyte upload is nothing.
      { method: "POST", rejectUnauthorized, headers, agent: false },
      (response) => {
        let raw = "";
        response.setEncoding("utf-8");
        response.on("data", (chunk: string) => (raw += chunk));
        response.on("end", () => {
          let parsed: unknown = {};
          try {
            if (raw.trim()) parsed = JSON.parse(raw);
          } catch {
            parsed = {};
          }
          const status = response.statusCode ?? 502;
          if (status >= 400) {
            const fallback =
              status === 413
                ? `The document service rejected this file as too large. The creator portal accepts up to ${TEACHER_UPLOAD_MAX_LABEL}.`
                : `Document service request failed (${status}).`;
            reject(new UpstreamUploadError(apiMessage(parsed, fallback), status));
            return;
          }
          if (raw.trim() && !Object.keys(parsed as ApiRecord).length) {
            reject(
              new UpstreamUploadError(
                `The document service returned an invalid response (${status}).`,
                status,
              ),
            );
            return;
          }
          resolve((parsed ?? {}) as ApiRecord);
        });
      },
    );
    request.setTimeout(timeoutMs, () => {
      request.destroy(new Error(`Document service timed out after ${timeoutMs}ms.`));
    });
    request.on("error", reject);
    request.write(body);
    request.end();
  });
}

export async function uploadAndIndex(input: {
  collectionKey: string;
  fileBuffer: Buffer;
  fileName: string;
  mimeType: string;
  path: string;
  metadata?: string;
}) {
  const { baseUrl, rejectUnauthorized, timeoutMs } = getTenantApiEnv();
  const uploadTimeoutMs = Math.max(timeoutMs, 180_000);
  const boundary = `----NanoSyllabus${randomUUID()}`;
  const parts: Buffer[] = [];
  parts.push(
    Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="path"\r\n\r\n${input.path}\r\n`,
    ),
  );
  if (input.metadata) {
    parts.push(
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="metadata"\r\n\r\n${input.metadata}\r\n`,
      ),
    );
  }
  parts.push(
    Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${teacherUploadStorageFileName(input.fileName)}"\r\nContent-Type: ${input.mimeType}\r\n\r\n`,
    ),
  );
  parts.push(input.fileBuffer);
  parts.push(Buffer.from(`\r\n--${boundary}--\r\n`));
  const body = Buffer.concat(parts);

  const upload = await sendTenantRequest(
    new URL("/v1/collection/upload", baseUrl),
    rejectUnauthorized,
    uploadTimeoutMs,
    {
      Authorization: `Bearer ${input.collectionKey}`,
      "Content-Type": `multipart/form-data; boundary=${boundary}`,
      "Content-Length": body.length,
    },
    body,
  );
  const collectionPath = uploadedPath(upload);
  if (!collectionPath) {
    throw new Error("The document uploaded, but its collection path was not returned.");
  }
  const indexBody = JSON.stringify({ path: collectionPath });
  const index = await sendTenantRequest(
    new URL("/v1/collection/index-document", baseUrl),
    rejectUnauthorized,
    Math.max(timeoutMs, DOCUMENT_INDEX_TIMEOUT_MS),
    {
      Authorization: `Bearer ${input.collectionKey}`,
      "Content-Type": "application/json",
      "Content-Length": Buffer.byteLength(indexBody),
    },
    indexBody,
  );
  return { upload, index, collectionPath };
}

export async function savePreview(input: {
  teacherId: string;
  storagePath: string;
  collectionPath: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  documentId: string;
}) {
  const admin = createSupabaseAdminClient();
  const { data: previous } = await admin
    .from("teacher_document_files")
    .select("storage_path")
    .eq("teacher_id", input.teacherId)
    .eq("collection_path", input.collectionPath)
    .maybeSingle();
  const { error } = await admin.from("teacher_document_files").upsert(
    {
      teacher_id: input.teacherId,
      external_document_id: input.documentId || null,
      collection_path: input.collectionPath,
      storage_path: input.storagePath,
      original_name: input.fileName,
      mime_type: input.mimeType,
      size_bytes: input.sizeBytes,
    },
    { onConflict: "teacher_id,collection_path" },
  );
  if (error) throw error;
  const oldPath = text(previous?.storage_path);
  if (oldPath && oldPath !== input.storagePath) {
    await admin.storage.from("teacher-documents").remove([oldPath]);
  }
}

/**
 * Store the bytes for the private preview and record the document row.
 *
 * Split out of the small-file path because a Drive import has the bytes in
 * memory too, and the two must not drift: a preview saved one way and not the
 * other means the creator can open one document in the portal and not another,
 * with nothing on screen explaining why.
 */
export async function savePreviewFromBuffer(input: {
  teacherId: string;
  fileBuffer: Buffer;
  fileName: string;
  mimeType: string;
  collectionPath: string;
  documentId: string;
}) {
  const storagePath = `${input.teacherId}/${randomUUID()}-${teacherUploadStorageFileName(input.fileName)}`;
  const admin = createSupabaseAdminClient();
  const { error } = await admin.storage
    .from("teacher-documents")
    .upload(storagePath, input.fileBuffer, { contentType: input.mimeType, upsert: false });
  if (error) throw error;
  await savePreview({
    teacherId: input.teacherId,
    storagePath,
    collectionPath: input.collectionPath,
    fileName: input.fileName,
    mimeType: input.mimeType,
    sizeBytes: input.fileBuffer.length,
    documentId: input.documentId,
  });
}
