import { cache } from "react";
import { redirect } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import { isProfileComplete } from "@/lib/access";
import { isAdminRole } from "@/lib/admin-role";
import { grantStarterCredits, refreshMonthlyCredits } from "@/lib/data/billing";
import { monthlyRefreshReference } from "@/lib/billing";
import { isStudentAmbassadorCached } from "@/lib/data/student-ambassadors";
import {
  normalizeBoard,
  normalizeBoardScore,
  normalizeCollege,
  normalizeFullName,
  normalizeGrade,
  normalizeSubjects,
  normalizeTargetGrade,
} from "@/lib/profile-normalization";
import { DEV_AUTH_BYPASS } from "@/lib/dev-auth-bypass";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { hasCompletedStudyDiagnostic, hasStartedStudyDiagnostic } from "@/lib/study-diagnostic";
import type { AppUser, StudentProfile } from "@/lib/types";
import { getVerifiedUser } from "@/lib/supabase/verified-user";
import { timed } from "@/lib/dev-timing";

function normalizeProfile(row: any): StudentProfile {
  return {
    userId: row.user_id,
    fullName: normalizeFullName(row.full_name ?? ""),
    phoneNumber: typeof row.phone_number === "string" ? row.phone_number : null,
    studyQuote: typeof row.study_quote === "string" ? row.study_quote.trim().slice(0, 140) : null,
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

function toAppUser(
  user: User,
  profile: StudentProfile | null,
  creditBalance: number,
  hasUnlimitedAccess: boolean,
  activePlanTier?: AppUser["activePlanTier"],
  isStudentAmbassador = false,
  hasPaidPlan = false,
): AppUser {
  return {
    id: user.id,
    email: user.email ?? "",
    fullName:
      profile?.fullName ||
      (typeof user.user_metadata.full_name === "string" ? user.user_metadata.full_name : "") ||
      (user.email?.split("@")[0] ?? "Student"),
    onboarded: isProfileComplete(profile),
    role: profile?.role ?? "student",
    creditBalance,
    hasUnlimitedAccess,
    ...(activePlanTier ? { activePlanTier } : {}),
    ...(isStudentAmbassador ? { isStudentAmbassador } : {}),
    ...(hasPaidPlan ? { hasPaidPlan } : {}),
  };
}

/**
 * The verified session user and its client, nothing else — a local JWT check,
 * no database. Shared per request, so callers that only need the id (the app
 * layout's faculty lookups) can start their queries while `getCurrentAuth` is
 * still waiting on the profile and credits batch.
 */
export const getSessionUser = cache(async function getSessionUser() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await getVerifiedUser(supabase);
  return { supabase, user };
});

/**
 * Deduped for the lifetime of one request. The app layout and the page beneath
 * it both need the signed-in user; without this each of them paid a separate
 * `auth.getUser()` round trip plus its own profile and credits queries, so a
 * single navigation spent three sequential Supabase hops on work it had
 * already done.
 */
export const getCurrentAuth = cache(async function getCurrentAuth() {
  const { supabase, user } = await getSessionUser();

  if (!user) {
    return {
      user: null,
      profile: null,
      studyDiagnosticCompleted: false,
      studyDiagnosticStarted: false,
    };
  }

  // The profile decides whether the user is onboarded and the ledger row
  // carries the credit balance. Neither depends on the other, so they go out
  // together instead of one after the next.
  const [profileResult, ledgerResult, subscriptionResult, ambassador, refreshResult] = await timed(
    "page:getCurrentAuth-batch(5)",
    async () =>
      Promise.all([
        supabase.from("student_profiles").select("*").eq("user_id", user.id).maybeSingle(),
        supabase
          .from("credits_ledger")
          .select("balance_after")
          .eq("user_id", user.id)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
        supabase
          .from("user_subscriptions")
          .select("ends_at, subscription_plans(slug,product_type,is_unlimited)")
          .eq("user_id", user.id)
          .eq("status", "active")
          .order("starts_at", { ascending: false }),
        isStudentAmbassadorCached(user.email),
        // This month's credit refill, if it has happened (one unique-index read).
        supabase
          .from("credits_ledger")
          .select("id")
          .eq("reference_type", "monthly_refresh")
          .eq("reference_id", monthlyRefreshReference(user.id))
          .maybeSingle(),
      ]),
  );

  const profileRow = profileResult.data;
  const profile: StudentProfile | null = profileRow ? normalizeProfile(profileRow) : null;
  const onboarded = isProfileComplete(profile);

  // Only a brand-new onboarded account still needs the starter grant written;
  // everyone else already has a ledger row and reads it from the query above.
  //
  // A bypassed development session owns no ledger row and no subscription, so
  // without these two overrides every screen renders its out-of-credits state
  // and the UI being worked on never appears. Both collapse to the real values
  // outside development, where DEV_AUTH_BYPASS is false.
  const ledgerBalance = DEV_AUTH_BYPASS
    ? 999
    : (ledgerResult.data?.balance_after ?? (onboarded ? await grantStarterCredits(user.id) : 0));

  const now = Date.now();
  // Whoever can see platform analytics is always on Pro (see
  // lib/data/platform-admin.ts); the profile is already in hand, so no extra read.
  const platformAdmin = isAdminRole(profile?.role);
  const hasUnlimitedAccess =
    DEV_AUTH_BYPASS ||
    platformAdmin ||
    (subscriptionResult.data ?? []).some((subscription: any) => {
      const plan = Array.isArray(subscription.subscription_plans)
        ? subscription.subscription_plans[0]
        : subscription.subscription_plans;
      const notExpired = !subscription.ends_at || new Date(subscription.ends_at).getTime() > now;
      return Boolean(plan?.is_unlimited && notExpired);
    });

  // A regular student's credits refill to 20 once a month, on their first visit
  // of the month. Unlimited accounts (admins included) never spend credits, and
  // an ambassador's credits stay as they are (user, 2026-10-07).
  const creditBalance =
    !DEV_AUTH_BYPASS &&
    onboarded &&
    !hasUnlimitedAccess &&
    !ambassador &&
    !refreshResult.error &&
    !refreshResult.data
      ? await refreshMonthlyCredits(user.id, ledgerBalance)
      : ledgerBalance;

  const activePlans = (subscriptionResult.data ?? [])
    .filter(
      (subscription: any) =>
        !subscription.ends_at || new Date(subscription.ends_at).getTime() > now,
    )
    .map((subscription: any) =>
      Array.isArray(subscription.subscription_plans)
        ? subscription.subscription_plans[0]
        : subscription.subscription_plans,
    );
  const activePlanTier: AppUser["activePlanTier"] =
    DEV_AUTH_BYPASS || platformAdmin
      ? "pro"
      : activePlans.some((plan: any) => plan?.product_type === "group")
        ? "group"
        : activePlans.some((plan: any) => plan?.is_unlimited)
          ? "pro"
          : activePlans.some((plan: any) => plan?.slug === "plus-monthly")
            ? "plus"
            : undefined;

  return {
    user: toAppUser(
      user,
      profile,
      creditBalance,
      hasUnlimitedAccess,
      activePlanTier,
      ambassador,
      DEV_AUTH_BYPASS || platformAdmin || activePlans.length > 0,
    ),
    profile,
    studyDiagnosticCompleted: hasCompletedStudyDiagnostic(user.user_metadata?.study_answers),
    studyDiagnosticStarted: hasStartedStudyDiagnostic(user.user_metadata?.study_diagnostic_started),
  };
});

export async function requireAuthenticatedUser() {
  const auth = await getCurrentAuth();
  if (!auth.user) redirect("/login");
  return auth;
}

export async function requireOnboardedUser() {
  return requireAuthenticatedUser();
}

/**
 * `requireOnboardedUser()` plus work that needs only the user id, started at the
 * same time instead of after it. A page that awaited the user and then, say, its
 * active community paid two round trips in a row; this makes them one.
 */
export async function requireOnboardedUserWith<T>(work: (userId: string) => Promise<T>) {
  const { user: sessionUser } = await getSessionUser();
  const early = sessionUser ? work(sessionUser.id) : null;
  // Handled here so a sign-in redirect can't leave it unhandled; awaiting it
  // below still throws as before.
  early?.catch(() => {});
  const auth = await requireOnboardedUser();
  return [auth, await (early ?? work(auth.user.id))] as const;
}

export async function requireAdminUser() {
  const auth = await requireAuthenticatedUser();
  if (!isAdminRole(auth.user.role)) redirect("/app/today");
  return auth;
}
