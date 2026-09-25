import { NextResponse } from "next/server";
import {
  AnswerSheetError,
  answerSheetForUser,
  openAnswerSheet,
  sheetState,
} from "@/lib/data/challenge-answer-sheet";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getVerifiedUser } from "@/lib/supabase/verified-user";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function failure(error: unknown, fallback: string) {
  if (error instanceof AnswerSheetError) return NextResponse.json({ error: error.message }, { status: error.status });
  console.warn("[answer-sheet]", fallback, error);
  return NextResponse.json({ error: fallback }, { status: 500 });
}

/**
 * The upload screen's sheet, with a fresh token for its QR. The token also
 * authorises this desktop's own uploads, through the same routes the phone uses.
 */
export async function POST(request: Request, { params }: { params: Promise<{ challengeId: string }> }) {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await getVerifiedUser(supabase);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { challengeId } = await params;
    const { token, state } = await openAnswerSheet(user.id, challengeId);
    return NextResponse.json({
      token,
      uploadUrl: new URL(`/answer-sheet/${encodeURIComponent(challengeId)}/${token}`, request.url).toString(),
      ...state,
    });
  } catch (error) {
    return failure(error, "Could not prepare the answer sheet upload.");
  }
}

/** Polled by the desktop, so a page added on the phone appears here. */
export async function GET(request: Request, { params }: { params: Promise<{ challengeId: string }> }) {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await getVerifiedUser(supabase);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { challengeId } = await params;
    const sessionId = new URL(request.url).searchParams.get("sessionId") || "";
    if (!/^[0-9a-f-]{36}$/i.test(sessionId)) return NextResponse.json({ error: "Upload session not found." }, { status: 404 });
    const session = await answerSheetForUser(user.id, challengeId, sessionId);
    return NextResponse.json(await sheetState(session), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return failure(error, "Could not check the answer sheet.");
  }
}
