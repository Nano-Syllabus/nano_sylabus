import { NextResponse } from "next/server";
import { getChallengeFundamentals } from "@/lib/data/challenge-fundamentals";
import { TeacherApiError } from "@/lib/teacher-app/client";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getVerifiedUser } from "@/lib/supabase/verified-user";

export const dynamic = "force-dynamic";
// The first student on a topic waits for the set to be written upstream.
export const maxDuration = 120;

/** The challenge's fundamentals MCQs, without their answers — see
 *  `lib/data/challenge-fundamentals.ts`. */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ challengeId: string }> },
) {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await getVerifiedUser(supabase);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { challengeId } = await params;
    const questions = await getChallengeFundamentals(user.id, challengeId);
    if (!questions) return NextResponse.json({ error: "Challenge not found." }, { status: 404 });
    return NextResponse.json({ questions });
  } catch (error) {
    console.warn("[challenge] fundamentals failed", error);
    // The one failure a retry will not fix, said as what it is.
    if (error instanceof TeacherApiError && error.status === 404) {
      return NextResponse.json(
        { error: "This topic's notes aren't indexed yet, so there's nothing to set questions from." },
        { status: 404 },
      );
    }
    return NextResponse.json(
      { error: "The fundamentals check couldn't be set right now. Try again in a moment." },
      { status: 502 },
    );
  }
}
