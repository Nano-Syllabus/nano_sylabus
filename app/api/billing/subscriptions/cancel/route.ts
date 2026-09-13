import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getVerifiedUser } from "@/lib/supabase/verified-user";

const subscriptionActionSchema = z.object({
  subscriptionId: z.string().uuid(),
  action: z.enum(["cancel", "resume"]),
  reason: z.string().trim().max(500).optional(),
});

function serializeSubscription(row: Record<string, unknown>) {
  return {
    id: row.id,
    status: row.status,
    endsAt: row.ends_at,
    cancelAtPeriodEnd: row.cancel_at_period_end ?? false,
    cancelledAt: row.cancelled_at ?? null,
  };
}

/**
 * Schedules (or reverses) a cancellation for a subscription owned by the
 * signed-in student. This intentionally keeps the subscription active until
 * its already-paid `ends_at` timestamp.
 */
export async function POST(request: Request) {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await getVerifiedUser(supabase);

    if (!user) {
      return NextResponse.json({ error: "Sign in to manage your subscription." }, { status: 401 });
    }

    const parsed = subscriptionActionSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ error: "Choose a valid subscription action." }, { status: 400 });
    }

    const admin = createSupabaseAdminClient();
    const { data: subscription, error: subscriptionError } = await admin
      .from("user_subscriptions")
      .select(
        "id, user_id, invoice_id, status, ends_at, cancel_at_period_end, subscription_plans!inner(is_unlimited)",
      )
      .eq("id", parsed.data.subscriptionId)
      .eq("user_id", user.id)
      .maybeSingle();

    if (subscriptionError) {
      return NextResponse.json({ error: subscriptionError.message }, { status: 500 });
    }
    if (!subscription) {
      return NextResponse.json({ error: "Subscription not found." }, { status: 404 });
    }
    if (subscription.status !== "active") {
      return NextResponse.json(
        { error: "Only an active subscription can be managed." },
        { status: 409 },
      );
    }
    if (!subscription.ends_at || new Date(subscription.ends_at).getTime() <= Date.now()) {
      return NextResponse.json({ error: "This subscription has already ended." }, { status: 409 });
    }

    const plan = Array.isArray(subscription.subscription_plans)
      ? subscription.subscription_plans[0]
      : subscription.subscription_plans;
    if (!plan?.is_unlimited) {
      return NextResponse.json(
        { error: "This subscription cannot be cancelled from billing." },
        { status: 409 },
      );
    }

    const cancelling = parsed.data.action === "cancel";
    if (subscription.cancel_at_period_end === cancelling) {
      return NextResponse.json({ subscription: serializeSubscription(subscription) });
    }

    const updateValues = cancelling
      ? {
          cancel_at_period_end: true,
          cancelled_at: new Date().toISOString(),
          cancellation_reason: parsed.data.reason || null,
        }
      : {
          cancel_at_period_end: false,
          cancelled_at: null,
          cancellation_reason: null,
        };
    const { data: updatedSubscription, error: updateError } = await admin
      .from("user_subscriptions")
      .update(updateValues)
      .eq("id", subscription.id)
      .eq("user_id", user.id)
      .eq("status", "active")
      .select("id, status, ends_at, cancel_at_period_end, cancelled_at")
      .maybeSingle();

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }
    if (!updatedSubscription) {
      return NextResponse.json(
        { error: "This subscription changed before it could be updated. Refresh and try again." },
        { status: 409 },
      );
    }

    const auditResult = await admin.from("billing_audit_logs").insert({
      invoice_id: subscription.invoice_id,
      actor_id: user.id,
      action: cancelling
        ? "subscription_cancellation_scheduled"
        : "subscription_cancellation_resumed",
      metadata: {
        subscriptionId: subscription.id,
        endsAt: subscription.ends_at,
      },
    });
    if (auditResult.error) {
      // The subscription update has succeeded. Do not make the user's action
      // appear to fail merely because the non-critical audit write failed.
      console.error("Could not write subscription billing audit log", auditResult.error);
    }

    return NextResponse.json({ subscription: serializeSubscription(updatedSubscription) });
  } catch (error) {
    console.error("Could not manage subscription cancellation", error);
    return NextResponse.json(
      { error: "Could not update your subscription. Please try again." },
      { status: 500 },
    );
  }
}
