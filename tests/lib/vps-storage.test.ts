import { createHmac } from "node:crypto";
import http from "node:http";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const config = vi.hoisted(() => ({ baseUrl: "", token: "t".repeat(40), rejectUnauthorized: true }));
vi.mock("@/lib/env", () => ({ getTenantApiEnv: () => config }));
import { createVpsStorageClient } from "@/lib/vps-storage";

const calls: Array<{ method: string; url: string; token: string; body: string }> = [];
const server = http.createServer((request, response) => {
  const chunks: Buffer[] = [];
  request.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
  request.on("end", () => {
    calls.push({ method: request.method || "", url: request.url || "", token: request.headers.authorization || "", body: Buffer.concat(chunks).toString() });
    if (request.method === "GET" || request.method === "HEAD") {
      response.setHeader("Content-Type", "application/pdf");
      response.setHeader("Content-Length", "4");
      response.end(request.method === "GET" ? "%PDF" : undefined);
    } else {
      response.setHeader("Content-Type", "application/json");
      response.end("{}");
    }
  });
});

beforeAll(async () => {
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  config.baseUrl = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
});
afterAll(async () => {
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
});
beforeEach(() => {
  calls.length = 0;
  vi.stubEnv("VPS_STORAGE_URL", "");
  vi.stubEnv("VPS_STORAGE_TOKEN", "");
  vi.stubEnv("VPS_STORAGE_SIGNING_SECRET", "");
  vi.stubEnv("VPS_STORAGE_PATH_PREFIX", "development");
});
afterEach(() => vi.unstubAllEnvs());

describe("VPS storage across environments", () => {
  it("isolates development writes, reads, lookups and deletions under the same prefix", async () => {
    const bucket = createVpsStorageClient().from("teacher-documents");
    expect((await bucket.upload("notes/file.pdf", Buffer.from("%PDF"))).error).toBeNull();
    const file = await bucket.download("notes/file.pdf");
    expect(await file.data?.text()).toBe("%PDF");
    expect((await bucket.info("notes/file.pdf")).data?.size).toBe(4);
    expect((await bucket.remove(["notes/file.pdf"])).error).toBeNull();
    expect(calls.map((call) => call.method)).toEqual(["PUT", "GET", "HEAD", "DELETE"]);
    expect(calls.every((call) => call.url === "/v1/object-storage/object/teacher-documents/development/notes/file.pdf")).toBe(true);
    expect(calls.every((call) => call.token === `Bearer ${config.token}`)).toBe(true);
  });

  it.each(["GET", "PUT"] as const)("signs the physical development object path for %s", async (method) => {
    const bucket = createVpsStorageClient().from("teacher-documents");
    const result = method === "GET" ? await bucket.createSignedUrl("notes/my file.pdf", 60) : await bucket.createSignedUploadUrl("notes/my file.pdf");
    const url = new URL(result.data.signedUrl, "http://localhost");
    const expected = createHmac("sha256", config.token).update(`${method}\nteacher-documents\ndevelopment/notes/my file.pdf\n${url.searchParams.get("expires")}`).digest("hex");
    expect(url.searchParams.get("signature")).toBe(expected);
    expect(decodeURIComponent(url.pathname)).toContain("/teacher-documents/development/notes/my file.pdf");
  });

  it("keeps existing staging paths unchanged", async () => {
    vi.stubEnv("VPS_STORAGE_PATH_PREFIX", "");
    await createVpsStorageClient().from("teacher-documents").download("existing/file.pdf");
    expect(calls[0].url).toBe("/v1/object-storage/object/teacher-documents/existing/file.pdf");
    expect(createVpsStorageClient().from("landing-assets").getPublicUrl("logo.png").data.publicUrl).toBe("/vps-storage/public/landing-assets/logo.png");
  });

  it("uses the development prefix for public assets", () => {
    expect(createVpsStorageClient().from("landing-assets").getPublicUrl("logo.png").data.publicUrl).toBe("/vps-storage/public/landing-assets/development/logo.png");
  });

  it("rejects a prefix that could traverse into another environment", async () => {
    vi.stubEnv("VPS_STORAGE_PATH_PREFIX", "../staging");
    const result = await createVpsStorageClient().from("teacher-documents").upload("notes.pdf", Buffer.from("bytes"));
    expect(result.error?.message).toContain("relative directory names");
    expect(calls).toHaveLength(0);
  });

  it.each(["../staging/file.pdf", "notes/../../file.pdf", "/file.pdf", "notes\\file.pdf"])("blocks an object path that could escape its environment: %s", async (path) => {
    const result = await createVpsStorageClient().from("teacher-documents").upload(path, Buffer.from("bytes"));
    expect(result.error?.message).toContain("relative file and directory names");
    expect(calls).toHaveLength(0);
  });
});
