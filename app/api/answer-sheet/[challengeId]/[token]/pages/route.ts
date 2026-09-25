import { NextResponse } from "next/server";
import { z } from "zod";
import {
  AnswerSheetError,
  answerSheetForToken,
  removeAnswerSheetPages,
  reorderAnswerSheetPages,
  reserveAnswerSheetPage,
} from "@/lib/data/challenge-answer-sheet";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const pageSchema = z.object({
  name: z.string().trim().max(200).default(""),
  mimeType: z.enum(["image/jpeg", "application/pdf"]),
  size: z.number().int().positive(),
  source: z.enum(["desktop", "phone"]).default("phone"),
});

function failure(error: unknown, fallback: string) {
  if (error instanceof AnswerSheetError) return NextResponse.json({ error: error.message }, { status: error.status });
  console.warn("[answer-sheet]", fallback, error);
  return NextResponse.json({ error: fallback }, { status: 500 });
}

/** A signed URL to put ONE page (a compressed photo, or the PDF) straight into storage. */
export async function POST(request: Request, { params }: { params: Promise<{ challengeId: string; token: string }> }) {
  try {
    const parsed = pageSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: "Add photos or one PDF." }, { status: 400 });
    const { challengeId, token } = await params;
    const { session } = await answerSheetForToken(challengeId, token);
    return NextResponse.json(await reserveAnswerSheetPage(session, parsed.data));
  } catch (error) {
    return failure(error, "Could not start the upload.");
  }
}

/** Start again: every page removed. */
export async function DELETE(_request: Request, { params }: { params: Promise<{ challengeId: string; token: string }> }) {
  try {
    const { challengeId, token } = await params;
    const { session } = await answerSheetForToken(challengeId, token);
    await removeAnswerSheetPages(session, null);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return failure(error, "Could not clear the answer sheet.");
  }
}

const orderSchema = z.object({ order: z.array(z.string().uuid()).min(1).max(40) });

/** The pages in the order the student dragged them into. */
export async function PATCH(request: Request, { params }: { params: Promise<{ challengeId: string; token: string }> }) {
  try {
    const parsed = orderSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: "Arrange the pages again." }, { status: 400 });
    const { challengeId, token } = await params;
    const { session } = await answerSheetForToken(challengeId, token);
    await reorderAnswerSheetPages(session, parsed.data.order);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return failure(error, "Could not save the page order.");
  }
}
