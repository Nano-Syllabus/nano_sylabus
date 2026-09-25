import { NextResponse } from "next/server";
import {
  AnswerSheetError,
  answerSheetForToken,
  commitAnswerSheetPage,
  removeAnswerSheetPages,
} from "@/lib/data/challenge-answer-sheet";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PAGE_ID = /^[0-9a-f-]{36}$/i;

function failure(error: unknown, fallback: string) {
  if (error instanceof AnswerSheetError) return NextResponse.json({ error: error.message }, { status: error.status });
  console.warn("[answer-sheet]", fallback, error);
  return NextResponse.json({ error: fallback }, { status: 500 });
}

/** The file landed in storage: the page joins the sheet. */
export async function POST(_request: Request, { params }: { params: Promise<{ challengeId: string; token: string; pageId: string }> }) {
  try {
    const { challengeId, token, pageId } = await params;
    if (!PAGE_ID.test(pageId)) return NextResponse.json({ error: "That page is not on this sheet." }, { status: 404 });
    const { session } = await answerSheetForToken(challengeId, token);
    await commitAnswerSheetPage(session, pageId);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return failure(error, "The page could not be saved.");
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ challengeId: string; token: string; pageId: string }> }) {
  try {
    const { challengeId, token, pageId } = await params;
    if (!PAGE_ID.test(pageId)) return NextResponse.json({ error: "That page is not on this sheet." }, { status: 404 });
    const { session } = await answerSheetForToken(challengeId, token);
    await removeAnswerSheetPages(session, [pageId]);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return failure(error, "Could not remove that page.");
  }
}
