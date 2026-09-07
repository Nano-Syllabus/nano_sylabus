import { assertMediaPath, proxyMedia } from "@/lib/tenant/media-proxy";

export const runtime = "nodejs";
// These bytes are final, but the route still has to run per request rather than
// being frozen into the build's static cache — the set of archived figures is
// not known at build time.
export const dynamic = "force-dynamic";

/**
 * `/api/tikz/*` — the frozen archive, served from this origin.
 *
 * Figures drawn before the TikZ path was removed. Their URLs are baked into
 * stored answers, which are replayed verbatim, so this has to keep resolving for
 * as long as those answers survive — new figures are `/api/figure/*`.
 * See lib/tenant/media-proxy.ts.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ segments: string[] }> },
) {
  const { segments } = await params;
  const upstreamPath = assertMediaPath("tikz", segments ?? []);
  if (!upstreamPath) return new Response(null, { status: 404 });

  try {
    return await proxyMedia(upstreamPath, request.signal);
  } catch {
    // The renderer being unreachable is a missing picture, not a broken page.
    return new Response(null, { status: 502 });
  }
}
