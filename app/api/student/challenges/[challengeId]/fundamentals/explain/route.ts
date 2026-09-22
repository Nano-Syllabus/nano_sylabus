import { NextResponse } from "next/server";
import { z } from "zod";
import { FundamentalsChangedError, explainChallengeFundamental } from "@/lib/data/challenge-fundamentals";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getVerifiedUser } from "@/lib/supabase/verified-user";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  questionId: z.string().trim().min(1).max(64),
  selected: z.string().trim().min(1).max(4),
});

/**
 * Every call queues and bills a render, and nothing is reused, so one student
 * gets one at a time: a second press while the first is still being planned is
 * the button being pressed twice, not a second question. Per server instance —
 * a guard against a double click, not a quota.
 */
const SPACING_MS = 20_000;
const lastRequest = new Map<string, number>();

/** A short video, made now for this one wrong answer — see
 *  `explainChallengeFundamental`. */
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

    const since = Date.now() - (lastRequest.get(user.id) ?? 0);
    if (since < SPACING_MS) {
      return NextResponse.json(
        { error: "One explainer is already being made. Give it a few seconds." },
        { status: 429, headers: { "Retry-After": String(Math.ceil((SPACING_MS - since) / 1000)) } },
      );
    }
    lastRequest.set(user.id, Date.now());
    if (lastRequest.size > 5000) lastRequest.delete(lastRequest.keys().next().value as string);

    const { challengeId } = await params;
    const explainer = await explainChallengeFundamental(
      user.id,
      challengeId,
      parsed.data.questionId,
      parsed.data.selected,
    );
    if (!explainer) return NextResponse.json({ error: "Challenge not found." }, { status: 404 });
    return NextResponse.json({ explainer });
  } catch (error) {
    if (error instanceof FundamentalsChangedError) {
      return NextResponse.json({ error: error.message, changed: true }, { status: 409 });
    }
    if (error instanceof RangeError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    console.warn("[challenge] fundamentals explainer failed", error);
    return NextResponse.json(
      { error: "The video explainer couldn't be started right now. Try again shortly." },
      { status: 502 },
    );
  }
}
