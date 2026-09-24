import { NextResponse } from "next/server";
import { drawMissingChallengeFigure } from "@/lib/data/student-challenges";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getVerifiedUser } from "@/lib/supabase/verified-user";

export const dynamic = "force-dynamic";

/**
 * Draw the picture a worked solution promised and lost.
 *
 * `{ question }` names the worked example; the brief is built on the server
 * from the stored question, never taken from the browser, so this can only ever
 * ask for the one figure that example is missing — and once it is filed on the
 * row, asking again draws nothing. See `drawMissingChallengeFigure`.
 *
 * `deadFigureUrl` asks for a figure already on the solution to be replaced,
 * which happens only when the renderer itself reports it will never arrive.
 *
 * 503 is "the renderer could not take it now": not a fault in the request, and
 * the same call works later.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ challengeId: string }> },
) {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await getVerifiedUser(supabase);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { challengeId } = await params;
    const body = (await request.json().catch(() => ({}))) as {
      question?: unknown;
      deadFigureUrl?: unknown;
    };
    const question = typeof body.question === "string" ? body.question.trim() : "";
    const deadFigureUrl =
      typeof body.deadFigureUrl === "string" ? body.deadFigureUrl.trim() : undefined;
    if (!question) return NextResponse.json({ error: "Name the question." }, { status: 400 });

    const result = await drawMissingChallengeFigure(
      user.id,
      challengeId,
      question,
      deadFigureUrl,
    );
    if (!result.challenge) {
      return NextResponse.json({ error: "Challenge not found." }, { status: 404 });
    }
    if (result.reason === "not_found") {
      return NextResponse.json({ error: "No worked example asks that." }, { status: 404 });
    }
    if (result.reason === "unavailable") {
      return NextResponse.json(
        { error: "The diagram could not be drawn right now." },
        { status: 503 },
      );
    }
    return NextResponse.json({ challenge: result.challenge, solution: result.solution });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not draw this diagram." },
      { status: 502 },
    );
  }
}
