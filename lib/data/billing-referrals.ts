import type { SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export type BillingReferralLink = {
  id: string;
  code: string;
  active: boolean;
  referrerName: string;
  claimCount: number;
  createdAt: string;
};

function normalizeCode(value: string) {
  return value.trim().toUpperCase();
}

export async function getBillingReferralByCode(
  code: string,
  admin: SupabaseClient = createSupabaseAdminClient(),
) {
  const normalized = normalizeCode(code);
  if (!/^[A-Z0-9]{6,32}$/.test(normalized)) return null;

  const { data: link, error } = await admin
    .from("billing_referral_links")
    .select("id,code,referrer_id,active,created_at")
    .eq("code", normalized)
    .maybeSingle();
  if (error) throw error;
  if (!link) return null;

  const [profileResult, countResult] = await Promise.all([
    admin
      .from("student_profiles")
      .select("full_name")
      .eq("user_id", link.referrer_id)
      .maybeSingle(),
    admin
      .from("billing_referral_claims")
      .select("id", { count: "exact", head: true })
      .eq("link_id", link.id),
  ]);
  if (profileResult.error) throw profileResult.error;
  if (countResult.error) throw countResult.error;

  return {
    id: String(link.id),
    code: String(link.code),
    active: Boolean(link.active),
    referrerName: String(profileResult.data?.full_name || "A NanoSyllabus student"),
    claimCount: countResult.count ?? 0,
    createdAt: String(link.created_at),
  } satisfies BillingReferralLink;
}

export function referralLinkForCode(code: string, origin: string) {
  return `${origin.replace(/\/+$/, "")}/r/${encodeURIComponent(normalizeCode(code))}`;
}
