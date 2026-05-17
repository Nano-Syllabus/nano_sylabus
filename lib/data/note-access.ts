import { createSupabaseServerClient } from "@/lib/supabase/server";

export type NotePlanTier = "free" | "basic" | "pro" | "unlimited";

export interface NoteAccessPolicy {
  tier: NotePlanTier;
  maxNotes: number;
  revisionEnabled: boolean;
}

const NOTE_LIMIT_BY_TIER: Record<NotePlanTier, number> = {
  free: 50,
  basic: 200,
  pro: 500,
  unlimited: Number.POSITIVE_INFINITY,
};

function resolveTierFromPlan(plan: { slug?: string | null; name?: string | null } | null): NotePlanTier {
  if (!plan) return "free";
  const source = `${plan.slug ?? ""} ${plan.name ?? ""}`.toLowerCase();
  if (source.includes("unlimited")) return "unlimited";
  if (source.includes("pro")) return "pro";
  if (source.includes("basic")) return "basic";
  return "free";
}

export async function getNoteAccessPolicy(userId: string): Promise<NoteAccessPolicy> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("user_subscriptions")
    .select("status, starts_at, created_at, subscription_plans(slug, name)")
    .eq("user_id", userId)
    .eq("status", "active")
    .order("starts_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;

  const plan = (data as any)?.subscription_plans ?? null;
  const tier = resolveTierFromPlan(plan);
  return {
    tier,
    maxNotes: NOTE_LIMIT_BY_TIER[tier],
    revisionEnabled: tier !== "free",
  };
}
