import { NextResponse } from "next/server";
import { challengeAccessResponse } from "@/lib/data/challenge-access-error";
import { z } from "zod";
import { checkExamChoice, StalePaperError } from "@/lib/data/challenge-exam-picks";
import { studentFacingBuildError } from "@/lib/data/student-challenges";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getVerifiedUser } from "@/lib/supabase/verified-user";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  questionId: z.string().trim().min(1).max(64),
  selected: z.string().trim().min(1).max(4),
});

/** Answer one question of an MCQ community's paper: final, and marked at once. */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ challengeId: string }> },
) {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await getVerifiedUser(supabase);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const parsed = bodySchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: "Choose an answer." }, { status: 400 });
    const { challengeId } = await params;
    const result = await checkExamChoice(user.id, challengeId, parsed.data.questionId, parsed.data.selected);
    if (!result) return NextResponse.json({ error: "Challenge not found." }, { status: 404 });
    return NextResponse.json({ result });
  } catch (error) {
    const denied = challengeAccessResponse(error);
    if (denied) return denied;
    if (error instanceof StalePaperError) {
      return NextResponse.json({ error: error.message, stale: true }, { status: 409 });
    }
    if (error instanceof RangeError) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json(
      { error: error instanceof Error ? studentFacingBuildError(error.message) : "Could not check this answer." },
      { status: 502 },
    );
  }
}
