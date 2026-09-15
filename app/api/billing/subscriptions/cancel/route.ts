import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getVerifiedUser } from "@/lib/supabase/verified-user";

const subscriptionActionSchema = z.object({
  subscriptionId: z.string().uuid(),
  action: z.literal("cancel"),
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

function hasCancellablePlan(row: Record<string, any>) {
  const plan = Array.isArray(row.subscription_plans)
    ? row.subscription_plans[0]
    : row.subscription_plans;
  return Boolean(plan && ["individual", "group"].includes(plan.product_type));
}

/**
 * Immediately cancels a subscription owned by the signed-in student. Access
 * ends in the same transaction by changing the status and `ends_at` timestamp,
 * so every entitlement check sees the cancellation on its next read.
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
        "id, user_id, invoice_id, status, ends_at, cancel_at_period_end, cancelled_at, cancellation_reason, subscription_plans!inner(product_type)",
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
    if (!["active", "cancelled"].includes(subscription.status)) {
      return NextResponse.json(
        { error: "Only an active subscription can be cancelled." },
        { status: 409 },
      );
    }
    if (
      subscription.status === "active" &&
      subscription.ends_at &&
      new Date(subscription.ends_at).getTime() <= Date.now()
    ) {
      return NextResponse.json({ error: "This subscription has already ended." }, { status: 409 });
    }
    if (!hasCancellablePlan(subscription)) {
      return NextResponse.json(
        { error: "This subscription cannot be cancelled from billing." },
        { status: 409 },
      );
    }

    // A user can have overlapping active rows after repeat activations or
    // referral extensions. Cancelling only the row currently shown in the UI
    // would leave paid access active through another row, producing a false
    // "Subscription cancelled" state. End every active paid-access row.
    const { data: activeSubscriptions, error: activeSubscriptionsError } = await admin
      .from("user_subscriptions")
      .select(
        "id, invoice_id, ends_at, subscription_plans!inner(product_type)",
      )
      .eq("user_id", user.id)
      .eq("status", "active");

    if (activeSubscriptionsError) {
      return NextResponse.json({ error: activeSubscriptionsError.message }, { status: 500 });
    }

    const subscriptionsToCancel = (activeSubscriptions ?? []).filter(hasCancellablePlan);
    if (subscriptionsToCancel.length === 0) {
      if (subscription.status === "cancelled") {
        return NextResponse.json({
          subscription: serializeSubscription(subscription),
          cancelledSubscriptionIds: [],
        });
      }
      return NextResponse.json(
        { error: "No active paid subscription could be cancelled. Refresh and try again." },
        { status: 409 },
      );
    }

    const cancelledAt = new Date().toISOString();
    const subscriptionIds = subscriptionsToCancel.map((item) => item.id);
    const { data: updatedSubscriptions, error: updateError } = await admin
      .from("user_subscriptions")
      .update({
        status: "cancelled",
        ends_at: cancelledAt,
        cancel_at_period_end: false,
        cancelled_at: cancelledAt,
        cancellation_reason: parsed.data.reason || null,
      })
      .eq("user_id", user.id)
      .eq("status", "active")
      .in("id", subscriptionIds)
      .select("id, status, ends_at, cancel_at_period_end, cancelled_at");

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }
    if (!updatedSubscriptions || updatedSubscriptions.length !== subscriptionIds.length) {
      return NextResponse.json(
        { error: "This subscription changed before it could be updated. Refresh and try again." },
        { status: 409 },
      );
    }

    const updatedTarget =
      updatedSubscriptions.find((item) => item.id === subscription.id) ?? subscription;

    const auditResult = await admin.from("billing_audit_logs").insert({
      invoice_id: subscription.invoice_id,
      actor_id: user.id,
      action: "subscription_cancelled_immediately",
      metadata: {
        subscriptionId: subscription.id,
        cancelledSubscriptionIds: subscriptionIds,
        cancelledSubscriptionCount: subscriptionIds.length,
        previousEndsAt: subscription.ends_at,
        effectiveAt: cancelledAt,
      },
    });
    if (auditResult.error) {
      // The subscription update has succeeded. Do not make the user's action
      // appear to fail merely because the non-critical audit write failed.
      console.error("Could not write subscription billing audit log", auditResult.error);
    }

    return NextResponse.json({
      subscription: serializeSubscription(updatedTarget),
      cancelledSubscriptionIds: subscriptionIds,
    });
  } catch (error) {
    console.error("Could not manage subscription cancellation", error);
    return NextResponse.json(
      { error: "Could not update your subscription. Please try again." },
      { status: 500 },
    );
  }
}
