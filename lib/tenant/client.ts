import http from "node:http";
import https from "node:https";
import { getTenantApiEnv } from "@/lib/env";

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

function slugifyTenantValue(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function countIndexedChunks(nodes: TenantSourceTreeNode[] | undefined): number {
  return (nodes ?? []).reduce((total, node) => {
    const ownChunks = node.indexed && typeof node.chunk_count === "number" ? node.chunk_count : 0;
    return total + ownChunks + countIndexedChunks(node.children);
  }, 0);
}

function deriveTenantSubjectsFromSourceTree(nodes: TenantSourceTreeNode[], path: string[] = []) {
  const subjects: TenantSubject[] = [];

  for (const node of nodes) {
    const nextPath = [...path, node.name];

    if (nextPath.length === 5) {
      const [namespace = "", , , , subjectName = ""] = nextPath;
      const folderPath = nextPath.join("/");
      subjects.push({
        name: subjectName,
        slug: slugifyTenantValue(subjectName),
        namespace,
        namespace_slug: slugifyTenantValue(namespace),
        full_path: `nano-syllabus/${folderPath}`,
        folder_path: folderPath,
        chunk_count: countIndexedChunks(node.children),
      });
      continue;
    }

    if (node.children?.length) {
      subjects.push(...deriveTenantSubjectsFromSourceTree(node.children, nextPath));
    }
  }

  return subjects;
}

function requestJson<T>(
  path: string,
  options: {
    method?: "GET" | "POST";
    body?: unknown;
  } = {},
) {
  const { baseUrl, token, rejectUnauthorized, timeoutMs } = getTenantApiEnv();

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
            reject(
              new Error(
                `Tenant API ${url.pathname} failed with ${response.statusCode}: ${raw.slice(0, 500)}`,
              ),
            );
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
  const [payload, sourceTree] = await Promise.all([
    requestJson<TenantSubjectsResponse>("/api/v1/subjects"),
    getTenantSourceTree(),
  ]);
  const subjectsByFolderPath = new Map<string, TenantSubject>();

  for (const subject of deriveTenantSubjectsFromSourceTree(sourceTree.tree ?? [])) {
    subjectsByFolderPath.set(subject.folder_path, subject);
  }

  for (const subject of payload.subjects ?? []) {
    subjectsByFolderPath.set(subject.folder_path, subject);
  }

  return Array.from(subjectsByFolderPath.values());
}

export async function getTenantSourceTree() {
  return requestJson<TenantSourceTreeResponse>("/api/v1/source-tree");
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

  const readNumber = (value: unknown) => (typeof value === "number" && Number.isFinite(value) ? value : 0);

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
      readNumber(usage.totalTokens) ||
      readNumber(usage.total_tokens) ||
      inputTokens + outputTokens;

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
            reject(
              new Error(
                `Tenant API ${url.pathname} failed with ${response.statusCode}: ${raw.slice(0, 500)}`,
              ),
            );
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
