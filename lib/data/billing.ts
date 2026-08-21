import { STARTER_CREDITS } from "@/lib/billing";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type {
  AdminPaymentSubmissionDetail,
  AdminPaymentSubmissionSummary,
  BillingInvoiceSummary,
  CreditsLedgerEntry,
  Invoice,
  PaymentSubmission,
  PaymentMethodConfig,
  StudentBillingOverview,
  SubscriptionPlan,
  UserSubscription,
} from "@/lib/types";

function normalizePlan(row: any): SubscriptionPlan {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    credits: row.credits,
    price: row.price,
    currency: row.currency,
    billingType: row.billing_type,
    productType: row.product_type ?? "credit_pack",
    seatLimit: row.seat_limit ?? 1,
    isUnlimited: row.is_unlimited ?? false,
    features: Array.isArray(row.features) ? row.features.filter((item: unknown): item is string => typeof item === "string") : [],
    isActive: row.is_active,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function normalizeInvoice(row: any): Invoice {
  return {
    id: row.id,
    userId: row.user_id,
    planId: row.plan_id,
    status: row.status,
    amount: row.amount,
    currency: row.currency,
    paymentMethod: row.payment_method,
    invoiceCode: row.invoice_code ?? `NS-${String(row.id).replaceAll("-", "").slice(0, 10).toUpperCase()}`,
    subtotal: row.subtotal ?? row.amount,
    discountAmount: row.discount_amount ?? 0,
    couponId: row.coupon_id ?? null,
    expiresAt: row.expires_at ?? row.created_at,
    billingPeriodStart: row.billing_period_start ?? null,
    billingPeriodEnd: row.billing_period_end ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function normalizePaymentSubmission(row: any): PaymentSubmission {
  return {
    id: row.id,
    invoiceId: row.invoice_id,
    userId: row.user_id,
    reference: row.reference,
    proofMeta: row.proof_meta ?? null,
    payerName: row.payer_name ?? row.proof_meta?.payerName ?? null,
    proofStoragePath: row.proof_storage_path ?? null,
    note: row.note ?? row.proof_meta?.note ?? null,
    reviewNote: row.review_note ?? null,
    status: row.status,
    submittedAt: row.submitted_at,
    reviewedAt: row.reviewed_at,
    reviewedBy: row.reviewed_by,
  };
}

function normalizePaymentMethodConfig(row: any): PaymentMethodConfig {
  return {
    id: row.id,
    paymentMethod: row.payment_method,
    displayName: row.display_name,
    bankName: row.bank_name ?? null,
    accountName: row.account_name,
    accountNumber: row.account_number ?? null,
    qrImageUrl: row.qr_image_url,
    instructions: row.instructions ?? null,
  };
}

function normalizeSubscription(row: any): UserSubscription {
  return {
    id: row.id,
    userId: row.user_id,
    planId: row.plan_id,
    invoiceId: row.invoice_id,
    status: row.status,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    createdAt: row.created_at,
  };
}

function normalizeLedgerEntry(row: any): CreditsLedgerEntry {
  return {
    id: row.id,
    userId: row.user_id,
    type: row.type,
    amount: row.amount,
    balanceAfter: row.balance_after,
    referenceType: row.reference_type,
    referenceId: row.reference_id,
    description: row.description,
    createdAt: row.created_at,
  };
}

export async function getLatestCreditLedgerEntry(userId: string) {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("credits_ledger")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return data ? normalizeLedgerEntry(data) : null;
}

export async function getCreditBalanceForUser(userId: string) {
  const latest = await getLatestCreditLedgerEntry(userId);
  return latest?.balanceAfter ?? 0;
}

export async function ensureStarterCreditsForUser(userId: string) {
  const supabase = await createSupabaseServerClient();
  const { data: existing, error: existingError } = await supabase
    .from("credits_ledger")
    .select("balance_after")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existingError) throw existingError;
  if (existing) return existing.balance_after ?? 0;

  return grantStarterCredits(userId);
}

/**
 * Writes the starter grant for an account that has no ledger row yet. Split out
 * of `ensureStarterCreditsForUser` so callers that already read the latest
 * ledger row (the auth loader does) can skip the duplicate lookup.
 */
export async function grantStarterCredits(userId: string) {
  const supabase = await createSupabaseServerClient();

  const { error: insertError } = await supabase.from("credits_ledger").insert({
    user_id: userId,
    type: "grant",
    amount: STARTER_CREDITS,
    balance_after: STARTER_CREDITS,
    reference_type: "starter_grant",
    reference_id: userId,
    description: "Starter credits for new student account",
  });

  if (insertError && insertError.code !== "23505") {
    throw insertError;
  }

  const { data: latest, error: latestError } = await supabase
    .from("credits_ledger")
    .select("balance_after")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (latestError) throw latestError;
  return latest?.balance_after ?? STARTER_CREDITS;
}

export async function listSubscriptionPlans() {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("subscription_plans")
    .select("*")
    .eq("is_active", true)
    .order("price", { ascending: true });

  if (error) throw error;
  return (data ?? []).map(normalizePlan);
}

export async function getActiveManualPaymentConfig() {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("payment_method_configs")
    .select("*")
    .eq("payment_method", "bank_transfer")
    .eq("is_active", true)
    .maybeSingle();

  if (error) throw error;
  return data ? normalizePaymentMethodConfig(data) : null;
}

export async function hasUnlimitedSubscription(userId: string) {
  const supabase = await createSupabaseServerClient();
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from("user_subscriptions")
    .select("ends_at, subscription_plans!inner(is_unlimited)")
    .eq("user_id", userId)
    .eq("status", "active")
    .eq("subscription_plans.is_unlimited", true)
    .or(`ends_at.is.null,ends_at.gt.${now}`)
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return Boolean(data);
}

export async function listUserSubscriptions(userId: string) {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("user_subscriptions")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (error) throw error;
  return (data ?? []).map(normalizeSubscription);
}

export async function listInvoicesForUser(userId: string) {
  const supabase = await createSupabaseServerClient();
  const { data: invoiceRows, error: invoiceError } = await supabase
    .from("invoices")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (invoiceError) throw invoiceError;
  if (!invoiceRows || invoiceRows.length === 0) return [] as BillingInvoiceSummary[];

  const planIds = Array.from(new Set(invoiceRows.map((invoice) => invoice.plan_id)));
  const invoiceIds = invoiceRows.map((invoice) => invoice.id);

  const { data: planRows, error: planError } = await supabase
    .from("subscription_plans")
    .select("*")
    .in("id", planIds);

  if (planError) throw planError;

  const { data: paymentRows, error: paymentError } = await supabase
    .from("payment_submissions")
    .select("*")
    .in("invoice_id", invoiceIds);

  if (paymentError) throw paymentError;

  const plansById = new Map((planRows ?? []).map((plan) => [plan.id, normalizePlan(plan)]));
  const paymentByInvoiceId = new Map(
    (paymentRows ?? []).map((submission) => [submission.invoice_id, normalizePaymentSubmission(submission)]),
  );

  return invoiceRows.map((invoice) => ({
    ...normalizeInvoice(invoice),
    plan: plansById.get(invoice.plan_id)!,
    paymentSubmission: paymentByInvoiceId.get(invoice.id) ?? null,
  }));
}

export async function getStudentBillingOverview(userId: string): Promise<StudentBillingOverview> {
  const [balance, plans, invoices, subscriptions] = await Promise.all([
    ensureStarterCreditsForUser(userId),
    listSubscriptionPlans(),
    listInvoicesForUser(userId),
    listUserSubscriptions(userId),
  ]);

  return {
    balance,
    plans,
    invoices,
    subscriptions,
  };
}

export async function listAdminPaymentSubmissions() {
  const supabase = await createSupabaseServerClient();
  const { data: submissionRows, error: submissionError } = await supabase
    .from("payment_submissions")
    .select("*")
    .order("submitted_at", { ascending: false });

  if (submissionError) throw submissionError;
  if (!submissionRows || submissionRows.length === 0) return [] as AdminPaymentSubmissionSummary[];

  const invoiceIds = submissionRows.map((submission) => submission.invoice_id);
  const userIds = Array.from(new Set(submissionRows.map((submission) => submission.user_id)));

  const { data: invoiceRows, error: invoiceError } = await supabase
    .from("invoices")
    .select("*")
    .in("id", invoiceIds);

  if (invoiceError) throw invoiceError;

  const planIds = Array.from(new Set((invoiceRows ?? []).map((invoice) => invoice.plan_id)));
  const { data: planRows, error: planError } = await supabase
    .from("subscription_plans")
    .select("*")
    .in("id", planIds);

  if (planError) throw planError;

  const { data: profileRows, error: profileError } = await supabase
    .from("student_profiles")
    .select("user_id, full_name")
    .in("user_id", userIds);

  if (profileError) throw profileError;

  const invoicesById = new Map((invoiceRows ?? []).map((invoice) => [invoice.id, normalizeInvoice(invoice)]));
  const plansById = new Map((planRows ?? []).map((plan) => [plan.id, normalizePlan(plan)]));
  const namesByUserId = new Map((profileRows ?? []).map((profile) => [profile.user_id, profile.full_name]));

  return submissionRows.map((submission) => {
    const invoice = invoicesById.get(submission.invoice_id)!;
    const plan = plansById.get(invoice.planId)!;

    return {
      id: submission.id,
      invoiceId: invoice.id,
      userId: submission.user_id,
      studentName: namesByUserId.get(submission.user_id) || "Student",
      planName: plan.name,
      planCredits: plan.credits,
      amount: invoice.amount,
      currency: invoice.currency,
      paymentMethod: invoice.paymentMethod,
      reference: submission.reference,
      status: submission.status,
      invoiceStatus: invoice.status,
      submittedAt: submission.submitted_at,
    } satisfies AdminPaymentSubmissionSummary;
  });
}

export async function getAdminPaymentSubmissionDetail(submissionId: string) {
  const supabase = await createSupabaseServerClient();
  const { data: submissionRow, error: submissionError } = await supabase
    .from("payment_submissions")
    .select("*")
    .eq("id", submissionId)
    .maybeSingle();

  if (submissionError) throw submissionError;
  if (!submissionRow) return null;

  const { data: invoiceRow, error: invoiceError } = await supabase
    .from("invoices")
    .select("*")
    .eq("id", submissionRow.invoice_id)
    .maybeSingle();

  if (invoiceError) throw invoiceError;
  if (!invoiceRow) return null;

  const { data: planRow, error: planError } = await supabase
    .from("subscription_plans")
    .select("*")
    .eq("id", invoiceRow.plan_id)
    .maybeSingle();

  if (planError) throw planError;
  if (!planRow) return null;

  const { data: profileRow, error: profileError } = await supabase
    .from("student_profiles")
    .select("user_id, full_name")
    .eq("user_id", submissionRow.user_id)
    .maybeSingle();

  if (profileError) throw profileError;

  const invoice = normalizeInvoice(invoiceRow);
  const plan = normalizePlan(planRow);
  const proofMeta = submissionRow.proof_meta ?? {};
  let receiptUrl: string | null = null;
  if (typeof submissionRow.proof_storage_path === "string" && submissionRow.proof_storage_path) {
    const admin = createSupabaseAdminClient();
    const { data: signedReceipt } = await admin.storage
      .from("payment-receipts")
      .createSignedUrl(submissionRow.proof_storage_path, 15 * 60);
    receiptUrl = signedReceipt?.signedUrl ?? null;
  }

  return {
    id: submissionRow.id,
    invoiceId: invoice.id,
    userId: submissionRow.user_id,
    studentName: profileRow?.full_name || "Student",
    planName: plan.name,
    planCredits: plan.credits,
    amount: invoice.amount,
    currency: invoice.currency,
    paymentMethod: invoice.paymentMethod,
    reference: submissionRow.reference,
    status: submissionRow.status,
    invoiceStatus: invoice.status,
    submittedAt: submissionRow.submitted_at,
    screenshotUrl: receiptUrl ?? (typeof proofMeta.screenshotUrl === "string" ? proofMeta.screenshotUrl : null),
    payerName: submissionRow.payer_name ?? (typeof proofMeta.payerName === "string" ? proofMeta.payerName : null),
    note: submissionRow.note ?? (typeof proofMeta.note === "string" ? proofMeta.note : null),
    reviewedAt: submissionRow.reviewed_at,
    reviewedBy: submissionRow.reviewed_by,
  } satisfies AdminPaymentSubmissionDetail;
}
