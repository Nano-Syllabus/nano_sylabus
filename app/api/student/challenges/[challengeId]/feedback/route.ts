import { NextResponse } from "next/server";
import { parseChallengeFeedback } from "@/lib/challenge-feedback";
import { recordChallengeFeedback } from "@/lib/data/student-challenge-feedback";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getVerifiedUser } from "@/lib/supabase/verified-user";

export const dynamic = "force-dynamic";

/** The two questions asked while an answer sheet is graded. */
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

    const input = parseChallengeFeedback(await request.json().catch(() => null));
    if (!input) {
      return NextResponse.json(
        { error: "Choose a rating and an expected score, or skip." },
        { status: 400 },
      );
    }
    const { challengeId } = await params;
    const outcome = await recordChallengeFeedback(user.id, challengeId, input);
    if (outcome === "not_found") {
      return NextResponse.json({ error: "Challenge not found." }, { status: 404 });
    }
    return NextResponse.json({ stored: outcome === "stored" || outcome === "duplicate" });
  } catch (error) {
    console.error("[challenge feedback]", error);
    return NextResponse.json({ error: "Could not save your feedback." }, { status: 500 });
  }
}
