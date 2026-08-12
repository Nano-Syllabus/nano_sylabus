import { randomUUID } from "node:crypto";
import http from "node:http";
import https from "node:https";
import { NextResponse } from "next/server";
import { getTeacherProfile } from "@/app/teachers/actions";
import { getTenantApiEnv } from "@/lib/env";
import {
  getTeacherSubjects,
  TeacherApiError,
  type ApiRecord as TeacherApiRecord,
} from "@/lib/teacher-app/client";
import {
  TEACHER_UPLOAD_MAX_BYTES,
  TEACHER_UPLOAD_MAX_LABEL,
  teacherUploadSizeError,
} from "@/lib/teacher-upload";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

type ApiRecord = Record<string, unknown>;

export const maxDuration = 300;

// Uploading the bytes is quick, but PDF/OCR indexing is currently synchronous in
// the tenant service. Large notes and question banks routinely need longer than
// the general API timeout, so keep this below the route's five-minute ceiling.
const DOCUMENT_INDEX_TIMEOUT_MS = 270_000;

class UpstreamUploadError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "UpstreamUploadError";
  }
}

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function numberValue(value: unknown) {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function field(value: FormDataEntryValue | null) {
  return typeof value === "string" ? value.trim() : "";
}

function apiMessage(payload: unknown, fallback: string) {
  if (!payload || typeof payload !== "object") return fallback;
  const record = payload as ApiRecord;
  return String(record.detail ?? record.error ?? record.message ?? fallback);
}

function uploadedPath(payload: unknown) {
  if (!payload || typeof payload !== "object") return "";
  const record = payload as ApiRecord;
  if (typeof record.path === "string") return record.path;
  if (record.file && typeof record.file === "object") {
    const path = (record.file as ApiRecord).path;
    if (typeof path === "string") return path;
  }
  return "";
}

function jobId(payload: unknown) {
  if (!payload || typeof payload !== "object") return "";
  const record = payload as ApiRecord;
  if (typeof record.job_id === "string") return record.job_id;
  if (record.job && typeof record.job === "object") {
    const id = (record.job as ApiRecord).job_id ?? (record.job as ApiRecord).id;
    if (typeof id === "string") return id;
  }
  return typeof record.id === "string" ? record.id : "";
}

function safeUploadPath(path: string) {
  if (!path || path.startsWith("/") || path.includes("\\")) return false;
  const parts = path.split("/");
  return !parts.some((part) => !part || part === "." || part === "..");
}

function safeFilename(name: string) {
  return name.replace(/[\\/\r\n"]/g, "_").slice(0, 240) || "upload";
}

function pathBelongsToSubjectShelf(path: string, subjects: TeacherApiRecord[]) {
  return subjects.some((subject) => {
    const root = typeof subject.folder_path === "string" ? subject.folder_path.trim() : "";
    if (!root || !safeUploadPath(root)) return false;
    return ["Syllabus", "Notes", "Question Bank"].some((shelf) => {
      const shelfPath = `${root}/${shelf}`;
      return path === shelfPath || path.startsWith(`${shelfPath}/`);
    });
  });
}

async function validateDestination(collectionKey: string, path: string) {
  if (!safeUploadPath(path)) {
    return "Choose a valid Syllabus, Notes or Question Bank folder.";
  }
  const subjects = await getTeacherSubjects(collectionKey);
  return pathBelongsToSubjectShelf(path, subjects.subjects)
    ? ""
    : "Choose a folder inside one of this creator's subject shelves.";
}

function indexedDocumentId(payload: ApiRecord) {
  if (typeof payload.document_id === "string") return payload.document_id;
  if (payload.document && typeof payload.document === "object") {
    const id = (payload.document as ApiRecord).id;
    if (typeof id === "string") return id;
  }
  return "";
}

async function sendTenantRequest(
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

async function uploadAndIndex(input: {
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
      `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${safeFilename(input.fileName)}"\r\nContent-Type: ${input.mimeType}\r\n\r\n`,
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

async function savePreview(input: {
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

function errorResponse(error: unknown) {
  console.error("Upload route error:", error);
  const status =
    error instanceof UpstreamUploadError
      ? error.status === 413
        ? 413
        : error.status >= 400 && error.status < 500
          ? error.status
          : 502
      : error instanceof TeacherApiError
        ? error.status
        : 500;
  return NextResponse.json(
    { error: error instanceof Error ? error.message : "The upload could not be completed." },
    { status },
  );
}

export async function POST(request: Request) {
  try {
    const teacher = await getTeacherProfile();
    if (!teacher) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const contentType = request.headers.get("content-type") || "";
    if (contentType.includes("application/json")) {
      const input = (await request.json().catch(() => null)) as ApiRecord | null;
      const action = text(input?.action);
      const path = text(input?.path);
      const destinationError = await validateDestination(teacher.collection_sk, path);
      if (destinationError) {
        return NextResponse.json({ error: destinationError }, { status: 400 });
      }

      if (action === "prepare") {
        const fileName = safeFilename(text(input?.fileName));
        const sizeBytes = numberValue(input?.sizeBytes);
        if (!fileName || sizeBytes <= 0) {
          return NextResponse.json({ error: "Choose a non-empty file first." }, { status: 400 });
        }
        const sizeError = teacherUploadSizeError(sizeBytes);
        if (sizeError) return NextResponse.json({ error: sizeError }, { status: 413 });
        const storagePath = `${teacher.id}/staged/${randomUUID()}-${fileName}`;
        const admin = createSupabaseAdminClient();
        const { data, error } = await admin.storage
          .from("teacher-documents")
          .createSignedUploadUrl(storagePath);
        if (error || !data?.token) {
          throw new Error(error?.message || "Could not prepare private upload storage.");
        }
        return NextResponse.json({
          bucket: "teacher-documents",
          storagePath,
          token: data.token,
          maxBytes: TEACHER_UPLOAD_MAX_BYTES,
          maxLabel: TEACHER_UPLOAD_MAX_LABEL,
        });
      }

      if (action === "complete") {
        const storagePath = text(input?.storagePath);
        const fileName = safeFilename(text(input?.fileName));
        const mimeType = text(input?.mimeType) || "application/octet-stream";
        if (!storagePath.startsWith(`${teacher.id}/staged/`) || !fileName) {
          return NextResponse.json({ error: "Invalid staged upload." }, { status: 400 });
        }
        const admin = createSupabaseAdminClient();
        const { data, error } = await admin.storage.from("teacher-documents").download(storagePath);
        if (error || !data) {
          return NextResponse.json(
            { error: error?.message || "The staged file could not be read." },
            { status: 400 },
          );
        }
        const fileBuffer = Buffer.from(await data.arrayBuffer());
        const sizeError = teacherUploadSizeError(fileBuffer.length);
        if (sizeError) {
          await admin.storage.from("teacher-documents").remove([storagePath]);
          return NextResponse.json({ error: sizeError }, { status: 413 });
        }
        try {
          const result = await uploadAndIndex({
            collectionKey: teacher.collection_sk,
            fileBuffer,
            fileName,
            mimeType,
            path,
            metadata: text(input?.metadata),
          });
          await savePreview({
            teacherId: teacher.id,
            storagePath,
            collectionPath: result.collectionPath,
            fileName,
            mimeType,
            sizeBytes: fileBuffer.length,
            documentId: indexedDocumentId(result.index),
          });
          return NextResponse.json({
            upload: result.upload,
            index: result.index,
            jobId: jobId(result.index),
            previewWarning: "",
          });
        } catch (error) {
          await admin.storage.from("teacher-documents").remove([storagePath]);
          throw error;
        }
      }

      return NextResponse.json({ error: "Unknown upload action." }, { status: 400 });
    }

    // Small-file backwards-compatible path. The UI uses signed storage so large files
    // never pass through the deployment request-body limit.
    const formData = await request.formData();
    const file = formData.get("file");
    const path = field(formData.get("path"));
    if (!(file instanceof File) || file.size === 0) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }
    const sizeError = teacherUploadSizeError(file.size);
    if (sizeError) return NextResponse.json({ error: sizeError }, { status: 413 });
    const destinationError = await validateDestination(teacher.collection_sk, path);
    if (destinationError) {
      return NextResponse.json({ error: destinationError }, { status: 400 });
    }
    const fileBuffer = Buffer.from(await file.arrayBuffer());
    const result = await uploadAndIndex({
      collectionKey: teacher.collection_sk,
      fileBuffer,
      fileName: file.name,
      mimeType: file.type || "application/octet-stream",
      path,
      metadata: field(formData.get("metadata")),
    });
    let previewWarning = "";
    try {
      const storagePath = `${teacher.id}/${randomUUID()}-${safeFilename(file.name)}`;
      const admin = createSupabaseAdminClient();
      const { error } = await admin.storage
        .from("teacher-documents")
        .upload(storagePath, fileBuffer, {
          contentType: file.type || "application/octet-stream",
          upsert: false,
        });
      if (error) throw error;
      await savePreview({
        teacherId: teacher.id,
        storagePath,
        collectionPath: result.collectionPath,
        fileName: file.name,
        mimeType: file.type || "application/octet-stream",
        sizeBytes: file.size,
        documentId: indexedDocumentId(result.index),
      });
    } catch {
      previewWarning =
        "The document was indexed, but its private preview could not be saved. Check the latest database migration.";
    }
    return NextResponse.json({
      upload: result.upload,
      index: result.index,
      jobId: jobId(result.index),
      previewWarning,
    });
  } catch (error) {
    return errorResponse(error);
  }
}
