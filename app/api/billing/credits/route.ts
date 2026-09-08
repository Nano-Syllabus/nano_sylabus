import { NextResponse } from "next/server";
import { CACHE, errorJson, privateJson } from "@/lib/http/cache";
import { ensureStarterCreditsForUser } from "@/lib/data/billing";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getVerifiedUser } from "@/lib/supabase/verified-user";

/**
 * The credit balance, deliberately NOT given a freshness window.
 *
 * This is the counter a student watches tick down as they ask questions, so a
 * cached one is a bug report. `CACHE.REVALIDATE` means the browser always asks
 * and usually gets a 304 with no body — cheap, and never wrong. The query for
 * it uses `STALE.LIVE` for the same reason.
 */
export async function GET(request: Request) {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await getVerifiedUser(supabase);

    if (!user) {
      return errorJson("Unauthorized", 401);
    }

    const balance = await ensureStarterCreditsForUser(user.id);
    return privateJson({ balance }, { request, profile: CACHE.REVALIDATE });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to fetch credits." },
      { status: 500 },
    );
  }
}
