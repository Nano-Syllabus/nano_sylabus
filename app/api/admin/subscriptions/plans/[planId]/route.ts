import { NextResponse } from "next/server";
import { z } from "zod";
import { assertAdminRequest } from "@/lib/admin-access";
import {
  updateAdminSubscriptionPlan,
  type AdminSubscriptionPlanInput,
} from "@/lib/data/admin-subscriptions";

const planSchema = z.object({
  name: z.string().trim().min(1),
  slug: z.string().trim().default(""),
  credits: z.number().int().min(0, "Credits must be a whole number, 0 or higher."),
  price: z.number().int().min(0),
  currency: z.string().trim().min(1).default("NPR"),
  billingType: z.enum(["one_time", "monthly"]),
  isActive: z.boolean().default(true),
  features: z.array(z.string().trim().min(1).max(160)).max(20).optional(),
});

function toInput(payload: z.infer<typeof planSchema>): AdminSubscriptionPlanInput {
  return payload;
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ planId: string }> },
) {
  const access = await assertAdminRequest();
  if ("error" in access) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }

  try {
    const { planId } = await params;
    const payload = planSchema.parse(await request.json());
    const plan = await updateAdminSubscriptionPlan(planId, toInput(payload));
    return NextResponse.json({ plan });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: error.issues[0]?.message || "Enter valid plan details." },
        { status: 400 },
      );
    }
    if (error instanceof SyntaxError) {
      return NextResponse.json({ error: "Send valid plan details as JSON." }, { status: 400 });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to update subscription plan." },
      { status: 500 },
    );
  }
}
