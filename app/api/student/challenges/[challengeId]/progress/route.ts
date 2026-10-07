import { NextResponse } from "next/server";
import { z } from "zod";
import { markStudentChallengeStep } from "@/lib/data/student-challenges";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getVerifiedUser } from "@/lib/supabase/verified-user";
import { challengeAccessResponse } from "@/lib/data/challenge-access-error";
import { withUsageCommunity } from "@/lib/usage-community";

const schema = z.object({ step: z.enum(["lesson", "examples", "learn"]) });

async function handlePOST(
  request: Request,
  { params }: { params: Promise<{ challengeId: string }> },
) {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await getVerifiedUser(supabase);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const parsed = schema.parse(await request.json());
    const { challengeId } = await params;
    const challenge = await markStudentChallengeStep(user.id, challengeId, parsed.step);
    if (!challenge) return NextResponse.json({ error: "Challenge not found." }, { status: 404 });
    return NextResponse.json({ challenge });
  } catch (error) {
    const denied = challengeAccessResponse(error);
    if (denied) return denied;
    const message =
      error instanceof z.ZodError
        ? error.issues[0]?.message || "Invalid challenge step."
        : error instanceof Error
          ? error.message
          : "Could not save challenge progress.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

// Tokens these spend are counted against the student's faculty (lib/usage-community.ts).
export const POST = withUsageCommunity(handlePOST);
