import http from "node:http";
import https from "node:https";
import { getTenantApiEnv } from "@/lib/env";

type JsonRecord = Record<string, unknown>;

export class TeacherOperatorApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly payload: unknown,
  ) {
    super(message);
    this.name = "TeacherOperatorApiError";
  }
}

function operatorToken() {
  const token = process.env.TEACHER_APP_API_TOKEN?.trim();
  if (!token) throw new Error("Missing TEACHER_APP_API_TOKEN.");
  return token;
}

function messageFromPayload(payload: unknown, fallback: string) {
  if (!payload || typeof payload !== "object") return fallback;
  const record = payload as JsonRecord;
  const detail = record.detail ?? record.error ?? record.message;
  return typeof detail === "string" && detail.trim() ? detail : fallback;
}

async function operatorRequest(
  pathname: string,
  method: "GET" | "POST",
  body?: JsonRecord,
) {
  const { baseUrl, rejectUnauthorized, timeoutMs } = getTenantApiEnv();
  const url = new URL(pathname, baseUrl);
  const serialized = body ? JSON.stringify(body) : "";

  return new Promise<JsonRecord>((resolve, reject) => {
    const transport = url.protocol === "https:" ? https : http;
    const request = transport.request(
      url,
      {
        method,
        rejectUnauthorized,
        headers: {
          Authorization: `Bearer ${operatorToken()}`,
          Accept: "application/json",
          ...(serialized
            ? {
                "Content-Type": "application/json",
                "Content-Length": Buffer.byteLength(serialized),
              }
            : {}),
        },
      },
      (response) => {
        let raw = "";
        response.setEncoding("utf8");
        response.on("data", (chunk: string) => { raw += chunk; });
        response.on("end", () => {
          let payload: unknown = {};
          if (raw.trim()) {
            try {
              payload = JSON.parse(raw);
            } catch {
              reject(new TeacherOperatorApiError("Teacher API returned an invalid response.", response.statusCode ?? 502, raw.slice(0, 300)));
              return;
            }
          }

          const status = response.statusCode ?? 502;
          if (status >= 400) {
            reject(new TeacherOperatorApiError(messageFromPayload(payload, "Teacher operator request failed."), status, payload));
            return;
          }
          resolve(payload && typeof payload === "object" ? payload as JsonRecord : {});
        });
      },
    );
    request.setTimeout(timeoutMs, () => request.destroy(new Error("Teacher operator request timed out.")));
    request.on("error", reject);
    if (serialized) request.write(serialized);
    request.end();
  });
}

export function getTeacherFromOperator(handle: string) {
  return operatorRequest(`/v1/teacher-app/teachers/${encodeURIComponent(handle)}`, "GET");
}

export function regenerateTeacherKeyFromOperator(handle: string) {
  return operatorRequest(`/v1/teacher-app/teachers/${encodeURIComponent(handle)}/api-key/regenerate`, "POST");
}

export function createTeacherFromOperator(input: { handle: string; name: string; email: string }) {
  return operatorRequest("/v1/teacher-app/teachers", "POST", {
    ...input,
    create_login: false,
  });
}

export function collectionKeyFromOperatorPayload(payload: JsonRecord) {
  const candidates = [payload.api_key, payload.collection_api_key, payload.collection_key, payload.key];
  return candidates.find((candidate): candidate is string => typeof candidate === "string" && candidate.trim().length > 0) ?? null;
}
