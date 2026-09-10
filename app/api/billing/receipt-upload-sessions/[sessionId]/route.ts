import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getVerifiedUser } from "@/lib/supabase/verified-user";

export const runtime = "nodejs";

const sessionIdSchema = z.string().uuid();

export async function GET(
  _request: Request,
  context: { params: Promise<{ sessionId: string }> },
) {
  try {
    const supabase = await createSupabaseServerClient();
    const { data: { user } } = await getVerifiedUser(supabase);
    if (!user) return NextResponse.json({ error: "Sign in to check this upload." }, { status: 401 });

    const { sessionId } = await context.params;
    const parsedId = sessionIdSchema.safeParse(sessionId);
    if (!parsedId.success) return NextResponse.json({ error: "Upload session not found." }, { status: 404 });

    const admin = createSupabaseAdminClient();
    const { data: session, error } = await admin
      .from("billing_receipt_upload_sessions")
      .select("id, status, original_file_name, expires_at, uploaded_at")
      .eq("id", parsedId.data)
      .eq("user_id", user.id)
      .maybeSingle();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!session) return NextResponse.json({ error: "Upload session not found." }, { status: 404 });

    const expired = new Date(session.expires_at).getTime() <= Date.now();
    if (expired && session.status === "pending") {
      await admin.from("billing_receipt_upload_sessions").update({ status: "expired" }).eq("id", session.id);
    }

    return NextResponse.json({
      status: expired && session.status === "pending" ? "expired" : session.status,
      fileName: session.original_file_name,
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
