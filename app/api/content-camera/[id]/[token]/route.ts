import { NextResponse } from "next/server";
import { z } from "zod";
import {
  closeContentCamera,
  completeContentPhoto,
  contentCameraPdf,
  contentCameraState,
  ContentCameraError,
  getContentCamera,
  prepareContentPhoto,
  removeContentPhoto,
  reorderContentPhotos,
} from "@/lib/data/content-camera";

export const maxDuration = 120;
type Context = { params: Promise<{ id: string; token: string }> };
const headers = { "Cache-Control": "no-store, private", "Referrer-Policy": "no-referrer" };
function failure(cause: unknown) {
  return NextResponse.json(
    {
      error:
        cause instanceof ContentCameraError
          ? cause.message
          : "Camera upload failed. Please try again.",
    },
    {
      status:
        cause instanceof ContentCameraError
          ? cause.status
          : cause instanceof z.ZodError
            ? 400
            : 500,
      headers,
    },
  );
}
export async function GET(request: Request, context: Context) {
  try {
    const { id, token } = await context.params;
    const session = await getContentCamera(id, token);
    const url = new URL(request.url);
    if (url.searchParams.get("pdf") === "1") {
      const revision = Number(url.searchParams.get("revision"));
      const pdf = await contentCameraPdf(session, revision);
      return new Response(new Uint8Array(pdf), {
        headers: {
          ...headers,
          "Content-Type": "application/pdf",
          "Content-Disposition": 'inline; filename="scanned-content.pdf"',
        },
      });
    }
    return NextResponse.json(await contentCameraState(session), { headers });
  } catch (cause) {
    return failure(cause);
  }
}
const inputSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("prepare"),
    name: z.string().max(240),
    size: z.number().int().positive(),
    source: z.enum(["desktop", "phone"]),
  }),
  z.object({ action: z.literal("complete"), pageId: z.string().uuid() }),
  z.object({ action: z.literal("reorder"), order: z.array(z.string().uuid()).max(50) }),
  z.object({ action: z.literal("remove"), pageId: z.union([z.string().uuid(), z.literal("all")]) }),
]);
export async function POST(request: Request, context: Context) {
  try {
    const { id, token } = await context.params;
    const input = inputSchema.parse(await request.json());
    if (input.action === "prepare")
      return NextResponse.json(await prepareContentPhoto(id, token, input), { headers });
    const session =
      input.action === "complete"
        ? await completeContentPhoto(id, token, input.pageId)
        : input.action === "remove"
          ? await removeContentPhoto(id, token, input.pageId)
          : await reorderContentPhotos(id, token, input.order);
    return NextResponse.json(await contentCameraState(session), { headers });
  } catch (cause) {
    return failure(cause);
  }
}
export async function DELETE(_request: Request, context: Context) {
  try {
    const { id, token } = await context.params;
    await closeContentCamera(id, token);
    return NextResponse.json({ closed: true }, { headers });
  } catch (cause) {
    return failure(cause);
  }
}
