import { assertMediaPath, proxyMedia } from "@/lib/tenant/media-proxy";

export const runtime = "nodejs";
// The upstream decides how long these live (immutable for a finished render,
// no-cache while a better one is still being drawn), so this route must not be
// frozen into the build's static cache.
export const dynamic = "force-dynamic";

/**
 * `/api/media/*` — the backend's own media route, served from this origin.
 *
 * Chat answers carry root-relative media URLs written by the backend; without
 * this handler they resolve against this app and 404. See lib/tenant/media-proxy.ts.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ segments: string[] }> },
) {
  const { segments } = await params;
  const upstreamPath = assertMediaPath("media", segments ?? []);
  if (!upstreamPath) return new Response(null, { status: 404 });

  try {
    return await proxyMedia(upstreamPath, request.signal);
  } catch {
    // The renderer being unreachable is a missing picture, not a broken page.
    return new Response(null, { status: 502 });
  }
}
