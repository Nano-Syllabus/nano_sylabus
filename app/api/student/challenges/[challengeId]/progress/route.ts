import { NextResponse } from "next/server";
import { z } from "zod";
import { markStudentChallengeStep } from "@/lib/data/student-challenges";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const schema = z.object({ step: z.enum(["lesson", "examples"]) });

export async function POST(
  request: Request,
  { params }: { params: Promise<{ challengeId: string }> },
) {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const parsed = schema.parse(await request.json());
    const { challengeId } = await params;
    const challenge = await markStudentChallengeStep(user.id, challengeId, parsed.step);
    if (!challenge) return NextResponse.json({ error: "Challenge not found." }, { status: 404 });
    return NextResponse.json({ challenge });
  } catch (error) {
    const message =
      error instanceof z.ZodError
        ? error.issues[0]?.message || "Invalid challenge step."
        : error instanceof Error
          ? error.message
          : "Could not save challenge progress.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
