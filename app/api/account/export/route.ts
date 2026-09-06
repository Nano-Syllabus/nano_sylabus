import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getVerifiedUser } from "@/lib/supabase/verified-user";

export async function GET() {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await getVerifiedUser(supabase);

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const [profile, sessions, notes, invoices, payments, subscriptions, ledger] = await Promise.all([
      supabase.from("student_profiles").select("*").eq("user_id", user.id).maybeSingle(),
      supabase.from("chat_sessions").select("*, chat_messages(*)").eq("user_id", user.id),
      supabase.from("revision_notes").select("*").eq("user_id", user.id),
      supabase.from("invoices").select("*").eq("user_id", user.id),
      supabase.from("payment_submissions").select("*").eq("user_id", user.id),
      supabase.from("user_subscriptions").select("*").eq("user_id", user.id),
      supabase.from("credits_ledger").select("*").eq("user_id", user.id).order("created_at", {
        ascending: false,
      }),
    ]);

    const firstError =
      profile.error ||
      sessions.error ||
      notes.error ||
      invoices.error ||
      payments.error ||
      subscriptions.error ||
      ledger.error;

    if (firstError) {
      return NextResponse.json({ error: firstError.message }, { status: 500 });
    }

    return NextResponse.json({
      exportedAt: new Date().toISOString(),
      account: {
        id: user.id,
        email: user.email ?? "",
      },
      profile: profile.data,
      chatSessions: sessions.data ?? [],
      notes: notes.data ?? [],
      invoices: invoices.data ?? [],
      paymentSubmissions: payments.data ?? [],
      subscriptions: subscriptions.data ?? [],
      creditsLedger: ledger.data ?? [],
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to export account." },
      { status: 500 },
    );
  }
}
