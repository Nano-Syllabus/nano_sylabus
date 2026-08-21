import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

const MAX_RECEIPT_BYTES = 5 * 1024 * 1024;
const ALLOWED_RECEIPT_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
]);

const paymentFieldsSchema = z.object({
  invoiceId: z.string().uuid(),
  reference: z.string().trim().min(3).max(120),
  payerName: z.string().trim().min(2).max(120),
  note: z.string().trim().max(500).optional().default(""),
});

function fileExtension(file: File) {
  const extensions: Record<string, string> = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "application/pdf": "pdf",
  };
  return extensions[file.type] ?? "bin";
}

export async function POST(request: Request) {
  let uploadedPath: string | null = null;

  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Sign in before submitting payment." }, { status: 401 });
    }

    const formData = await request.formData();
    const parsed = paymentFieldsSchema.safeParse({
      invoiceId: formData.get("invoiceId"),
      reference: formData.get("reference"),
      payerName: formData.get("payerName"),
      note: formData.get("note") ?? "",
    });

    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message || "Check the payment details." },
        { status: 400 },
      );
    }

    const admin = createSupabaseAdminClient();
    const { data: invoice, error: invoiceError } = await admin
      .from("invoices")
      .select("id, user_id, status, amount, expires_at")
      .eq("id", parsed.data.invoiceId)
      .eq("user_id", user.id)
      .maybeSingle();

    if (invoiceError) {
      return NextResponse.json({ error: invoiceError.message }, { status: 500 });
    }
    if (!invoice) {
      return NextResponse.json({ error: "Invoice not found." }, { status: 404 });
    }
    if (invoice.status !== "pending_payment" && invoice.status !== "payment_submitted") {
      return NextResponse.json({ error: "This invoice is no longer open for payment." }, { status: 409 });
    }
    if (invoice.amount <= 0) {
      return NextResponse.json({ error: "This invoice does not require payment." }, { status: 409 });
    }
    if (new Date(invoice.expires_at).getTime() <= Date.now()) {
      return NextResponse.json({ error: "This invoice has expired. Generate a new one." }, { status: 410 });
    }

    const { data: existingSubmission, error: existingError } = await admin
      .from("payment_submissions")
      .select("id, status, proof_storage_path")
      .eq("invoice_id", invoice.id)
      .maybeSingle();

    if (existingError) {
      return NextResponse.json({ error: existingError.message }, { status: 500 });
    }
    if (existingSubmission && existingSubmission.status !== "submitted") {
      return NextResponse.json({ error: "This payment submission is already finalized." }, { status: 409 });
    }

    const normalizedReference = parsed.data.reference.toUpperCase();
    const duplicateQuery = admin
      .from("payment_submissions")
      .select("id")
      .eq("reference", normalizedReference)
      .limit(1);
    const { data: duplicateReference, error: duplicateError } = existingSubmission
      ? await duplicateQuery.neq("id", existingSubmission.id).maybeSingle()
      : await duplicateQuery.maybeSingle();

    if (duplicateError) {
      return NextResponse.json({ error: duplicateError.message }, { status: 500 });
    }
    if (duplicateReference) {
      return NextResponse.json(
        { error: "This transaction reference has already been submitted." },
        { status: 409 },
      );
    }

    const receipt = formData.get("receipt");
    if (!(receipt instanceof File) && !existingSubmission?.proof_storage_path) {
      return NextResponse.json({ error: "Upload the payment receipt." }, { status: 400 });
    }

    if (receipt instanceof File) {
      if (receipt.size <= 0 || receipt.size > MAX_RECEIPT_BYTES) {
        return NextResponse.json({ error: "Receipt must be smaller than 5 MB." }, { status: 400 });
      }
      if (!ALLOWED_RECEIPT_TYPES.has(receipt.type)) {
        return NextResponse.json(
          { error: "Upload a JPG, PNG, WebP, or PDF receipt." },
          { status: 400 },
        );
      }

      uploadedPath = `${user.id}/${invoice.id}/${randomUUID()}.${fileExtension(receipt)}`;
      const { error: uploadError } = await admin.storage
        .from("payment-receipts")
        .upload(uploadedPath, Buffer.from(await receipt.arrayBuffer()), {
          contentType: receipt.type,
          upsert: false,
        });

      if (uploadError) {
        return NextResponse.json({ error: "Receipt upload failed. Try again." }, { status: 500 });
      }
    }

    const proofPath = uploadedPath ?? existingSubmission?.proof_storage_path ?? null;
    const values = {
      reference: normalizedReference,
      payer_name: parsed.data.payerName,
      proof_storage_path: proofPath,
      note: parsed.data.note || null,
      proof_meta: {
        payerName: parsed.data.payerName,
        note: parsed.data.note || undefined,
      },
      status: "submitted",
      submitted_at: new Date().toISOString(),
    };

    const submissionResult = existingSubmission
      ? await admin.from("payment_submissions").update(values).eq("id", existingSubmission.id)
      : await admin.from("payment_submissions").insert({
          ...values,
          invoice_id: invoice.id,
          user_id: user.id,
        });

    if (submissionResult.error) {
      if (uploadedPath) await admin.storage.from("payment-receipts").remove([uploadedPath]);
      return NextResponse.json({ error: submissionResult.error.message }, { status: 500 });
    }

    const { error: invoiceUpdateError } = await admin
      .from("invoices")
      .update({ status: "payment_submitted" })
      .eq("id", invoice.id)
      .eq("user_id", user.id);

    if (invoiceUpdateError) {
      return NextResponse.json({ error: invoiceUpdateError.message }, { status: 500 });
    }

    if (uploadedPath && existingSubmission?.proof_storage_path) {
      await admin.storage.from("payment-receipts").remove([existingSubmission.proof_storage_path]);
    }

    await admin.from("billing_audit_logs").insert({
      invoice_id: invoice.id,
      submission_id: existingSubmission?.id ?? null,
      actor_id: user.id,
      action: existingSubmission ? "payment_resubmitted" : "payment_submitted",
      metadata: { reference: normalizedReference },
    });

    return NextResponse.json({ ok: true, status: "payment_submitted" });
  } catch (error) {
    if (uploadedPath) {
      try {
        await createSupabaseAdminClient().storage.from("payment-receipts").remove([uploadedPath]);
      } catch {
        // Best-effort cleanup; the bucket is private even if cleanup fails.
      }
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to submit payment." },
      { status: 500 },
    );
  }
}
