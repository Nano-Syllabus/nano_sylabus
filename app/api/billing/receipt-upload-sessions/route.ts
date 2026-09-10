import { NextResponse } from "next/server";
import { z } from "zod";
import {
  createReceiptUploadToken,
  hashReceiptUploadToken,
  MOBILE_RECEIPT_UPLOAD_TTL_MINUTES,
} from "@/lib/billing-receipt-upload";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getVerifiedUser } from "@/lib/supabase/verified-user";

export const runtime = "nodejs";

const createSessionSchema = z.object({ invoiceId: z.string().uuid() });

export async function POST(request: Request) {
  try {
    const supabase = await createSupabaseServerClient();
    const { data: { user } } = await getVerifiedUser(supabase);
    if (!user) {
      return NextResponse.json({ error: "Sign in before creating an upload link." }, { status: 401 });
    }

    const parsed = createSessionSchema.safeParse(await request.json().catch(() => ({})));
    if (!parsed.success) {
      return NextResponse.json({ error: "Choose a valid payment invoice." }, { status: 400 });
    }

    const admin = createSupabaseAdminClient();
    const { data: invoice, error: invoiceError } = await admin
      .from("invoices")
      .select("id, status, expires_at")
      .eq("id", parsed.data.invoiceId)
      .eq("user_id", user.id)
      .maybeSingle();

    if (invoiceError) return NextResponse.json({ error: invoiceError.message }, { status: 500 });
    if (!invoice) return NextResponse.json({ error: "Invoice not found." }, { status: 404 });
    if (!["pending_payment", "payment_submitted"].includes(invoice.status)) {
      return NextResponse.json({ error: "This invoice is no longer open for uploads." }, { status: 409 });
    }
    if (new Date(invoice.expires_at).getTime() <= Date.now()) {
      return NextResponse.json({ error: "This invoice has expired." }, { status: 410 });
    }

    const token = createReceiptUploadToken();
    const expiresAt = new Date(Date.now() + MOBILE_RECEIPT_UPLOAD_TTL_MINUTES * 60_000).toISOString();
    const { data: session, error: sessionError } = await admin
      .from("billing_receipt_upload_sessions")
      .insert({
        token_hash: hashReceiptUploadToken(token),
        invoice_id: invoice.id,
        user_id: user.id,
        expires_at: expiresAt,
      })
      .select("id")
      .single();

    if (sessionError) return NextResponse.json({ error: sessionError.message }, { status: 500 });

    const uploadUrl = new URL(`/payment-upload/${token}`, request.url).toString();
    return NextResponse.json({
      sessionId: session.id,
      uploadUrl,
      expiresAt,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not create the phone upload link." },
      { status: 500 },
    );
  }
}
