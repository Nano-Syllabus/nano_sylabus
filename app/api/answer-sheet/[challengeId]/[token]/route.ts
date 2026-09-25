import { NextResponse } from "next/server";
import { AnswerSheetError, answerSheetForToken, sheetState } from "@/lib/data/challenge-answer-sheet";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** What the phone shows: which challenge this is, and the pages so far. No sign-in: the token is the permission. */
export async function GET(_request: Request, { params }: { params: Promise<{ challengeId: string; token: string }> }) {
  try {
    const { challengeId, token } = await params;
    const { session, topicTitle, subjectName } = await answerSheetForToken(challengeId, token);
    return NextResponse.json(
      { topicTitle, subjectName, ...(await sheetState(session)) },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    if (error instanceof AnswerSheetError) return NextResponse.json({ error: error.message }, { status: error.status });
    console.warn("[answer-sheet] phone link failed", error);
    return NextResponse.json({ error: "This upload link is unavailable right now." }, { status: 500 });
  }
}
