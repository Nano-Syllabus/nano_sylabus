import { adminAnalyticsSchema } from "@/lib/admin-analytics";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export class AnalyticsUnavailableError extends Error {
  constructor(public readonly setupRequired: boolean) {
    super(setupRequired
      ? "Analytics database setup is required. Apply migration 20260828120000_platform_admin_analytics.sql, then retry."
      : "Analytics could not be verified. No replacement numbers are being shown. Please retry.");
  }
}

export async function getAdminAnalytics() {
  const { data, error } = await createSupabaseAdminClient()
    .rpc("get_platform_admin_analytics")
    .abortSignal(AbortSignal.timeout(15_000));
  if (error) {
    throw new AnalyticsUnavailableError(["PGRST202", "PGRST205", "42P01", "42883"].includes(error.code));
  }
  const parsed = adminAnalyticsSchema.safeParse(data);
  if (!parsed.success) throw new AnalyticsUnavailableError(false);
  return parsed.data;
}
