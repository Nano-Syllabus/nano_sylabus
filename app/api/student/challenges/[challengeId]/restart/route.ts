import { NextResponse } from "next/server";
import { restartStudentChallenge } from "@/lib/data/student-challenges";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getVerifiedUser } from "@/lib/supabase/verified-user";

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
    const challenge = await restartStudentChallenge(user.id, challengeId);
    if (!challenge) return NextResponse.json({ error: "Challenge not found." }, { status: 404 });
    return NextResponse.json({ challenge });
  } catch (error) {
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
