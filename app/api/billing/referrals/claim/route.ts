import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const claimSchema = z.object({ code: z.string().trim().min(1).max(32) });

export async function POST(request: Request) {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Sign in before claiming this referral." }, { status: 401 });

    const parsed = claimSchema.safeParse(await request.json().catch(() => ({})));
    if (!parsed.success) return NextResponse.json({ error: "Enter a valid referral code." }, { status: 400 });

    const { data, error } = await supabase.rpc("claim_billing_referral", {
      target_code: parsed.data.code.toUpperCase(),
      target_user_id: user.id,
    });
    if (error) {
      const status = error.code === "P0002" ? 404 : error.code === "P0001" ? 400 : error.code === "23505" ? 409 : error.code === "42501" ? 403 : 500;
      return NextResponse.json({ error: error.message }, { status });
    }

    const row = Array.isArray(data) ? data[0] : data;
    return NextResponse.json({ claim: { id: row?.id, status: row?.status } });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not claim this referral." },
      { status: 500 },
    );
  }
}
