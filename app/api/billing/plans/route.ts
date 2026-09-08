import { NextResponse } from "next/server";
import { CACHE, errorJson, privateJson } from "@/lib/http/cache";
import { getActiveManualPaymentConfig, listSubscriptionPlans } from "@/lib/data/billing";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getVerifiedUser } from "@/lib/supabase/verified-user";

/** Plan prices and the manual-payment config. Editorial data — cache it. */
export async function GET(request: Request) {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await getVerifiedUser(supabase);

    if (!user) {
      return errorJson("Unauthorized", 401);
    }

    const [plans, paymentConfig] = await Promise.all([
      listSubscriptionPlans(),
      getActiveManualPaymentConfig(),
    ]);
    return privateJson({ plans, paymentConfig }, { request, profile: CACHE.STATIC });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load plans." },
      { status: 500 },
    );
  }
}
