import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

/**
 * A finished figure is cached at the edge; one still being drawn is not.
 *
 * The backend marks a finished picture `immutable`, which the browser honours
 * and the CDN in front of the app does not — a function response is only cached
 * there when told so separately. Holding a provisional render at the edge would
 * freeze it for every reader, so only what the backend calls immutable is shared.
 */

let server: Server;
let base = "";

vi.mock("@/lib/env", () => ({
  getTenantApiEnv: () => ({ baseUrl: base, rejectUnauthorized: false, timeoutMs: 5000 }),
}));

import { proxyMedia } from "@/lib/tenant/media-proxy";

beforeAll(async () => {
  server = createServer((request, response) => {
    const final = request.url?.startsWith("/api/figure/aaaa");
    response.writeHead(200, {
      "content-type": "image/png",
      "cache-control": final ? "public, max-age=31536000, immutable" : "no-cache",
    });
    response.end("png");
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

describe("figures at the edge", () => {
  it("lets the CDN keep a finished figure", async () => {
    const response = await proxyMedia("/api/figure/aaaa.png");
    expect(response.headers.get("cache-control")).toContain("immutable");
    expect(response.headers.get("cdn-cache-control")).toBe("public, max-age=31536000, immutable");
    expect(await response.text()).toBe("png");
  });

  it("never holds a render that may still be replaced", async () => {
    const response = await proxyMedia("/api/figure/bbbb.png");
    expect(response.headers.get("cache-control")).toBe("no-cache");
    expect(response.headers.get("cdn-cache-control")).toBeNull();
    await response.text();
  });
});
