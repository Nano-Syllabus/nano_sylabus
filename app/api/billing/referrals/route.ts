import { NextResponse } from "next/server";
import { z } from "zod";
import { hasActivePaidProSubscription, referralLinkForCode } from "@/lib/data/billing-referrals";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getVerifiedUser } from "@/lib/supabase/verified-user";

const codeSchema = z.object({ code: z.string().trim().min(1).max(32).optional() });

export async function POST(request: Request) {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await getVerifiedUser(supabase);
    if (!user) return NextResponse.json({ error: "Sign in to create a referral link." }, { status: 401 });

    const parsed = codeSchema.safeParse(await request.json().catch(() => ({})));
    if (!parsed.success) return NextResponse.json({ error: "Invalid referral request." }, { status: 400 });

    const { data, error } = await supabase.rpc("create_billing_referral_link", {
      target_user_id: user.id,
    });
    if (error) {
      if (error.code === "42501") return NextResponse.json({ error: error.message }, { status: 403 });
      if (error.code === "P0001") return NextResponse.json({ error: error.message }, { status: 403 });
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const row = Array.isArray(data) ? data[0] : data;
    if (!row?.code) return NextResponse.json({ error: "Referral link could not be created." }, { status: 500 });

    // Any student may hold a link; the Pro bonus is paid only while they hold paid
    // Pro. The client words its share message by this, so a free student's link
    // does not promise a bonus the reward trigger would void.
    const billingReward = await hasActivePaidProSubscription(createSupabaseAdminClient(), user.id);

    return NextResponse.json({
      referral: {
        code: String(row.code),
        link: referralLinkForCode(String(row.code), new URL(request.url).origin),
        rewardDays: 30,
        billingReward,
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not create referral link." },
      { status: 500 },
    );
  }
}
