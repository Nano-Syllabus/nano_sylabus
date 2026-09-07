import type { IncomingMessage } from "node:http";
import { getTenantApiEnv } from "@/lib/env";
import { agentFor, transportFor } from "@/lib/http-agents";

/**
 * The figures and animations in a chat answer, served through this app.
 *
 * WHY THIS EXISTS
 * ---------------
 * The backend draws figures itself and splices them into the answer text as
 * ROOT-RELATIVE markdown images — `![Diagram](/api/figure/<sha>.png)`,
 * `![...](/api/media/<sha>/poster.png)`. Those URLs are correct for the origin
 * that wrote them and wrong for every other one: rendered here, the browser
 * resolved them against this app and got a 404, so every server-drawn figure and
 * every animation in the product was a broken image. The answer text cannot be
 * rewritten instead — the URL is baked into the stored `learned_answers` row and
 * into every chat message already saved, so the fix has to be that this origin
 * answers those paths too.
 *
 * WHY IT IS A PROXY AND NOT A REDIRECT
 * ------------------------------------
 * The backend is served over a self-signed certificate (`TENANT_API_REJECT_
 * UNAUTHORIZED=0`), which a browser will not follow a redirect into, and it sits
 * on a bare IP that has no business appearing in a user's network tab. Proxying
 * keeps one origin in front of the reader and keeps the renderer unexposed.
 *
 * WHAT IT WILL NOT DO
 * -------------------
 * `assertMediaPath` is an allowlist, not a sanitiser. Only the three
 * content-addressed media shapes reach the backend, so this can never be steered
 * into a general proxy for `/v1/admin/*` or anything else behind the same host —
 * which matters because these routes are deliberately unauthenticated, exactly
 * as the backend's own media routes are. A figure has to render for a reader
 * opening a shared answer, and the hash of its source is the only thing that
 * names it.
 */

/** `<sha>`, `<sha>.png`, `<sha>.m` or `<sha>.m.png` — a content hash and nothing
 *  else. The `.m` form only ever appears on `/api/tikz`, the frozen archive of
 *  figures drawn before the TikZ path was removed. */
const FIGURE_NAME = /^[0-9a-f]{1,64}(?:\.m)?(?:\.png)?$/;
/** The three files one animation can have, exactly as `derivatives` names them. */
const ANIMATION_ASSETS = new Set(["poster.png", "animation.gif", "animation.mp4"]);
const SPEC_HASH = /^[0-9a-f]{1,64}$/;

/**
 * The upstream path for a media request, or null if it is not one.
 *
 * `segments` is the catch-all from the route — already URL-decoded by Next, and
 * matched here against fixed alphabets rather than escaped, so `..` and an
 * encoded separator both simply fail to be hex.
 */
export function assertMediaPath(
  kind: "figure" | "tikz" | "diagram" | "media",
  segments: string[],
): string | null {
  if (segments.length === 0 || segments.length > 2) return null;
  const [name, tail] = segments;

  if (kind === "media") {
    if (!SPEC_HASH.test(name)) return null;
    // `/api/media/<hash>` is the job's STATUS and `/api/media/<hash>/<file>` is
    // one of its derivatives — one prefix for the reader, because that is the
    // shape the answer's own image URL already has.
    //
    // Upstream they are not on one prefix. The backend used to serve the status
    // at both `/api/media/<hash>` and `/api/v1/media/animations/<hash>`, two
    // handlers answering the same question, and the duplicate was removed in
    // favour of the versioned one — the twin of the POST that creates the job.
    // The asset route stayed where it was, because that URL is written into
    // stored answers. So the translation is here, in the one place that has to
    // know, rather than in every player.
    if (tail === undefined) return `/api/v1/media/animations/${name}`;
    if (!ANIMATION_ASSETS.has(tail)) return null;
    return `/api/media/${name}/${tail}`;
  }

  if (!FIGURE_NAME.test(name)) return null;
  if (tail === undefined) return `/api/${kind}/${name}`;
  if (tail !== "status") return null;
  return `/api/${kind}/${name}/status`;
}

/**
 * Headers worth carrying back to the browser.
 *
 * `Cache-Control` above all: these assets are named by the hash of what produced
 * them, so the backend marks them `immutable` and a reader who scrolls back
 * through a conversation should not refetch a single one. Whatever the upstream
 * says is passed through rather than assumed: it is the side that knows whether
 * a given render is final.
 */
const PASSTHROUGH_HEADERS = ["content-type", "content-length", "cache-control", "etag", "last-modified"];

function responseHeaders(upstream: IncomingMessage): Headers {
  const headers = new Headers();
  for (const name of PASSTHROUGH_HEADERS) {
    const value = upstream.headers[name];
    if (typeof value === "string") headers.set(name, value);
  }
  if (!headers.has("content-type")) headers.set("content-type", "application/octet-stream");
  // Nothing here is per-user, but it is also not the browser's to hand to
  // another origin.
  headers.set("x-content-type-options", "nosniff");
  return headers;
}

/**
 * Pipe one media response straight through.
 *
 * The body is streamed rather than buffered: an MP4 is megabytes, and holding a
 * whole one in the route's memory to hand it over in one piece would cost the
 * player its progressive start for nothing.
 *
 * The timeout is generous on purpose. `/api/figure/<sha>` is a route that WAITS —
 * the answer names a figure the moment its render is queued, and this request is
 * where the browser holds for it — so a normal API timeout would abandon exactly
 * the figures that were about to arrive.
 */
export function proxyMedia(upstreamPath: string, signal?: AbortSignal): Promise<Response> {
  const { baseUrl, rejectUnauthorized } = getTenantApiEnv();
  const url = new URL(upstreamPath, baseUrl);

  return new Promise<Response>((resolve, reject) => {
    let settled = false;
    const request = transportFor(url).request(
      url,
      {
        method: "GET",
        rejectUnauthorized,
        agent: agentFor(url),
        headers: { Accept: "*/*" },
      },
      (upstream) => {
        if (settled) {
          upstream.resume();
          return;
        }
        settled = true;

        const status = upstream.statusCode ?? 502;
        if (status >= 400) {
          // A figure that is not there is not an error worth a body — the caller
          // is an <img> or a poller, and both only read the status.
          upstream.resume();
          resolve(new Response(null, { status: status === 404 ? 404 : 502 }));
          return;
        }

        const body = new ReadableStream<Uint8Array>({
          start(controller) {
            upstream.on("data", (chunk: Buffer) => controller.enqueue(new Uint8Array(chunk)));
            upstream.on("end", () => controller.close());
            upstream.on("error", (error) => controller.error(error));
          },
          cancel() {
            // The reader gave up — scrolled away, navigated, closed the tab.
            // Stop pulling the rest of the video down for nobody.
            upstream.destroy();
          },
        });

        resolve(new Response(body, { status, headers: responseHeaders(upstream) }));
      },
    );

    // 70s: past the backend's own ILLUSTRATION_WAIT and inside nginx's 60s
    // proxy_read_timeout plus its slack, so this is never the thing that gives up
    // first on a render that is still coming.
    request.setTimeout(70_000, () => {
      request.destroy(new Error(`Media request ${url.pathname} timed out`));
    });
    request.on("error", (error) => {
      if (settled) return;
      settled = true;
      reject(error);
    });
    signal?.addEventListener("abort", () => request.destroy(), { once: true });
    request.end();
  });
}
