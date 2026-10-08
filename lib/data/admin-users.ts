import { isProfileComplete } from "@/lib/access";
import { isAdminRole } from "@/lib/admin-role";
import { listStudentAmbassadors } from "@/lib/data/student-ambassadors";
import { listAdminSites, type AdminSite, type FacultyRef } from "@/lib/data/faculty-lock";
import { monthlyRefreshAmount, monthlyRefreshReference } from "@/lib/billing";
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
    languagePref: row.language_pref ?? "RN",
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
    productType: row.product_type ?? "credit_pack",
    seatLimit: row.seat_limit ?? 1,
    isUnlimited: row.is_unlimited ?? false,
    features: Array.isArray(row.features)
      ? row.features.filter((item: unknown): item is string => typeof item === "string")
      : [],
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
    cancelAtPeriodEnd: row.cancel_at_period_end ?? false,
    cancelledAt: row.cancelled_at ?? null,
    cancellationReason: row.cancellation_reason ?? null,
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
    invoiceCode:
      row.invoice_code ?? `NS-${String(row.id).replaceAll("-", "").slice(0, 10).toUpperCase()}`,
    subtotal: row.subtotal ?? row.amount,
    expiresAt: row.expires_at ?? row.created_at,
    billingPeriodStart: row.billing_period_start ?? null,
    billingPeriodEnd: row.billing_period_end ?? null,
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
      activePlanByUserId: new Map<string, { name: string; endsAt: string | null }>(),
      sessionCountByUserId: new Map<string, number>(),
      noteCountByUserId: new Map<string, number>(),
      facultiesByUserId: new Map<string, FacultyRef[]>(),
      adminSiteByUserId: new Map<string, AdminSite>(),
      unlimitedPlanUserIds: new Set<string>(),
      refreshedUserIds: new Set<string>(),
      ambassadorEmails: new Set<string>(),
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
    { data: memberRows, error: memberError },
    { data: enrollmentRows, error: enrollmentError },
    adminSites,
    { data: refreshRows, error: refreshError },
    ambassadors,
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
    // A student's faculty: the one they joined, or the one an exam site pinned.
    supabase
      .from("community_memberships")
      .select("user_id,communities!inner(id,slug,name)")
      .in("user_id", userIds)
      .eq("role", "member")
      .eq("status", "active"),
    supabase
      .from("student_exam_enrollments")
      .select("user_id,communities!inner(id,slug,name)")
      .in("user_id", userIds),
    listAdminSites(userIds),
    supabase
      .from("credits_ledger")
      .select("user_id")
      .eq("reference_type", "monthly_refresh")
      .in(
        "reference_id",
        userIds.map((userId) => monthlyRefreshReference(userId)),
      ),
    listStudentAmbassadors(),
  ]);

  if (profileError) throw profileError;
  if (ledgerError) throw ledgerError;
  if (subscriptionError) throw subscriptionError;
  if (planError) throw planError;
  if (sessionError) throw sessionError;
  if (noteError) throw noteError;
  if (memberError) throw memberError;
  if (enrollmentError) throw enrollmentError;
  if (refreshError) throw refreshError;

  const facultiesByUserId = new Map<string, FacultyRef[]>();
  for (const row of [...(enrollmentRows ?? []), ...(memberRows ?? [])]) {
    const faculty = (Array.isArray(row.communities)
      ? row.communities[0]
      : row.communities) as unknown as FacultyRef;
    const list = facultiesByUserId.get(row.user_id) ?? [];
    if (!list.some((item) => item.id === faculty.id))
      list.push({ id: faculty.id, slug: faculty.slug, name: faculty.name });
    facultiesByUserId.set(row.user_id, list);
  }

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
  // Match what the student sees (lib/auth.ts): a row still marked "active" past its
  // ends_at has lapsed — nothing flips its status — so it is not their plan any more.
  const now = Date.now();
  const activePlanByUserId = new Map<string, { name: string; endsAt: string | null }>();
  const unlimitedPlanUserIds = new Set<string>();
  for (const row of subscriptionRows ?? []) {
    const subscription = normalizeSubscription(row);
    if (subscription.endsAt && new Date(subscription.endsAt).getTime() <= now) continue;
    if (plansById.get(subscription.planId)?.isUnlimited)
      unlimitedPlanUserIds.add(subscription.userId);
    if (!activePlanByUserId.has(subscription.userId)) {
      activePlanByUserId.set(subscription.userId, {
        name: plansById.get(subscription.planId)?.name ?? "Active plan",
        endsAt: subscription.endsAt,
      });
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

  return {
    profilesByUserId,
    latestLedgerByUserId,
    activePlanByUserId,
    sessionCountByUserId,
    noteCountByUserId,
    facultiesByUserId,
    adminSiteByUserId: adminSites,
    unlimitedPlanUserIds,
    refreshedUserIds: new Set((refreshRows ?? []).map((row) => row.user_id as string)),
    ambassadorEmails: new Set(ambassadors.map((row) => row.email.toLowerCase())),
  };
}

function buildUserSummaries(
  users: any[],
  aggregates: {
    profilesByUserId: Map<string, StudentProfile>;
    latestLedgerByUserId: Map<string, CreditsLedgerEntry>;
    activePlanByUserId: Map<string, { name: string; endsAt: string | null }>;
    sessionCountByUserId: Map<string, number>;
    noteCountByUserId: Map<string, number>;
    facultiesByUserId: Map<string, FacultyRef[]>;
    /** The subdomain each admin runs; its faculties are their column, not where they sit. */
    adminSiteByUserId: Map<string, AdminSite>;
    unlimitedPlanUserIds: Set<string>;
    /** Who already had this month's credit refill. */
    refreshedUserIds: Set<string>;
    ambassadorEmails: Set<string>;
  },
) {
  const {
    profilesByUserId,
    latestLedgerByUserId,
    activePlanByUserId,
    sessionCountByUserId,
    noteCountByUserId,
    facultiesByUserId,
    adminSiteByUserId,
    unlimitedPlanUserIds,
    refreshedUserIds,
    ambassadorEmails,
  } = aggregates;

  return users.map((user) => {
    const profile = profilesByUserId.get(user.id) ?? null;
    const ledgerBalance = latestLedgerByUserId.get(user.id)?.balanceAfter ?? 0;
    // Same rule as the student's own page (lib/auth.ts): unlimited for admins
    // and unlimited plans, as-is for ambassadors, a monthly refill to 20 for
    // everyone else — counted here even before they visit this month.
    const creditAllowance: AdminUserSummary["creditAllowance"] =
      isAdminRole(profile?.role) || unlimitedPlanUserIds.has(user.id)
        ? "unlimited"
        : ambassadorEmails.has((user.email ?? "").toLowerCase())
          ? "ambassador"
          : "monthly";
    const balance =
      creditAllowance === "monthly" && !refreshedUserIds.has(user.id)
        ? ledgerBalance + monthlyRefreshAmount(ledgerBalance)
        : ledgerBalance;

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
      creditAllowance,
      // Admins are Pro by role (lib/data/platform-admin.ts), with or without a subscription row.
      activePlanName: isAdminRole(profile?.role)
        ? "Pro"
        : (activePlanByUserId.get(user.id)?.name ?? null),
      activePlanEndsAt: isAdminRole(profile?.role)
        ? null
        : (activePlanByUserId.get(user.id)?.endsAt ?? null),
      chatSessionCount: sessionCountByUserId.get(user.id) ?? 0,
      noteCount: noteCountByUserId.get(user.id) ?? 0,
      createdAt: user.created_at,
      lastSignInAt: user.last_sign_in_at ?? null,
      faculties:
        profile?.role === "super_admin"
          ? "all"
          : profile?.role === "admin"
            ? (adminSiteByUserId.get(user.id)?.faculties ?? [])
            : (facultiesByUserId.get(user.id) ?? []),
      site: profile?.role === "admin" ? siteRef(adminSiteByUserId.get(user.id)) : null,
    } satisfies AdminUserSummary;
  });
}

function siteRef(site: AdminSite | undefined) {
  return site ? { slug: site.slug, name: site.name } : null;
}

export async function listAdminUsers(filters?: {
  q?: string;
  page?: number;
  pageSize?: number;
  /**
   * "admins" = admin + super_admin; "students" = everyone else; "ambassadors" =
   * people whose email may create faculties (only a super admin may ask).
   */
  role?: "students" | "admins" | "ambassadors";
  /**
   * A faculty slug: the people in it — its students, and the admins whose
   * subdomain covers it, sorted first so "who runs this faculty" is the top of
   * page one. Super admins ("all faculties") are left out; they cover every one.
   */
  faculty?: string;
  /** An admin's reach (see lib/admin-scope.ts); null/undefined = everyone. */
  onlyUserIds?: Set<string> | null;
}): Promise<AdminListPage<AdminUserSummary>> {
  const page = normalizePage(filters?.page);
  const pageSize = normalizePageSize(filters?.pageSize);
  const q = filters?.q?.trim().toLowerCase() ?? "";
  const role = filters?.role;
  const faculty = filters?.faculty?.trim() ?? "";
  const onlyUserIds = filters?.onlyUserIds ?? null;

  if (q || role || faculty || onlyUserIds) {
    const users = await listAllAuthUsers();
    const aggregates = await loadAdminUserAggregates(users.map((user) => user.id));
    const ambassadors =
      role === "ambassadors"
        ? new Set((await listStudentAmbassadors()).map((row) => row.email.toLowerCase()))
        : null;
    const filtered = buildUserSummaries(users, aggregates)
      .filter((user) => !onlyUserIds || onlyUserIds.has(user.userId))
      .filter((user) =>
        ambassadors
          ? ambassadors.has((user.email ?? "").toLowerCase())
          : !role || (user.role === "student") === (role === "students"),
      )
      .filter((user) =>
        [user.email, user.fullName, user.college, user.board, user.grade, user.activePlanName ?? ""]
          .join(" ")
          .toLowerCase()
          .includes(q),
      )
      .filter(
        (user) =>
          !faculty ||
          (user.faculties !== "all" && user.faculties.some((item) => item.slug === faculty)),
      )
      .sort(
        (a, b) =>
          (faculty ? Number(b.role === "admin") - Number(a.role === "admin") : 0) ||
          sortUsersByRecent(a, b),
      );

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
    supabase
      .from("credits_ledger")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(12),
    supabase
      .from("user_subscriptions")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(6),
    supabase
      .from("invoices")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(8),
    supabase
      .from("chat_sessions")
      .select("id, title, updated_at")
      .eq("user_id", userId)
      .order("updated_at", { ascending: false })
      .limit(8),
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
    languagePref: profile?.languagePref ?? "RN",
    recentLedger,
    recentSubscriptions,
    recentInvoices,
    recentSessions: (
      (sessionRows ?? []) as Array<{ id: string; title: string; updated_at: string }>
    ).map((row) => ({
      id: row.id,
      title: row.title,
      updatedAt: row.updated_at,
    })),
  } satisfies AdminUserDetail;
}

export class AdminRoleError extends Error {
  constructor(
    message: string,
    readonly status = 400,
  ) {
    super(message);
  }
}

/**
 * Change a person's access. An admin runs exactly one subdomain site, and a
 * site may have several admins (user, 2026-10-08), so making someone an admin
 * — or moving an admin — needs `siteSlug`. Leaving the admin role frees the
 * site (a database trigger, `release_landing_site_on_role_change`).
 */
export async function updateAdminUserRole(input: {
  actorUserId: string;
  userId: string;
  role: AppRole;
  siteSlug?: string;
}) {
  const supabase = createSupabaseAdminClient();
  let alreadyOnSite = false;
  if (input.role === "admin") {
    if (!input.siteSlug) throw new AdminRoleError("Choose the subdomain this admin will run.");
    const { data: held, error: heldError } = await supabase
      .from("landing_site_admins")
      .select("site_slug")
      .eq("user_id", input.userId)
      .maybeSingle();
    if (heldError) throw new Error(heldError.message);
    alreadyOnSite = held?.site_slug === input.siteSlug;
  }

  const { data: current, error: currentError } = await supabase
    .from("student_profiles")
    .select("role")
    .eq("user_id", input.userId)
    .maybeSingle();
  if (currentError) throw new Error(currentError.message);
  const previousRole = (current?.role ?? "student") as AppRole;

  if (previousRole !== input.role) {
    const { error } = await supabase.rpc("set_platform_user_roles", {
      p_actor_user_id: input.actorUserId,
      p_target_user_ids: [input.userId],
      p_role: input.role,
    });
    if (error) throw new Error(error.message);
  }

  if (input.role === "admin" && !alreadyOnSite) {
    // The admin's old site (if any) goes, the new one comes.
    const { error: clearError } = await supabase
      .from("landing_site_admins")
      .delete()
      .eq("user_id", input.userId);
    const { error: assignError } = clearError
      ? { error: clearError }
      : await supabase.from("landing_site_admins").insert({
          site_slug: input.siteSlug,
          user_id: input.userId,
          assigned_by: input.actorUserId,
        });
    if (assignError) {
      // Don't leave an admin without a site: put the old role back.
      if (previousRole !== "admin")
        await supabase.rpc("set_platform_user_roles", {
          p_actor_user_id: input.actorUserId,
          p_target_user_ids: [input.userId],
          p_role: previousRole,
        });
      // 23505 here means the one-admin-per-site key is still in the database
      // (migration 20261008090000 not applied yet).
      throw new AdminRoleError(
        assignError.code === "23505"
          ? "This subdomain can hold only one admin until the database is updated."
          : "The subdomain could not be assigned.",
        assignError.code === "23505" ? 409 : 500,
      );
    }
  }
  return getAdminUserDetail(input.userId);
}

/** Every active faculty, for the Users page's faculty filter. */
export async function listFacultyChoices(): Promise<Array<{ slug: string; name: string }>> {
  const { data, error } = await createSupabaseAdminClient()
    .from("communities")
    .select("slug,name")
    .eq("status", "active")
    .order("name");
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => ({ slug: row.slug as string, name: row.name as string }));
}

export type SiteAdmin = { userId: string; fullName: string; email: string };

/** Names and emails for a set of user ids, in one profile read plus one auth lookup each. */
export async function describeUsers(userIds: string[]): Promise<Map<string, SiteAdmin>> {
  const supabase = createSupabaseAdminClient();
  const byId = new Map<string, SiteAdmin>();
  const ids = [...new Set(userIds)];
  if (!ids.length) return byId;
  const { data: profiles } = await supabase
    .from("student_profiles")
    .select("user_id,full_name")
    .in("user_id", ids);
  const nameById = new Map((profiles ?? []).map((row) => [row.user_id, row.full_name ?? ""]));
  // A handful of managers per page, so one lookup each is fine.
  const users = await Promise.all(
    ids.map((id) => supabase.auth.admin.getUserById(id).then((r) => r.data.user)),
  );
  ids.forEach((id, index) => {
    const user = users[index];
    const metaName =
      typeof user?.user_metadata?.full_name === "string" ? user.user_metadata.full_name : "";
    byId.set(id, {
      userId: id,
      fullName: normalizeFullName(nameById.get(id) || metaName) || "No name",
      email: user?.email ?? "",
    });
  });
  return byId;
}

/**
 * Who runs each subdomain site, by slug — the Websites list shows it. A missing
 * table (migration not applied) reads as no admins rather than failing the page.
 */
export async function listSiteAdmins(): Promise<Map<string, SiteAdmin[]>> {
  const supabase = createSupabaseAdminClient();
  const bySite = new Map<string, SiteAdmin[]>();
  const { data: rows, error } = await supabase
    .from("landing_site_admins")
    .select("site_slug,user_id")
    .order("assigned_at");
  if (error) {
    console.error("[site-admins] could not read site admins", error.message);
    return bySite;
  }
  const people = await describeUsers((rows ?? []).map((row) => row.user_id));
  for (const row of rows ?? []) {
    const person = people.get(row.user_id);
    if (person) bySite.set(row.site_slug, [...(bySite.get(row.site_slug) ?? []), person]);
  }
  return bySite;
}

/**
 * Add an admin to a site, or take one off it. A site may have several admins
 * and an admin runs one site, so an added admin leaves any site they ran, and a
 * removed admin goes back to student — an admin with no site has nothing to
 * run. A super admin can't be added: it would quietly take away their
 * platform-wide access.
 */
export async function setSiteAdmin(input: {
  actorUserId: string;
  siteSlug: string;
  userId: string;
  action: "add" | "remove";
}) {
  const supabase = createSupabaseAdminClient();
  const { data: profile, error: profileError } = await supabase
    .from("student_profiles")
    .select("role")
    .eq("user_id", input.userId)
    .maybeSingle();
  if (profileError) throw new Error(profileError.message);

  if (input.action === "add") {
    if (profile?.role === "super_admin")
      throw new AdminRoleError("A super admin already sees every site. Pick someone else.", 409);
    await updateAdminUserRole({
      actorUserId: input.actorUserId,
      userId: input.userId,
      role: "admin",
      siteSlug: input.siteSlug,
    });
    return;
  }

  const { data: held, error } = await supabase
    .from("landing_site_admins")
    .select("user_id")
    .eq("site_slug", input.siteSlug)
    .eq("user_id", input.userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!held) return;
  // The trigger frees the site when the role changes; the delete makes that
  // independent of the trigger having been applied.
  if (profile?.role === "admin")
    await updateAdminUserRole({ actorUserId: input.actorUserId, userId: input.userId, role: "student" });
  const { error: freeError } = await supabase
    .from("landing_site_admins")
    .delete()
    .eq("site_slug", input.siteSlug)
    .eq("user_id", input.userId);
  if (freeError) throw new Error(freeError.message);
}

/** Every subdomain site, for the super admin's site picker. */
export async function listSiteAdminChoices() {
  const { data: sites, error } = await createSupabaseAdminClient()
    .from("landing_sites")
    .select("slug,name")
    .order("name");
  if (error) throw new Error(error.message);
  return (sites ?? []).map((site) => ({ slug: site.slug as string, name: site.name as string }));
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
