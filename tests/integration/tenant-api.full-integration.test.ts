import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import http from "node:http";
import https from "node:https";
import { join } from "node:path";

type TenantNamespace = {
  namespace: string;
  namespace_slug: string;
  path: string;
  total_files: number;
  indexed_files: number;
  queryable: boolean;
};

type TenantSubject = {
  name: string;
  slug: string;
  namespace: string;
  namespace_slug: string;
  full_path: string;
  folder_path: string;
  chunk_count: number;
};

type TenantSourceTreeNode = {
  name: string;
  children?: TenantSourceTreeNode[];
};

type TenantCollectionsResponse = {
  tenant: string;
  collections: Array<{
    name: string;
    slug: string;
    path: string;
    total_files: number;
    indexed_files: number;
  }>;
  total_files: number;
  indexed_files: number;
};

type PromptPayload = {
  answer?: string;
  detail?: string;
  citations?: unknown[];
  served_from?: string;
};

type JsonResponse<T> = {
  status: number;
  body: T;
  ms: number;
};

const TARGET_PROMPTS = [
  {
    subjectName: "Digital Logic",
    prompt: "Explain Karnaugh map in one short paragraph.",
  },
  {
    subjectName: "Engineering Physics",
    prompt: "Explain interference of light in one short paragraph.",
  },
] as const;

function loadLocalEnv() {
  const envPath = join(process.cwd(), ".env.local");
  if (!existsSync(envPath)) return;

  for (const line of readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!match) continue;

    const [, key, rawValue] = match;
    if (!process.env[key]) {
      process.env[key] = rawValue.replace(/^['"]|['"]$/g, "");
    }
  }
}

function countSubjectFolders(nodes: TenantSourceTreeNode[], path: string[] = [], count = { value: 0 }) {
  for (const node of nodes) {
    const nextPath = [...path, node.name];
    if (nextPath.length === 5) {
      count.value += 1;
    }
    if (node.children?.length) {
      countSubjectFolders(node.children, nextPath, count);
    }
  }

  return count.value;
}

loadLocalEnv();

const baseUrl = process.env.TENANT_API_BASE_URL?.trim() || "";
const token = process.env.TENANT_API_TOKEN?.trim() || "";
const shouldRun = Boolean(baseUrl && token);
const maybeDescribe = shouldRun ? describe : describe.skip;

function requestJson<T>(
  path: string,
  options: {
    method?: "GET" | "POST";
    body?: unknown;
  } = {},
) {
  return new Promise<JsonResponse<T>>((resolve, reject) => {
    const startedAt = Date.now();
    const url = new URL(path, baseUrl);
    const transport = url.protocol === "https:" ? https : http;
    const serializedBody = options.body == null ? null : JSON.stringify(options.body);

    const request = transport.request(
      url,
      {
        method: options.method ?? "GET",
        rejectUnauthorized: false,
        timeout: 30_000,
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
        response.on("end", () => {
          try {
            resolve({
              status: response.statusCode ?? 0,
              body: raw ? (JSON.parse(raw) as T) : ({} as T),
              ms: Date.now() - startedAt,
            });
          } catch {
            reject(
              new Error(
                `Failed to parse JSON from ${url.pathname}. Status ${response.statusCode}. Body: ${raw.slice(0, 800)}`,
              ),
            );
          }
        });
      },
    );

    request.on("timeout", () => request.destroy(new Error(`Tenant API ${url.pathname} timed out`)));
    request.on("error", reject);
    if (serializedBody) request.write(serializedBody);
    request.end();
  });
}

maybeDescribe("tenant API full integration", () => {
  it("verifies core tenant endpoints and scoped prompt answers end to end", async () => {
    const [namespacesResponse, subjectsResponse, sourceTreeResponse, collectionsResponse] = await Promise.all([
      requestJson<{ tenant: string; namespaces: TenantNamespace[] }>("/tenant/namespaces"),
      requestJson<{ tenant: string; subjects: TenantSubject[] }>("/tenant/subjects"),
      requestJson<{ tenant: string; total_files: number; indexed_files: number; tree: TenantSourceTreeNode[] }>(
        "/tenant/source-tree",
      ),
      requestJson<TenantCollectionsResponse>("/tenant/collections"),
    ]);

    expect(namespacesResponse.status).toBe(200);
    expect(subjectsResponse.status).toBe(200);
    expect(sourceTreeResponse.status).toBe(200);
    expect(collectionsResponse.status).toBe(200);

    expect(namespacesResponse.body.namespaces.length).toBeGreaterThan(0);
    expect(subjectsResponse.body.subjects.length).toBeGreaterThan(0);
    expect(sourceTreeResponse.body.tree.length).toBeGreaterThan(0);
    expect(collectionsResponse.body.collections.length).toBeGreaterThan(0);

    const promptResults: Array<{
      subjectName: string;
      status: number;
      ms: number;
      answerLength: number;
      servedFrom: string | null;
    }> = [];

    for (const target of TARGET_PROMPTS) {
      const subject = subjectsResponse.body.subjects.find((item) => item.name === target.subjectName);
      expect(subject, `Missing subject in /tenant/subjects: ${target.subjectName}`).toBeTruthy();

      const promptResponse = await requestJson<PromptPayload>("/v1/prompt", {
        method: "POST",
        body: {
          user_id: `tenant-full-integration-${subject!.slug}`,
          subject: subject!.slug,
          folder_path: subject!.folder_path,
          prompt: target.prompt,
          namespace: subject!.namespace_slug,
        },
      });

      expect(
        promptResponse.status,
        `Tenant prompt failed for ${target.subjectName}: ${JSON.stringify(promptResponse.body).slice(0, 1_000)}`,
      ).toBe(200);
      expect(
        promptResponse.body.answer?.trim(),
        `Tenant prompt returned no answer for ${target.subjectName}. Detail: ${promptResponse.body.detail ?? "none"}`,
      ).toBeTruthy();

      promptResults.push({
        subjectName: target.subjectName,
        status: promptResponse.status,
        ms: promptResponse.ms,
        answerLength: promptResponse.body.answer?.trim().length ?? 0,
        servedFrom: promptResponse.body.served_from ?? null,
      });
    }

    console.info(
      JSON.stringify(
        {
          endpointSummary: {
            namespaces: {
              status: namespacesResponse.status,
              ms: namespacesResponse.ms,
              count: namespacesResponse.body.namespaces.length,
              queryable: namespacesResponse.body.namespaces.filter((item) => item.queryable).length,
            },
            subjects: {
              status: subjectsResponse.status,
              ms: subjectsResponse.ms,
              count: subjectsResponse.body.subjects.length,
            },
            sourceTree: {
              status: sourceTreeResponse.status,
              ms: sourceTreeResponse.ms,
              subjectFolders: countSubjectFolders(sourceTreeResponse.body.tree),
              totalFiles: sourceTreeResponse.body.total_files,
              indexedFiles: sourceTreeResponse.body.indexed_files,
            },
            collections: {
              status: collectionsResponse.status,
              ms: collectionsResponse.ms,
              count: collectionsResponse.body.collections.length,
              totalFiles: collectionsResponse.body.total_files,
              indexedFiles: collectionsResponse.body.indexed_files,
            },
          },
          promptSummary: promptResults,
        },
        null,
        2,
      ),
    );
  }, 120_000);
});
