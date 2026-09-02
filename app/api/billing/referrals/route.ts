import { NextResponse } from "next/server";
import { z } from "zod";
import { referralLinkForCode } from "@/lib/data/billing-referrals";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const codeSchema = z.object({ code: z.string().trim().min(1).max(32).optional() });

export async function POST(request: Request) {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Sign in to create a referral link." }, { status: 401 });

    const parsed = codeSchema.safeParse(await request.json().catch(() => ({})));
    if (!parsed.success) return NextResponse.json({ error: "Invalid referral request." }, { status: 400 });

    const { data, error } = await supabase.rpc("create_billing_referral_link", {
      target_user_id: user.id,
    });
    if (error) {
      if (error.code === "42501") return NextResponse.json({ error: error.message }, { status: 403 });
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const row = Array.isArray(data) ? data[0] : data;
    if (!row?.code) return NextResponse.json({ error: "Referral link could not be created." }, { status: 500 });

    return NextResponse.json({
      referral: {
        code: String(row.code),
        link: referralLinkForCode(String(row.code), new URL(request.url).origin),
        rewardDays: 30,
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not create referral link." },
      { status: 500 },
    );
  }
}
