import { NextResponse } from "next/server";
import { studentFacingBuildError } from "@/lib/data/student-challenges";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { startStudentChallenge } from "@/lib/data/student-challenges";
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

    const { challengeId } = await params;
    const challenge = await startStudentChallenge(user.id, challengeId);
    if (!challenge) return NextResponse.json({ error: "Challenge not found." }, { status: 404 });
    return NextResponse.json({ challenge });
  } catch (error) {
    const denied = challengeAccessResponse(error);
    if (denied) return denied;
    // A database error is a plain object, not an Error, and used to reach the
    // student as the generic line below with nothing recorded anywhere. It is
    // logged whole so the next one can be traced.
    if (!(error instanceof Error)) console.error("[challenge start]", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? studentFacingBuildError(error.message)
            : "Could not build this challenge from the course material.",
      },
      { status: 502 },
    );
  }
}
