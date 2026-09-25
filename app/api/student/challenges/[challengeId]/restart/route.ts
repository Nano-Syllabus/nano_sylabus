import { NextResponse } from "next/server";
import { mayRestartChallenges } from "@/lib/challenge-refetch";
import { restartStudentChallenge } from "@/lib/data/student-challenges";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getVerifiedUser } from "@/lib/supabase/verified-user";
import { challengeAccessResponse } from "@/lib/data/challenge-access-error";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ challengeId: string }> },
) {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await getVerifiedUser(supabase);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    // The button is hidden for everyone else, which is presentation, not
    // authorisation — this endpoint is one `fetch` away from any console.
    if (!mayRestartChallenges(user.email)) {
      return NextResponse.json({ error: "Not available on this account." }, { status: 403 });
    }

    const { challengeId } = await params;
    const challenge = await restartStudentChallenge(user.id, challengeId);
    if (!challenge) return NextResponse.json({ error: "Challenge not found." }, { status: 404 });
    return NextResponse.json({ challenge });
  } catch (error) {
    const denied = challengeAccessResponse(error);
    if (denied) return denied;
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Could not restart this challenge from the course material.",
      },
      { status: 502 },
    );
  }
}
