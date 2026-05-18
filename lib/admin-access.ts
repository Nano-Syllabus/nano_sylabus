import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function assertAdminRequest() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "Unauthorized" as const, status: 401 };
  }

  const { data: profile } = await supabase
    .from("student_profiles")
    .select("role")
    .eq("user_id", user.id)
    .maybeSingle();

  if (profile?.role !== "admin") {
    return { error: "Forbidden" as const, status: 403 };
  }

  return { userId: user.id };
}
