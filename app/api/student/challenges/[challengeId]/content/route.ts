import { NextResponse } from "next/server";
import { getStudentChallengeContent } from "@/lib/data/student-challenges";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getVerifiedUser } from "@/lib/supabase/verified-user";

export const dynamic = "force-dynamic";

/**
 * The challenge as it stands right now.
 *
 * `/start` returns as soon as the lesson is written and finishes the worked
 * examples and the exam behind the response, so the screen needs somewhere cheap
 * to ask "is the rest here yet". This is that: one row read plus the access
 * check, no upstream call, safe to poll every couple of seconds while the
 * student reads. `?retry=1` is the student pressing retry after a build failed.
 */
export async function GET(
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
    const retry = new URL(request.url).searchParams.get("retry") === "1";
    const challenge = await getStudentChallengeContent(user.id, challengeId, { retry });
    if (!challenge) return NextResponse.json({ error: "Challenge not found." }, { status: 404 });
    return NextResponse.json({ challenge });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not load this challenge." },
      { status: 502 },
    );
  }
}
