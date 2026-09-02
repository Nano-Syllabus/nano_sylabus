import type { SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export type CommunityLearningProfile = {
  xp: number;
  joinedCommunities: number;
  completedChallenges: number;
  topics: { strong: number; developing: number; weak: number; notAttempted: number };
  recentXp: Array<{ id: string; points: number; reason: string; createdAt: string }>;
};

export async function getCommunityLearningProfile(
  userId: string,
  admin: SupabaseClient = createSupabaseAdminClient(),
): Promise<CommunityLearningProfile> {
  const [xpResult, communitiesResult, challengesResult, masteryResult] = await Promise.all([
    admin
      .from("student_xp_ledger")
      .select("id,points,reason,created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false }),
    admin
      .from("community_memberships")
      .select("community_id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("status", "active"),
    admin
      .from("student_challenges")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("status", "completed"),
    admin.from("student_topic_mastery").select("status").eq("user_id", userId),
  ]);
  for (const result of [xpResult, communitiesResult, challengesResult, masteryResult]) {
    if (result.error) throw result.error;
  }
  const topics = { strong: 0, developing: 0, weak: 0, notAttempted: 0 };
  for (const row of masteryResult.data || []) {
    if (row.status === "strong") topics.strong += 1;
    else if (row.status === "developing") topics.developing += 1;
    else if (row.status === "weak") topics.weak += 1;
    else topics.notAttempted += 1;
  }
  const xpRows = xpResult.data || [];
  return {
    xp: xpRows.reduce((sum, row) => sum + Number(row.points || 0), 0),
    joinedCommunities: communitiesResult.count || 0,
    completedChallenges: challengesResult.count || 0,
    topics,
    recentXp: xpRows.slice(0, 8).map((row) => ({
      id: String(row.id),
      points: Number(row.points) || 0,
      reason: String(row.reason || "Learning activity"),
      createdAt: String(row.created_at),
    })),
  };
}
