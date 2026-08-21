import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const couponSchema = z.object({
  invoiceId: z.string().uuid(),
  code: z.string().trim().min(3).max(40),
});

export async function POST(request: Request) {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Sign in before applying a coupon." }, { status: 401 });
    }

    const parsed = couponSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ error: "Enter a valid coupon code." }, { status: 400 });
    }

    const { data, error } = await supabase.rpc("redeem_billing_coupon", {
      target_invoice_id: parsed.data.invoiceId,
      target_coupon_code: parsed.data.code,
    });

    if (error) {
      const message = error.message || "Coupon could not be applied.";
      const status = /already used|not active|invalid|does not apply|expired/i.test(message) ? 400 : 500;
      return NextResponse.json({ error: message }, { status });
    }

    return NextResponse.json({ redemption: data });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Coupon could not be applied." },
      { status: 500 },
    );
  }
}
