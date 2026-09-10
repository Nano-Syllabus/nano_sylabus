import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import {
  hashReceiptUploadToken,
  receiptFileError,
  receiptFileExtension,
} from "@/lib/billing-receipt-upload";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

const tokenSchema = z.string().min(32).max(128).regex(/^[A-Za-z0-9_-]+$/);

async function findSession(token: string) {
  const parsed = tokenSchema.safeParse(token);
  if (!parsed.success) return null;
  const admin = createSupabaseAdminClient();
  const { data } = await admin
    .from("billing_receipt_upload_sessions")
    .select("id, invoice_id, user_id, status, proof_storage_path, expires_at, invoices!inner(invoice_code, status, expires_at)")
    .eq("token_hash", hashReceiptUploadToken(parsed.data))
    .maybeSingle();
  return data;
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ token: string }> },
) {
  const { token } = await context.params;
  const session = await findSession(token);
  if (!session) return NextResponse.json({ error: "This upload link is invalid." }, { status: 404 });

  const invoice = Array.isArray(session.invoices) ? session.invoices[0] : session.invoices;
  const expired = new Date(session.expires_at).getTime() <= Date.now();
  const unavailable = expired || !invoice || !["pending_payment", "payment_submitted"].includes(invoice.status);
  if (unavailable || session.status === "expired") {
    return NextResponse.json({ error: "This upload link has expired. Create a new QR on your desktop." }, { status: 410 });
  }
  if (session.status === "consumed") {
    return NextResponse.json({ error: "This receipt has already been attached to the payment." }, { status: 409 });
  }

  return NextResponse.json({
    status: session.status,
    invoiceCode: invoice.invoice_code,
    expiresAt: session.expires_at,
  });
}

export async function POST(
  request: Request,
  context: { params: Promise<{ token: string }> },
) {
  let uploadedPath: string | null = null;
  try {
    const { token } = await context.params;
    const session = await findSession(token);
    if (!session) return NextResponse.json({ error: "This upload link is invalid." }, { status: 404 });

    const invoice = Array.isArray(session.invoices) ? session.invoices[0] : session.invoices;
    const expired = new Date(session.expires_at).getTime() <= Date.now();
    if (expired || session.status === "expired") {
      return NextResponse.json({ error: "This upload link has expired. Create a new QR on your desktop." }, { status: 410 });
    }
    if (session.status === "consumed") {
      return NextResponse.json({ error: "This receipt has already been attached to the payment." }, { status: 409 });
    }
    if (!invoice || !["pending_payment", "payment_submitted"].includes(invoice.status)) {
      return NextResponse.json({ error: "This invoice is no longer open for uploads." }, { status: 409 });
    }
    if (new Date(invoice.expires_at).getTime() <= Date.now()) {
      return NextResponse.json({ error: "This invoice has expired." }, { status: 410 });
    }

    const formData = await request.formData();
    const receipt = formData.get("receipt");
    if (!(receipt instanceof File)) {
      return NextResponse.json({ error: "Choose a receipt from your phone." }, { status: 400 });
    }
    const fileError = receiptFileError(receipt);
    if (fileError) return NextResponse.json({ error: fileError }, { status: 400 });

    const admin = createSupabaseAdminClient();
    uploadedPath = `${session.user_id}/${session.invoice_id}/phone-${session.id}-${randomUUID()}.${receiptFileExtension(receipt)}`;
    const { error: uploadError } = await admin.storage
      .from("payment-receipts")
      .upload(uploadedPath, Buffer.from(await receipt.arrayBuffer()), {
        contentType: receipt.type,
        upsert: false,
      });
    if (uploadError) return NextResponse.json({ error: "Receipt upload failed. Try again." }, { status: 500 });

    const oldPath = session.proof_storage_path;
    let updateQuery = admin
      .from("billing_receipt_upload_sessions")
      .update({
        status: "uploaded",
        proof_storage_path: uploadedPath,
        original_file_name: receipt.name.slice(0, 255),
        mime_type: receipt.type,
        uploaded_at: new Date().toISOString(),
      })
      .eq("id", session.id)
      .in("status", ["pending", "uploaded"])
      .gt("expires_at", new Date().toISOString());
    updateQuery = oldPath
      ? updateQuery.eq("proof_storage_path", oldPath)
      : updateQuery.is("proof_storage_path", null);
    const { data: updated, error: updateError } = await updateQuery
      .select("id")
      .maybeSingle();

    if (updateError || !updated) {
      await admin.storage.from("payment-receipts").remove([uploadedPath]);
      uploadedPath = null;
      return NextResponse.json({ error: "The upload link expired. Create a new QR on your desktop." }, { status: 410 });
    }

    if (oldPath && oldPath !== uploadedPath) {
      await admin.storage.from("payment-receipts").remove([oldPath]);
    }

    return NextResponse.json({ ok: true, fileName: receipt.name });
  } catch (error) {
    if (uploadedPath) {
      try {
        await createSupabaseAdminClient().storage.from("payment-receipts").remove([uploadedPath]);
      } catch {
        // The bucket is private; cleanup is best effort if the request aborts.
      }
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Receipt upload failed." },
      { status: 500 },
    );
  }
}
