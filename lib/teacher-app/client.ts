import http from "node:http";
import https from "node:https";
import { getTenantApiEnv } from "@/lib/env";

export type ApiRecord = Record<string, unknown>;

export class TeacherApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly payload?: unknown,
  ) {
    super(message);
    this.name = "TeacherApiError";
  }
}

function formatApiErrorValue(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) {
    return value
      .map(formatApiErrorValue)
      .filter(Boolean)
      .join("; ");
  }
  if (!value || typeof value !== "object") return "";

  const record = value as ApiRecord;
  const location = Array.isArray(record.loc)
    ? record.loc.map((part) => String(part)).filter((part) => part !== "body").join(".")
    : "";
  const validationMessage =
    typeof record.msg === "string" ? record.msg.trim() : "";
  if (validationMessage) {
    return location ? `${location}: ${validationMessage}` : validationMessage;
  }

  for (const key of ["message", "detail", "error", "reason"] as const) {
    const message = formatApiErrorValue(record[key]);
    if (message) return message;
  }

  try {
    return JSON.stringify(value);
  } catch {
    return "";
  }
}

export function formatTeacherApiError(payload: unknown, status: number): string {
  return formatApiErrorValue(payload) || `Teacher API request failed (${status})`;
}

async function teacherRequest<T>(
  path: string,
  collectionSk: string,
  options: { method?: "GET" | "POST" | "DELETE"; body?: unknown; timeoutMs?: number } = {},
): Promise<T> {
  const { baseUrl, rejectUnauthorized, timeoutMs } = getTenantApiEnv();
  const requestTimeoutMs = options.timeoutMs ?? timeoutMs;

  return new Promise<T>((resolve, reject) => {
    const url = new URL(path, baseUrl);
    const transport = url.protocol === "https:" ? https : http;
    const serializedBody = options.body === undefined ? undefined : JSON.stringify(options.body);
    const request = transport.request(
      url,
      {
        method: options.method ?? "GET",
        rejectUnauthorized,
        headers: {
          Authorization: `Bearer ${collectionSk}`,
          Accept: "application/json",
          ...(serializedBody
            ? {
                "Content-Type": "application/json",
                "Content-Length": Buffer.byteLength(serializedBody),
              }
            : {}),
        },
      },
      (response) => {
        let raw = "";
        response.setEncoding("utf8");
        response.on("data", (chunk: string) => {
          raw += chunk;
        });
        response.on("end", () => {
          let payload: unknown = {};
          if (raw.trim()) {
            try {
              payload = JSON.parse(raw);
            } catch {
              reject(
                new TeacherApiError(
                  `Teacher API returned invalid JSON: ${raw.slice(0, 300)}`,
                  response.statusCode ?? 502,
                ),
              );
              return;
            }
          }

          const status = response.statusCode ?? 502;
          if (status >= 400) {
            const detail = formatTeacherApiError(payload, status);
            reject(new TeacherApiError(detail, status, payload));
            return;
          }
          resolve(payload as T);
        });
      },
    );

    request.setTimeout(requestTimeoutMs, () => {
      request.destroy(new Error(`Teacher API timed out after ${requestTimeoutMs}ms`));
    });
    request.on("error", reject);
    if (serializedBody) request.write(serializedBody);
    request.end();
  });
}

export const getTeacherMe = (key: string) =>
  teacherRequest<ApiRecord>("/v1/collection/me", key);

export const getTeacherSubjects = (key: string) =>
  teacherRequest<{ subjects: ApiRecord[] }>("/v1/collection/subjects", key);

export const getTeacherSourceTree = (key: string) =>
  teacherRequest<ApiRecord>("/v1/collection/source-tree", key);

export const getTeacherDocuments = (key: string) =>
  teacherRequest<ApiRecord | ApiRecord[]>("/v1/collection/documents", key);

export const getTeacherDocument = (key: string, documentId: string) =>
  teacherRequest<ApiRecord>(
    `/v1/collection/documents/${encodeURIComponent(documentId)}`,
    key,
  );

export const getTeacherJob = (key: string, jobId: string) =>
  teacherRequest<ApiRecord>(`/v1/jobs/${encodeURIComponent(jobId)}`, key);

export const createTeacherFolder = (key: string, path: string) =>
  teacherRequest<ApiRecord>("/v1/collection/mkdir", key, {
    method: "POST",
    body: { path },
  });

export async function createTeacherSubject(key: string, subjectName: string) {
  for (const shelf of ["Syllabus", "Notes", "Question Bank"]) {
    try {
      await createTeacherFolder(key, `${subjectName}/${shelf}`);
    } catch (error) {
      if (!(error instanceof TeacherApiError) || error.status !== 409) throw error;
    }
  }
  return teacherRequest<ApiRecord>("/v1/collection/subjects", key, {
    method: "POST",
    body: { name: subjectName, folder_path: subjectName },
  });
}

export const deleteTeacherSubject = (key: string, slug: string) =>
  teacherRequest<ApiRecord>(
    `/v1/collection/subjects/${encodeURIComponent(slug)}`,
    key,
    { method: "DELETE" },
  );

export const deleteTeacherPath = (key: string, path: string) =>
  teacherRequest<ApiRecord>(
    `/v1/collection/source-tree/${path.split("/").map(encodeURIComponent).join("/")}`,
    key,
    { method: "DELETE" },
  );

export const deleteTeacherDocument = (key: string, documentId: string) =>
  teacherRequest<ApiRecord>(
    `/v1/collection/documents/${encodeURIComponent(documentId)}`,
    key,
    { method: "DELETE" },
  );

export const indexAllTeacherDocuments = (key: string) =>
  teacherRequest<ApiRecord>("/v1/collection/index-all", key, { method: "POST" });

export const indexTeacherDocument = (
  key: string,
  input: { documentId?: string; path?: string },
) =>
  teacherRequest<ApiRecord>("/v1/collection/index-document", key, {
    method: "POST",
    body: {
      ...(input.documentId ? { document_id: input.documentId } : {}),
      ...(input.path ? { path: input.path } : {}),
    },
  });

export const regenerateTeacherCollectionKey = (key: string) =>
  teacherRequest<ApiRecord>("/v1/collection/api-key/regenerate", key, {
    method: "POST",
  });

export const askTeacherQuestion = (
  key: string,
  query: string,
  topK: number,
  namespace: string,
  conversationHistory: Array<{ role: "user" | "assistant"; content: string }> = [],
) =>
  teacherRequest<ApiRecord>("/v1/answer", key, {
    method: "POST",
    body: { query, top_k: topK, namespace, conversation_history: conversationHistory },
  });

export const retrieveTeacherChunks = (key: string, query: string, topK: number, namespace: string) =>
  teacherRequest<ApiRecord>("/v1/query", key, {
    method: "POST",
    body: { query, top_k: topK, namespace },
  });

export type TeacherPracticeBand = {
  label: string;
  question_type: "theory" | "numerical";
  count: number;
  marks_each: number;
};

export const generateTeacherPracticePaper = (
  key: string,
  input: {
    subject: string;
    bands: TeacherPracticeBand[];
    title?: string;
    instruction?: string;
    pass_marks?: number;
  },
) =>
  teacherRequest<ApiRecord>("/api/v1/practice/generate", key, {
    method: "POST",
    body: input,
    timeoutMs: 120_000,
  });

export async function gradeTeacherPracticePaperFile(
  key: string,
  paperId: string,
  input: {
    studentName?: string;
    instruction?: string;
    file: { name: string; mimeType: string; buffer: Buffer };
  },
) {
  const { baseUrl, rejectUnauthorized, timeoutMs: defaultTimeoutMs } = getTenantApiEnv();
  const url = new URL(
    `/api/v1/practice/papers/${encodeURIComponent(paperId)}/grade-file`,
    baseUrl,
  );
  const boundary = `----padhai-teacher-grade-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const chunks: Buffer[] = [];
  const pushText = (value: string) => chunks.push(Buffer.from(value, "utf8"));
  const fields = [
    ["student_name", input.studentName?.trim() || "Student"],
    ["instruction", input.instruction?.trim() || ""],
  ];

  fields.forEach(([name, value]) => {
    pushText(`--${boundary}\r\n`);
    pushText(`Content-Disposition: form-data; name="${name}"\r\n\r\n`);
    pushText(`${value}\r\n`);
  });
  pushText(`--${boundary}\r\n`);
  pushText(
    `Content-Disposition: form-data; name="file"; filename="${input.file.name.replace(/["\r\n]/g, "_")}"\r\n`,
  );
  pushText(`Content-Type: ${input.file.mimeType || "application/octet-stream"}\r\n\r\n`);
  chunks.push(input.file.buffer);
  pushText("\r\n");
  pushText(`--${boundary}--\r\n`);
  const body = Buffer.concat(chunks);
  const transport = url.protocol === "https:" ? https : http;
  const timeoutMs = Math.max(defaultTimeoutMs, 120_000);

  return new Promise<ApiRecord>((resolve, reject) => {
    const request = transport.request(
      url,
      {
        method: "POST",
        rejectUnauthorized,
        headers: {
          Authorization: `Bearer ${key}`,
          Accept: "application/json",
          "Content-Type": `multipart/form-data; boundary=${boundary}`,
          "Content-Length": body.length,
        },
      },
      (response) => {
        let raw = "";
        response.setEncoding("utf8");
        response.on("data", (chunk: string) => {
          raw += chunk;
        });
        response.on("end", () => {
          let payload: unknown = {};
          if (raw.trim()) {
            try {
              payload = JSON.parse(raw);
            } catch {
              reject(
                new TeacherApiError(
                  `Teacher API returned invalid JSON: ${raw.slice(0, 300)}`,
                  response.statusCode ?? 502,
                ),
              );
              return;
            }
          }
          const status = response.statusCode ?? 502;
          if (status >= 400) {
            reject(new TeacherApiError(formatTeacherApiError(payload, status), status, payload));
            return;
          }
          resolve(payload as ApiRecord);
        });
      },
    );

    request.setTimeout(timeoutMs, () => {
      request.destroy(new Error(`Teacher API timed out after ${timeoutMs}ms`));
    });
    request.on("error", reject);
    request.write(body);
    request.end();
  });
}
