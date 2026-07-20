import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import http from "node:http";
import https from "node:https";
import { join } from "node:path";

type TenantSubject = {
  name: string;
  slug: string;
  namespace_slug: string;
  folder_path: string;
  chunk_count: number;
};

type TenantSourceTreeNode = {
  name: string;
  indexed?: boolean;
  chunk_count?: number;
  children?: TenantSourceTreeNode[];
};

type JsonResponse<T> = {
  status: number;
  body: T;
};

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
    const url = new URL(path, baseUrl);
    const serializedBody = options.body == null ? null : JSON.stringify(options.body);
    const transport = url.protocol === "https:" ? https : http;

    const request = transport.request(
      url,
      {
        method: options.method ?? "GET",
        rejectUnauthorized: false,
        timeout: 60_000,
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
            });
          } catch (error) {
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

function collectIndexedChunks(
  nodes: TenantSourceTreeNode[],
  path: string[] = [],
  stats = new Map<string, number>(),
) {
  for (const node of nodes) {
    const nextPath = [...path, node.name];

    if (node.children?.length) {
      collectIndexedChunks(node.children, nextPath, stats);
      continue;
    }

    if (node.indexed && nextPath.length >= 6) {
      const subjectFolderPath = nextPath.slice(0, 5).join("/");
      stats.set(subjectFolderPath, (stats.get(subjectFolderPath) ?? 0) + (node.chunk_count ?? 0));
    }
  }

  return stats;
}

function promptForSubject(subject: TenantSubject) {
  if (/digital logic/i.test(subject.name)) {
    return "Explain Karnaugh map in one short paragraph.";
  }

  if (/electrical circuit and machine/i.test(subject.name)) {
    return "Explain the working principle of a transformer in one short paragraph.";
  }

  return `Explain one core concept from ${subject.name} in one short paragraph.`;
}

maybeDescribe("tenant prompt API indexed sample", () => {
  it("answers from an indexed tenant subject without local answer generation", async () => {
    const subjectsResponse = await requestJson<{ subjects: TenantSubject[] }>("/api/v1/subjects");
    const treeResponse = await requestJson<{ tree: TenantSourceTreeNode[] }>("/api/v1/source-tree");

    expect(subjectsResponse.status).toBe(200);
    expect(treeResponse.status).toBe(200);

    const indexedChunksByFolderPath = collectIndexedChunks(treeResponse.body.tree ?? []);
    const indexedSubjects = (subjectsResponse.body.subjects ?? [])
      .map((subject) => ({
        ...subject,
        indexedChunkCount: indexedChunksByFolderPath.get(subject.folder_path) ?? subject.chunk_count ?? 0,
      }))
      .filter((subject) => subject.indexedChunkCount > 0)
      .sort((left, right) => right.indexedChunkCount - left.indexedChunkCount);

    expect(
      indexedSubjects.length,
      "No indexed subjects were found by matching /api/v1/subjects with /api/v1/source-tree.",
    ).toBeGreaterThan(0);

    const preferredSubject =
      indexedSubjects.find((subject) => /electrical circuit and machine/i.test(subject.name)) ??
      indexedSubjects.find((subject) => /digital logic/i.test(subject.name)) ??
      indexedSubjects[0];

    const promptResponse = await requestJson<{
      answer?: string;
      detail?: string;
      citations?: unknown[];
    }>("/v1/prompt", {
      method: "POST",
      body: {
        user_id: "tenant-indexed-sample-test",
        subject: preferredSubject.slug,
        folder_path: preferredSubject.folder_path,
        prompt: promptForSubject(preferredSubject),
        namespace: preferredSubject.namespace_slug,
      },
    });

    expect(
      promptResponse.status,
      `Tenant prompt failed for ${preferredSubject.name}: ${JSON.stringify(promptResponse.body).slice(0, 1_000)}`,
    ).toBe(200);
    expect(
      promptResponse.body.answer?.trim(),
      `Tenant prompt returned no answer for ${preferredSubject.name}. Detail: ${promptResponse.body.detail ?? "none"}`,
    ).toBeTruthy();
  }, 90_000);
});
