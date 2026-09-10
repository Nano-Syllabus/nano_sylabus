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

async function hasActivePaidProSubscription(admin: SupabaseClient, userId: string) {
  const { data, error } = await admin
    .from("user_subscriptions")
    .select("id,subscription_plans!inner(product_type,is_unlimited,billing_type),invoices!inner(status)")
    .eq("user_id", userId)
    .eq("status", "active")
    .not("invoice_id", "is", null)
    .gt("ends_at", new Date().toISOString())
    .eq("subscription_plans.product_type", "individual")
    .eq("subscription_plans.is_unlimited", true)
    .eq("subscription_plans.billing_type", "monthly")
    .eq("invoices.status", "paid")
    .limit(1);

  if (error) throw error;
  return Boolean(data?.length);
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

  const [profileResult, countResult, referrerEligible] = await Promise.all([
    admin
      .from("student_profiles")
      .select("full_name")
      .eq("user_id", link.referrer_id)
      .maybeSingle(),
    admin
      .from("billing_referral_claims")
      .select("id", { count: "exact", head: true })
      .eq("link_id", link.id),
    hasActivePaidProSubscription(admin, String(link.referrer_id)),
  ]);
  if (profileResult.error) throw profileResult.error;
  if (countResult.error) throw countResult.error;

  return {
    id: String(link.id),
    code: String(link.code),
    active: Boolean(link.active) && referrerEligible,
    referrerName: String(profileResult.data?.full_name || "A NanoSyllabus student"),
    claimCount: countResult.count ?? 0,
    createdAt: String(link.created_at),
  } satisfies BillingReferralLink;
}

export function referralLinkForCode(code: string, origin: string) {
  return `${origin.replace(/\/+$/, "")}/r/${encodeURIComponent(normalizeCode(code))}`;
}
