import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isAdminRole } from "@/lib/admin-role";
import type { AppRole } from "@/lib/types";

type AdminRole = Extract<AppRole, "admin" | "super_admin">;

export async function assertAdminRequest() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "Unauthorized" as const, status: 401 };
  }

  const { data: profile, error } = await supabase
    .from("student_profiles")
    .select("role")
    .eq("user_id", user.id)
    .maybeSingle();

  if (error) {
    return { error: "Unable to verify admin access" as const, status: 503 };
  }

  if (!isAdminRole(profile?.role)) {
    return { error: "Forbidden" as const, status: 403 };
  }

  return { userId: user.id, role: profile?.role as AdminRole };
}

export async function assertSuperAdminRequest() {
  const access = await assertAdminRequest();
  if ("error" in access) return access;

  if (access.role !== "super_admin") {
    return { error: "Super admin access is required." as const, status: 403 };
  }

  return access;
}
