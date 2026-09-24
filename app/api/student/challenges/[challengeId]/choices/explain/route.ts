import { NextResponse } from "next/server";
import { z } from "zod";
import { explainExamChoice } from "@/lib/data/challenge-exam-picks";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getVerifiedUser } from "@/lib/supabase/verified-user";

export const dynamic = "force-dynamic";

const bodySchema = z.object({ questionId: z.string().trim().min(1).max(64) });

/** One render at a time per student, as the fundamentals explainer keeps it. */
const SPACING_MS = 20_000;
const lastRequest = new Map<string, number>();

/** A short video on why a wrong MCQ answer is wrong — made now, never cached. */
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
    const explainer = await explainExamChoice(user.id, challengeId, parsed.data.questionId);
    if (!explainer) return NextResponse.json({ error: "Challenge not found." }, { status: 404 });
    return NextResponse.json({ explainer });
  } catch (error) {
    if (error instanceof RangeError) return NextResponse.json({ error: error.message }, { status: 400 });
    console.warn("[challenge] exam MCQ explainer failed", error);
    return NextResponse.json(
      { error: "The video explainer couldn't be started right now. Try again shortly." },
      { status: 502 },
    );
  }
}
