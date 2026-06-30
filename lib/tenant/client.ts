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

export type TenantPromptResponse = {
  answer?: string;
  detail?: string;
  citations?: TenantPromptCitation[];
};

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
  const payload = await requestJson<TenantNamespacesResponse>("/tenant/namespaces");
  return payload.namespaces ?? [];
}

export async function listTenantSubjects() {
  const payload = await requestJson<TenantSubjectsResponse>("/tenant/subjects");
  return payload.subjects ?? [];
}

export async function getTenantSourceTree() {
  return requestJson<TenantSourceTreeResponse>("/tenant/source-tree");
}

export async function promptTenant(input: {
  userId: string;
  subject: string;
  folderPath: string;
  prompt: string;
  namespace: string;
  topK?: number;
}) {
  return requestJson<TenantPromptResponse>("/v1/prompt", {
    method: "POST",
    body: {
      user_id: input.userId,
      subject: input.subject,
      folder_path: input.folderPath,
      prompt: input.prompt,
      namespace: input.namespace,
      top_k: input.topK ?? 5,
    },
  });
}
