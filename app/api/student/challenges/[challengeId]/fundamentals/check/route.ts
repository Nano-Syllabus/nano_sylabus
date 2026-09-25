import { NextResponse } from "next/server";
import { challengeAccessResponse } from "@/lib/data/challenge-access-error";
import { z } from "zod";
import { FundamentalsChangedError, checkChallengeFundamental } from "@/lib/data/challenge-fundamentals";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getVerifiedUser } from "@/lib/supabase/verified-user";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  questionId: z.string().trim().min(1).max(64),
  selected: z.string().trim().min(1).max(4),
});

/** Checks one answer and reveals the correct option — the key is only ever sent
 *  after the student has committed to an answer. */
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
    const result = await checkChallengeFundamental(
      user.id,
      challengeId,
      parsed.data.questionId,
      parsed.data.selected,
    );
    if (!result) return NextResponse.json({ error: "Challenge not found." }, { status: 404 });
    return NextResponse.json({ result });
  } catch (error) {
    const denied = challengeAccessResponse(error);
    if (denied) return denied;
    if (error instanceof FundamentalsChangedError) {
      return NextResponse.json({ error: error.message, changed: true }, { status: 409 });
    }
    console.warn("[challenge] fundamentals check failed", error);
    return NextResponse.json({ error: "That answer couldn't be checked. Try again." }, { status: 502 });
  }
}
