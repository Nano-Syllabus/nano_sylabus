import { NextResponse } from "next/server";
import { listAdminPaymentSubmissions } from "@/lib/data/billing";
import { getAdminScope, scopeSite } from "@/lib/admin-scope";
import { isAdminRole } from "@/lib/admin-role";
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

    const { data: profile } = await supabase
      .from("student_profiles")
      .select("role")
      .eq("user_id", user.id)
      .maybeSingle();

    if (!isAdminRole(profile?.role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const scope = await getAdminScope({
      userId: user.id,
      role: profile!.role as "admin" | "super_admin",
    });
    const submissions = await listAdminPaymentSubmissions({ onlySite: scopeSite(scope) });
    return NextResponse.json({ submissions });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load payment submissions." },
      { status: 500 },
    );
  }
}
