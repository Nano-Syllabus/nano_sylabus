import { beforeAll, describe, expect, it } from "vitest";
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

type JsonResponse<T> = {
  status: number;
  body: T;
};

type TenantSourceTreeNode = {
  name: string;
  children?: TenantSourceTreeNode[];
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

function collectTreeSubjectFolderPaths(
  nodes: TenantSourceTreeNode[],
  path: string[] = [],
  stats = new Set<string>(),
) {
  for (const node of nodes) {
    const nextPath = [...path, node.name];

    if (nextPath.length === 5) {
      stats.add(nextPath.join("/"));
    }

    if (node.children?.length) {
      collectTreeSubjectFolderPaths(node.children, nextPath, stats);
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
    const isHttps = url.protocol === "https:";
    const transport = isHttps ? https : http;
    const serializedBody = options.body == null ? null : JSON.stringify(options.body);

    const request = transport.request(
      url,
      {
        method: options.method ?? "GET",
        rejectUnauthorized: false,
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
            const parsed = raw ? (JSON.parse(raw) as T) : ({} as T);
            resolve({
              status: response.statusCode ?? 0,
              body: parsed,
            });
          } catch (error) {
            reject(
              new Error(
                `Failed to parse JSON from ${url.pathname}. Status ${response.statusCode}. Body: ${raw.slice(0, 500)}`,
              ),
            );
          }
        });
      },
    );

    request.on("error", reject);
    if (serializedBody) request.write(serializedBody);
    request.end();
  });
}

maybeDescribe("tenant API smoke test", () => {
  let namespacesResponse: JsonResponse<{ tenant: string; namespaces: TenantNamespace[] }>;
  let subjectsResponse: JsonResponse<{ tenant: string; subjects: TenantSubject[] }>;
  let sourceTreeResponse: JsonResponse<{
    tenant: string;
    total_files: number;
    indexed_files: number;
    tree: TenantSourceTreeNode[];
  }>;
  let collectionsResponse: JsonResponse<TenantCollectionsResponse>;

  beforeAll(async () => {
    namespacesResponse = await requestJson("/tenant/namespaces");
    subjectsResponse = await requestJson("/tenant/subjects");
    sourceTreeResponse = await requestJson("/tenant/source-tree");
    collectionsResponse = await requestJson("/tenant/collections");
  });

  it("returns queryable namespaces for onboarding or scope pickers", () => {
    expect(namespacesResponse.status).toBe(200);
    expect(Array.isArray(namespacesResponse.body.namespaces)).toBe(true);
    expect(namespacesResponse.body.namespaces.length).toBeGreaterThan(0);
    expect(
      namespacesResponse.body.namespaces.some(
        (namespace) =>
          namespace.queryable &&
          typeof namespace.namespace_slug === "string" &&
          namespace.namespace_slug.length > 0,
      ),
    ).toBe(true);
  });

  it("returns subject cards usable in explore, subject selectors, and scoped chat start flows", () => {
    expect(subjectsResponse.status).toBe(200);
    expect(Array.isArray(subjectsResponse.body.subjects)).toBe(true);
    expect(subjectsResponse.body.subjects.length).toBeGreaterThan(0);
    expect(subjectsResponse.body.subjects[0]).toMatchObject({
      name: expect.any(String),
      slug: expect.any(String),
      namespace_slug: expect.any(String),
      folder_path: expect.any(String),
    });
  });

  it("returns the full source tree usable for admin/source browsing and provenance UIs", () => {
    expect(sourceTreeResponse.status).toBe(200);
    expect(sourceTreeResponse.body.total_files).toBeGreaterThanOrEqual(0);
    expect(sourceTreeResponse.body.indexed_files).toBeGreaterThanOrEqual(0);
    expect(Array.isArray(sourceTreeResponse.body.tree)).toBe(true);
    expect(sourceTreeResponse.body.tree.length).toBeGreaterThan(0);
  });

  it("keeps /tenant/subjects aligned with subject folders present in /tenant/source-tree", () => {
    const treeSubjectFolderPaths = collectTreeSubjectFolderPaths(sourceTreeResponse.body.tree);
    const subjects = subjectsResponse.body.subjects ?? [];

    expect(treeSubjectFolderPaths.size).toBeGreaterThan(0);
    expect(subjects.length).toBeGreaterThan(0);

    const missingFromTree = subjects.filter((subject) => !treeSubjectFolderPaths.has(subject.folder_path));

    expect(
      missingFromTree,
      `Subjects missing from source-tree: ${missingFromTree.map((subject) => subject.folder_path).join(", ")}`,
    ).toHaveLength(0);
  });

  it("returns collection coverage stats usable for dashboards and health checks", () => {
    expect(collectionsResponse.status).toBe(200);
    expect(Array.isArray(collectionsResponse.body.collections)).toBe(true);
    expect(collectionsResponse.body.collections.length).toBeGreaterThan(0);
    expect(collectionsResponse.body.total_files).toBeGreaterThanOrEqual(
      collectionsResponse.body.indexed_files,
    );
  });

  it("can answer a scoped prompt for chat when credits and upstream LLM are healthy", async () => {
    const indexedSubjects = subjectsResponse.body.subjects
      .filter((item) => item.folder_path && item.slug && item.namespace_slug && item.chunk_count > 0)
      .sort((left, right) => right.chunk_count - left.chunk_count);

    const subject =
      indexedSubjects.find((item) => /electrical circuit and machine/i.test(item.name)) ??
      indexedSubjects.find((item) => /digital logic/i.test(item.name)) ??
      indexedSubjects[0];

    expect(subject, "No usable subject metadata returned from /tenant/subjects").toBeTruthy();

    const response = await requestJson<{
      answer?: string;
      detail?: string;
      citations?: unknown[];
    }>("/v1/prompt", {
      method: "POST",
      body: {
        user_id: "tenant-api-smoke-user",
        subject: subject!.slug,
        folder_path: subject!.folder_path,
        prompt: promptForSubject(subject!),
        namespace: subject!.namespace_slug,
        top_k: 5,
      },
    });

    expect(
      response.status,
      `Prompt API failed with status ${response.status}: ${JSON.stringify(response.body).slice(0, 800)}`,
    ).toBe(200);
    expect(typeof response.body.answer).toBe("string");
    expect(response.body.answer?.trim().length).toBeGreaterThan(0);
  }, 90_000);
});
