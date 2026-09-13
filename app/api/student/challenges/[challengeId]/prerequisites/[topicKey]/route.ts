import { NextResponse } from "next/server";
import { getStudentChallengePrerequisiteReading } from "@/lib/data/student-challenges";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getVerifiedUser } from "@/lib/supabase/verified-user";

export const dynamic = "force-dynamic";
export const maxDuration = 180;

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ challengeId: string; topicKey: string }> },
) {
  try {
    const supabase = await createSupabaseServerClient();
    // Verified locally against the cached JWKS rather than by asking the auth
    // server, which measured ~143ms a call and is on the path of every open of
    // the challenge reader. Same token, same cryptographic check — and
    // nothing here reads `user_metadata`, which is the one case getClaims() can
    // lag on (see lib/supabase/verified-user.ts).
    const {
      data: { user },
    } = await getVerifiedUser(supabase);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { challengeId, topicKey } = await params;
    const reading = await getStudentChallengePrerequisiteReading(user.id, challengeId, topicKey);
    if (!reading) return NextResponse.json({ error: "Challenge not found." }, { status: 404 });
    return NextResponse.json({ reading });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Could not load this prerequisite lesson.",
      },
      { status: 502 },
    );
  }
}
