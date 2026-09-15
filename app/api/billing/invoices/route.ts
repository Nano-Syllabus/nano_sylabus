import { NextResponse } from "next/server";
import { z } from "zod";
import { getActiveManualPaymentConfig } from "@/lib/data/billing";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getVerifiedUser } from "@/lib/supabase/verified-user";

export const runtime = "nodejs";

const invoiceSchema = z.object({
  planId: z.string().uuid(),
  paymentMethod: z.literal("bank_transfer").default("bank_transfer"),
  billingMonths: z.union([z.literal(1), z.literal(3)]).default(1),
  purchaseDetails: z.object({
    groupName: z.string().trim().min(2).max(120),
    organizerEmail: z.string().trim().email().max(160),
    studentEmails: z.array(z.string().trim().email().max(160)).min(1).max(5),
  }).optional(),
});

function serializeInvoice(row: Record<string, any>) {
  return {
    id: row.id,
    planId: row.plan_id,
    status: row.status,
    amount: row.amount,
    subtotal: row.subtotal ?? row.amount,
    currency: row.currency,
    paymentMethod: row.payment_method,
    invoiceCode: row.invoice_code,
    expiresAt: row.expires_at,
    billingPeriodStart: row.billing_period_start,
    billingPeriodEnd: row.billing_period_end,
  };
}

function formatSimpleInvoiceCode(value: number) {
  return value < 1000 ? String(value).padStart(3, "0") : String(value);
}

async function nextAvailableSimpleInvoiceCode(
  admin: ReturnType<typeof createSupabaseAdminClient>,
) {
  const { data, error } = await admin.from("invoices").select("invoice_code");
  if (error) throw error;

  const usedCodes = new Set(
    (data ?? [])
      .map((row) => String(row.invoice_code ?? ""))
      .filter((code) => /^\d+$/.test(code))
      .map(Number),
  );

  let nextValue = 1;
  while (usedCodes.has(nextValue)) nextValue += 1;
  return formatSimpleInvoiceCode(nextValue);
}

async function ensureSimpleInvoiceCode(
  admin: ReturnType<typeof createSupabaseAdminClient>,
  invoice: Record<string, any>,
) {
  if (/^\d{3,}$/.test(String(invoice.invoice_code ?? ""))) return invoice;
  if (invoice.status !== "pending_payment") return invoice;

  for (let attempt = 0; attempt < 12; attempt += 1) {
    const invoiceCode = await nextAvailableSimpleInvoiceCode(admin);
    const { data, error } = await admin
      .from("invoices")
      .update({ invoice_code: invoiceCode })
      .eq("id", invoice.id)
      .in("status", ["pending_payment"])
      .select("*")
      .maybeSingle();

    if (!error && data) return data;
    if (error?.code !== "23505") throw error;
  }

  throw new Error("Could not allocate a short invoice ID. Please try again.");
}

export async function POST(request: Request) {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await getVerifiedUser(supabase);

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const parsed = invoiceSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ error: "Choose a valid plan and payment method." }, { status: 400 });
    }
    const payload = parsed.data;
    const admin = createSupabaseAdminClient();

    const { data: plan, error: planError } = await admin
      .from("subscription_plans")
      .select("*")
      .eq("id", payload.planId)
      .eq("is_active", true)
      .maybeSingle();

    if (planError) {
      return NextResponse.json({ error: planError.message }, { status: 500 });
    }

    if (!plan) {
      return NextResponse.json({ error: "Plan not found." }, { status: 404 });
    }

    if (plan.product_type === "group" && !payload.purchaseDetails) {
      return NextResponse.json({ error: "Add the group name and 1–5 student emails." }, { status: 400 });
    }

    const invoiceAmount = plan.price * payload.billingMonths;

    const { data: existingInvoice, error: existingError } = await admin
      .from("invoices")
      .select("*")
      .eq("user_id", user.id)
      .eq("plan_id", payload.planId)
      .eq("amount", invoiceAmount)
      .in("status", ["pending_payment", "payment_submitted"])
      .gt("expires_at", new Date().toISOString())
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (existingError) {
      return NextResponse.json({ error: existingError.message }, { status: 500 });
    }

    const paymentConfig = await getActiveManualPaymentConfig();
    if (existingInvoice) {
      const normalizedInvoice = await ensureSimpleInvoiceCode(admin, existingInvoice);
      return NextResponse.json({
        invoice: serializeInvoice(normalizedInvoice),
        paymentConfig,
        reused: true,
      });
    }

    const startsAt = new Date();
    const endsAt = plan.billing_type === "monthly"
      ? new Date(startsAt.getTime() + payload.billingMonths * 30 * 24 * 60 * 60 * 1000)
      : null;

    const { data: invoice, error: invoiceError } = await admin
      .from("invoices")
      .insert({
        user_id: user.id,
        plan_id: payload.planId,
        status: "pending_payment",
        amount: invoiceAmount,
        subtotal: invoiceAmount,
        currency: plan.currency,
        payment_method: payload.paymentMethod,
        expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        billing_period_start: startsAt.toISOString(),
        billing_period_end: endsAt?.toISOString() ?? null,
        purchase_meta: {
          ...(payload.purchaseDetails ?? {}),
          billingMonths: payload.billingMonths,
        },
      })
      .select("*")
      .single();

    if (invoiceError || !invoice) {
      return NextResponse.json(
        { error: invoiceError?.message || "Failed to create invoice." },
        { status: 500 },
      );
    }

    const normalizedInvoice = await ensureSimpleInvoiceCode(admin, invoice);

    return NextResponse.json({
      invoice: serializeInvoice(normalizedInvoice),
      paymentConfig,
      reused: false,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to create invoice." },
      { status: 500 },
    );
  }
}
