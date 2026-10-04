import { createHmac } from "node:crypto";
import http from "node:http";
import https from "node:https";
import { getTenantApiEnv } from "@/lib/env";

type StorageError = { message: string; statusCode?: string };
type StorageResult<T> = Promise<{ data: T | null; error: StorageError | null }>;

const PROXY_PREFIX = "/vps-storage";

function objectPath(path: string) {
  if (!path || path.includes("\\") || path.split("/").some((part) => !part || part === "." || part === "..")) {
    throw new Error("Object paths must contain only relative file and directory names.");
  }
  const prefix = process.env.VPS_STORAGE_PATH_PREFIX?.trim().replace(/\/$/, "") || "";
  if (prefix && !/^[a-zA-Z0-9_-]+(?:\/[a-zA-Z0-9_-]+)*$/.test(prefix)) {
    throw new Error("VPS_STORAGE_PATH_PREFIX must contain only relative directory names.");
  }
  return prefix ? `${prefix}/${path}` : path;
}

function config() {
  const tenant = getTenantApiEnv();
  const configuredUrl = process.env.VPS_STORAGE_URL?.trim();
  const baseUrl = new URL(configuredUrl || tenant.baseUrl);
  // The VPS currently has a self-signed certificate on its bare IP. Internal
  // calls use nginx over HTTP; browser calls remain same-origin HTTPS through
  // the Next rewrite below.
  if (!configuredUrl && !tenant.rejectUnauthorized) baseUrl.protocol = "http:";
  const token = (process.env.VPS_STORAGE_TOKEN || tenant.token).trim();
  const signingSecret = (process.env.VPS_STORAGE_SIGNING_SECRET || token).trim();
  if (token.length < 32 || signingSecret.length < 32) {
    throw new Error("VPS object storage credentials must be at least 32 characters.");
  }
  return { baseUrl, token, signingSecret, rejectUnauthorized: tenant.rejectUnauthorized };
}

function encodedPath(path: string) {
  return path.split("/").map(encodeURIComponent).join("/");
}

function storagePath(kind: string, bucket: string, path: string) {
  return `${kind}/${encodeURIComponent(bucket)}/${encodedPath(path)}`;
}

function signedPath(method: "GET" | "PUT", kind: string, bucket: string, path: string, seconds: number) {
  path = objectPath(path);
  const { signingSecret } = config();
  const expires = Math.floor(Date.now() / 1000) + Math.max(1, seconds);
  const signature = createHmac("sha256", signingSecret)
    .update(`${method}\n${bucket}\n${path}\n${expires}`)
    .digest("hex");
  const query = new URLSearchParams({ expires: String(expires), signature });
  return `${PROXY_PREFIX}/${storagePath(kind, bucket, path)}?${query}`;
}

async function responseBody(response: http.IncomingMessage) {
  const chunks: Buffer[] = [];
  for await (const chunk of response) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  return Buffer.concat(chunks);
}

async function request(
  method: string,
  kind: string,
  bucket: string,
  path: string,
  options: { body?: Buffer; contentType?: string; upsert?: boolean } = {},
) {
  const { baseUrl, token, rejectUnauthorized } = config();
  const url = new URL(`/v1/object-storage/${storagePath(kind, bucket, objectPath(path))}`, baseUrl);
  const transport = url.protocol === "https:" ? https : http;
  return new Promise<{ status: number; headers: http.IncomingHttpHeaders; body: Buffer }>((resolve, reject) => {
    const req = transport.request(
      url,
      {
        method,
        rejectUnauthorized,
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/json",
          ...(options.contentType ? { "Content-Type": options.contentType } : {}),
          ...(options.upsert ? { "x-upsert": "true" } : {}),
          ...(options.body ? { "Content-Length": String(options.body.length) } : {}),
        },
      },
      async (response) => {
        try {
          resolve({
            status: response.statusCode ?? 502,
            headers: response.headers,
            body: await responseBody(response),
          });
        } catch (error) {
          reject(error);
        }
      },
    );
    req.setTimeout(300_000, () => req.destroy(new Error("VPS object storage request timed out.")));
    req.on("error", reject);
    if (options.body) req.write(options.body);
    req.end();
  });
}

function failure(status: number, body: Buffer): StorageError {
  let message = body.toString("utf8").slice(0, 500) || `Object storage answered ${status}.`;
  try {
    const parsed = JSON.parse(message) as { detail?: unknown };
    if (typeof parsed.detail === "string") message = parsed.detail;
  } catch {
    // The short response body is already the best diagnostic.
  }
  return { message, statusCode: String(status) };
}

async function bytes(value: unknown) {
  if (Buffer.isBuffer(value)) return value;
  if (value instanceof Uint8Array) return Buffer.from(value);
  if (value instanceof ArrayBuffer) return Buffer.from(value);
  if (value instanceof Blob) return Buffer.from(await value.arrayBuffer());
  return Buffer.from(String(value ?? ""));
}

class VpsBucket {
  constructor(private readonly bucket: string) {}

  async upload(path: string, body: unknown, options: { contentType?: string; upsert?: boolean } = {}) {
    try {
      const payload = await bytes(body);
      const result = await request("PUT", "object", this.bucket, path, {
        body: payload,
        contentType: options.contentType || "application/octet-stream",
        upsert: options.upsert,
      });
      if (result.status >= 400) return { data: null, error: failure(result.status, result.body) };
      return { data: { path, fullPath: `${this.bucket}/${path}` }, error: null };
    } catch (error) {
      return { data: null, error: { message: error instanceof Error ? error.message : "Object upload failed." } };
    }
  }

  async download(path: string): StorageResult<Blob> {
    try {
      const result = await request("GET", "object", this.bucket, path);
      if (result.status >= 400) return { data: null, error: failure(result.status, result.body) };
      const type = String(result.headers["content-type"] || "application/octet-stream");
      const copy = new Uint8Array(result.body.length);
      copy.set(result.body);
      return { data: new Blob([copy], { type }), error: null };
    } catch (error) {
      return { data: null, error: { message: error instanceof Error ? error.message : "Object download failed." } };
    }
  }

  async remove(paths: string[]) {
    const removed: Array<{ name: string }> = [];
    for (const path of paths) {
      try {
        const result = await request("DELETE", "object", this.bucket, path);
        if (result.status >= 400) return { data: null, error: failure(result.status, result.body) };
        removed.push({ name: path });
      } catch (error) {
        return { data: null, error: { message: error instanceof Error ? error.message : "Object deletion failed." } };
      }
    }
    return { data: removed, error: null };
  }

  async info(path: string) {
    try {
      const result = await request("HEAD", "object", this.bucket, path);
      if (result.status >= 400) return { data: null, error: failure(result.status, result.body) };
      return {
        data: {
          name: path.split("/").pop() || path,
          size: Number(result.headers["content-length"] || 0),
          mimetype: String(result.headers["content-type"] || "application/octet-stream"),
          eTag: String(result.headers.etag || ""),
        },
        error: null,
      };
    } catch (error) {
      return { data: null, error: { message: error instanceof Error ? error.message : "Object lookup failed." } };
    }
  }

  async createSignedUrl(path: string, seconds: number, options?: { download?: string | boolean }) {
    let signedUrl = signedPath("GET", "signed", this.bucket, path, seconds);
    if (options?.download) {
      const name = typeof options.download === "string" ? options.download : path.split("/").pop() || "download";
      signedUrl += `&download=${encodeURIComponent(name)}`;
    }
    return { data: { signedUrl }, error: null };
  }

  async createSignedUrls(paths: string[], seconds: number) {
    return {
      data: paths.map((path) => ({ path, signedUrl: signedPath("GET", "signed", this.bucket, path, seconds), error: null })),
      error: null,
    };
  }

  async createSignedUploadUrl(path: string) {
    const signedUrl = signedPath("PUT", "signed-upload", this.bucket, path, 60 * 60);
    return { data: { path, token: signedUrl, signedUrl }, error: null };
  }

  getPublicUrl(path: string) {
    return { data: { publicUrl: `${PROXY_PREFIX}/${storagePath("public", this.bucket, objectPath(path))}` } };
  }
}

export function createVpsStorageClient() {
  return { from: (bucket: string) => new VpsBucket(bucket) };
}
