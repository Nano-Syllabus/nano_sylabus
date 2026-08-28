import { createSupabaseAdminClient } from "@/lib/supabase/admin";

/** One row per settled outbound call, including retries and failed calls.
 * Never records keys, paths, prompts, answers, or student identifiers.
 * Logging failure must not discard a student's answer or upstream result.
 */
export async function trackApiRequest<T>(
  service: "tenant" | "collection",
  operation: () => Promise<T>,
): Promise<T> {
  const started = Date.now();
  let succeeded = false;
  try {
    const result = await operation();
    succeeded = true;
    return result;
  } finally {
    try {
      const { error } = await createSupabaseAdminClient()
        .from("platform_api_requests")
        .insert({
          service,
          started_at: new Date(started).toISOString(),
          succeeded,
          duration_ms: Math.max(0, Math.min(2147483647, Date.now() - started)),
        })
        .abortSignal(AbortSignal.timeout(750));
      if (error) throw new Error("Request log unavailable");
    } catch {
      // Do not log the original exception: it may contain a request secret.
      console.warn("[analytics] Outbound request was not recorded; request totals may be incomplete.");
    }
  }
}
