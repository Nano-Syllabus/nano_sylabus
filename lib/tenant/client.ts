import http from "node:http";
import https from "node:https";
import { getTenantApiEnv } from "@/lib/env";

function extractErrorMessage(url: URL, statusCode: number, raw: string): string {
  try {
    const parsed = JSON.parse(raw);
    if (parsed.detail) {
      return typeof parsed.detail === "string" ? parsed.detail : JSON.stringify(parsed.detail);
    }
  } catch {}
  return `Tenant API ${url.pathname} failed with ${statusCode}: ${raw.slice(0, 500)}`;
}

export type TenantSubject = {
  name: string;
  slug: string;
  namespace: string;
  namespace_slug: string;
  full_path: string;
  folder_path: string;
  chunk_count: number;
};

export type TenantSourceTreeNode = {
  name: string;
  type?: string;
  indexed?: boolean;
  chunk_count?: number;
  children?: TenantSourceTreeNode[];
};

export type TenantDocumentDetail = {
  document_id?: string;
  id?: string;
  status?: string;
  indexed?: boolean;
  subject?: string;
  namespace?: string;
  source_path?: string;
  filename?: string;
  word_count?: number;
  chunk_count?: number;
  indexed_at?: string | null;
  indexing_cost?: number | string | null;
};

export type TenantPromptCitation = {
  excerpt?: string;
  source?: string;
  title?: string;
  page?: number;
  chapter?: string;
  topic?: string;
};

export type TenantChatSource = {
  rank?: number;
  title?: string;
  subject?: string;
  semester?: string;
  source_path?: string;
  clean_path?: string;
  excerpt?: string;
  score?: number;
  pages?: number[] | null;
};

export type TenantNextContextChunk = {
  title?: string;
  subject?: string;
  source_path?: string;
  clean_path?: string;
  text?: string;
};

export type TenantTokenUsage = {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
};

export type TenantChatAttachment = {
  name: string;
  mimeType: string;
  dataUrl: string;
};

export type TenantPromptResponse = {
  answer?: string;
  detail?: string;
  citations?: TenantPromptCitation[];
};

export type TenantChatResponse = {
  answer?: string;
  sources?: TenantChatSource[];
  query?: string;
  chunks_retrieved?: number;
  served_from?: string;
  context_summary?: string;
  detail?: string;
};

export type TenantStreamEvent =
  | { type: "status"; message: string; query?: string; served_from?: string }
  | { type: "token"; text: string }
  | {
      type: "sources";
      sources: TenantChatSource[];
      chunks_retrieved?: number;
      served_from?: string;
      context_summary?: string;
      next_topic?: string;
      next_context_chunk?: TenantNextContextChunk;
    }
  | { type: "done"; ok?: boolean; usage?: TenantTokenUsage }
  | { type: "error"; message: string };

type TenantNamespacesResponse = {
  tenant: string;
  namespaces: Array<{
    namespace: string;
    namespace_slug: string;
    path: string;
    total_files: number;
    indexed_files: number;
    queryable: boolean;
  }>;
};

type TenantSubjectsResponse = {
  tenant: string;
  subjects: TenantSubject[];
};

type TenantSourceTreeResponse = {
  tenant: string;
  total_files: number;
  indexed_files: number;
  tree: TenantSourceTreeNode[];
};

export type TeacherQuestionBand = {
  label: string;
  question_type: string;
  count: number;
  marks_each: number;
};

export type TeacherQuestion = {
  id: string;
  chapter?: string;
  band_label?: string;
  question_type?: string;
  marks: number;
  text: string;
  reference_answer?: string;
};

export type TeacherGenerateRequest = {
  namespaces: string[];
  subject: string;
  bands: TeacherQuestionBand[];
  title?: string;
  instruction?: string;
  university?: string;
  pass_marks?: number;
};

export type TeacherGenerateResponse = {
  id: string;
  title?: string;
  subject?: string;
  university?: string;
  pass_marks?: number;
  total_marks: number;
  warning?: string;
  questions: TeacherQuestion[];
};

export type TeacherTypedAnswer = {
  question_id: string;
  answer_text: string;
};

export type TeacherGradeRequest = {
  student_name?: string;
  answers: TeacherTypedAnswer[];
  instruction?: string;
};

export type TeacherGradeResult = {
  question_id: string;
  chapter?: string;
  question: string;
  marks: number;
  student_answer?: string;
  score: number;
  feedback: string;
};

export type TeacherGradeResponse = {
  submission_id?: string;
  set_id?: string;
  student_name?: string;
  source?: string;
  results: TeacherGradeResult[];
  total_score: number;
  total_marks: number;
  graded?: boolean;
  evaluation?: PracticeEvaluation;
};

export type PracticeGradeItem = {
  question_id: string;
  question: string;
  chapter?: string;
  marks: number;
  reference_answer?: string;
  student_answer: string;
};

export type PracticeGradeResponse = {
  results: PracticeGradeResult[];
  total_score: number;
  total_marks: number;
  graded: boolean;
  evaluation?: PracticeEvaluation;
};

/**
 * Published catalog. Teachers own the content now, so this — not the source
 * tree folder taxonomy — is what decides which subjects a student may pick.
 */
export type MarketplaceSubject = {
  subject: string;
  chunk_count: number;
  word_count: number;
  document_count: number;
  unit_count: number;
};

export type MarketplaceProvider = {
  tenant: string;
  tenant_name: string;
  namespace: string;
  provider_name: string;
  provider_kind: string;
  is_default_tenant: boolean;
  chunk_count: number;
  word_count: number;
  document_count: number;
  subjects: MarketplaceSubject[];
};

export type MarketplaceResponse = {
  default_tenant: string;
  providers: MarketplaceProvider[];
};

export type PracticeTopic = {
  topic_id: string;
  topic_key: string;
  title: string;
  blurb?: string;
  order_index: number;
  syllabus_weight: number;
  /** Share of the subject's question bank this chapter accounts for. */
  weight: number;
  weight_source: string;
  qb_question_count: number;
  qb_marks: number;
};

export type PracticePlanItem = {
  topic_key: string;
  title: string;
  marks_each: number;
  count: number;
};

export type PracticeTopicsResponse = {
  subject: string;
  namespaces: string[];
  topic_source: string;
  weightage_basis: string;
  question_bank_questions: number;
  marks_bands: number[];
  topics: PracticeTopic[];
  suggested_plan: PracticePlanItem[];
  suggested_total_marks?: number;
  suggested_question_count?: number;
  note?: string | null;
};

export type PracticeSessionQuestion = {
  id: string;
  topic_key: string;
  topic: string;
  marks: number;
  question_type?: string;
  text: string;
};

export type PracticeSessionResponse = {
  session_id: string;
  subject: string;
  topic_source: string;
  questions: PracticeSessionQuestion[];
  total_marks: number;
  /** Sessions are ephemeral — the tenant drops them after this timestamp. */
  expires_at: string;
  plan: PracticePlanItem[];
  warning?: string | null;
};

export type PracticeTopicStatus = "strong" | "developing" | "weak" | "not_attempted";

export type PracticeChapterEvaluation = {
  chapter: string;
  topic_key: string;
  questions: number;
  questions_answered: number;
  marks: number;
  score: number;
  marks_lost: number;
  percentage: number;
  /** Share of this paper's marks that sat in this chapter. */
  weightage: number;
  /** Share of the whole paper's marks dropped in this chapter. */
  lost_weightage: number;
  status: PracticeTopicStatus;
};

/**
 * The tenant computes this per grade call and stores nothing, so anything that
 * needs to survive the request has to be persisted on our side.
 */
export type PracticeEvaluation = {
  total_score: number;
  total_marks: number;
  percentage: number;
  marks_lost: number;
  questions: number;
  questions_answered: number;
  chapters: PracticeChapterEvaluation[];
  strong_topics: PracticeChapterEvaluation[];
  weak_topics: PracticeChapterEvaluation[];
  not_attempted: PracticeChapterEvaluation[];
  summary: string;
};

export type PracticeGradeResult = {
  question_id: string;
  topic_key?: string;
  topic?: string;
  question: string;
  marks: number;
  student_answer?: string;
  score: number;
  feedback: string;
};

export type PracticeSessionGradeResponse = {
  session_id: string;
  subject: string;
  results: PracticeGradeResult[];
  total_score: number;
  total_marks: number;
  graded: boolean;
  stored: boolean;
  evaluation: PracticeEvaluation;
};

function requestJson<T>(
  path: string,
  options: {
    method?: "GET" | "POST";
    body?: unknown;
    timeoutMs?: number;
  } = {},
) {
  const { baseUrl, token, rejectUnauthorized, timeoutMs: defaultTimeoutMs } = getTenantApiEnv();
  const timeoutMs = options.timeoutMs ?? defaultTimeoutMs;

  return new Promise<T>((resolve, reject) => {
    const url = new URL(path, baseUrl);
    const transport = url.protocol === "https:" ? https : http;
    const serializedBody = options.body == null ? null : JSON.stringify(options.body);
    let settled = false;
    let timeoutHandle: ReturnType<typeof setTimeout> | null = setTimeout(() => {
      if (settled) return;
      settled = true;
      request.destroy(new Error(`Tenant API ${url.pathname} timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    const request = transport.request(
      url,
      {
        method: options.method ?? "GET",
        rejectUnauthorized,
        headers: {
          Authorization: `Bearer ${token}`,
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
        response.on("data", (chunk) => {
          raw += chunk;
        });
        response.on("aborted", () => {
          if (settled) return;
          settled = true;
          if (timeoutHandle) clearTimeout(timeoutHandle);
          reject(new Error(`Tenant API ${url.pathname} aborted before completing the response.`));
        });
        response.on("error", (error) => {
          if (settled) return;
          settled = true;
          if (timeoutHandle) clearTimeout(timeoutHandle);
          reject(error);
        });
        response.on("end", () => {
          if (settled) return;
          settled = true;
          if (timeoutHandle) clearTimeout(timeoutHandle);
          if ((response.statusCode ?? 500) >= 400) {
            reject(new Error(extractErrorMessage(url, response.statusCode ?? 500, raw)));
            return;
          }

          try {
            resolve(raw ? (JSON.parse(raw) as T) : ({} as T));
          } catch {
            reject(
              new Error(
                `Failed to parse tenant API JSON from ${url.pathname}. Body: ${raw.slice(0, 500)}`,
              ),
            );
          }
        });
      },
    );

    request.setTimeout(timeoutMs, () => {
      if (settled) return;
      settled = true;
      if (timeoutHandle) clearTimeout(timeoutHandle);
      request.destroy(new Error(`Tenant API ${url.pathname} timed out after ${timeoutMs}ms`));
    });
    request.on("error", (error) => {
      if (settled) return;
      settled = true;
      if (timeoutHandle) clearTimeout(timeoutHandle);
      reject(error);
    });
    if (serializedBody) request.write(serializedBody);
    request.end();
  });
}

export async function listTenantNamespaces() {
  const payload = await requestJson<TenantNamespacesResponse>("/api/v1/namespaces");
  return payload.namespaces ?? [];
}

export async function listTenantSubjects() {
  const payload = await requestJson<TenantSubjectsResponse>("/api/v1/subjects");
  return payload.subjects ?? [];
}

function tenantSubjectKey(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

/** Resolves the name, slug, or URL form used across student subject surfaces. */
export function findTenantSubject(subjects: TenantSubject[], value: string) {
  const key = tenantSubjectKey(value);
  if (!key) return null;

  return (
    subjects.find((subject) => tenantSubjectKey(subject.slug) === key) ??
    subjects.find((subject) => tenantSubjectKey(subject.name) === key) ??
    null
  );
}

/** Every API-available subject, with profile choices ordered first. */
export function listTenantSubjectNames(
  subjects: TenantSubject[],
  preferredSubjects: string[] = [],
) {
  const namesByKey = new Map<string, string>();
  for (const subject of subjects) {
    const key = tenantSubjectKey(subject.name);
    if (key && !namesByKey.has(key)) namesByKey.set(key, subject.name.trim());
  }

  const ordered: string[] = [];
  const included = new Set<string>();
  for (const preferred of preferredSubjects) {
    const key = tenantSubjectKey(preferred);
    const name = namesByKey.get(key);
    if (!name || included.has(key)) continue;
    ordered.push(name);
    included.add(key);
  }

  const remaining = [...namesByKey.entries()]
    .filter(([key]) => !included.has(key))
    .map(([, name]) => name)
    .sort((left, right) => left.localeCompare(right));

  return [...ordered, ...remaining];
}

let cachedTenantName: string | null = null;

/**
 * The tenant that owns this API key's content. Chat has to send it explicitly,
 * and it moves with the key — hardcoding it silently retrieves nothing when
 * the content lives under a different tenant.
 */
export async function getTenantName() {
  if (cachedTenantName) return cachedTenantName;

  const payload = await requestJson<TenantSubjectsResponse>("/api/v1/subjects");
  if (!payload.tenant) {
    throw new Error("Tenant API did not report which tenant this key belongs to.");
  }

  cachedTenantName = payload.tenant;
  return cachedTenantName;
}

export async function getTenantSourceTree() {
  return requestJson<TenantSourceTreeResponse>("/api/v1/source-tree");
}

export async function getTenantDocument(documentId: string) {
  return requestJson<TenantDocumentDetail>(`/api/v1/documents/${encodeURIComponent(documentId)}`);
}

export async function getMarketplace() {
  return requestJson<MarketplaceResponse>("/api/marketplace");
}

/**
 * Downloads a source file as bytes. Uses node:https directly because the tenant
 * is served over a self-signed certificate that global fetch will not accept.
 */
export function fetchTenantDocumentRaw(documentId: string) {
  const { baseUrl, token, rejectUnauthorized, timeoutMs } = getTenantApiEnv();
  const url = new URL(`/api/v1/documents/${encodeURIComponent(documentId)}/raw`, baseUrl);
  const transport = url.protocol === "https:" ? https : http;

  return new Promise<{ body: Buffer; contentType: string }>((resolve, reject) => {
    const request = transport.request(
      url,
      { method: "GET", rejectUnauthorized, headers: { Authorization: `Bearer ${token}` } },
      (response) => {
        const chunks: Buffer[] = [];
        response.on("data", (chunk: Buffer) => chunks.push(chunk));
        response.on("error", reject);
        response.on("end", () => {
          if ((response.statusCode ?? 500) >= 400) {
            reject(new Error(`Tenant API ${url.pathname} failed with ${response.statusCode}`));
            return;
          }
          resolve({
            body: Buffer.concat(chunks),
            contentType: response.headers["content-type"] || "application/octet-stream",
          });
        });
      },
    );

    request.setTimeout(timeoutMs, () => request.destroy(new Error("Document download timed out.")));
    request.on("error", reject);
    request.end();
  });
}

export async function listPracticeTopics(input: {
  subject: string;
  namespaces?: string[];
  totalMarks?: number;
  maxQuestions?: number;
  /** Re-parse the syllabus document instead of serving the cached topic list. */
  refresh?: boolean;
}) {
  const params = new URLSearchParams({ subject: input.subject });
  for (const namespace of input.namespaces ?? []) params.append("namespaces", namespace);
  if (input.totalMarks) params.set("total_marks", String(input.totalMarks));
  if (input.maxQuestions) params.set("max_questions", String(input.maxQuestions));
  if (input.refresh) params.set("refresh", "true");

  return requestJson<PracticeTopicsResponse>(`/api/v1/practice/topics?${params.toString()}`, {
    timeoutMs: 120000,
  });
}

export async function startPracticeSession(input: {
  subject: string;
  topics?: string[];
  namespaces?: string[];
  total_marks?: number;
  max_questions?: number;
}) {
  return requestJson<PracticeSessionResponse>("/api/v1/practice/session", {
    method: "POST",
    body: input,
    timeoutMs: 240000,
  });
}

export async function gradePracticeSession(
  sessionId: string,
  input: { answers: Array<{ question_id: string; answer_text: string }>; instruction?: string },
) {
  return requestJson<PracticeSessionGradeResponse>(
    `/api/v1/practice/session/${encodeURIComponent(sessionId)}/grade`,
    {
      method: "POST",
      body: input,
      timeoutMs: 240000,
    },
  );
}

export async function generateTeacherPaper(input: TeacherGenerateRequest) {
  return requestJson<TeacherGenerateResponse>("/api/v1/practice/generate", {
    method: "POST",
    body: input,
    timeoutMs: 120000,
  });
}

export async function gradePracticeItems(input: { items: PracticeGradeItem[] }) {
  return requestJson<PracticeGradeResponse>("/api/v1/practice/grade", {
    method: "POST",
    body: input,
    timeoutMs: 240000,
  });
}

export async function gradeTeacherPaper(setId: string, input: TeacherGradeRequest) {
  return requestJson<TeacherGradeResponse>(
    `/api/v1/practice/papers/${encodeURIComponent(setId)}/grade`,
    {
      method: "POST",
      body: input,
      timeoutMs: 120000,
    },
  );
}

function createTeacherGradeFileMultipartBody(input: {
  studentName?: string;
  instruction?: string;
  file: {
    name: string;
    mimeType: string;
    buffer: Buffer;
  };
}) {
  const boundary = `----nano-syllabus-grade-${Date.now()}-${Math.random().toString(36).slice(2)}`;
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
    `Content-Disposition: form-data; name="file"; filename="${input.file.name.replace(/"/g, "_")}"\r\n`,
  );
  pushText(`Content-Type: ${input.file.mimeType || "application/octet-stream"}\r\n\r\n`);
  chunks.push(input.file.buffer);
  pushText("\r\n");
  pushText(`--${boundary}--\r\n`);

  return {
    body: Buffer.concat(chunks),
    contentType: `multipart/form-data; boundary=${boundary}`,
  };
}

export async function gradeTeacherPaperFile(
  setId: string,
  input: {
    studentName?: string;
    instruction?: string;
    file: {
      name: string;
      mimeType: string;
      buffer: Buffer;
    };
  },
) {
  const { baseUrl, token, rejectUnauthorized, timeoutMs: defaultTimeoutMs } = getTenantApiEnv();
  const timeoutMs = Math.max(defaultTimeoutMs, 120000);
  const url = new URL(`/api/v1/practice/papers/${encodeURIComponent(setId)}/grade-file`, baseUrl);
  const transport = url.protocol === "https:" ? https : http;
  const multipartBody = createTeacherGradeFileMultipartBody(input);

  return new Promise<TeacherGradeResponse>((resolve, reject) => {
    let settled = false;
    const request = transport.request(
      url,
      {
        method: "POST",
        rejectUnauthorized,
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/json",
          "Content-Type": multipartBody.contentType,
          "Content-Length": multipartBody.body.length,
        },
      },
      (response) => {
        let raw = "";
        response.setEncoding("utf8");
        response.on("data", (chunk) => {
          raw += chunk;
        });
        response.on("end", () => {
          if (settled) return;
          settled = true;
          if ((response.statusCode ?? 500) >= 400) {
            reject(new Error(extractErrorMessage(url, response.statusCode ?? 500, raw)));
            return;
          }

          try {
            resolve(raw ? (JSON.parse(raw) as TeacherGradeResponse) : ({} as TeacherGradeResponse));
          } catch {
            reject(
              new Error(
                `Failed to parse tenant API JSON from ${url.pathname}. Body: ${raw.slice(0, 500)}`,
              ),
            );
          }
        });
      },
    );

    request.setTimeout(timeoutMs, () => {
      if (settled) return;
      settled = true;
      request.destroy(new Error(`Tenant API ${url.pathname} timed out after ${timeoutMs}ms`));
    });
    request.on("error", (error) => {
      if (settled) return;
      settled = true;
      reject(error);
    });
    request.write(multipartBody.body);
    request.end();
  });
}

export async function promptTenant(input: {
  userId: string;
  subject: string;
  folderPath: string;
  prompt: string;
  namespace: string;
}) {
  return requestJson<TenantPromptResponse>("/v1/prompt", {
    method: "POST",
    body: {
      user_id: input.userId,
      subject: input.subject,
      folder_path: input.folderPath,
      prompt: input.prompt,
      namespace: input.namespace,
    },
  });
}

export async function chatTenant(input: {
  question: string;
  contextSummary: string;
  subject: string;
  tenant: string;
  namespaces: string[];
  topK: number;
  responseLanguage?: "EN" | "RN";
}) {
  return requestJson<TenantChatResponse>("/api/chat", {
    method: "POST",
    body: {
      question: input.question,
      context_summary: input.contextSummary,
      subject: input.subject,
      tenant: input.tenant,
      namespaces: input.namespaces,
      top_k: input.topK,
      response_language: input.responseLanguage,
      language: input.responseLanguage,
    },
  });
}

function parseSseEvent(rawEvent: string): TenantStreamEvent | null {
  const eventName = rawEvent.match(/^event:\s*(.+)$/m)?.[1]?.trim() ?? "message";
  const data = [...rawEvent.matchAll(/^data:\s?(.*)$/gm)].map((match) => match[1]).join("\n");
  if (!data) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(data);
  } catch {
    parsed = { message: data };
  }

  const payload =
    parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};

  const readNumber = (value: unknown) =>
    typeof value === "number" && Number.isFinite(value) ? value : 0;

  const normalizeUsage = (value: unknown): TenantTokenUsage | undefined => {
    const usageValue = Array.isArray(value) ? value[0] : value;
    if (!usageValue || typeof usageValue !== "object") return undefined;
    const usage = usageValue as Record<string, unknown>;
    const inputTokens =
      readNumber(usage.promptTokens) ||
      readNumber(usage.prompt_tokens) ||
      readNumber(usage.inputTokens) ||
      readNumber(usage.input_tokens);
    const outputTokens =
      readNumber(usage.completionTokens) ||
      readNumber(usage.completion_tokens) ||
      readNumber(usage.outputTokens) ||
      readNumber(usage.output_tokens);
    const totalTokens =
      readNumber(usage.totalTokens) || readNumber(usage.total_tokens) || inputTokens + outputTokens;

    return { inputTokens, outputTokens, totalTokens };
  };

  if (eventName === "status") {
    return {
      type: "status",
      message: String(payload.message ?? ""),
      query: typeof payload.query === "string" ? payload.query : undefined,
      served_from: typeof payload.served_from === "string" ? payload.served_from : undefined,
    };
  }

  if (eventName === "token") {
    return {
      type: "token",
      text: String(payload.text ?? ""),
    };
  }

  if (eventName === "sources") {
    return {
      type: "sources",
      sources: Array.isArray(payload.sources) ? (payload.sources as TenantChatSource[]) : [],
      chunks_retrieved:
        typeof payload.chunks_retrieved === "number" ? payload.chunks_retrieved : undefined,
      served_from: typeof payload.served_from === "string" ? payload.served_from : undefined,
      context_summary:
        typeof payload.context_summary === "string" ? payload.context_summary : undefined,
      next_topic: typeof payload.next_topic === "string" ? payload.next_topic : undefined,
      next_context_chunk:
        payload.next_context_chunk &&
        typeof payload.next_context_chunk === "object" &&
        !Array.isArray(payload.next_context_chunk)
          ? (payload.next_context_chunk as TenantNextContextChunk)
          : undefined,
    };
  }

  if (eventName === "done") {
    return {
      type: "done",
      ok: typeof payload.ok === "boolean" ? payload.ok : undefined,
      usage: normalizeUsage(payload.usage),
    };
  }

  if (eventName === "error") {
    return {
      type: "error",
      message: String(payload.message ?? payload.error ?? data),
    };
  }

  return null;
}

function dataUrlToBuffer(dataUrl: string) {
  const match = dataUrl.match(/^data:([^;,]+);base64,(.+)$/);
  if (!match) {
    throw new Error("Invalid image attachment data URL.");
  }

  return {
    mimeType: match[1],
    buffer: Buffer.from(match[2], "base64"),
  };
}

function sanitizeAttachmentName(name: string, index: number) {
  const safeName = name.trim().replace(/[^\w.\- ()]/g, "_");
  return safeName || `attachment-${index + 1}.png`;
}

function createTenantChatMultipartBody({
  payload,
  attachments,
}: {
  payload: Record<string, unknown>;
  attachments: TenantChatAttachment[];
}) {
  const boundary = `----nano-syllabus-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const chunks: Buffer[] = [];
  const pushText = (value: string) => chunks.push(Buffer.from(value, "utf8"));

  pushText(`--${boundary}\r\n`);
  pushText('Content-Disposition: form-data; name="payload"\r\n');
  pushText("Content-Type: application/json; charset=utf-8\r\n\r\n");
  pushText(`${JSON.stringify(payload)}\r\n`);

  attachments.forEach((attachment, index) => {
    const decoded = dataUrlToBuffer(attachment.dataUrl);
    const mimeType = attachment.mimeType || decoded.mimeType;
    const filename = sanitizeAttachmentName(attachment.name, index);

    pushText(`--${boundary}\r\n`);
    pushText(
      `Content-Disposition: form-data; name="attachments"; filename="${filename.replace(/"/g, "_")}"\r\n`,
    );
    pushText(`Content-Type: ${mimeType}\r\n\r\n`);
    chunks.push(decoded.buffer);
    pushText("\r\n");
  });

  pushText(`--${boundary}--\r\n`);

  return {
    body: Buffer.concat(chunks),
    contentType: `multipart/form-data; boundary=${boundary}`,
  };
}

export async function chatTenantStream(
  input: {
    question: string;
    answerInstruction: string;
    contextSummary: string;
    subject: string;
    tenant: string;
    namespaces: string[];
    topK: number;
    attachments?: TenantChatAttachment[];
  },
  onEvent: (event: TenantStreamEvent) => void | Promise<void>,
) {
  const { baseUrl, token, rejectUnauthorized, timeoutMs } = getTenantApiEnv();
  const url = new URL("/api/chat/stream", baseUrl);
  const transport = url.protocol === "https:" ? https : http;
  const requestPayload = {
    question: input.question,
    answer_instruction: input.answerInstruction,
    context_summary: input.contextSummary,
    subject: input.subject,
    tenant: input.tenant,
    namespaces: input.namespaces,
    top_k: input.topK,
  };
  const attachments = input.attachments ?? [];
  const multipartBody = attachments.length
    ? createTenantChatMultipartBody({ payload: requestPayload, attachments })
    : null;
  const serializedBody = multipartBody ? multipartBody.body : JSON.stringify(requestPayload);

  await new Promise<void>((resolve, reject) => {
    let settled = false;
    let buffer = "";

    const request = transport.request(
      url,
      {
        method: "POST",
        rejectUnauthorized,
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "text/event-stream",
          "Content-Type": multipartBody?.contentType ?? "application/json",
          "Content-Length": Buffer.isBuffer(serializedBody)
            ? serializedBody.length
            : Buffer.byteLength(serializedBody),
        },
      },
      (response) => {
        response.setEncoding("utf8");

        if ((response.statusCode ?? 500) >= 400) {
          let raw = "";
          response.on("data", (chunk) => {
            raw += chunk;
          });
          response.on("end", () => {
            if (settled) return;
            settled = true;
            reject(new Error(extractErrorMessage(url, response.statusCode ?? 500, raw)));
          });
          return;
        }

        response.on("data", async (chunk) => {
          buffer += chunk;
          const parts = buffer.split(/\r?\n\r?\n/);
          buffer = parts.pop() ?? "";

          for (const part of parts) {
            const event = parseSseEvent(part);
            if (!event) continue;
            try {
              await onEvent(event);
            } catch (error) {
              request.destroy(error instanceof Error ? error : new Error(String(error)));
              return;
            }
          }
        });

        response.on("aborted", () => {
          if (settled) return;
          settled = true;
          reject(new Error(`Tenant API ${url.pathname} aborted before completing the stream.`));
        });

        response.on("error", (error) => {
          if (settled) return;
          settled = true;
          reject(error);
        });

        response.on("end", async () => {
          if (settled) return;
          if (buffer.trim()) {
            const event = parseSseEvent(buffer);
            if (event) {
              try {
                await onEvent(event);
              } catch (error) {
                settled = true;
                reject(error);
                return;
              }
            }
          }
          settled = true;
          resolve();
        });
      },
    );

    request.setTimeout(timeoutMs, () => {
      if (settled) return;
      settled = true;
      request.destroy(new Error(`Tenant API ${url.pathname} timed out after ${timeoutMs}ms`));
    });
    request.on("error", (error) => {
      if (settled) return;
      settled = true;
      reject(error);
    });
    request.write(serializedBody);
    request.end();
  });
}
