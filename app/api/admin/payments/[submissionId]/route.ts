import { NextResponse } from "next/server";
import { z } from "zod";
import { isAdminRole } from "@/lib/admin-role";
import { getAdminPaymentSubmissionDetail } from "@/lib/data/billing";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const actionSchema = z.object({
  action: z.enum(["approve", "reject"]),
});

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ submissionId: string }> },
) {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: profile } = await supabase
      .from("student_profiles")
      .select("role")
      .eq("user_id", user.id)
      .maybeSingle();

    if (!isAdminRole(profile?.role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { submissionId } = await params;
    const detail = await getAdminPaymentSubmissionDetail(submissionId);

    if (!detail) {
      return NextResponse.json({ error: "Payment submission not found." }, { status: 404 });
    }

    return NextResponse.json({ submission: detail });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load payment detail." },
      { status: 500 },
    );
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ submissionId: string }> },
) {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: profile } = await supabase
      .from("student_profiles")
      .select("role")
      .eq("user_id", user.id)
      .maybeSingle();

    if (!isAdminRole(profile?.role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { submissionId } = await params;
    const payload = actionSchema.parse(await request.json());

    const { error } =
      payload.action === "approve"
        ? await supabase.rpc("approve_payment_submission", {
            target_submission_id: submissionId,
          })
        : await supabase.rpc("reject_payment_submission", {
            target_submission_id: submissionId,
          });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to update payment." },
      { status: 500 },
    );
  }
}
