import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type {
  AdminSubscriptionSummary,
  BillingType,
  SubscriptionPlan,
  UserSubscriptionStatus,
} from "@/lib/types";

interface SubscriptionPlanRow {
  id: string;
  name: string;
  slug: string;
  credits: number;
  price: number;
  currency: string;
  billing_type: BillingType;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

interface UserSubscriptionRow {
  id: string;
  user_id: string;
  plan_id: string;
  invoice_id: string | null;
  status: UserSubscriptionStatus;
  starts_at: string;
  ends_at: string | null;
  created_at: string;
}

export interface AdminSubscriptionPlanInput {
  name: string;
  slug: string;
  credits: number;
  price: number;
  currency: string;
  billingType: BillingType;
  isActive: boolean;
}

function normalizePlan(row: SubscriptionPlanRow): SubscriptionPlan {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    credits: row.credits,
    price: row.price,
    currency: row.currency,
    billingType: row.billing_type,
    isActive: row.is_active,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function slugify(input: string) {
  return input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "plan";
}

export function computeExtendedEndDate(
  currentEndsAt: string | null,
  extraDays: number,
  nowIso = new Date().toISOString(),
) {
  const base = currentEndsAt && new Date(currentEndsAt).getTime() > Date.now() ? new Date(currentEndsAt) : new Date(nowIso);
  base.setUTCDate(base.getUTCDate() + extraDays);
  return base.toISOString();
}

export async function listAdminSubscriptionPlans() {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("subscription_plans")
    .select("*")
    .order("price", { ascending: true });

  if (error) throw error;
  return ((data ?? []) as SubscriptionPlanRow[]).map(normalizePlan);
}

export async function createAdminSubscriptionPlan(input: AdminSubscriptionPlanInput) {
  const supabase = createSupabaseAdminClient();
  const payload = {
    name: input.name.trim(),
    slug: slugify(input.slug || input.name),
    credits: input.credits,
    price: input.price,
    currency: input.currency.trim().toUpperCase(),
    billing_type: input.billingType,
    is_active: input.isActive,
  };

  const { data, error } = await supabase
    .from("subscription_plans")
    .insert(payload)
    .select("*")
    .single();

  if (error || !data) throw error || new Error("Failed to create subscription plan.");
  return normalizePlan(data as SubscriptionPlanRow);
}

export async function updateAdminSubscriptionPlan(planId: string, input: AdminSubscriptionPlanInput) {
  const supabase = createSupabaseAdminClient();
  const payload = {
    name: input.name.trim(),
    slug: slugify(input.slug || input.name),
    credits: input.credits,
    price: input.price,
    currency: input.currency.trim().toUpperCase(),
    billing_type: input.billingType,
    is_active: input.isActive,
  };

  const { data, error } = await supabase
    .from("subscription_plans")
    .update(payload)
    .eq("id", planId)
    .select("*")
    .single();

  if (error || !data) throw error || new Error("Failed to update subscription plan.");
  return normalizePlan(data as SubscriptionPlanRow);
}

export async function listAdminSubscriptions() {
  const supabase = createSupabaseAdminClient();
  const { data: subscriptionRows, error: subscriptionError } = await supabase
    .from("user_subscriptions")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(300);

  if (subscriptionError) throw subscriptionError;
  if (!subscriptionRows?.length) return [] as AdminSubscriptionSummary[];

  const userIds = Array.from(new Set(subscriptionRows.map((row) => row.user_id)));
  const planIds = Array.from(new Set(subscriptionRows.map((row) => row.plan_id)));

  const [{ data: profileRows, error: profileError }, { data: authUsers, error: authError }, { data: planRows, error: planError }] =
    await Promise.all([
      supabase.from("student_profiles").select("user_id, full_name").in("user_id", userIds),
      supabase.auth.admin.listUsers(),
      supabase.from("subscription_plans").select("*").in("id", planIds),
    ]);

  if (profileError) throw profileError;
  if (authError) throw authError;
  if (planError) throw planError;

  const namesByUserId = new Map((profileRows ?? []).map((row) => [row.user_id, row.full_name ?? "Student"]));
  const emailsByUserId = new Map((authUsers.users ?? []).map((user) => [user.id, user.email ?? ""]));
  const plansById = new Map(((planRows ?? []) as SubscriptionPlanRow[]).map((row) => [row.id, normalizePlan(row)]));

  return (subscriptionRows as UserSubscriptionRow[]).map((row) => {
    const plan = plansById.get(row.plan_id)!;
    return {
      id: row.id,
      userId: row.user_id,
      planId: row.plan_id,
      invoiceId: row.invoice_id,
      status: row.status,
      startsAt: row.starts_at,
      endsAt: row.ends_at,
      createdAt: row.created_at,
      studentName: namesByUserId.get(row.user_id) ?? "Student",
      studentEmail: emailsByUserId.get(row.user_id) ?? "",
      planName: plan.name,
      planSlug: plan.slug,
      planCredits: plan.credits,
    } satisfies AdminSubscriptionSummary;
  });
}

export async function grantAdminSubscription(input: {
  userId: string;
  planId: string;
  startsAt?: string | null;
  endsAt?: string | null;
}) {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("user_subscriptions")
    .insert({
      user_id: input.userId,
      plan_id: input.planId,
      invoice_id: null,
      status: "active",
      starts_at: input.startsAt ?? new Date().toISOString(),
      ends_at: input.endsAt ?? null,
    })
    .select("id")
    .single();

  if (error || !data) throw error || new Error("Failed to grant subscription.");
  return data.id as string;
}

export async function cancelAdminSubscription(subscriptionId: string) {
  const supabase = createSupabaseAdminClient();
  const { error } = await supabase
    .from("user_subscriptions")
    .update({
      status: "cancelled",
      ends_at: new Date().toISOString(),
    })
    .eq("id", subscriptionId);

  if (error) throw error;
}

export async function extendAdminSubscription(subscriptionId: string, extraDays: number) {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("user_subscriptions")
    .select("ends_at")
    .eq("id", subscriptionId)
    .maybeSingle();

  if (error) throw error;
  if (!data) throw new Error("Subscription not found.");

  const nextEndsAt = computeExtendedEndDate(data.ends_at ?? null, extraDays);
  const { error: updateError } = await supabase
    .from("user_subscriptions")
    .update({
      status: "active",
      ends_at: nextEndsAt,
    })
    .eq("id", subscriptionId);

  if (updateError) throw updateError;
  return nextEndsAt;
}
