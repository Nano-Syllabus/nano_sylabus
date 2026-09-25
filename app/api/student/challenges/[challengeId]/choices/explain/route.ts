import { NextResponse } from "next/server";
import { challengeAccessResponse } from "@/lib/data/challenge-access-error";
import { z } from "zod";
import { explainExamChoice } from "@/lib/data/challenge-exam-picks";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getVerifiedUser } from "@/lib/supabase/verified-user";

export const dynamic = "force-dynamic";

const bodySchema = z.object({ questionId: z.string().trim().min(1).max(64) });

/**
 * A question's video is one render shared by everyone and cached, and a paper can
 * only ever name its own questions — so this bounds clicking, not spending. A
 * student going down Revision watching one after another stays well inside it.
 */
const WINDOW_MS = 60_000;
const PER_WINDOW = 12;
const recent = new Map<string, number[]>();

/** The short video for one MCQ whose answer is open: on the paper, or in Revision. */
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
    if (!parsed.success) return NextResponse.json({ error: "Choose a question." }, { status: 400 });

    const now = Date.now();
    const asked = (recent.get(user.id) ?? []).filter((at) => now - at < WINDOW_MS);
    if (asked.length >= PER_WINDOW) {
      return NextResponse.json(
        { error: "That's a lot of videos at once. Give it a few seconds." },
        { status: 429, headers: { "Retry-After": String(Math.ceil((WINDOW_MS - (now - asked[0])) / 1000)) } },
      );
    }
    recent.delete(user.id);
    recent.set(user.id, [...asked, now]);
    if (recent.size > 5000) recent.delete(recent.keys().next().value as string);

    const { challengeId } = await params;
    const explainer = await explainExamChoice(user.id, challengeId, parsed.data.questionId);
    if (!explainer) return NextResponse.json({ error: "Challenge not found." }, { status: 404 });
    return NextResponse.json({ explainer });
  } catch (error) {
    const denied = challengeAccessResponse(error);
    if (denied) return denied;
    if (error instanceof RangeError) return NextResponse.json({ error: error.message }, { status: 400 });
    console.warn("[challenge] exam MCQ explainer failed", error);
    return NextResponse.json(
      { error: "The video explainer couldn't be started right now. Try again shortly." },
      { status: 502 },
    );
  }
}
