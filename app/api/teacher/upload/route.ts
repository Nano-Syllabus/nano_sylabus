import { NextResponse } from "next/server";
import { getTeacherProfile } from "@/app/teachers/actions";
import { getTenantApiEnv } from "@/lib/env";
import https from "node:https";
import http from "node:http";

type ApiRecord = Record<string, unknown>;

function field(value: FormDataEntryValue | null) {
  return typeof value === "string" ? value.trim() : "";
}

function apiMessage(payload: unknown, fallback: string) {
  if (!payload || typeof payload !== "object") return fallback;
  const record = payload as ApiRecord;
  return String(record.detail ?? record.error ?? record.message ?? fallback);
}

function uploadedPath(payload: unknown) {
  if (!payload || typeof payload !== "object") return "";
  const record = payload as ApiRecord;
  if (typeof record.path === "string") return record.path;
  if (record.file && typeof record.file === "object") {
    const path = (record.file as ApiRecord).path;
    if (typeof path === "string") return path;
  }
  return "";
}

export async function POST(req: Request) {
  try {
    const teacher = await getTeacherProfile();
    if (!teacher) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { baseUrl, rejectUnauthorized, timeoutMs } = getTenantApiEnv();

    const formData = await req.formData();
    const file = formData.get("file");
    const path = field(formData.get("path"));
    const metadata = field(formData.get("metadata"));

    if (!(file instanceof File) || file.size === 0) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }
    if (!path) {
      return NextResponse.json(
        { error: "A collection-relative upload path is required." },
        { status: 400 },
      );
    }

    const fileBuffer = Buffer.from(await file.arrayBuffer());
    const boundary = `----WebKitFormBoundary${Math.random().toString(36).substring(2)}`;
    const safeFilename = file.name.replace(/[\r\n"]/g, "_");

    const parts = [];

    if (path) {
      parts.push(
        Buffer.from(
          `--${boundary}\r\nContent-Disposition: form-data; name="path"\r\n\r\n${path}\r\n`,
        ),
      );
    }

    if (metadata) {
      parts.push(
        Buffer.from(
          `--${boundary}\r\nContent-Disposition: form-data; name="metadata"\r\n\r\n${metadata}\r\n`,
        ),
      );
    }

    parts.push(
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${safeFilename}"\r\nContent-Type: ${file.type || "application/octet-stream"}\r\n\r\n`,
      ),
    );
    parts.push(fileBuffer);
    parts.push(Buffer.from(`\r\n--${boundary}--\r\n`));

    const bodyBuffer = Buffer.concat(parts);

    const url = new URL("/v1/collection/upload", baseUrl);
    const transport = url.protocol === "https:" ? https : http;

    const makeRequest = (
      reqUrl: URL,
      method: "POST",
      headers: Record<string, string | number>,
      body: Buffer | string,
    ) => {
      return new Promise<ApiRecord>((resolve, reject) => {
        const request = transport.request(
          reqUrl,
          { method, rejectUnauthorized, headers },
          (response) => {
            let raw = "";
            response.setEncoding("utf-8");
            response.on("data", (chunk: string) => (raw += chunk));
            response.on("end", () => {
              let parsed: unknown = {};
              try {
                if (raw.trim()) parsed = JSON.parse(raw);
              } catch {
                reject(new Error(`Failed to parse response: ${raw.slice(0, 500)}`));
                return;
              }
              const status = response.statusCode ?? 502;
              if (status >= 400) {
                reject(new Error(apiMessage(parsed, `Teacher API request failed (${status}).`)));
                return;
              }
              resolve((parsed ?? {}) as ApiRecord);
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
    };

    // 1. Upload to shelf
    const uploadRes = await makeRequest(
      url,
      "POST",
      {
        Authorization: `Bearer ${teacher.collection_sk}`,
        "Content-Type": `multipart/form-data; boundary=${boundary}`,
        "Content-Length": bodyBuffer.length,
      },
      bodyBuffer,
    );

    const uploadedFilePath = uploadedPath(uploadRes);
    if (!uploadedFilePath) {
      throw new Error("Teacher API uploaded the file but did not return its collection path.");
    }

    // 2. Index the document
    const indexUrl = new URL("/v1/collection/index-document", baseUrl);
    const indexBody = JSON.stringify({ path: uploadedFilePath });

    const indexRes = await makeRequest(
      indexUrl,
      "POST",
      {
        Authorization: `Bearer ${teacher.collection_sk}`,
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(indexBody),
      },
      indexBody,
    );

    return NextResponse.json({ upload: uploadRes, index: indexRes });
  } catch (error: unknown) {
    console.error("Upload route error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 },
    );
  }
}
