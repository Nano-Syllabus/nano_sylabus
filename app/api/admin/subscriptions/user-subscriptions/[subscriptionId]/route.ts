import { NextResponse } from "next/server";
import { z } from "zod";
import { assertAdminRequest } from "@/lib/admin-access";
import {
  cancelAdminSubscription,
  extendAdminSubscription,
} from "@/lib/data/admin-subscriptions";

const actionSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("cancel"),
  }),
  z.object({
    action: z.literal("extend"),
    extraDays: z.number().int().positive().max(365),
  }),
]);

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ subscriptionId: string }> },
) {
  const access = await assertAdminRequest();
  if ("error" in access) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }

  try {
    const { subscriptionId } = await params;
    const payload = actionSchema.parse(await request.json());

    if (payload.action === "cancel") {
      await cancelAdminSubscription(subscriptionId);
      return NextResponse.json({ ok: true });
    }

    const endsAt = await extendAdminSubscription(subscriptionId, payload.extraDays);
    return NextResponse.json({ ok: true, endsAt });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to update subscription." },
      { status: 500 },
    );
  }
}
