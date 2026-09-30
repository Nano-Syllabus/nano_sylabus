import { NextResponse } from "next/server";
import { getStudentChallengeRomanNepali } from "@/lib/data/student-challenges";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getVerifiedUser } from "@/lib/supabase/verified-user";
import { challengeAccessResponse } from "@/lib/data/challenge-access-error";
import { withUsageCommunity } from "@/lib/usage-community";

export const dynamic = "force-dynamic";
// A first translation of a long reading is a few model calls upstream.
export const maxDuration = 300;

/**
 * The challenge's reading and worked answers in Roman Nepali — the student's
 * choice of language for what they study from. See
 * `getStudentChallengeRomanNepali`.
 */
async function handleGET(
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
    const romanNepali = await getStudentChallengeRomanNepali(user.id, challengeId);
    if (!romanNepali) return NextResponse.json({ error: "Challenge not found." }, { status: 404 });
    return NextResponse.json({ romanNepali });
  } catch (error) {
    const denied = challengeAccessResponse(error);
    if (denied) return denied;
    console.warn("[challenge] Roman Nepali failed", error);
    return NextResponse.json(
      { error: "This couldn't be put into Roman Nepali right now. Showing English." },
      { status: 502 },
    );
  }
}

// Tokens these spend are counted against the student's faculty (lib/usage-community.ts).
export const GET = withUsageCommunity(handleGET);
