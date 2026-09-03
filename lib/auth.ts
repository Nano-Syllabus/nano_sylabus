import { cache } from "react";
import { redirect } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import { isProfileComplete } from "@/lib/access";
import { isAdminRole } from "@/lib/admin-role";
import { grantStarterCredits } from "@/lib/data/billing";
import {
  normalizeBoard,
  normalizeBoardScore,
  normalizeCollege,
  normalizeFullName,
  normalizeGrade,
  normalizeSubjects,
  normalizeTargetGrade,
} from "@/lib/profile-normalization";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { hasCompletedStudyDiagnostic } from "@/lib/study-diagnostic";
import type { AppUser, StudentProfile } from "@/lib/types";

function normalizeProfile(row: any): StudentProfile {
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

function toAppUser(
  user: User,
  profile: StudentProfile | null,
  creditBalance: number,
  hasUnlimitedAccess: boolean,
): AppUser {
  return {
    id: user.id,
    email: user.email ?? "",
    fullName:
      profile?.fullName ||
      (typeof user.user_metadata.full_name === "string"
        ? user.user_metadata.full_name
        : "") ||
      (user.email?.split("@")[0] ?? "Student"),
    onboarded: isProfileComplete(profile),
    role: profile?.role ?? "student",
    creditBalance,
    hasUnlimitedAccess,
  };
}

/**
 * Deduped for the lifetime of one request. The app layout and the page beneath
 * it both need the signed-in user; without this each of them paid a separate
 * `auth.getUser()` round trip plus its own profile and credits queries, so a
 * single navigation spent three sequential Supabase hops on work it had
 * already done.
 */
export const getCurrentAuth = cache(async function getCurrentAuth() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { user: null, profile: null, studyDiagnosticCompleted: false };

  // The profile decides whether the user is onboarded and the ledger row
  // carries the credit balance. Neither depends on the other, so they go out
  // together instead of one after the next.
  const [profileResult, ledgerResult, subscriptionResult] = await Promise.all([
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
      .select("ends_at, subscription_plans(is_unlimited)")
      .eq("user_id", user.id)
      .eq("status", "active")
      .order("starts_at", { ascending: false }),
  ]);

  const profileRow = profileResult.data;
  const profile: StudentProfile | null = profileRow ? normalizeProfile(profileRow) : null;
  const onboarded = isProfileComplete(profile);

  // Only a brand-new onboarded account still needs the starter grant written;
  // everyone else already has a ledger row and reads it from the query above.
  const creditBalance =
    ledgerResult.data?.balance_after ??
    (onboarded ? await grantStarterCredits(user.id) : 0);

  const now = Date.now();
  const hasUnlimitedAccess = (subscriptionResult.data ?? []).some((subscription: any) => {
    const plan = Array.isArray(subscription.subscription_plans)
      ? subscription.subscription_plans[0]
      : subscription.subscription_plans;
    const notExpired = !subscription.ends_at || new Date(subscription.ends_at).getTime() > now;
    return Boolean(plan?.is_unlimited && notExpired);
  });

  return {
    user: toAppUser(user, profile, creditBalance, hasUnlimitedAccess),
    profile,
    studyDiagnosticCompleted: hasCompletedStudyDiagnostic(user.user_metadata?.study_answers),
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

export async function requireAdminUser() {
  const auth = await requireAuthenticatedUser();
  if (!isAdminRole(auth.user.role)) redirect("/app/today");
  return auth;
}
