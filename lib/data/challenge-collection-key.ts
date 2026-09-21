import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { memo } from "@/lib/http/memo";
import { devCollectionKey } from "@/lib/dev-collection-key";

/**
 * A creator's collection key, memoized per teacher.
 *
 * It is one row on `teachers` that effectively never changes, and every single
 * challenge call — start, refresh, each progress tick, submit — was fetching it
 * again. TTL is short because a creator whose collection is provisioned mid-
 * session must not be told for an hour that it is "not ready yet".
 *
 * Its own module so the per-student challenge code and the global challenge
 * pool (`lib/data/challenge-pool.ts`) share one memo without importing each
 * other.
 */
export function collectionKeyForTeacher(teacherId: string): Promise<string> {
  // Local dev against a local api-service: the key in Supabase was issued by
  // production and means nothing to it. See lib/dev-collection-key.ts — this is
  // "" in every build that ships, so the memo below is the only real path.
  const devKey = devCollectionKey();
  if (devKey) return Promise.resolve(devKey);
  return memo(
    `challenge:collection-sk:${teacherId}`,
    async () => {
      const { data, error } = await createSupabaseAdminClient()
        .from("teachers")
        .select("collection_sk")
        .eq("id", teacherId)
        .maybeSingle();
      if (error) throw error;
      return String(data?.collection_sk || "").trim();
    },
    { ttlSeconds: 60, staleSeconds: 240 },
  );
}
