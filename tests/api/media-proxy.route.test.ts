import http from "node:http";
import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * The whole media path, end to end against a stand-in backend.
 *
 * What this covers is the gap the proxy exists to close: a chat answer carries
 * `![Diagram](/api/tikz/<sha>.m.png)`, the browser resolves that against THIS
 * origin, and before these routes existed it got a 404 — so every server-drawn
 * figure in the product was a broken image.
 */
async function withBackend(
  handler: http.RequestListener,
  body: (call: () => Promise<typeof import("@/lib/tenant/media-proxy")>) => Promise<void>,
) {
  const server = http.createServer(handler);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Test server did not start.");
    vi.stubEnv("TENANT_API_BASE_URL", `http://127.0.0.1:${address.port}`);
    vi.stubEnv("TENANT_API_TOKEN", "unused");
    vi.stubEnv("TENANT_API_REJECT_UNAUTHORIZED", "0");
    await body(() => import("@/lib/tenant/media-proxy"));
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

describe("media proxy", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("serves a figure the backend drew, with its cache header intact", async () => {
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    let requestedPath = "";
    await withBackend(
      (request, response) => {
        requestedPath = request.url || "";
        response.writeHead(200, {
          "Content-Type": "image/png",
          "Cache-Control": "public, max-age=31536000, immutable",
        });
        response.end(png);
      },
      async (load) => {
        const { assertMediaPath, proxyMedia } = await load();
        const upstream = assertMediaPath("tikz", ["7437faa845d14df1.m.png"]);
        expect(upstream).toBe("/api/tikz/7437faa845d14df1.m.png");

        const result = await proxyMedia(upstream!);
        expect(result.status).toBe(200);
        expect(result.headers.get("content-type")).toBe("image/png");
        // Content-addressed, so the browser must be allowed to keep it.
        expect(result.headers.get("cache-control")).toContain("immutable");
        expect(Buffer.from(await result.arrayBuffer())).toEqual(png);
        expect(requestedPath).toBe("/api/tikz/7437faa845d14df1.m.png");
      },
    );
  });

  it("keeps no-cache on the interim render, so the redraw can replace it", async () => {
    await withBackend(
      (_request, response) => {
        response.writeHead(200, { "Content-Type": "image/png", "Cache-Control": "no-cache" });
        response.end(Buffer.from([0x89]));
      },
      async (load) => {
        const { proxyMedia } = await load();
        const result = await proxyMedia("/api/tikz/abc.m.png");
        expect(result.headers.get("cache-control")).toBe("no-cache");
      },
    );
  });

  it("reads an animation's progress off the one surviving backend route", async () => {
    let requestedPath = "";
    await withBackend(
      (request, response) => {
        requestedPath = request.url || "";
        response.writeHead(200, { "Content-Type": "application/json" });
        response.end(JSON.stringify({ status: "rendering", derivatives: { poster: "/api/media/c9c3/poster.png" } }));
      },
      async (load) => {
        const { assertMediaPath, proxyMedia } = await load();
        const upstream = assertMediaPath("media", ["c9c38460e6faad69"]);
        const result = await proxyMedia(upstream!);
        expect(result.status).toBe(200);
        expect(await result.json()).toMatchObject({ status: "rendering" });
        expect(requestedPath).toBe("/api/v1/media/animations/c9c38460e6faad69");
      },
    );
  });

  it("reports a figure that is not there as not there", async () => {
    await withBackend(
      (_request, response) => {
        response.writeHead(404).end("nope");
      },
      async (load) => {
        const { proxyMedia } = await load();
        expect((await proxyMedia("/api/tikz/abc.png")).status).toBe(404);
      },
    );
  });

  it("never lets a crafted path reach anything but media", async () => {
    let reached = false;
    await withBackend(
      (_request, response) => {
        reached = true;
        response.writeHead(200).end("{}");
      },
      async (load) => {
        const { assertMediaPath } = await load();
        for (const segments of [
          ["..", "..", "v1", "admin", "dashboard"],
          ["../v1/admin/storage"],
          ["c9c38460", "../../../etc/passwd"],
        ]) {
          expect(assertMediaPath("media", segments)).toBeNull();
          expect(assertMediaPath("tikz", segments)).toBeNull();
        }
        expect(reached).toBe(false);
      },
    );
  });
});
