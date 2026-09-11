import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getVerifiedUser } from "@/lib/supabase/verified-user";

export const runtime = "nodejs";

const sessionIdSchema = z.string().uuid();

export async function GET(_request: Request, context: { params: Promise<{ sessionId: string }> }) {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await getVerifiedUser(supabase);
    if (!user)
      return NextResponse.json({ error: "Sign in to check this upload." }, { status: 401 });

    const { sessionId } = await context.params;
    const parsedId = sessionIdSchema.safeParse(sessionId);
    if (!parsedId.success)
      return NextResponse.json({ error: "Upload session not found." }, { status: 404 });

    const admin = createSupabaseAdminClient();
    const { data: session, error } = await admin
      .from("billing_receipt_upload_sessions")
      .select(
        "id, status, proof_storage_path, original_file_name, mime_type, expires_at, uploaded_at",
      )
      .eq("id", parsedId.data)
      .eq("user_id", user.id)
      .maybeSingle();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!session) return NextResponse.json({ error: "Upload session not found." }, { status: 404 });

    const expired = new Date(session.expires_at).getTime() <= Date.now();
    if (expired && session.status === "pending") {
      await admin
        .from("billing_receipt_upload_sessions")
        .update({ status: "expired" })
        .eq("id", session.id);
    }

    let previewUrl: string | null = null;
    if (
      session.status === "uploaded" &&
      session.proof_storage_path &&
      session.mime_type?.startsWith("image/")
    ) {
      const { data: signedPreview } = await admin.storage
        .from("payment-receipts")
        .createSignedUrl(session.proof_storage_path, 5 * 60);
      previewUrl = signedPreview?.signedUrl ?? null;
    }

    return NextResponse.json({
      status: expired && session.status === "pending" ? "expired" : session.status,
      fileName: session.original_file_name,
      mimeType: session.mime_type,
      previewUrl,
      uploadedAt: session.uploaded_at,
      expiresAt: session.expires_at,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not check the phone upload." },
      { status: 500 },
    );
  }
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ sessionId: string }> },
) {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await getVerifiedUser(supabase);
    if (!user)
      return NextResponse.json({ error: "Sign in to remove this upload." }, { status: 401 });

    const { sessionId } = await context.params;
    const parsedId = sessionIdSchema.safeParse(sessionId);
    if (!parsedId.success)
      return NextResponse.json({ error: "Upload session not found." }, { status: 404 });

    const admin = createSupabaseAdminClient();
    const { data: session, error } = await admin
      .from("billing_receipt_upload_sessions")
      .select("id, status, proof_storage_path, expires_at")
      .eq("id", parsedId.data)
      .eq("user_id", user.id)
      .maybeSingle();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!session) return NextResponse.json({ error: "Upload session not found." }, { status: 404 });
    if (session.status === "consumed") {
      return NextResponse.json(
        { error: "This receipt is already attached to the payment." },
        { status: 409 },
      );
    }

    const expired = new Date(session.expires_at).getTime() <= Date.now();
    if (expired || session.status === "expired") {
      return NextResponse.json(
        { error: "This upload link has expired. Create a new QR." },
        { status: 410 },
      );
    }

    const { data: cleared, error: clearError } = await admin
      .from("billing_receipt_upload_sessions")
      .update({
        status: "pending",
        proof_storage_path: null,
        original_file_name: null,
        mime_type: null,
        uploaded_at: null,
      })
      .eq("id", session.id)
      .eq("user_id", user.id)
      .in("status", ["pending", "uploaded"])
      .gt("expires_at", new Date().toISOString())
      .select("id")
      .maybeSingle();

    if (clearError) return NextResponse.json({ error: clearError.message }, { status: 500 });
    if (!cleared) {
      return NextResponse.json(
        { error: "This upload is no longer available. Create a new QR." },
        { status: 409 },
      );
    }

    if (session.proof_storage_path) {
      await admin.storage.from("payment-receipts").remove([session.proof_storage_path]);
    }

    return NextResponse.json({ ok: true, status: "pending" });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not remove this upload." },
      { status: 500 },
    );
  }
}
