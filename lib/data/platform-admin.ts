import { cache } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { isAdminRole } from "@/lib/admin-role";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

/**
 * WHOEVER CAN SEE PLATFORM ANALYTICS IS ALWAYS ON PRO (user, 2026-09-28).
 *
 * `admin` and `super_admin` — the roles the sidebar shows "Platform analytics"
 * to. The accounts that run the platform should never meet a free-plan limit
 * while checking it. This is decided by role, not by a subscription row: a made-up Pro
 * subscription would be counted in the very platform analytics this account
 * reads. Every place that decides a plan asks here first.
 *
 * Once per request per user (`cache`): several of those checks run in one render.
 */
export const isPlatformAdmin = cache(async function isPlatformAdmin(
  userId: string,
  admin?: SupabaseClient,
): Promise<boolean> {
  if (!userId) return false;
  // A failed lookup is "not known to be an admin": the plan check it sits
  // in then answers from subscriptions exactly as before.
  try {
    const { data, error } = await (admin ?? createSupabaseAdminClient())
      .from("student_profiles")
      .select("role")
      .eq("user_id", userId)
      .maybeSingle();
    return !error && isAdminRole(data?.role);
  } catch {
    return false;
  }
});
