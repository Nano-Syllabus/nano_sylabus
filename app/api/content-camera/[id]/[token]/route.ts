import { NextResponse } from "next/server";
import { z } from "zod";
import {
  closeContentCamera,
  completeContentPdf,
  contentCameraPdf,
  contentCameraState,
  ContentCameraError,
  getContentCamera,
  prepareContentPdf,
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
    const pdfId = url.searchParams.get("pdf");
    if (pdfId) {
      const pdf = await contentCameraPdf(session, pdfId);
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
    action: z.literal("prepare-pdf"),
    name: z.string().min(1).max(240),
    size: z.number().int().positive(),
    pageCount: z.number().int().min(1).max(50),
  }),
  z.object({ action: z.literal("complete-pdf"), pdfId: z.string().uuid() }),
]);
export async function POST(request: Request, context: Context) {
  try {
    const { id, token } = await context.params;
    const input = inputSchema.parse(await request.json());
    if (input.action === "prepare-pdf")
      return NextResponse.json(await prepareContentPdf(id, token, input), { headers });
    const session = await completeContentPdf(id, token, input.pdfId);
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
