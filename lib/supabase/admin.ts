import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseServiceRoleEnv } from "@/lib/env";

// The service-role client holds no per-request state (`persistSession: false`),
// so one instance is reused for the process instead of rebuilding the whole
// PostgREST/auth/storage stack on every helper call.
let adminClient: SupabaseClient | undefined;

export function createSupabaseAdminClient() {
  if (adminClient) return adminClient;
  const { url, serviceRoleKey } = getSupabaseServiceRoleEnv();
  adminClient = createClient(url, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
  return adminClient;
}
