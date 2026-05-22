import { isProfileComplete } from "@/lib/access";
import {
  normalizeBoard,
  normalizeBoardScore,
  normalizeCollege,
  normalizeFullName,
  normalizeGrade,
  normalizeSubjects,
  normalizeTargetGrade,
} from "@/lib/profile-normalization";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type {
  AdminListPage,
  AdminUserDetail,
  AdminUserSummary,
  AppRole,
  BillingInvoiceSummary,
  CreditsLedgerEntry,
  Invoice,
  StudentProfile,
  SubscriptionPlan,
  UserSubscription,
} from "@/lib/types";

interface ProfileRow {
  user_id: string;
  full_name: string | null;
  college: string | null;
  board: string | null;
  grade: string | null;
  board_score: string | null;
  subjects: string[] | null;
  target_grade: string | null;
  language_pref: "EN" | "RN" | null;
  role: AppRole | null;
  created_at: string;
  updated_at: string;
}

interface ChatSessionRow {
  id: string;
  user_id: string;
  title: string;
  updated_at: string;
}

function normalizeProfile(row: ProfileRow | null): StudentProfile | null {
  if (!row) return null;
  return {
    userId: row.user_id,
    fullName: normalizeFullName(row.full_name ?? ""),
    college: normalizeCollege(row.college ?? ""),
    board: normalizeBoard(row.board ?? ""),
    grade: normalizeGrade(row.grade ?? ""),
    boardScore: row.board_score ? normalizeBoardScore(row.board_score) : null,
    subjects: normalizeSubjects(row.subjects ?? []),
    targetGrade: normalizeTargetGrade(row.target_grade ?? ""),
    languagePref: row.language_pref ?? "EN",
    role: row.role ?? "student",
    createdAt: row.created_at,
    updatedAt: row.updated_at,
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

function normalizePlan(row: any): SubscriptionPlan {
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

function normalizeInvoice(row: any): Invoice {
  return {
    id: row.id,
    userId: row.user_id,
    planId: row.plan_id,
    status: row.status,
    amount: row.amount,
    currency: row.currency,
    paymentMethod: row.payment_method,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function createReferenceId(adminUserId: string) {
  return `admin:${adminUserId}:${Date.now()}`;
}

function computeAdjustedBalance(currentBalance: number, delta: number) {
  const nextBalance = currentBalance + delta;
  if (nextBalance < 0) {
    throw new Error("This adjustment would make the credit balance negative.");
  }
  return nextBalance;
}

const DEFAULT_ADMIN_PAGE_SIZE = 50;
const MAX_ADMIN_PAGE_SIZE = 100;

function normalizePage(value: number | undefined) {
  if (!value || Number.isNaN(value) || value < 1) return 1;
  return Math.floor(value);
}

function normalizePageSize(value: number | undefined) {
  if (!value || Number.isNaN(value) || value < 1) return DEFAULT_ADMIN_PAGE_SIZE;
  return Math.min(MAX_ADMIN_PAGE_SIZE, Math.floor(value));
}

function sortUsersByRecent(a: AdminUserSummary, b: AdminUserSummary) {
  return (b.lastSignInAt ?? b.createdAt).localeCompare(a.lastSignInAt ?? a.createdAt);
}

async function listAllAuthUsers() {
  const supabase = createSupabaseAdminClient();
  const users: any[] = [];
  let page = 1;
  const perPage = 200;

  while (true) {
    const { data: authData, error: authError } = await supabase.auth.admin.listUsers({
      page,
      perPage,
    });
    if (authError) throw authError;

    const batch = authData.users ?? [];
    users.push(...batch);
    if (batch.length < perPage) break;
    page += 1;
  }

  return users;
}

async function loadAdminUserAggregates(userIds: string[]) {
  if (!userIds.length) {
    return {
      profilesByUserId: new Map<string, StudentProfile>(),
      latestLedgerByUserId: new Map<string, CreditsLedgerEntry>(),
      activePlanByUserId: new Map<string, string>(),
      sessionCountByUserId: new Map<string, number>(),
      noteCountByUserId: new Map<string, number>(),
    };
  }

  const supabase = createSupabaseAdminClient();

  const [
    { data: profileRows, error: profileError },
    { data: ledgerRows, error: ledgerError },
    { data: subscriptionRows, error: subscriptionError },
    { data: planRows, error: planError },
    { data: sessionRows, error: sessionError },
    { data: noteRows, error: noteError },
  ] = await Promise.all([
    supabase.from("student_profiles").select("*").in("user_id", userIds),
    supabase
      .from("credits_ledger")
      .select("*")
      .in("user_id", userIds)
      .order("created_at", { ascending: false }),
    supabase
      .from("user_subscriptions")
      .select("*")
      .in("user_id", userIds)
      .eq("status", "active")
      .order("created_at", { ascending: false }),
    supabase.from("subscription_plans").select("*"),
    supabase.from("chat_sessions").select("id, user_id, title, updated_at").in("user_id", userIds),
    supabase.from("revision_notes").select("user_id").in("user_id", userIds),
  ]);

  if (profileError) throw profileError;
  if (ledgerError) throw ledgerError;
  if (subscriptionError) throw subscriptionError;
  if (planError) throw planError;
  if (sessionError) throw sessionError;
  if (noteError) throw noteError;

  const profilesByUserId = new Map(
    ((profileRows ?? []) as ProfileRow[])
      .map(normalizeProfile)
      .filter((profile): profile is StudentProfile => Boolean(profile))
      .map((profile) => [profile.userId, profile]),
  );

  const latestLedgerByUserId = new Map<string, CreditsLedgerEntry>();
  for (const row of ledgerRows ?? []) {
    const entry = normalizeLedgerEntry(row);
    if (!latestLedgerByUserId.has(entry.userId)) {
      latestLedgerByUserId.set(entry.userId, entry);
    }
  }

  const plansById = new Map((planRows ?? []).map((plan) => [plan.id, normalizePlan(plan)]));
  const activePlanByUserId = new Map<string, string>();
  for (const row of subscriptionRows ?? []) {
    const subscription = normalizeSubscription(row);
    if (!activePlanByUserId.has(subscription.userId)) {
      activePlanByUserId.set(subscription.userId, plansById.get(subscription.planId)?.name ?? "Active plan");
    }
  }

  const sessionCountByUserId = new Map<string, number>();
  for (const row of (sessionRows ?? []) as ChatSessionRow[]) {
    sessionCountByUserId.set(row.user_id, (sessionCountByUserId.get(row.user_id) ?? 0) + 1);
  }

  const noteCountByUserId = new Map<string, number>();
  for (const row of noteRows ?? []) {
    noteCountByUserId.set(row.user_id, (noteCountByUserId.get(row.user_id) ?? 0) + 1);
  }

  return { profilesByUserId, latestLedgerByUserId, activePlanByUserId, sessionCountByUserId, noteCountByUserId };
}

function buildUserSummaries(
  users: any[],
  aggregates: {
    profilesByUserId: Map<string, StudentProfile>;
    latestLedgerByUserId: Map<string, CreditsLedgerEntry>;
    activePlanByUserId: Map<string, string>;
    sessionCountByUserId: Map<string, number>;
    noteCountByUserId: Map<string, number>;
  },
) {
  const {
    profilesByUserId,
    latestLedgerByUserId,
    activePlanByUserId,
    sessionCountByUserId,
    noteCountByUserId,
  } = aggregates;

  return users.map((user) => {
    const profile = profilesByUserId.get(user.id) ?? null;
    const balance = latestLedgerByUserId.get(user.id)?.balanceAfter ?? 0;

    return {
      userId: user.id,
      email: user.email ?? "",
      fullName:
        profile?.fullName ||
        (typeof user.user_metadata?.full_name === "string" ? user.user_metadata.full_name : "") ||
        "Student",
      college: profile?.college ?? "",
      board: profile?.board ?? "",
      grade: profile?.grade ?? "",
      role: profile?.role ?? "student",
      onboarded: isProfileComplete(profile),
      creditBalance: balance,
      activePlanName: activePlanByUserId.get(user.id) ?? null,
      chatSessionCount: sessionCountByUserId.get(user.id) ?? 0,
      noteCount: noteCountByUserId.get(user.id) ?? 0,
      createdAt: user.created_at,
      lastSignInAt: user.last_sign_in_at ?? null,
    } satisfies AdminUserSummary;
  });
}

export async function listAdminUsers(filters?: {
  q?: string;
  page?: number;
  pageSize?: number;
}): Promise<AdminListPage<AdminUserSummary>> {
  const page = normalizePage(filters?.page);
  const pageSize = normalizePageSize(filters?.pageSize);
  const q = filters?.q?.trim().toLowerCase();

  if (q) {
    const users = await listAllAuthUsers();
    const aggregates = await loadAdminUserAggregates(users.map((user) => user.id));
    const filtered = buildUserSummaries(users, aggregates)
      .filter((user) =>
        [user.email, user.fullName, user.college, user.board, user.grade, user.activePlanName ?? ""]
          .join(" ")
          .toLowerCase()
          .includes(q),
      )
      .sort(sortUsersByRecent);

    const total = filtered.length;
    const from = (page - 1) * pageSize;
    const items = filtered.slice(from, from + pageSize);
    return {
      items,
      total,
      page,
      pageSize,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
    };
  }

  const supabase = createSupabaseAdminClient();
  const { data: authData, error: authError } = await supabase.auth.admin.listUsers({
    page,
    perPage: pageSize,
  });
  if (authError) throw authError;

  const users = authData.users ?? [];
  const totalFromApi = (authData as { total?: unknown }).total;
  const total = typeof totalFromApi === "number" ? totalFromApi : users.length;
  const aggregates = await loadAdminUserAggregates(users.map((user) => user.id));
  const items = buildUserSummaries(users, aggregates).sort(sortUsersByRecent);
  return {
    items,
    total,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  };
}

async function getAdminUserSummary(userId: string) {
  const supabase = createSupabaseAdminClient();
  const { data: authData, error: authError } = await supabase.auth.admin.getUserById(userId);
  if (authError || !authData.user) return null;
  const user = authData.user;
  const aggregates = await loadAdminUserAggregates([user.id]);
  return buildUserSummaries([user], aggregates)[0] ?? null;
}

export async function getAdminUserDetail(userId: string) {
  const supabase = createSupabaseAdminClient();
  const summary = await getAdminUserSummary(userId);
  if (!summary) return null;

  const [
    { data: profileRow, error: profileError },
    { data: ledgerRows, error: ledgerError },
    { data: subscriptionRows, error: subscriptionError },
    { data: invoiceRows, error: invoiceError },
    { data: sessionRows, error: sessionError },
    { data: planRows, error: planError },
  ] = await Promise.all([
    supabase.from("student_profiles").select("*").eq("user_id", userId).maybeSingle(),
    supabase.from("credits_ledger").select("*").eq("user_id", userId).order("created_at", { ascending: false }).limit(12),
    supabase.from("user_subscriptions").select("*").eq("user_id", userId).order("created_at", { ascending: false }).limit(6),
    supabase.from("invoices").select("*").eq("user_id", userId).order("created_at", { ascending: false }).limit(8),
    supabase.from("chat_sessions").select("id, title, updated_at").eq("user_id", userId).order("updated_at", { ascending: false }).limit(8),
    supabase.from("subscription_plans").select("*"),
  ]);

  if (profileError) throw profileError;
  if (ledgerError) throw ledgerError;
  if (subscriptionError) throw subscriptionError;
  if (invoiceError) throw invoiceError;
  if (sessionError) throw sessionError;
  if (planError) throw planError;

  const profile = normalizeProfile(profileRow as ProfileRow | null);
  const recentLedger = (ledgerRows ?? []).map(normalizeLedgerEntry);
  const recentSubscriptions = (subscriptionRows ?? []).map(normalizeSubscription);
  const plansById = new Map((planRows ?? []).map((plan) => [plan.id, normalizePlan(plan)]));

  const recentInvoices = (invoiceRows ?? []).map((row) => {
    const invoice = normalizeInvoice(row);
    return {
      ...invoice,
      plan: plansById.get(invoice.planId)!,
      paymentSubmission: null,
    } satisfies BillingInvoiceSummary;
  });

  return {
    ...summary,
    boardScore: profile?.boardScore ?? null,
    subjects: profile?.subjects ?? [],
    targetGrade: profile?.targetGrade ?? "",
    languagePref: profile?.languagePref ?? "EN",
    recentLedger,
    recentSubscriptions,
    recentInvoices,
    recentSessions: ((sessionRows ?? []) as Array<{ id: string; title: string; updated_at: string }>).map((row) => ({
      id: row.id,
      title: row.title,
      updatedAt: row.updated_at,
    })),
  } satisfies AdminUserDetail;
}

export async function updateAdminUserRole(userId: string, role: AppRole) {
  const supabase = createSupabaseAdminClient();
  const { error } = await supabase.from("student_profiles").upsert(
    {
      user_id: userId,
      role,
    },
    { onConflict: "user_id" },
  );
  if (error) throw error;
  return getAdminUserDetail(userId);
}

export async function bulkUpdateAdminUserRoles(input: {
  userIds: string[];
  role: AppRole;
}) {
  const userIds = [...new Set(input.userIds.map((id) => id.trim()).filter(Boolean))];
  if (!userIds.length) {
    throw new Error("No user ids were provided for bulk role update.");
  }

  const supabase = createSupabaseAdminClient();
  const payload = userIds.map((userId) => ({
    user_id: userId,
    role: input.role,
  }));

  const { error } = await supabase.from("student_profiles").upsert(payload, { onConflict: "user_id" });
  if (error) throw error;

  return {
    updatedCount: userIds.length,
    userIds,
  };
}

export async function adjustAdminUserCredits(input: {
  userId: string;
  amount: number;
  description: string;
  adminUserId: string;
}) {
  const supabase = createSupabaseAdminClient();
  const { data: latest, error: latestError } = await supabase
    .from("credits_ledger")
    .select("balance_after")
    .eq("user_id", input.userId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (latestError) throw latestError;

  const currentBalance = latest?.balance_after ?? 0;
  const nextBalance = computeAdjustedBalance(currentBalance, input.amount);

  const { error } = await supabase.from("credits_ledger").insert({
    user_id: input.userId,
    type: "adjustment",
    amount: input.amount,
    balance_after: nextBalance,
    reference_type: "manual_adjustment",
    reference_id: createReferenceId(input.adminUserId),
    description: input.description.trim() || "Manual admin credit adjustment",
  });

  if (error) throw error;
  return getAdminUserDetail(input.userId);
}

export { computeAdjustedBalance };
