import { NextResponse } from "next/server";
import { getStudentChallengePrerequisiteReading } from "@/lib/data/student-challenges";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const maxDuration = 180;

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ challengeId: string; topicKey: string }> },
) {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
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
