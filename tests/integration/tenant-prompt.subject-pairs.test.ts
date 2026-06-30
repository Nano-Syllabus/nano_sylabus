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
};

type JsonResponse<T> = {
  status: number;
  body: T;
};

const TARGET_SUBJECTS = [
  {
    name: "Digital Logic",
    prompt: "Explain Karnaugh map in one short paragraph.",
  },
  {
    name: "Engineering Physics",
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

maybeDescribe("tenant prompt API for indexed subject pairs", () => {
  it("answers Digital Logic and Engineering Physics with scoped tenant calls", async () => {
    const subjectsResponse = await requestJson<{ subjects: TenantSubject[] }>("/tenant/subjects");
    expect(subjectsResponse.status).toBe(200);

    const subjects = subjectsResponse.body.subjects ?? [];
    for (const target of TARGET_SUBJECTS) {
      const subject = subjects.find((item) => item.name === target.name);
      expect(subject, `Missing subject in /tenant/subjects: ${target.name}`).toBeTruthy();

      const promptResponse = await requestJson<{
        answer?: string;
        detail?: string;
        citations?: unknown[];
      }>("/v1/prompt", {
        method: "POST",
        body: {
          user_id: `tenant-subject-pair-${subject!.slug}`,
          subject: subject!.slug,
          folder_path: subject!.folder_path,
          prompt: target.prompt,
          namespace: subject!.namespace_slug,
          top_k: 5,
        },
      });

      expect(
        promptResponse.status,
        `Tenant prompt failed for ${target.name}: ${JSON.stringify(promptResponse.body).slice(0, 1_000)}`,
      ).toBe(200);
      expect(
        promptResponse.body.answer?.trim(),
        `Tenant prompt returned no answer for ${target.name}. Detail: ${promptResponse.body.detail ?? "none"}`,
      ).toBeTruthy();
    }
  }, 120_000);
});
