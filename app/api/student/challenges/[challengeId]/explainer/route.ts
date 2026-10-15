import { NextResponse } from "next/server";
import { z } from "zod";
import { challengeAccessResponse } from "@/lib/data/challenge-access-error";
import { requestConceptExplainer } from "@/lib/data/concept-explainer";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getVerifiedUser } from "@/lib/supabase/verified-user";
import { withUsageCommunity } from "@/lib/usage-community";

export const dynamic = "force-dynamic";

const bodySchema = z.object({ priority: z.enum(["urgent", "background"]).optional() });

/** Bound repeated asks per student: each one can queue a render. */
const WINDOW_MS = 60_000;
const PER_WINDOW = 6;
const recent = new Map<string, number[]>();

/**
 * Queue (or find) the topic's animated explainer and say where it got to. The
 * browser then polls `/api/media/<hash>` for status and plays
 * `/api/media/<hash>/animation.mp4` — both through the media proxy.
 */
async function handlePOST(request: Request, { params }: { params: Promise<{ challengeId: string }> }) {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await getVerifiedUser(supabase);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const parsed = bodySchema.safeParse(await request.json().catch(() => ({})));
    if (!parsed.success) return NextResponse.json({ error: "Bad request." }, { status: 400 });

    const now = Date.now();
    const asked = (recent.get(user.id) ?? []).filter((at) => now - at < WINDOW_MS);
    if (asked.length >= PER_WINDOW) {
      return NextResponse.json({ error: "Give it a few seconds." }, { status: 429 });
    }
    recent.set(user.id, [...asked, now]);
    if (recent.size > 5000) recent.delete(recent.keys().next().value as string);

    const { challengeId } = await params;
    const explainer = await requestConceptExplainer(user.id, challengeId, parsed.data.priority ?? "urgent");
    if (!explainer) return NextResponse.json({ error: "Challenge not found." }, { status: 404 });
    return NextResponse.json({ explainer });
  } catch (error) {
    const denied = challengeAccessResponse(error);
    if (denied) return denied;
    if (error instanceof RangeError) return NextResponse.json({ error: error.message }, { status: 409 });
    console.warn("[challenge] concept explainer failed", error);
    return NextResponse.json(
      { error: "The explainer couldn't be prepared right now. Try again shortly." },
      { status: 502 },
    );
  }
}

// Tokens these spend are counted against the student's faculty (lib/usage-community.ts).
export const POST = withUsageCommunity(handlePOST);
