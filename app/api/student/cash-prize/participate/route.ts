import { NextResponse } from "next/server";
import { registerWeeklyParticipation } from "@/lib/data/cash-prize-weekly";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getVerifiedUser } from "@/lib/supabase/verified-user";

/**
 * Confirm participation in this week's Friday draw.
 *
 * The request carries nothing but the session. Eligibility — the BCT community,
 * the 7-day streak, the referral count and so the number of entries — is worked
 * out again on the server from durable records (`registerWeeklyParticipation`).
 * A request cannot say how many entries it deserves, because it is never asked.
 */
export async function POST() {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await getVerifiedUser(supabase);
    if (!user) {
      return NextResponse.json({ error: "Sign in to take part." }, { status: 401 });
    }

    const admin = createSupabaseAdminClient();
    const { data: profile } = await admin
      .from("student_profiles")
      .select("full_name")
      .eq("user_id", user.id)
      .maybeSingle();
    const metadataName =
      typeof user.user_metadata?.full_name === "string" ? user.user_metadata.full_name : "";
    const email = user.email ?? "";
    const name =
      String(profile?.full_name || "").trim() || metadataName.trim() || email.split("@")[0] || "Student";

    const result = await registerWeeklyParticipation(user.id, { name, email });
    if (!result.ok) {
      return NextResponse.json({ error: result.message, reason: result.reason }, { status: 403 });
    }
    return NextResponse.json({
      participation: {
        drawDate: result.drawDate,
        entries: result.entries,
        confirmedAt: result.confirmedAt,
      },
    });
  } catch (error) {
    console.error("[cash-prize] participation failed", error);
    return NextResponse.json(
      { error: "Your participation could not be confirmed. Please try again." },
      { status: 500 },
    );
  }
}
