import fs from "node:fs";
import { createHash } from "node:crypto";
import http from "node:http";
import https from "node:https";

const QUESTION =
  "Explain Young's double-slit experiment in detail. Derive the conditions for constructive and destructive interference, explain how fringe width depends on wavelength, slit separation, and screen distance, and describe one practical significance of the experiment.";

function loadLocalEnv() {
  const envPath = ".env.local";
  if (!fs.existsSync(envPath)) return;

  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!match) continue;
    const [, key, rawValue] = match;
    if (!process.env[key]) process.env[key] = rawValue.replace(/^['"]|['"]$/g, "");
  }
}

function requestJson(path, body = null) {
  const baseUrl = process.env.TENANT_API_BASE_URL;
  const token = process.env.TENANT_API_TOKEN;
  if (!baseUrl || !token) {
    throw new Error("Missing TENANT_API_BASE_URL or TENANT_API_TOKEN.");
  }

  return new Promise((resolve, reject) => {
    const url = new URL(path, baseUrl);
    const serializedBody = body == null ? null : JSON.stringify(body);
    const transport = url.protocol === "https:" ? https : http;
    const startedAt = Date.now();

    const request = transport.request(
      url,
      {
        method: serializedBody ? "POST" : "GET",
        rejectUnauthorized: false,
        timeout: 90_000,
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
          let parsed = {};
          try {
            parsed = raw ? JSON.parse(raw) : {};
          } catch {
            reject(new Error(`Invalid JSON from ${path}: ${raw.slice(0, 500)}`));
            return;
          }

          resolve({
            status: response.statusCode ?? 0,
            ms: Date.now() - startedAt,
            body: parsed,
          });
        });
      },
    );

    request.on("timeout", () => request.destroy(new Error(`${path} timed out`)));
    request.on("error", reject);
    if (serializedBody) request.write(serializedBody);
    request.end();
  });
}

function hashDebugValue(value) {
  return createHash("sha256")
    .update(typeof value === "string" ? value : JSON.stringify(value))
    .digest("hex")
    .slice(0, 16);
}

loadLocalEnv();

const subjectsResponse = await requestJson("/tenant/subjects");
const subject = subjectsResponse.body.subjects?.find(
  (item) => item.name === "Engineering Physics",
);

if (!subject) {
  throw new Error("Engineering Physics was not found in /tenant/subjects.");
}

const payload = {
  user_id: "ui-parity-engineering-physics",
  subject: subject.slug,
  folder_path: subject.folder_path,
  prompt: QUESTION,
  namespace: subject.namespace_slug,
};

const promptResponse = await requestJson("/v1/prompt", payload);

console.log(
  JSON.stringify(
    {
      question: QUESTION,
      payload,
      questionHash: hashDebugValue(QUESTION),
      payloadHash: hashDebugValue({
        subject: payload.subject,
        folder_path: payload.folder_path,
        prompt: payload.prompt,
        namespace: payload.namespace,
      }),
      status: promptResponse.status,
      ms: promptResponse.ms,
      answer: promptResponse.body.answer ?? "",
      detail: promptResponse.body.detail ?? null,
      citationCount: Array.isArray(promptResponse.body.citations)
        ? promptResponse.body.citations.length
        : null,
    },
    null,
    2,
  ),
);
