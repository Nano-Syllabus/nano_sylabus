import { cookies } from "next/headers";
import { ACTIVE_COMMUNITY_COOKIE } from "@/lib/community-switch";
import { memo } from "@/lib/http/memo";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getVerifiedUser } from "@/lib/supabase/verified-user";
import { usageCommunityStorage as storage } from "@/lib/usage-community-context";

/**
 * WHICH COMMUNITY A BACKEND CALL IS SPENDING TOKENS FOR.
 *
 * The backend bills every AI call to the creator's collection, and a creator's
 * collection serves every faculty they run — so on its own the usage total
 * cannot say which faculty spent it. Student routes run inside
 * `withUsageCommunity`, which resolves the student's faculty once and keeps it
 * for the rest of the request; both backend clients then send it as
 * `X-NSDI-Community`, and the backend stores it on the usage row
 * (shared/usage.py in nano_syllabus_sample).
 *
 * A label for a breakdown, never an access decision: a missing or wrong value
 * costs an "untagged" row in the creator's usage card, nothing more.
 */
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/**
 * The faculty a student is studying in: their one active member community
 * (a student holds one at a time), else — for a creator studying their own
 * faculty, who has no member row — the faculty their switch cookie names.
 */
async function studyingCommunitySlug(userId: string): Promise<string> {
  const member = await memo(
    `usage-community:${userId}`,
    async () => {
      const { data, error } = await createSupabaseAdminClient()
        .from("community_memberships")
        .select("communities!inner(slug,status)")
        .eq("user_id", userId)
        .eq("role", "member")
        .eq("status", "active")
        .eq("communities.status", "active")
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      const community = (data as { communities?: { slug?: string } | { slug?: string }[] } | null)
        ?.communities;
      const row = Array.isArray(community) ? community[0] : community;
      return String(row?.slug || "");
    },
    { ttlSeconds: 60, staleSeconds: 300 },
  );
  if (member) return member;
  const cookie = (await cookies()).get(ACTIVE_COMMUNITY_COOKIE)?.value || "";
  return SLUG.test(cookie) ? cookie : "";
}

/** Run a student route handler with its backend calls tagged by community. */
export function withUsageCommunity<A extends unknown[], R>(
  handler: (...args: A) => Promise<R>,
): (...args: A) => Promise<R> {
  return async (...args: A) => {
    let slug = "";
    try {
      const {
        data: { user },
      } = await getVerifiedUser(await createSupabaseServerClient());
      if (user) slug = await studyingCommunitySlug(user.id);
    } catch {
      // Attribution must never fail the request it labels.
    }
    return slug ? storage.run(slug, () => handler(...args)) : handler(...args);
  };
}
